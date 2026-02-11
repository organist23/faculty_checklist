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
    'Student Consultation Form', 'Student Evaluation (FPESf)', 
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
    <span className="photo-preview" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
      {displayUploads.map((file, idx) => {
        const isLate = deadline && file.uploadedAt && new Date(file.uploadedAt) > new Date(deadline);
        const statusColor = isLate ? 'var(--nvsu-red)' : 'var(--brand-green)';
        
        return (
          <span 
            key={idx} 
            className="photo-thumbnail-container"
            title={`Uploaded: ${new Date(file.uploadedAt || Date.now()).toLocaleString()} (${isLate ? 'LATE' : 'On-time'})`}
            style={{ 
              position: 'relative', 
              display: 'inline-block',
              width: '64px',
              height: '64px',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 3px 10px rgba(0,0,0,0.12)',
              background: 'var(--gray-100)',
              cursor: 'pointer',
              transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
            onClick={() => onPreview(file, uploads, idx)}
            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {/* Smooth Status Bar at bottom */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: statusColor, zIndex: 3 }}></div>
            
            {file.preview ? (
              <img 
                src={file.preview} 
                alt={file.name} 
                style={{ 
                  display: 'block', 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover' 
                }} 
              />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '12px' }}>📄</span>
            )}

            {idx === displayLimit - 1 && remainingCount > 0 && (
              <div 
                style={{ 
                  position: 'absolute', 
                  inset: 0, 
                  background: 'rgba(0,0,0,0.5)', 
                  backdropFilter: 'blur(1px)', 
                  color: 'white', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '10px', 
                  fontWeight: '800', 
                  zIndex: 2,
                  pointerEvents: 'none'
                }}
              >
                +{remainingCount + 1}
              </div>
            )}
          </span>
        );
      })}
    </span>
  );
};

