import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import DeadlineBanner from '../components/DeadlineBanner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { supabase } from '../supabase';

const DEFAULT_DOCUMENTS = {
  subjects: [
    'Syllabus', 'IMs', 'Exam (Mid)', 'Exam (Final)', 
    'TOS (Mid)', 'TOS (Final)', 'Rubrics', 'Quizzes',
    'Learning Activities', 'COTED', 'Grading Sheet', 'Class Record'
  ],
  other: [
    'Faculty Workload', 'IPCR – Target', 'IPCR – Final with Rating',
    'Student Consultation', 'Student Evaluation (FPESf)', 
    'Superior\'s Evaluation (FPESu)', 'Classroom Observation',
    'Accomplishment Report – Quarter 1', 'Accomplishment Report – Quarter 2',
    'Seminar / Training Certificate/s', 'Membership ID / Certificate/s',
    'Individual Development Plan', 'Faculty Attendance'
  ]
};

const PhotoGrid = ({ uploads, onPreview, deadline }) => {
  if (!uploads || uploads.length === 0) return null;

  const displayLimit = 4;
  const displayUploads = uploads.slice(0, displayLimit);
  const remainingCount = uploads.length - displayLimit;

  return (
    <div className="photo-preview">
      {displayUploads.map((file, idx) => {
        const isLate = deadline && file.uploadedAt && new Date(file.uploadedAt) > new Date(deadline);
        const statusClass = isLate ? 'late' : 'on-time';

        return (
          <div 
            key={idx} 
            className={`photo-thumbnail ${statusClass}`}
            onClick={() => onPreview(file, uploads, idx)}
            style={{ position: 'relative', cursor: 'pointer' }}
            title={`Uploaded: ${new Date(file.uploadedAt || Date.now()).toLocaleString()} (${isLate ? 'LATE' : 'On-time'})`}
          >
            <div className={`status-indicator ${statusClass}`}></div>
            {file.preview ? (
              <img src={file.preview} alt={file.name} />
            ) : (
              <div className="file-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '10px' }}>📄</div>
            )}
            {idx === displayLimit - 1 && remainingCount > 0 && (
              <div className="photo-more-indicator">
                +{remainingCount + 1}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default function ChecklistView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: admin } = useAuth();
  const { addToast } = useToast();
  const { confirm, showAlert } = useConfirm();
  
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [checklist, setChecklist] = useState({
    loading: true,
    status: 'pending',
    subjects: [],
    other_docs: [],
    documentsBySubject: DEFAULT_DOCUMENTS.subjects,
    otherDocuments: DEFAULT_DOCUMENTS.other,
    uploads: {} // Initialize to empty object to prevent render crashes
  });

  useEffect(() => {
    fetchChecklist();

    // Real-time subscription for this checklist
    const channel = supabase
      .channel(`checklist-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for inserts, updates, deletes
          schema: 'public',
          table: 'checklists',
          filter: `id=eq.${id}` // Only listen to THIS checklist
        },
        (payload) => {
          console.log('Real-time Update Received:', payload);
          // Re-fetch to get fresh data (safest for JSONB updates)
          fetchChecklist();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchChecklist = async (isBackground = false) => {
    try {
      if (!isBackground) {
        setChecklist(prev => ({ ...prev, loading: true }));
      }
      
      const { data, error } = await supabase
        .from('checklists')
        .select(`
          *,
          faculty_profiles (
            name,
            email,
            college,
            department
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      // Hydrate previews for documents
      // Batched Hydration for Admin View
      const hydrateAllDocs = async () => {
         const subjects = data.subjects || [];
         const other = data.other_docs || [];
         
         const allPaths = [];
         subjects.forEach(s => s.docs?.forEach(d => allPaths.push(d.path)));
         other.forEach(o => o.docs?.forEach(d => allPaths.push(d.path)));

         if (allPaths.length === 0) return { subjects, other };

         const { data: signedData, error: signError } = await supabase.storage
            .from('checklists')
            .createSignedUrls(allPaths, 3600);

         if (signError) {
             console.error('Error signing URLs:', signError);
             return { subjects, other };
         }

         const urlMap = {};
         signedData?.forEach(item => {
             if (item.path && item.signedUrl) urlMap[item.path] = item.signedUrl;
         });

         const mapDocs = (list) => list.map(item => ({
             ...item,
             docs: (item.docs || []).map(d => ({ ...d, preview: urlMap[d.path] }))
         }));

         return { subjects: mapDocs(subjects), other: mapDocs(other) };
      };

      const { subjects: hydratedSubjects, other: hydratedOther } = await hydrateAllDocs();

      // Map to UI-friendly structure
      const uploadsMap = {};
      
      hydratedSubjects.forEach(sub => {
         sub.docs.forEach(doc => {
           if (doc.type) {
             const docTypeIdx = DEFAULT_DOCUMENTS.subjects.indexOf(doc.type);
             if (docTypeIdx > -1) {
               const key = `subject-${sub.id}-${docTypeIdx}`; 
               if (!uploadsMap[key]) uploadsMap[key] = [];
               uploadsMap[key].push(doc);
             }
           }
         });
      });
      
      hydratedOther.forEach((item, idx) => {
         // For 'other' docs, the item itself is the container
         // item.id should already be 'other-0', 'other-1', etc. but let's be safe
         // In FacultyDashboard it maps to 'other-idx'. 
         // Here `hydratedOther` is the array of items.
         // item.id is likely 'other-0'.
         if (item.docs && item.docs.length > 0) {
            uploadsMap[item.id] = item.docs;
         }
      });

      setChecklist(prev => ({
        ...prev,
        id: data.id,
        facultyName: data.faculty_profiles.name,
        email: data.faculty_profiles.email,
        college: data.faculty_profiles.college,
        department: data.faculty_profiles.department,
        status: data.status,
        semester: data.term_id.split('-').slice(1).join(' '),
        academicYear: data.term_id.split('-')[0],
        subjects: hydratedSubjects,
        other_docs: hydratedOther,
        uploads: uploadsMap,
        loading: false
      }));
    } catch (err) {
      console.error('Checklist Load Error:', err);
      setChecklist(prev => ({ ...prev, loading: false }));
    }
  };
  
  /* Removed legacy state */
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [printScale, setPrintScale] = useState(1);
  
  // Enhanced Preview State
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    imageSrc: null,
    files: [], 
    currentIndex: 0,
    zoom: 1,
    contextKey: null // To track which slot we are in for rejection
  });

  const calculateLatestUpload = () => {
    const allDocs = [
      ...checklist.subjects.flatMap(s => s.docs),
      ...checklist.other_docs.flatMap(o => o.docs)
    ];
    if (allDocs.length === 0) return null;
    return allDocs.reduce((latest, current) => {
      return !latest || new Date(current.uploadedAt) > new Date(latest) ? current.uploadedAt : latest;
    }, null);
  };

  const latestUploadAt = calculateLatestUpload();

  useEffect(() => {
    if (!showPreviewModal) return;
    
    const calculateScale = () => {
      // Calculate scale to fit screen width with some padding
      // Paper width is 816px
      const viewportWidth = window.innerWidth;
      // Increased padding to ensure edges are clearly visible (zoomed out slightly more)
      const sidePadding = viewportWidth < 768 ? 25 : 40; 
      const totalPadding = sidePadding * 2;
      
      const availableWidth = viewportWidth - totalPadding;
      
      if (availableWidth < 816) {
        setPrintScale(availableWidth / 816);
      } else {
        setPrintScale(1);
      }
    };
    
    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [showPreviewModal]);

  // Body scroll lock
  useEffect(() => {
    if (showPreviewModal || previewState.isOpen || showApproveModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  }, [showPreviewModal, previewState.isOpen, showApproveModal]);

  const handleApprove = async () => {
    if (!navigator.onLine) {
      addToast('No internet connection. Cannot approve checklist.', 'error');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('checklists')
        .update({ status: 'approved' })
        .eq('id', id)
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error('PERMISSION DENIED: Database security policy blocked this update. Please check RLS settings.');
      }

      setChecklist(prev => ({ ...prev, status: 'approved' }));
      setShowApproveModal(false);
      addToast('Faculty checklist approved!', 'success');
      
      // Update data in background to ensure everything is synced
      fetchChecklist(true);
    } catch (err) {
      console.error('Approval Error:', err);
      addToast('Failed to approve checklist.', 'error');
    }
  };

  const handleRemovePhoto = async (key, docToRemove) => {
    if (!key || !docToRemove) return;
    
    if (!navigator.onLine) {
      addToast('No internet connection. Cannot reject document.', 'error');
      return;
    }
    
    const confirmed = await confirm('Are you sure you want to reject and remove this document?', 'Reject Document');
    if (confirmed) {
      try {
        // Find the specific doc in the state map to verify it exists
        const docs = checklist.uploads[key];
        if (!docs || docs.length === 0) return;
        
        // Use the passed doc directly
        // const docToRemove = docs.find(d => d.preview === selectedImage) || docs[0];

        // 1. Delete from Storage
        const { error: storageError } = await supabase.storage
          .from('checklists')
          .remove([docToRemove.path]);

        if (storageError) {
             console.error('Storage error ignored for now:', storageError);
        }

        // 2. Update DB
        const { data: latestChecklist, error: fetchError } = await supabase
          .from('checklists')
          .select('subjects, other_docs')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;

        let updatedSubjects = [...latestChecklist.subjects];
        let updatedOther = [...latestChecklist.other_docs];

        if (key.startsWith('subject-')) {
           const parts = key.split('-');
           // Key format: subject-[id]-[docIdx]
           // If id contains dashes (like UUID), we need to handle it.
           // However, local keys are constructed as: `subject-${subject.id}-${docIdx}`
           // subject.id comes from database (UUID or integer).
           // If UUID: subject-123e4567-e89b...-0
           // The LAST part is always docIdx. The first part is 'subject'. The middle is ID.
           
           const docIdx = parts[parts.length - 1];
           const subId = parts.slice(1, -1).join('-'); 
           
           updatedSubjects = updatedSubjects.map(s => {
             if (s.id === subId) {
               const newDocs = s.docs.filter(d => d.path !== docToRemove.path);
               // Track the rejected document type so we can highlight it
               const rejectedType = docToRemove.type; 
               const currentRejections = s.rejected_types || [];
               
               // Add to rejection list if not already there
               const newRejections = rejectedType && !currentRejections.includes(rejectedType)
                 ? [...currentRejections, rejectedType]
                 : currentRejections;

               return { ...s, docs: newDocs, rejected_types: newRejections };
             }
             return s;
           });
        } else {
           updatedOther = updatedOther.map(o => {
             if (o.id === key) {
               // For 'other' docs, the item itself is the 'type', so we just mark the item as rejected
               return { 
                 ...o, 
                 docs: o.docs.filter(d => d.path !== docToRemove.path),
                 rejected: true 
               };
             }
             return o;
           });
        }

        const { data: updateData, error: updateError } = await supabase
          .from('checklists')
          .update({ 
            subjects: updatedSubjects,
            other_docs: updatedOther,
            status: 'revision' 
          })
          .eq('id', id)
          .select(); // Must select to see if it worked

        if (updateError) throw updateError;
        
        // RLS SAFETY CHECK
        if (!updateData || updateData.length === 0) {
           throw new Error('PERMISSION DENIED: Database security policy blocked this update. Please run the "fix_admin_rls.sql" script in Supabase.');
        }

        fetchChecklist(); 
        
        // Update local modal state to show next image
        setPreviewState(prev => {
           const newFiles = prev.files.filter(f => f.path !== docToRemove.path);
           if (newFiles.length === 0) {
              return { ...prev, isOpen: false };
           } else {
              const nextIndex = prev.currentIndex < newFiles.length ? prev.currentIndex : newFiles.length - 1;
              return {
                 ...prev,
                 files: newFiles,
                 currentIndex: nextIndex,
                 imageSrc: newFiles[nextIndex].preview,
                 zoom: 1
              };
           }
        });
        
        addToast('Document rejected and removed.', 'success');
        // setSelectedImage(null);
        // setSelectedImageKey(null);

      } catch (err) {
        console.error('Rejection Error:', err);
        addToast('Failed to reject document.', 'error');
      }
    }
  };

  const getUploadStatus = (key) => {
    const upload = checklist.uploads?.[key];
    
    if (upload && upload.length > 0) {
      return (
        <div className="upload-status uploaded">
          ✓ {upload.length} file(s)
        </div>
      );
    }
    
    // Check for rejection status
    let isRejected = false;
    
    try {
      if (key.startsWith('subject-')) {
         const parts = key.split('-');
         const docIdx = parseInt(parts[parts.length - 1]);
         const subId = parts.slice(1, parts.length - 1).join('-');
         const docName = DEFAULT_DOCUMENTS.subjects[docIdx];
         
         const subject = checklist.subjects.find(s => s.id === subId);
         if (subject && subject.rejected_types && subject.rejected_types.includes(docName)) {
           isRejected = true;
         }
      } else if (key.startsWith('other-')) {
         const item = checklist.other_docs.find(o => o.id === key);
         if (item && item.rejected) {
           isRejected = true;
         }
      }
    } catch (e) {
      console.warn('Error checking rejection status', e);
    }

    if (isRejected) {
      return (
        <div className="upload-status" style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '0.9em' }}>
          ⚠️ Waiting for Revision
        </div>
      );
    }
    
    return (
      <div className="upload-status">
        ⏳ Not uploaded
      </div>
    );
  };

  return (
    <div>
      <Header />
      
      <main className="container" style={{ paddingTop: 'var(--space-fluid-md)', paddingBottom: 'var(--space-fluid-md)' }}>
        {/* Back Button */}
        <button 
          className="btn btn-secondary mb-6"
          onClick={() => navigate('/admin/dashboard')}
        >
          ← Back to Dashboard
        </button>

        {/* Submission Info */}
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="card-title">Checklist Review</h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              <div>
                <strong>FACULTY:</strong> {checklist.facultyName}
              </div>
              <div>
                <strong>College:</strong> {checklist.college}
              </div>
              <div>
                <strong>Department:</strong> {checklist.department}
              </div>
              <div>
                <strong>Semester & AY:</strong> {checklist.semester}, A.Y. {checklist.academicYear}
              </div>
            </div>
            <div style={{ marginTop: 'var(--space-6)' }}>
              <DeadlineBanner 
                deadline={checklist.deadline} 
                submittedAt={checklist.submittedAt} 
                status={checklist.status}
                latestUploadAt={latestUploadAt}
              />
            </div>
          </div>
        </div>

        {/* Documents by Subject */}
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="card-title">Documents by Subject</h2>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  {checklist.documentsBySubject.map((doc, idx) => (
                    <th key={idx}>{doc}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checklist.subjects.map((subject) => (
                  <tr key={subject.id}>
                    <td data-label="Subject">
                      <strong>{subject.name}</strong>
                    </td>
                    {checklist.documentsBySubject.map((doc, docIdx) => {
                      const key = `subject-${subject.id}-${docIdx}`;
                      const upload = checklist.uploads[key];
                      
                      return (
                        <td key={docIdx} data-label={doc}>
                          {getUploadStatus(key)}
                          {upload && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <PhotoGrid 
                                uploads={upload} 
                                onPreview={(file, allFiles, index) => {
                                  setPreviewState({
                                    isOpen: true,
                                    imageSrc: file.preview,
                                    files: allFiles,
                                    currentIndex: index,
                                    zoom: 1,
                                    contextKey: key
                                  });
                                }} 
                                deadline={checklist.deadline}
                              />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-scroll-hint">
              ← Scroll horizontally to see all documents →
            </div>
          </div>
        </div>

        {/* Other Documents */}
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="card-title">Other Documents</h2>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Document</th>
                  <th>Status</th>
                  <th>Preview</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {checklist.otherDocuments.map((doc, idx) => {
                  const key = `other-${idx}`;
                  const upload = checklist.uploads?.[key];
                  
                  return (
                    <tr key={idx}>
                      <td data-label="Document"><strong>{doc}</strong></td>
                      <td data-label="Status">{getUploadStatus(key)}</td>
                      <td data-label="Preview">
                        {upload && (
                          <PhotoGrid 
                            uploads={upload} 
                            onPreview={(file, allFiles, index) => {
                              setPreviewState({
                                isOpen: true,
                                imageSrc: file.preview,
                                files: allFiles,
                                currentIndex: index,
                                zoom: 1,
                                contextKey: key
                              });
                            }} 
                            deadline={checklist.deadline}
                          />
                        )}
                      </td>
                      <td></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="card">
          <div className="card-body" style={{ textAlign: 'right' }}>
            <div className="flex justify-end items-center gap-4" style={{ display: 'inline-flex' }}>
              <button 
                className="btn btn-outline btn-lg"
                onClick={() => setShowPreviewModal(true)}
              >
                Preview
              </button>

              {checklist.status === 'approved' ? (
                <button 
                  className="btn btn-outline btn-lg"
                  onClick={async () => {
                    const confirmed = await confirm('Are you sure you want to undo this approval? The status will revert to Pending.', 'Undo Approval');
                    if (confirmed) {
                      try {
                        const { error } = await supabase
                          .from('checklists')
                          .update({ status: 'pending' })
                          .eq('id', id);
                        
                        if (error) throw error;
                        addToast('Approval undone. Status is now Pending.', 'info');
                        fetchChecklist(true); // Background refresh
                      } catch (err) {
                        console.error('Undo error:', err);
                        addToast('Failed to undo approval.', 'error');
                      }
                    }
                  }}
                >
                  ↩️ Undo Approval
                </button>
              ) : (
                <button 
                  className="btn btn-primary btn-lg"
                  onClick={() => setShowApproveModal(true)}
                >
                  Approve Checklist
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Enhanced Image Modal */}
      {previewState.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.9)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }} onClick={() => setPreviewState(prev => ({ ...prev, isOpen: false }))}>
          <div className="modal-content" style={{ width: '100%', height: '100%', background: 'transparent', boxShadow: 'none', padding: 0, position: 'relative' }} onClick={e => e.stopPropagation()}>
             
             {/* Toolbar */}
             <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '10px', zIndex: 10 }}>
               <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setPreviewState(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.5, 3) }))}>➕ Zoom In</button>
               <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setPreviewState(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.5, 0.5) }))}>➖ Zoom Out</button>
               
               {/* Reject Button */}
               <button 
                 className="btn btn-sm" 
                 style={{ background: 'rgba(220, 38, 38, 0.9)', color: 'white', border: 'none', marginLeft: '10px' }} 
                 onClick={() => handleRemovePhoto(previewState.contextKey, previewState.files[previewState.currentIndex])}
                 title="Reject this specific document"
               >
                 🗑️ Reject
               </button>

               <button className="btn btn-sm" style={{ background: 'rgba(75, 85, 99, 0.9)', color: 'white', border: 'none' }} onClick={() => setPreviewState(prev => ({ ...prev, isOpen: false, zoom: 1 }))}>❌ Close</button>
             </div>

             {/* Navigation - Left */}
             {previewState.files.length > 1 && (
               <button 
                 style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '3rem', cursor: 'pointer', padding: '20px', borderRadius: '10px', backdropFilter: 'blur(2px)', zIndex: 5 }}
                 onClick={(e) => {
                   e.stopPropagation();
                   setPreviewState(prev => {
                     const newIndex = (prev.currentIndex - 1 + prev.files.length) % prev.files.length;
                     return { ...prev, currentIndex: newIndex, imageSrc: prev.files[newIndex].preview, zoom: 1 };
                   });
                 }}
               >
                 ‹
               </button>
             )}

             {/* Main Image Container */}
             <div style={{ overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
               <div style={{ 
                 transform: `scale(${previewState.zoom})`, 
                 transition: 'transform 0.2s ease',
                 display: 'flex',
                 justifyContent: 'center',
                 alignItems: 'center'
               }}>
                 <img 
                   src={previewState.imageSrc} 
                   style={{ 
                     maxHeight: '90vh', 
                     maxWidth: '90vw', 
                     objectFit: 'contain',
                     boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                     borderRadius: '4px'
                   }} 
                   alt="Preview" 
                   draggable={false}
                 />
               </div>
             </div>

             {/* Navigation - Right */}
             {previewState.files.length > 1 && (
               <button 
                 style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '3rem', cursor: 'pointer', padding: '20px', borderRadius: '10px', backdropFilter: 'blur(2px)', zIndex: 5 }}
                 onClick={(e) => {
                   e.stopPropagation();
                   setPreviewState(prev => {
                     const newIndex = (prev.currentIndex + 1) % prev.files.length;
                     return { ...prev, currentIndex: newIndex, imageSrc: prev.files[newIndex].preview, zoom: 1 };
                   });
                 }}
               >
                 ›
               </button>
             )}

             {/* Caption */}
             <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', color: 'white', background: 'rgba(0,0,0,0.7)', padding: '10px 25px', borderRadius: '30px', textAlign: 'center', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)' }}>
               <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{previewState.files[previewState.currentIndex]?.name}</div>
               <div style={{ fontSize: '0.8em', opacity: 0.8 }}>Image {previewState.currentIndex + 1} of {previewState.files.length}</div>
             </div>

          </div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Approve Checklist</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to approve this checklist?</p>
              <p className="text-gray">
                This will mark the current submission as approved. The faculty member remains able to update or refine documents as needed.
              </p>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowApproveModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleApprove}
              >
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submission Preview Modal */}
      {showPreviewModal && (
        <div className="modal-backdrop" style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          backgroundColor: 'rgba(0, 0, 0, 0.7)', 
          zIndex: 99999, // Extremely high to cover everything
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: viewportWidth < 768 ? '0' : '20px' // No padding on mobile
        }}>
          <div className="modal-content" style={{ 
            backgroundColor: 'white', 
            borderRadius: viewportWidth < 768 ? '0' : '8px',
            width: '100%',
            height: viewportWidth < 768 ? '100%' : 'auto',
            maxWidth: '1250px',
            maxHeight: viewportWidth < 768 ? '100%' : '95vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 4px 50px rgba(0, 0, 0, 0.3)'
          }}>
            {/* Modal Header/Toolbar - Kept separate from the print design */}
            <div className="modal-header" style={{ 
              padding: '1rem', 
              borderBottom: '1px solid #eee', 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#f8f9fa'
            }}>
              <h3 className="modal-title" style={{ margin: 0, fontSize: '1.25rem' }}>Overall Submission Preview</h3>
              <button 
                onClick={() => setShowPreviewModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                &times;
              </button>
            </div>

            {/* Scrollable Content - This part mimics the paper */}
            <div className="modal-body" style={{ 
              overflow: 'auto', // Allow both horizontal and vertical scrolling
              padding: printScale < 1 ? '10px' : '2rem', // Reduced padding on mobile/scaled view
              flex: 1,
              backgroundColor: '#525659' // Dark background for contrast with the paper
            }}>
              <div className="paper-document print-content" style={{
                backgroundColor: 'white',
                padding: '40px',
                width: '816px', // Fixed width for Letter size (8.5 inches * 96 DPI)
                minWidth: '816px', // Ensure it doesn't shrink
                margin: '0 auto',
                zoom: printScale, // Zoom for mobile preview
                boxShadow: '0 0 10px rgba(0,0,0,0.3)',
                fontFamily: '"Times New Roman", Times, serif',
                color: 'black',
                position: 'relative' // Ensure relative positioning for print
              }}>
                
                {/* Official Header */}
                <div style={{ 
                  border: '1px solid black', 
                  marginBottom: '20px', 
                  padding: '10px', 
                  display: 'flex', 
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}>
                  <div style={{ position: 'absolute', left: '20px' }}>
                    <img src="/Logo/NVSU_logo.jpg" alt="Logo" style={{ width: '80px', height: '80px' }} />
                  </div>
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <div style={{ fontSize: '12pt' }}>Republic of the Philippines</div>
                    <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>NUEVA VIZCAYA STATE UNIVERSITY</div>
                    <div style={{ fontSize: '12pt' }}>Bambang, Nueva Vizcaya</div>
                    <div style={{ fontSize: '16pt', fontWeight: 'bold', marginTop: '10px', textTransform: 'uppercase' }}>FACULTY CHECKLIST</div>
                  </div>
                </div>

                {/* Faculty Details */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '20px', 
                  marginBottom: '30px',
                  fontSize: '12pt'
                }}>
                  <div>
                    <div style={{ marginBottom: '5px' }}><strong>Faculty Member:</strong> <span style={{ textTransform: 'uppercase', textDecoration: 'underline' }}>{checklist.facultyName}</span></div>
                    <div><strong>College:</strong> <span style={{ textTransform: 'uppercase', textDecoration: 'underline' }}>{checklist.college || 'TEACHER EDUCATION'}</span></div>
                  </div>
                  <div>
                    <div style={{ marginBottom: '5px' }}><strong>Semester & AY:</strong> <span style={{ textTransform: 'uppercase', textDecoration: 'underline' }}>{checklist.semester}, A.Y. {checklist.academicYear}</span></div>
                    <div><strong>Department:</strong> <span style={{ textTransform: 'uppercase', textDecoration: 'underline' }}>{checklist.department || 'PHYSICAL EDUCATION'}</span></div>
                  </div>
                </div>

                {/* Documents Table */}
                <div style={{ marginBottom: '30px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '12pt' }}>Documents, by subject</div>
                  <table style={{ 
                    width: '100%', 
                    borderCollapse: 'collapse', 
                    fontSize: '10pt', 
                    textAlign: 'center' 
                  }}>
                    <thead>
                      <tr>
                        <th rowSpan="2" style={{ border: '1px solid black', padding: '5px', width: '15%' }}>Subjects Taught<br/>(per class)</th>
                        <th rowSpan="2" style={{ border: '1px solid black', padding: '5px' }}>Syllabus</th>
                        <th rowSpan="2" style={{ border: '1px solid black', padding: '5px' }}>IMs</th>
                        <th colSpan="2" style={{ border: '1px solid black', padding: '5px' }}>Examinations</th>
                        <th colSpan="2" style={{ border: '1px solid black', padding: '5px' }}>TOS</th>
                        <th rowSpan="2" style={{ border: '1px solid black', padding: '5px' }}>Rubrics</th>
                        <th rowSpan="2" style={{ border: '1px solid black', padding: '5px' }}>Quizzes</th>
                        <th rowSpan="2" style={{ border: '1px solid black', padding: '5px' }}>Learning<br/>Activities</th>
                        <th rowSpan="2" style={{ border: '1px solid black', padding: '5px' }}>COTED</th>
                        <th rowSpan="2" style={{ border: '1px solid black', padding: '5px' }}>Grading<br/>Sheet</th>
                        <th rowSpan="2" style={{ border: '1px solid black', padding: '5px' }}>Class<br/>Record</th>
                      </tr>
                      <tr>
                        <th style={{ border: '1px solid black', padding: '5px' }}>Mid</th>
                        <th style={{ border: '1px solid black', padding: '5px' }}>Final</th>
                        <th style={{ border: '1px solid black', padding: '5px' }}>Mid</th>
                        <th style={{ border: '1px solid black', padding: '5px' }}>Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklist.subjects.map((subject) => (
                        <tr key={subject.id}>
                          <td style={{ border: '1px solid black', padding: '5px', textAlign: 'left', fontWeight: 'bold' }}>
                            {subject.code}
                          </td>
                          {/* 
                             Mapping Based on DEFAULT_DOCUMENTS index:
                             0: Syllabus, 1: IMs, 2: Exam(Mid), 3: Exam(Final), 
                             4: TOS(Mid), 5: TOS(Final), 6: Rubrics, 7: Quizzes, 
                             8: Learning Activities, 9: COTED, 10: Grading Sheet, 11: Class Record
                          */}
                          {checklist.documentsBySubject.map((_, idx) => {
                            const key = `subject-${subject.id}-${idx}`;
                            const upload = checklist.uploads[key];
                            const hasUpload = upload && upload.length > 0;
                            return (
                              <td key={idx} style={{ border: '1px solid black', padding: '5px' }}>
                                {hasUpload ? <span style={{ fontWeight: 'bold' }}>OK</span> : ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {/* Empty rows filler if needed, but dynamic is better */}
                    </tbody>
                  </table>
                </div>

                {/* Other Documents Table (To maintain completeness) */}
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '12pt' }}>Other Documents</div>
                  <table style={{ 
                    width: '100%', 
                    borderCollapse: 'collapse', 
                    fontSize: '10pt', 
                    textAlign: 'center' 
                  }}>
                     <thead>
                       <tr>
                         <th style={{ border: '1px solid black', padding: '5px', width: '40%', textAlign: 'left' }}>Document Name</th>
                         <th style={{ border: '1px solid black', padding: '5px' }}>Status</th>
                       </tr>
                     </thead>
                     <tbody>
                       {DEFAULT_DOCUMENTS.other.map((doc, idx) => {
                          const key = `other-${idx}`;
                          const upload = checklist.uploads[key];
                          const hasUpload = upload && upload.length > 0;
                          return (
                            <tr key={idx}>
                              <td style={{ border: '1px solid black', padding: '5px', textAlign: 'left' }}>{doc}</td>
                              <td style={{ border: '1px solid black', padding: '5px' }}>{hasUpload ? <span style={{ fontWeight: 'bold' }}>OK</span> : ''}</td>
                            </tr>
                          );
                       })}
                     </tbody>
                  </table>
                </div>

                {/* Print Footer */}
                <div className="print-footer-info">
                  Date Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer" style={{ 
              padding: '1rem', 
              borderTop: '1px solid #eee', 
              display: 'flex', 
              justifyContent: 'center',
              backgroundColor: '#f8f9fa',
              gap: '10px'
            }}>
              <button 
                className="btn btn-secondary btn-lg" 
                style={{ minWidth: '150px' }}
                onClick={() => window.print()}
              >
                🖨️ PRINT
              </button>
              <button 
                className="btn btn-primary btn-lg" 
                style={{ minWidth: '150px' }}
                onClick={() => setShowPreviewModal(false)}
              >
                CLOSE PREVIEW
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
