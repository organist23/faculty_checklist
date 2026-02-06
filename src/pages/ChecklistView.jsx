import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import DeadlineBanner from '../components/DeadlineBanner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
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
            onClick={() => onPreview(file.preview)}
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
          addToast('Checklist updated by faculty.', 'info');
          // Re-fetch to get fresh data (safest for JSONB updates)
          fetchChecklist();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchChecklist = async () => {
    try {
      setChecklist(prev => ({ ...prev, loading: true }));
      
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
      const hydrateDocs = async (docList) => {
        return await Promise.all(docList.map(async item => {
          const docsWithPreviews = await Promise.all(item.docs.map(async doc => {
             const { data: signData } = await supabase.storage
               .from('checklists')
               .createSignedUrl(doc.path, 3600);
             return { ...doc, preview: signData?.signedUrl };
          }));
          return { ...item, docs: docsWithPreviews };
        }));
      };

      const hydratedSubjects = await hydrateDocs(data.subjects);
      const hydratedOther = await hydrateDocs(data.other_docs);

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
  
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageKey, setSelectedImageKey] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

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

  const handleApprove = async () => {
    try {
      const { error } = await supabase
        .from('checklists')
        .update({ status: 'approved' })
        .eq('id', id);

      if (error) throw error;

      setChecklist(prev => ({ ...prev, status: 'approved' }));
      setShowApproveModal(false);
      addToast('Faculty checklist approved! Sending notification...', 'success');
      
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 1500);
    } catch (err) {
      console.error('Approval Error:', err);
      addToast('Failed to approve checklist.', 'error');
    }
  };

  const handleRemovePhoto = async () => {
    if (!selectedImageKey) return;
    
    const confirmReject = window.confirm('Are you sure you want to reject and remove this document?');
    if (confirmReject) {
      try {
        // Find the specific doc in the state map
        const docs = checklist.uploads[selectedImageKey];
        if (!docs || docs.length === 0) return;
        
        // Use the viewed image logic better: 
        // If we viewed a specific URL, try to find that specific doc in the list?
        // Current implementation of PhotoGrid -> onPreview passes the URL.
        // We set selectedImage = url.
        // Let's filter by the preview URL to be precise if possible, else index 0.
        const docToRemove = docs.find(d => d.preview === selectedImage) || docs[0];

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

        if (selectedImageKey.startsWith('subject-')) {
           const parts = selectedImageKey.split('-');
           // parts: ["subject", "sub", "0", "0"]
           const subId = parts.slice(1, -1).join('-'); // "sub-0"
           
           updatedSubjects = updatedSubjects.map(s => {
             if (s.id === subId) {
               const newDocs = s.docs.filter(d => d.path !== docToRemove.path);
               return { ...s, docs: newDocs };
             }
             return s;
           });
        } else {
           updatedOther = updatedOther.map(o => {
             if (o.id === selectedImageKey) {
               return { ...o, docs: o.docs.filter(d => d.path !== docToRemove.path) };
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

        addToast('Document rejected. Faculty notified for revision.', 'info');
        fetchChecklist(); 
        setSelectedImage(null);
        setSelectedImageKey(null);

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
                    <td>
                      <strong>{subject.name}</strong><br />
                      <small className="text-gray">
                        {subject.code} - {subject.course} {subject.section}
                      </small>
                    </td>
                    {checklist.documentsBySubject.map((doc, docIdx) => {
                      const key = `subject-${subject.id}-${docIdx}`;
                      const upload = checklist.uploads[key];
                      
                      return (
                        <td key={docIdx}>
                          {getUploadStatus(key)}
                          {upload && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <PhotoGrid 
                                uploads={upload} 
                                onPreview={(url) => {
                                  setSelectedImage(url);
                                  setSelectedImageKey(key);
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
                      <td><strong>{doc}</strong></td>
                      <td>{getUploadStatus(key)}</td>
                      <td>
                        {upload && (
                          <PhotoGrid 
                            uploads={upload} 
                            onPreview={(url) => {
                              setSelectedImage(url);
                              setSelectedImageKey(key);
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
              <button 
                className="btn btn-primary btn-lg"
                onClick={() => setShowApproveModal(true)}
              >
                Approve Checklist
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="modal-backdrop"
          onClick={() => setSelectedImage(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="modal-title">Document Preview</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button 
                  className="btn btn-danger btn-sm"
                  onClick={handleRemovePhoto}
                >
                  Reject & Remove
                </button>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setSelectedImage(null);
                    setSelectedImageKey(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <img 
                src={selectedImage} 
                alt="Document preview" 
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)' }}
              />
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
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h3 className="modal-title">📄 Overall Submission Preview</h3>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="mb-6 p-4 rounded" style={{ backgroundColor: 'var(--brand-green-pale)', border: '1px solid var(--nvsu-green-light)' }}>
                <h4 style={{ color: 'var(--nvsu-green)', marginBottom: 'var(--space-2)' }}>Faculty Submission Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div><strong>Faculty:</strong> {checklist.facultyName}</div>
                  <div><strong>Term:</strong> {checklist.semester}</div>
                  <div><strong>College:</strong> {checklist.college}</div>
                  <div><strong>A.Y.:</strong> {checklist.academicYear}</div>
                </div>
              </div>

              {/* Subject Documents Summary */}
              <div className="mb-6">
                <h4 style={{ borderBottom: '2px solid var(--nvsu-green)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                  Documents by Subjects
                </h4>
                {checklist.subjects.map((subject) => (
                  <div key={subject.id} className="mb-4">
                    <h5 style={{ color: 'var(--nvsu-green)', marginBottom: 'var(--space-2)' }}>
                      {subject.code} - {subject.name}
                    </h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-2)' }}>
                      {checklist.documentsBySubject.map((doc, idx) => {
                        const key = `subject-${subject.id}-${idx}`;
                        const upload = checklist.uploads[key];
                        return (
                          <div key={idx} style={{ 
                            padding: 'var(--space-2)', 
                            borderRadius: '4px', 
                            fontSize: 'var(--text-xs)',
                            backgroundColor: upload ? '#f0fff4' : '#fff5f5',
                            border: `1px solid ${upload ? '#c6f6d5' : '#fed7d7'}`
                          }}>
                            {upload ? '✅' : '❌'} {doc}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Other Documents Summary */}
              <div>
                <h4 style={{ borderBottom: '2px solid var(--nvsu-green)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                  Other Documents
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-2)' }}>
                  {checklist.otherDocuments.map((doc, idx) => {
                    const key = `other-${idx}`;
                    const upload = checklist.uploads[key];
                    return (
                      <div key={idx} style={{ 
                        padding: 'var(--space-2)', 
                        borderRadius: '4px', 
                        fontSize: 'var(--text-xs)',
                        backgroundColor: upload ? '#f0fff4' : '#fff5f5',
                        border: `1px solid ${upload ? '#c6f6d5' : '#fed7d7'}`
                      }}>
                        {upload ? '✅' : '❌'} {doc}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button 
                className="btn btn-primary btn-lg" 
                style={{ minWidth: '150px' }}
                onClick={() => setShowPreviewModal(false)}
              >
                OKAY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