export default function ChecklistView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: admin } = useAuth();
  const { addToast } = useToast();
  const { confirm, showAlert } = useConfirm();
  
  const [internalSearch, setInternalSearch] = useState('');
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
    uploads: {}, // Initialize to empty object to prevent render crashes
    error: null
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
        setChecklist(prev => ({ ...prev, loading: true, error: null }));
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
      // Batched Hydration for Admin View
      const hydrateAllDocs = async () => {
         const subjects = data.subjects || [];
         const other = data.other_docs || [];
         
         // Robustly collect paths, filtering out empty/null ones
         const allPaths = [];
         subjects.forEach(s => s.docs?.forEach(d => { if (d.path) allPaths.push(d.path); }));
         other.forEach(o => o.docs?.forEach(d => { if (d.path) allPaths.push(d.path); }));

         if (allPaths.length === 0) return { subjects, other };

         let urlMap = {};

         try {
           const { data: signedData, error: signError } = await supabase.storage
              .from('checklists')
              .createSignedUrls(allPaths, 3600);

           if (signError) {
               console.error('Error signing URLs (Check permission policies):', signError);
               // Proceed to try public URL fallback
           } else {
               signedData?.forEach(item => {
                   if (item.path && item.signedUrl) urlMap[item.path] = item.signedUrl;
                   else if (item.path && item.error) console.warn(`Failed to sign ${item.path}:`, item.error);
               });
           }
         } catch (err) {
            console.error('Exception during signing:', err);
         }

         // Fallback: If signed URL is missing, try getPublicUrl (works if bucket is public)
         // or keep the path (might allow download later)
         const mapDocs = (list) => list.map(item => ({
             ...item,
             docs: (item.docs || []).map(d => {
                const signed = urlMap[d.path];
                let previewUrl = signed;
                
                if (!previewUrl && d.path) {
                   // Fallback to public URL if no signed URL found
                   const { data: publicData } = supabase.storage
                      .from('checklists')
                      .getPublicUrl(d.path);
                   previewUrl = publicData.publicUrl;
                }
                
                return { ...d, preview: previewUrl };
             })
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
      
      hydratedOther.forEach((item) => {
          if (item.docs && item.docs.length > 0 && item.name) {
             uploadsMap[item.name] = item.docs;
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
      setChecklist(prev => ({ ...prev, loading: false, error: err.message }));
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
    offset: { x: 0, y: 0 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
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
    if (checklist.error) {
       addToast('System error: Action restricted.', 'error');
       return;
    }
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
    
    if (checklist.error) {
      addToast('System error detected. All actions are temporarily restricted.', 'error');
      return;
    }
    
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
        } else { // This is an 'other' document, keyed by its name
           updatedOther = updatedOther.map(o => {
             if (o.name === key) { // Match by name, not by item.id
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
        <span className="upload-status uploaded" style={{ display: 'block' }}>
          ✓ {upload.length} file(s)
        </span>
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
      } else { // This is an 'other' document, keyed by its name
         const item = checklist.other_docs.find(o => o.name === key); // Match by name
         if (item && item.rejected) {
           isRejected = true;
         }
      }
    } catch (e) {
      console.warn('Error checking rejection status', e);
    }

    if (isRejected) {
      return (
        <span className="upload-status" style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '0.9em', display: 'block' }}>
          ⚠️ Waiting for Revision
        </span>
      );
    }
    
    return (
      <span className="upload-status" style={{ display: 'block' }}>
        ⏳ Not uploaded
      </span>
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

        {/* Search Bar - Minimizing scrolling hassle */}
        <div className="card mb-8" style={{ padding: '0', borderRadius: '20px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 24px', background: 'white' }}>
            <span style={{ fontSize: '1.2rem', marginRight: '16px', color: 'var(--gray-400)' }}>🔍</span>
            <input 
              type="text" 
              placeholder="Search documents, subjects, or status..." 
              value={internalSearch}
              onChange={(e) => setInternalSearch(e.target.value)}
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                fontSize: '1rem',
                fontWeight: '500',
                color: 'var(--gray-700)',
                background: 'transparent'
              }}
            />
            {internalSearch && (
              <button 
                onClick={() => setInternalSearch('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--gray-400)',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  padding: '4px'
                }}
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Premium Section 1: Documents by Subject */}
        {(() => {
          const searchTerm = internalSearch.trim().toLowerCase();
          const isSearchActive = searchTerm.length > 0;
          
          // Identify if the search term matches any document category
          const matchingDocIndices = [];
          checklist.documentsBySubject.forEach((doc, idx) => {
            if (doc.toLowerCase().includes(searchTerm)) matchingDocIndices.push(idx);
          });

          const isDocumentSearch = matchingDocIndices.length > 0;

          const filteredSubjects = isSearchActive 
            ? checklist.subjects.filter(sub => {
                const nameMatch = sub.name.toLowerCase().includes(searchTerm) || sub.code.toLowerCase().includes(searchTerm);
                
                // If the user is specifically searching for a document (e.g., "Rubrics"), 
                // only show subjects that have that document uploaded.
                if (isDocumentSearch) {
                  const hasMatchingUpload = matchingDocIndices.some(idx => {
                    const key = `subject-${sub.id}-${idx}`;
                    return checklist.uploads[key] && checklist.uploads[key].length > 0;
                  });
                  return nameMatch || hasMatchingUpload;
                }
                
                return nameMatch;
              })
            : checklist.subjects;

          if (isSearchActive && filteredSubjects.length === 0) return null;

          // Headers: Only hide columns if it's a document-specific search
          const activeDocIndices = isDocumentSearch ? matchingDocIndices : checklist.documentsBySubject.map((_, i) => i);

          return (
            <div className="card mb-8" style={{ border: 'none', boxShadow: '0 4px 25px -5px rgba(0,0,0,0.08)', borderRadius: '24px', overflow: 'hidden' }}>
              <div style={{ 
                padding: '24px 32px', 
                background: 'linear-gradient(to right, #f1f5f9, #ffffff)', 
                borderBottom: '1px solid var(--gray-100)',
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px'
              }}>
                <span style={{ background: 'var(--brand-blue-pale)', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📚</span>
                <h2 className="card-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                  Section 1: Documents by Subject {isSearchActive && <span className="text-gray" style={{ fontSize: '0.75em', fontWeight: '500' }}>(Filtered)</span>}
                </h2>
              </div>
              <div className="table-responsive">
                <table className="table" style={{ borderCollapse: 'separate', borderSpacing: '0' }}>
                  <thead>
                    <tr>
                      <th style={{ background: '#f8fafc', padding: '16px 24px', borderBottom: '2px solid var(--gray-100)', width: '25%' }}>Subject Heading</th>
                      {checklist.documentsBySubject.map((doc, idx) => {
                        if (!activeDocIndices.includes(idx)) return null;
                        return (
                          <th key={idx} style={{ 
                            background: '#f8fafc', 
                            padding: '16px 12px', 
                            borderBottom: '2px solid var(--gray-100)', 
                            textAlign: 'center',
                            fontSize: '0.8rem',
                            minWidth: '100px'
                          }}>
                            {doc}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubjects.map((subject) => (
                      <tr key={subject.id} style={{ transition: 'background 0.2s' }}>
                        <td data-label="Subject" style={{ padding: '16px 24px', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: '800', color: 'var(--brand-blue-dark)' }}>{subject.code}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', fontWeight: '500' }}>{subject.name}</div>
                        </td>
                        {checklist.documentsBySubject.map((doc, docIdx) => {
                          if (!activeDocIndices.includes(docIdx)) return null;
                          const key = `subject-${subject.id}-${docIdx}`;
                          const upload = checklist.uploads[key];
                          const isRejected = subject.rejected_types?.includes(doc);
                          
                          return (
                            <td key={docIdx} data-label={doc} style={{ 
                              padding: '12px 16px', 
                              verticalAlign: 'middle', 
                              textAlign: 'center',
                              backgroundColor: isRejected ? '#fff5f5' : 'transparent',
                              position: 'relative',
                              borderLeft: isRejected ? '2px solid #ef4444' : 'none'
                            }}>
                              {isRejected && (
                                 <div style={{ 
                                   position: 'absolute', 
                                   top: 0, 
                                   left: 0, 
                                   right: 0, 
                                   fontSize: '8px', 
                                   background: '#ef4444', 
                                   color: 'white', 
                                   fontWeight: '900', 
                                   padding: '2px 0',
                                   letterSpacing: '0.5px'
                                 }}>VOIDED</div>
                              )}
                              <div style={{ marginTop: isRejected ? '10px' : '0' }}>
                                {getUploadStatus(key)}
                              </div>
                              {upload && (
                                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                                  <PhotoGrid 
                                    uploads={upload} 
                                    onPreview={(file, allFiles, index) => {
                                      setPreviewState({
                                        isOpen: true,
                                        imageSrc: file.preview,
                                        files: allFiles,
                                        currentIndex: index,
                                        zoom: 1,
                                        offset: { x: 0, y: 0 },
                                        isDragging: false,
                                        dragStart: { x: 0, y: 0 },
                                        contextKey: key
                                      });
                                    }} 
                                    deadline={checklist.deadline}
                                  />
                                </span>
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
          );
        })()}

        {/* Premium Section 2: Other Documents */}
        {(() => {
          const searchTerm = internalSearch.trim().toLowerCase();
          const isSearchActive = searchTerm.length > 0;
          
          const filteredOtherDocs = isSearchActive 
            ? checklist.otherDocuments.filter(docName => {
                const nameMatch = docName.toLowerCase().includes(searchTerm);
                const upload = checklist.uploads?.[docName];
                const hasContent = upload && upload.length > 0;
                
                // If the user types a specific document, only show it if it has an upload
                // Or if they are searching for a name that matches regardless of content.
                // We prioritize: matches search AND (if search is exact doc name, must have content)
                return nameMatch && hasContent;
              })
            : checklist.otherDocuments;

          if (isSearchActive && filteredOtherDocs.length === 0) return null;

          return (
            <div className="card mb-8" style={{ border: 'none', boxShadow: '0 4px 25px -5px rgba(0,0,0,0.08)', borderRadius: '24px', overflow: 'hidden' }}>
              <div style={{ 
                padding: '24px 32px', 
                background: 'linear-gradient(to right, #f1f5f9, #ffffff)', 
                borderBottom: '1px solid var(--gray-100)',
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px'
              }}>
                <span style={{ background: 'var(--brand-green-pale)', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📄</span>
                <h2 className="card-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                  Section 2: Other Documents {isSearchActive && <span className="text-gray" style={{ fontSize: '0.75em', fontWeight: '500' }}>(Filtered)</span>}
                </h2>
              </div>
              <div className="table-responsive">
                <table className="table" style={{ borderCollapse: 'separate', borderSpacing: '0' }}>
                  <thead>
                    <tr>
                      <th style={{ background: '#f8fafc', padding: '16px 24px', borderBottom: '2px solid var(--gray-100)', width: '40%' }}>Document Item</th>
                      <th style={{ background: '#f8fafc', padding: '16px', borderBottom: '2px solid var(--gray-100)', textAlign: 'center' }}>Status</th>
                      <th style={{ background: '#f8fafc', padding: '16px', borderBottom: '2px solid var(--gray-100)', textAlign: 'center' }}>Preview</th>
                      <th style={{ background: '#f8fafc', padding: '16px', borderBottom: '2px solid var(--gray-100)', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOtherDocs.map((docName) => { 
                      const key = docName;
                      const upload = checklist.uploads?.[key];
                      
                      return (
                        <tr key={docName}>
                          <td data-label="Document"><strong>{docName}</strong></td>
                          <td data-label="Status" style={{ textAlign: 'center' }}>{getUploadStatus(key)}</td>
                          <td data-label="Preview" style={{ textAlign: 'center' }}>
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
                                    offset: { x: 0, y: 0 },
                                    isDragging: false,
                                    dragStart: { x: 0, y: 0 },
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
          );
        })()}

        {/* Premium Approval Action Footer */}
        <div style={{ 
          background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)', 
          borderRadius: '24px', 
          padding: '32px', 
          boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)',
          border: '1px solid var(--gray-100)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '24px',
          marginBottom: '40px'
        }}>
          <div style={{ textAlign: viewportWidth < 768 ? 'center' : 'left', width: viewportWidth < 768 ? '100%' : 'auto' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: 'var(--brand-blue-dark)' }}>Chair Verification</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--gray-500)', fontWeight: '500' }}>Confirm the completeness and validity of this submission.</p>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: viewportWidth < 768 ? 'center' : 'flex-end', width: viewportWidth < 768 ? '100%' : 'auto' }}>
              <button 
                className="btn btn-outline"
                style={{ padding: '12px 32px', borderRadius: '12px', fontWeight: '700', background: 'white' }}
                onClick={() => setShowPreviewModal(true)}
              >
                📄 Print View
              </button>

            {checklist.status === 'approved' ? (
              <button 
                className="btn destructive"
                style={{ 
                  padding: '12px 32px', 
                  border: 'none', 
                  borderRadius: '12px', 
                  fontWeight: '800', 
                  color: '#ef4444', 
                  background: '#fee2e2',
                  opacity: checklist.error ? 0.5 : 1
                }}
                disabled={!!checklist.error}
                onClick={async () => {
                  if (checklist.error) return;
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
                ↩️ Revert Approval
              </button>
            ) : (
              <button 
                className={`btn btn-primary ${checklist.error ? 'disabled' : ''}`}
                style={{ 
                  padding: '12px 48px', 
                  borderRadius: '12px', 
                  fontWeight: '900', 
                  fontSize: '1rem',
                  boxShadow: checklist.error ? 'none' : '0 10px 20px -5px rgba(26, 67, 128, 0.3)',
                  opacity: checklist.error ? 0.5 : 1
                }}
                disabled={!!checklist.error}
                onClick={() => !checklist.error && setShowApproveModal(true)}
              >
                Approve Checklist
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Enhanced Image Modal with Panning and Zoom */}
      {previewState.isOpen && (
        <div 
          className="modal-overlay" 
          style={{ 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            backgroundColor: 'rgba(0,0,0,0.95)', 
            position: 'fixed', 
            top: 0, left: 0, right: 0, bottom: 0,
            overflow: 'hidden',
            touchAction: 'none'
          }} 
          onClick={() => setPreviewState(prev => ({ ...prev, isOpen: false }))}
          onMouseMove={(e) => {
            if (!previewState.isDragging) return;
            const dx = e.clientX - previewState.dragStart.x;
            const dy = e.clientY - previewState.dragStart.y;
            setPreviewState(prev => ({
              ...prev,
              offset: { x: prev.offset.x + dx, y: prev.offset.y + dy },
              dragStart: { x: e.clientX, y: e.clientY }
            }));
          }}
          onMouseUp={() => setPreviewState(prev => ({ ...prev, isDragging: false }))}
          onMouseLeave={() => setPreviewState(prev => ({ ...prev, isDragging: false }))}
          onTouchMove={(e) => {
            if (!previewState.isDragging || e.touches.length !== 1) return;
            const touch = e.touches[0];
            const dx = touch.clientX - previewState.dragStart.x;
            const dy = touch.clientY - previewState.dragStart.y;
            setPreviewState(prev => ({
              ...prev,
              offset: { x: prev.offset.x + dx, y: prev.offset.y + dy },
              dragStart: { x: touch.clientX, y: touch.clientY }
            }));
          }}
          onTouchEnd={() => setPreviewState(prev => ({ ...prev, isDragging: false }))}
        >
          <div className="modal-content" style={{ width: '100%', height: '100%', background: 'transparent', boxShadow: 'none', padding: 0, position: 'relative' }} onClick={e => e.stopPropagation()}>
             
             {/* Standard Professional Toolbar */}
             <div style={{ 
               position: 'absolute', 
               top: '20px', 
               right: '20px', 
               display: 'flex', 
               gap: '8px', 
               zIndex: 100,
               background: 'rgba(0,0,0,0.5)',
               padding: '10px',
               borderRadius: '8px'
             }}>
               <button 
                 className="btn btn-sm" 
                 style={{ background: '#3b82f6', color: 'white', border: 'none' }} 
                 onClick={() => setPreviewState(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.3, 5) }))}
               >
                 Zoom In
               </button>
               <button 
                 className="btn btn-sm" 
                 style={{ background: '#3b82f6', color: 'white', border: 'none' }} 
                 onClick={() => setPreviewState(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.3, 0.5), offset: prev.zoom <= 0.8 ? {x:0, y:0} : prev.offset }))}
               >
                 Zoom Out
               </button>

               <button 
                 className="btn btn-sm" 
                 style={{ background: '#ef4444', color: 'white', border: 'none', fontWeight: 'bold' }} 
                 onClick={() => handleRemovePhoto(previewState.contextKey, previewState.files[previewState.currentIndex])}
               >
                 REJECT
               </button>

               <button 
                 className="btn btn-sm" 
                 style={{ background: '#6b7280', color: 'white', border: 'none' }} 
                 onClick={() => setPreviewState(prev => ({ ...prev, isOpen: false, zoom: 1, offset: {x:0, y:0} }))}
               >
                 CLOSE
               </button>
             </div>

             {/* Navigation - Left */}
             {previewState.files.length > 1 && (
               <button 
                 style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '2.5rem', cursor: 'pointer', padding: '15px 25px', borderRadius: '50%', backdropFilter: 'blur(5px)', zIndex: 5, transition: 'all 0.3s ease' }}
                 onClick={(e) => {
                   e.stopPropagation();
                   setPreviewState(prev => {
                     const newIndex = (prev.currentIndex - 1 + prev.files.length) % prev.files.length;
                     return { ...prev, currentIndex: newIndex, imageSrc: prev.files[newIndex].preview, zoom: 1, offset: {x:0, y:0} };
                   });
                 }}
               >
                 ‹
               </button>
             )}

             {/* Viewport & Image */}
             <div 
               style={{ 
                 width: '100%', 
                 height: '100%', 
                 display: 'flex', 
                 justifyContent: 'center', 
                 alignItems: 'center',
                 cursor: previewState.isDragging ? 'grabbing' : (previewState.zoom > 1 ? 'grab' : 'default'),
                 userSelect: 'none'
               }}
               onMouseDown={(e) => {
                 setPreviewState(prev => ({
                   ...prev,
                   isDragging: true,
                   dragStart: { x: e.clientX, y: e.clientY }
                 }));
               }}
               onTouchStart={(e) => {
                 if (e.touches.length !== 1) return;
                 const touch = e.touches[0];
                 setPreviewState(prev => ({
                   ...prev,
                   isDragging: true,
                   dragStart: { x: touch.clientX, y: touch.clientY }
                 }));
               }}
             >
               <div style={{ 
                 transform: `translate(${previewState.offset.x}px, ${previewState.offset.y}px) scale(${previewState.zoom})`, 
                 transition: previewState.isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                 willChange: 'transform'
               }}>
                 <img 
                   src={previewState.imageSrc} 
                   style={{ 
                     maxHeight: '85vh', 
                     maxWidth: '85vw', 
                     objectFit: 'contain',
                     boxShadow: '0 30px 60px rgba(0,0,0,0.8)',
                     borderRadius: '8px',
                     pointerEvents: 'none'
                   }} 
                   alt="Preview Document" 
                 />
               </div>
             </div>

             {/* Navigation - Right */}
             {previewState.files.length > 1 && (
               <button 
                 style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '2.5rem', cursor: 'pointer', padding: '15px 25px', borderRadius: '50%', backdropFilter: 'blur(5px)', zIndex: 5, transition: 'all 0.3s ease' }}
                 onClick={(e) => {
                   e.stopPropagation();
                   setPreviewState(prev => {
                     const newIndex = (prev.currentIndex + 1) % prev.files.length;
                     return { ...prev, currentIndex: newIndex, imageSrc: prev.files[newIndex].preview, zoom: 1, offset: {x:0, y:0} };
                   });
                 }}
               >
                 ›
               </button>
             )}

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
                  border: '2px solid black', 
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
                          <td style={{ border: '1px solid black', padding: '5px', textAlign: 'left' }}>
                            <div style={{ fontWeight: 'bold' }}>{subject.code}</div>
                            <div style={{ fontSize: '8pt', color: '#666', fontWeight: 'normal' }}>{subject.name}</div>
                          </td>{checklist.documentsBySubject.map((_, idx) => {
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
                           const upload = checklist.uploads[doc];
                           const hasUpload = upload && upload.length > 0;
                           return (
                             <tr key={idx}>
                                <td style={{ border: '1px solid black', padding: '5px', textAlign: 'left' }}>{doc}</td><td style={{ border: '1px solid black', padding: '5px' }}>{hasUpload ? <span style={{ fontWeight: 'bold' }}>OK</span> : ''}</td>
                              </tr>
                           );
                        })}
                     </tbody>
                  </table>
                </div>

                {/* Footer Notes & Signatures */}
                {/* Footer Notes & Signatures */}
                <div className="print-footer-signatures" style={{ marginTop: '20px', fontSize: '9pt', color: 'black' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontWeight: 'bold' }}>* Licensure Educational Testing Center</div>
                    <div style={{ fontStyle: 'italic', marginTop: '2px' }}>Note: The Department Chair is to put the date of submission.</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                      <div style={{ marginBottom: '30px' }}>Checked and verified:</div>
                      <div style={{ borderBottom: '1px solid black', width: '200px', marginBottom: '4px' }}></div>
                      <div style={{ fontWeight: 'bold' }}>Department/Program Chair, {checklist.department || 'BPED'} Department</div>
                    </div>
                    <div>
                      <div style={{ marginBottom: '30px' }}>Approved:</div>
                      <div style={{ borderBottom: '1px solid black', width: '200px', marginBottom: '4px' }}></div>
                      <div style={{ fontWeight: 'bold' }}>Dean, {checklist.college || 'College of Teacher Education'}</div>
                    </div>
                  </div>
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
                 className={`btn btn-secondary btn-lg ${checklist.error ? 'disabled' : ''}`} 
                 style={{ minWidth: '150px', opacity: checklist.error ? 0.5 : 1 }}
                 disabled={!!checklist.error}
                 onClick={() => !checklist.error && window.print()}
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
