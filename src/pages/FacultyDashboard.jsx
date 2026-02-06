import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import DeadlineBanner from '../components/DeadlineBanner';
import { useSystem } from '../context/SystemContext';
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

const PhotoGrid = ({ uploads, onRemove, disabled, deadline }) => {
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
            title={`Uploaded: ${new Date(file.uploadedAt || Date.now()).toLocaleString()} (${isLate ? 'LATE' : 'On-time'})`}
          >
            <div className={`status-indicator ${statusClass}`}></div>
            {file.preview ? (
              <img src={file.preview} alt={file.name} />
            ) : (
              <div className="file-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '10px' }}>📄</div>
            )}
            {!disabled && (
              <button
                className="photo-remove"
                onClick={(e) => {
                  e.preventDefault();
                  onRemove(idx);
                }}
                title="Remove"
              >
                ×
              </button>
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

export default function FacultyDashboard() {
  const { user } = useAuth();
  const { settings } = useSystem();
  const { addToast } = useToast();
  
  const [checklist, setChecklist] = useState({
    id: null,
    status: 'in_progress',
    subjects: [],
    other_docs: [],
    loading: true
  });
  
  const [selectedTerm, setSelectedTerm] = useState('LIVE');
  const [availableTerms, setAvailableTerms] = useState([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchChecklist();
      fetchAvailableTerms();

      // Realtime Subscription
      const channel = supabase
        .channel(`faculty-dashboard-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'checklists',
            filter: `faculty_id=eq.${user.id}`
          },
          (payload) => {
            console.log('Faculty Realtime Update:', payload);
            if (payload.eventType === 'UPDATE') {
               // If status changed to revision, alert them
               if (payload.new.status === 'revision' && payload.old.status !== 'revision') {
                  addToast('Updates requested by Admin. Please check your documents.', 'info');
               } else if (payload.new.status === 'approved') {
                  addToast('Checklist Approved!', 'success');
               }
            }
            fetchChecklist();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id, settings.semester, settings.academicYear, selectedTerm]);

  const fetchAvailableTerms = async () => {
    try {
      const { data, error } = await supabase
        .from('checklists')
        .select('term_id')
        .eq('faculty_id', user.id);
      
      if (error) throw error;
      const terms = [...new Set(data.map(c => c.term_id))];
      setAvailableTerms(terms);
    } catch (err) {
      console.error('Fetch Terms Error:', err);
    }
  };

  const fetchChecklist = async () => {
    try {
      setChecklist(prev => ({ ...prev, loading: true }));
      const termId = selectedTerm === 'LIVE' 
        ? `${settings.academicYear}-${settings.semester}` 
        : selectedTerm;

      // 1. Try to find existing checklist
      let { data, error } = await supabase
        .from('checklists')
        .select('*')
        .eq('faculty_id', user.id)
        .eq('term_id', termId)
        .maybeSingle();

      if (error) throw error;

      // 2. If not found and it's for the LIVE term, create one
      if (!data && selectedTerm === 'LIVE') {
        const initialSubjects = user.default_subjects?.map((name, idx) => ({
          id: `sub-${idx}`,
          name,
          code: `CODE-${idx}`,
          course: 'N/A',
          section: 'N/A',
          docs: []
        })) || [];

        const initialOther = DEFAULT_DOCUMENTS.other.map((name, idx) => ({
          id: `other-${idx}`,
          name,
          docs: []
        }));

        const { data: newData, error: createError } = await supabase
          .from('checklists')
          .insert({
            faculty_id: user.id,
            term_id: termId,
            status: 'pending',
            subjects: initialSubjects,
            other_docs: initialOther
          })
          .select()
          .single();

        if (createError) {
          if (createError.code === '23505') {
            const { data: existingData } = await supabase
              .from('checklists')
              .select('*')
              .eq('faculty_id', user.id)
              .eq('term_id', termId)
              .single();
            data = existingData;
          } else {
            throw createError;
          }
        } else {
          data = newData;
        }
      }

      if (data) {
        // Hydrate previews for documents if they exist
        const hydrateDocs = async (docList = []) => {
          if (!docList) return [];
          return await Promise.all(docList.map(async item => {
            const docsWithPreviews = await Promise.all((item.docs || []).map(async doc => {
               const { data: signData } = await supabase.storage
                 .from('checklists')
                 .createSignedUrl(doc.path, 3600);
               return { ...doc, preview: signData?.signedUrl };
            }));
            return { ...item, docs: docsWithPreviews };
          }));
        };

        const hydratedSubjects = await hydrateDocs(data.subjects || []);
        const hydratedOther = await hydrateDocs(data.other_docs || []);

        setChecklist({
          id: data.id,
          status: data.status,
          college: user.college,
          department: user.department,
          semester: settings.semester,
          academicYear: settings.academicYear,
          deadline: settings.deadline,
          subjects: hydratedSubjects,
          other_docs: hydratedOther,
          loading: false
        });
      } else {
        setChecklist(prev => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error('Checklist Load Error:', err);
      setChecklist(prev => ({ ...prev, loading: false, error: err.message }));
    }
  };

  const calculateProgress = () => {
    const totalSubjectItems = (checklist.subjects || []).reduce((acc, sub) => acc + (DEFAULT_DOCUMENTS.subjects.length), 0);
    const totalOtherItems = (checklist.other_docs || []).length;
    const totalItems = totalSubjectItems + totalOtherItems;

    const uploadedSubjectItems = (checklist.subjects || []).reduce((acc, sub) => acc + (sub?.docs?.length || 0), 0); 
    const uploadedOtherItems = (checklist.other_docs || []).reduce((acc, item) => acc + (item?.docs?.length > 0 ? 1 : 0), 0);
    
    const uploadedCount = uploadedSubjectItems + uploadedOtherItems;
    const totalRequired = totalItems; // Simplified total count

    return {
      total: totalRequired > 0 ? Math.round((uploadedCount / totalRequired) * 100) : 0,
      uploadedCount,
      remainingCount: Math.max(0, totalRequired - uploadedCount),
      bySubject: totalSubjectItems > 0 ? Math.round((uploadedSubjectItems / totalSubjectItems) * 100) : 0,
      other: totalOtherItems > 0 ? Math.round((uploadedOtherItems / totalOtherItems) * 100) : 0
    };
  };

  const progress = calculateProgress();

  // Derive uploads map for UI
  const uploads = {};
  if (!checklist.loading) {
    checklist.subjects.forEach(sub => {
       sub.docs.forEach(doc => {
          if (doc.type) {
             const docIdx = DEFAULT_DOCUMENTS.subjects.indexOf(doc.type);
             if (docIdx > -1) {
                const k = `subject-${sub.id}-${docIdx}`;
                if (!uploads[k]) uploads[k] = [];
                uploads[k].push(doc);
             }
          }
       });
    });
    checklist.other_docs.forEach((od, i) => {
       const k = `other-${i}`; 
       uploads[k] = od.docs || [];
    });
  }

  const handleFileUpload = async (key, files) => {
    if (!files || files.length === 0) return;
    
    addToast('Uploading to Supabase Storage...', 'info');
    
    try {
      let type, itemId, docName;

      // Parse Key
      if (key.startsWith('other-')) {
         type = 'other';
         itemId = key; 
      } else if (key.startsWith('subject-')) {
         type = 'subject';
         const parts = key.split('-');
         const docIdx = parseInt(parts[parts.length - 1]);
         itemId = parts.slice(1, parts.length - 1).join('-');
         docName = DEFAULT_DOCUMENTS.subjects[docIdx];
      }

      const newDocs = [];
      for (const file of Array.from(files)) {
        // Unique filename with random string to prevent collisions
        const uniqueSuffix = Math.random().toString(36).substring(2, 15);
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${user.id}/${Date.now()}_${uniqueSuffix}_${cleanName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('checklists')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: signData } = await supabase.storage
          .from('checklists')
          .createSignedUrl(filePath, 3600);

        newDocs.push({
          name: file.name,
          path: filePath,
          preview: signData?.signedUrl,
          uploadedAt: new Date().toISOString(),
          type: docName 
        });
      }

      // Update State IMMUTABLY
      setChecklist(prev => {
        // Deep copy the relevant arrays to avoid mutation
        const updatedSubjects = prev.subjects.map(s => s.id === itemId && type === 'subject' 
          ? { ...s, docs: [...s.docs, ...newDocs] } 
          : s
        );
        
        const updatedOther = prev.other_docs.map(o => o.id === itemId && type === 'other'
          ? { ...o, docs: [...o.docs, ...newDocs] }
          : o
        );
        
        const newState = {
          ...prev,
          subjects: updatedSubjects,
          other_docs: updatedOther
        };

        // Sync with DB
        // Fire-and-forget DB update or await it? 
        // Better to await to ensure consistency, but inside setState is tricky.
        // We will call the DB update explicitly with the NEW state data.
        updateChecklistInDB(newState);

        return newState;
      });

      addToast('Upload successful!', 'success');
    } catch (err) {
      console.error('Upload Error:', err);
      addToast('Upload failed: ' + err.message, 'error');
    }
  };

  const updateChecklistInDB = async (state) => {
    try {
      const { error } = await supabase
        .from('checklists')
        .update({
          subjects: state.subjects.map(s => ({ 
              ...s, 
              docs: s.docs.map(d => ({ ...d, preview: undefined })) 
          })),
          other_docs: state.other_docs.map(o => ({ 
              ...o, 
              docs: o.docs.map(d => ({ ...d, preview: undefined })) 
          })),
          updated_at: new Date().toISOString()
        })
        .eq('id', state.id);
        
      if (error) console.error('DB Auto-save failed:', error);
    } catch (err) {
      console.error('DB Update Exception:', err);
    }
  };

  const removeUpload = async (key, fileIndex) => {
    try {
      let docToRemove;
      let type, itemId, docName;

      // 1. IDENTIFY THE FILE AND METADATA (Read-only check first)
      const currentSnapshot = checklist; 
      
      if (key.startsWith('other-')) {
         type = 'other';
         itemId = key;
         const item = currentSnapshot.other_docs.find(o => o.id === itemId);
         if (item && item.docs[fileIndex]) {
             docToRemove = item.docs[fileIndex];
         }
      } else if (key.startsWith('subject-')) {
         type = 'subject';
         const parts = key.split('-');
         const docIdx = parseInt(parts[parts.length - 1]);
         itemId = parts.slice(1, parts.length - 1).join('-'); 
         docName = DEFAULT_DOCUMENTS.subjects[docIdx];
         
         const subject = currentSnapshot.subjects.find(s => s.id === itemId);
         if (subject) {
             const docsOfType = subject.docs.filter(d => d.type === docName);
             docToRemove = docsOfType[fileIndex]; 
         }
      }

      if (!docToRemove) {
        console.warn('Document to remove not found in state', { key, fileIndex });
        return;
      }

      const confirmRemove = window.confirm('Are you sure you want to remove this file?');
      if (!confirmRemove) return;

      // 2. DELETE FROM STORAGE
      if (docToRemove.path) {
        const { error: storageError } = await supabase.storage
          .from('checklists')
          .remove([docToRemove.path]);
        
        if (storageError) {
          console.error('Storage Remove Error:', storageError);
          // We continue to remove from DB even if storage fail (orphan cleanup) or throw?
          // Usually best to throw to keep sync, but orphans are better than ghost UI.
          // Let's throw to warn user.
          throw new Error('Failed to delete file from storage.');
        }
      }

      // 3. UPDATE STATE IMMUTABLY
      setChecklist(prev => {
        let updatedSubjects = prev.subjects;
        let updatedOther = prev.other_docs;

        if (type === 'subject') {
           updatedSubjects = prev.subjects.map(s => {
             if (s.id === itemId) {
                // Remove by matching path (safer than index which shifts)
                return { ...s, docs: s.docs.filter(d => d.path !== docToRemove.path) };
             }
             return s;
           });
        } else {
           updatedOther = prev.other_docs.map(o => {
             if (o.id === itemId) {
                return { ...o, docs: o.docs.filter(d => d.path !== docToRemove.path) };
             }
             return o;
           });
        }

        const newState = {
          ...prev,
          subjects: updatedSubjects,
          other_docs: updatedOther
        };

        // 4. SYNC WITH DB
        updateChecklistInDB(newState);

        return newState;
      });

      addToast('Document removed.', 'info');
    } catch (err) {
      console.error('Remove Error:', err);
      addToast('Failed to remove document: ' + err.message, 'error');
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('checklists')
        .update({ 
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', checklist.id);

      if (error) throw error;

      setChecklist(prev => ({ ...prev, status: 'pending' }));
      addToast('Checklist submitted for review!', 'success');
      setShowSubmitModal(false);
    } catch (err) {
      console.error('Submit Error:', err);
      addToast('Submission failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getMissingDocuments = () => {
    const missing = { subjects: [], other: [] };
    
    checklist.subjects.forEach(subject => {
      if (subject.docs.length < DEFAULT_DOCUMENTS.subjects.length) {
        // Find which specific types are missing
        const uploadedTypes = subject.docs.map(d => d.type);
        const missingDocs = DEFAULT_DOCUMENTS.subjects.filter(name => !uploadedTypes.includes(name));
        
        missing.subjects.push({ 
          name: subject.name, 
          docs: missingDocs 
        });
      }
    });

    checklist.other_docs.forEach(item => {
      if (item.docs.length === 0) {
        missing.other.push(item.name);
      }
    });

    return missing;
  };

  const calculateLatestUpload = () => {
    const allDocs = [
      ...checklist.subjects.flatMap(s => s.docs),
      ...checklist.other_docs.flatMap(o => o.docs)
    ];
    if (allDocs.length === 0) return null;
    return allDocs.reduce((latest, current) => {
      const currentDate = new Date(current.uploadedAt);
      return !latest || currentDate > new Date(latest) ? current.uploadedAt : latest;
    }, null);
  };

  const latestUploadAt = calculateLatestUpload();

  return (
    <div>
      <Header />
      
      <main className="container" style={{ paddingTop: 'var(--space-fluid-md)', paddingBottom: 'var(--space-fluid-md)' }}>
        {/* Deadline Banner */}
        <DeadlineBanner 
          deadline={checklist.deadline}
          submittedAt={checklist.submittedAt}
          status={checklist.status}
          latestUploadAt={latestUploadAt}
        />

        {/* Status Notification */}
        {checklist.status === 'approved' && (
          <div className="alert alert-success animate-fade-in" style={{ marginBottom: 'var(--space-6)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderLeft: '4px solid var(--brand-green)' }}>
            <span style={{ fontSize: '1.5rem' }}>✓</span>
            <div>
              <strong style={{ display: 'block' }}>Submission Verified by Admin</strong>
              <span style={{ fontSize: 'var(--text-sm)' }}>Your checklist has been reviewed and approved. You can still upload files if needed.</span>
            </div>
          </div>
        )}

        {/* Page Title & History Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <h1 style={{ fontSize: 'var(--text-2xl)' }}>Welcome, {user?.name}</h1>
            <p className="text-gray">Faculty Compliance Checklist Dashboard</p>
          </div>

          <div className="history-picker" style={{ minWidth: '240px' }}>
            <label className="form-label" style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--brand-blue)' }}>
              📂 Past Semester History (Read-Only)
            </label>
            <select 
              className="form-select" 
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              style={{ borderColor: selectedTerm === 'LIVE' ? 'var(--brand-green)' : 'var(--brand-blue)', borderWidth: '2px' }}
            >
              <option value="LIVE">Active Semester (Current)</option>
              <optgroup label="Archived in Supabase">
                <option value="2024-2025-SEM2">AY 2024-2025 - 2nd Semester</option>
              </optgroup>
            </select>
          </div>
        </div>

        {/* Statistics Dashboard */}
        <div className="dashboard-stats">
          <div className="stat-card green" style={{ color: 'var(--brand-blue)', background: 'var(--brand-blue-pale)' }}>
            <div className="stat-label">Completion Rate</div>
            <div className="stat-value">{progress.total}%</div>
            <div className="stat-description">
              Overall progress
            </div>
          </div>

          <div className="stat-card green" style={{ color: 'var(--brand-green)' }}>
            <div className="stat-label">Total Uploaded</div>
            <div className="stat-value">{progress.uploadedCount || 0}</div>
            <div className="stat-description">
              Documents submitted
            </div>
          </div>

          <div className="stat-card yellow" style={{ color: 'var(--nvsu-yellow-dark)' }}>
            <div className="stat-label">Pending Proofs</div>
            <div className="stat-value">{progress.remainingCount || 0}</div>
            <div className="stat-description">
              Items to complete
            </div>
          </div>

          <div className="stat-card info" style={{ color: 'var(--brand-blue)' }}>
            <div className="stat-label">Active Subjects</div>
            <div className="stat-value">{checklist.loading ? <div className="skeleton" style={{ width: '40px', height: '1em' }}></div> : checklist.subjects.length}</div>
            <div className="stat-description">
              Total classes
            </div>
          </div>
        </div>

        {checklist.loading ? (
          <div className="animate-fade-in">
            <div className="card mb-6">
              <div className="card-header"><div className="skeleton skeleton-title"></div></div>
              <div className="card-body">
                <div className="grid grid-cols-2 gap-4">
                  <div className="skeleton skeleton-text"></div>
                  <div className="skeleton skeleton-text"></div>
                  <div className="skeleton skeleton-text"></div>
                  <div className="skeleton skeleton-text"></div>
                </div>
              </div>
            </div>
            <div className="card mb-6">
              <div className="card-header"><div className="skeleton skeleton-title"></div></div>
              <div className="card-body" style={{ height: '300px' }}>
                <div className="skeleton" style={{ height: '100%' }}></div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Faculty Information */}
            <div className="card mb-6">
          <div className="card-header" style={{ padding: 'var(--space-responsive, var(--space-4))' }}>
            <h2 className="card-title">Profile Context</h2>
          </div>
          <div className="card-body" style={{ padding: 'var(--space-responsive, var(--space-4))' }}>
            <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div style={{ fontSize: 'var(--text-sm)' }}>
                <span className="text-gray" style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: '800', display: 'block' }}>College</span>
                <strong>{checklist.college}</strong>
              </div>
              <div style={{ fontSize: 'var(--text-sm)' }}>
                <span className="text-gray" style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: '800', display: 'block' }}>Department</span>
                <strong>{checklist.department}</strong>
              </div>
              <div style={{ fontSize: 'var(--text-sm)' }}>
                <span className="text-gray" style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: '800', display: 'block' }}>Term</span>
                <strong>{checklist.semester}</strong>
              </div>
              <div style={{ fontSize: 'var(--text-sm)' }}>
                <span className="text-gray" style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: '800', display: 'block' }}>Academic Year</span>
                <strong>{checklist.academicYear}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Documents by Subject */}
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="card-title">Section 1: Documents by Subject</h2>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Subjects Taught</th>
                  {DEFAULT_DOCUMENTS.subjects.map((doc, idx) => (
                    <th key={idx}>{doc}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checklist.subjects.map((subject) => (
                  <tr key={subject.id}>
                    <td data-label="Subject">
                      <strong>{subject.name}</strong><br />
                      <small className="text-gray">
                        {subject.code} - {subject.course} {subject.section}
                      </small>
                    </td>
                    {DEFAULT_DOCUMENTS.subjects.map((doc, docIdx) => {
                      const key = `subject-${subject.id}-${docIdx}`;
                      const hasUpload = uploads[key];
                      const isReadOnly = selectedTerm !== 'LIVE';
                      
                      return (
                        <td key={docIdx} data-label={doc}>
                          <div className="file-cell" style={{ textAlign: 'right', justifyContent: 'flex-end', display: 'flex' }}>
                            {hasUpload ? (
                              <div className="file-present">
                                <PhotoGrid 
                                  uploads={uploads[key]} 
                                  onRemove={isReadOnly ? null : (idx) => removeUpload(key, idx)} 
                                  disabled={isReadOnly}
                                  deadline={checklist.deadline}
                                />
                                {!isReadOnly && (
                                  <label className="btn-add-mini" title="Add more photos">
                                    +
                                    <input
                                      type="file"
                                      multiple
                                      accept="image/*"
                                      onChange={(e) => handleFileUpload(key, e.target.files)}
                                      style={{ display: 'none' }}
                                    />
                                  </label>
                                )}
                              </div>
                            ) : (
                              <label className={`upload-btn ${isReadOnly ? 'disabled' : ''}`} htmlFor={key} style={{ padding: 'var(--space-2)', minWidth: '80px', alignSelf: 'flex-end' }}>
                                <input
                                  id={key}
                                  type="file"
                                  multiple
                                  accept="image/*"
                                  onChange={(e) => handleFileUpload(key, e.target.files)}
                                  disabled={isReadOnly}
                                  hidden
                                />
                                <span className="upload-icon" aria-hidden="true">+</span>
                                <span style={{ fontSize: '10px', marginTop: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>{doc}</span>
                              </label>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Other Documents */}
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="card-title">Section 2: Other Documents (One-Time Submission)</h2>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '60%' }}>Document</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(checklist.other_docs || []).map((item, idx) => {
                  if (!item) return null;
                  const key = `other-${idx}`;
                  const hasUpload = uploads[key];
                  
                  const isReadOnly = selectedTerm !== 'LIVE';
                  
                  return (
                    <tr key={idx}>
                      <td data-label="Document"><strong>{item.name || 'Unknown Document'}</strong></td>
                        <td data-label="Status" style={{ verticalAlign: 'middle' }}>
                          {!hasUpload ? (
                            <label className={`upload-btn ${isReadOnly ? 'disabled' : ''}`} style={{ width: '100%', maxWidth: '200px', marginLeft: 'auto' }} htmlFor={key}>
                              📤 Upload Proof
                              <input
                                id={key}
                                type="file"
                                accept="image/jpeg,image/jpg,image/png"
                                multiple
                                onChange={(e) => handleFileUpload(key, e.target.files)}
                                disabled={isReadOnly}
                              />
                            </label>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', justifyContent: 'flex-end' }}>
                              <div className="upload-status uploaded">
                                {hasUpload.length} Documents
                              </div>
                              <PhotoGrid 
                                uploads={hasUpload} 
                                onRemove={isReadOnly ? null : (idx) => removeUpload(key, idx)}
                                disabled={isReadOnly}
                                deadline={checklist.deadline}
                              />
                              {!isReadOnly && (
                                <label className="btn btn-sm btn-outline">
                                  + Add
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png"
                                    multiple
                                    onChange={(e) => handleFileUpload(key, e.target.files)}
                                    style={{ display: 'none' }}
                                  />
                                </label>
                              )}
                            </div>
                          )}
                        </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Progress & Submission */}
        <div className="completion-progress">
          <div className="progress-header">
            <h3>Overall Progress</h3>
            <div className="progress-percentage">{progress.total}%</div>
          </div>
          
          <div className="progress">
            <div 
              className="progress-bar"
              style={{ width: `${progress.total}%` }}
            ></div>
          </div>

          <div className="progress-details" style={{ paddingBottom: 'var(--space-4)' }}>
            <div className="progress-item">
              <span>Section 1: Documents by Subject:</span>
              <strong>{progress.bySubject}%</strong>
            </div>
            <div className="progress-item">
              <span>Section 2: Other Documents:</span>
              <strong>{progress.other}%</strong>
            </div>
          </div>

          {(
            <div style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
              <button 
                className="btn btn-primary btn-lg"
                onClick={() => setShowSubmitModal(true)}
                disabled={checklist.status === 'pending' || checklist.status === 'approved'}
              >
                {checklist.status === 'pending' ? 'Submission Pending' : 'Submit for Review'}
              </button>
              <p style={{ 
                marginTop: 'var(--space-4)', 
                fontSize: 'var(--text-sm)', 
                color: 'var(--gray-600)' 
              }}>
                You can continue to update your submission until allowed by your Chair.
              </p>
            </div>
          )}

          {checklist.status === 'approved' && (
            <div className="alert alert-success" style={{ marginTop: 'var(--space-6)' }}>
              ✅ Your checklist has been approved by the Chair. However, you can still update or re-submit documents if requested or necessary.
            </div>
          )}
        </div>
      </>)}

        {/* Submit Progress Modal */}
        {showSubmitModal && (
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth: '600px' }}>
              <div className="modal-header">
                <h3 className="modal-title">Final Submission Checklist</h3>
              </div>
              <div className="modal-body">
                {progress.total === 100 ? (
                  <div className="alert alert-success">
                    ✨ Perfect! All documents have been uploaded.
                  </div>
                ) : (
                  <div className="mb-4">
                    <p className="mb-4">You have completed <strong>{progress.total}%</strong> of your requirements. Here's what's currently missing:</p>
                    
                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-4)' }}>
                      {getMissingDocuments().subjects.map((sub, i) => (
                        <div key={i} className="mb-3">
                          <strong style={{ color: 'var(--nvsu-green)', fontSize: '11px', textTransform: 'uppercase' }}>{sub.name}</strong>
                          <ul className="text-sm text-gray" style={{ listStyle: 'none', paddingLeft: 0, marginTop: '2px' }}>
                            {sub.docs.map((d, di) => (
                              <li key={di}>• {d}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      
                      {getMissingDocuments().other.length > 0 && (
                        <div>
                          <strong style={{ color: 'var(--nvsu-green)', fontSize: '11px', textTransform: 'uppercase' }}>Other Documents</strong>
                          <ul className="text-sm text-gray" style={{ listStyle: 'none', paddingLeft: 0, marginTop: '2px' }}>
                            {getMissingDocuments().other.map((d, di) => (
                              <li key={di}>• {d}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <p className="text-sm mt-4">
                  By clicking confirm, you are notifying the Chairperson that your checklist is ready for verification.
                </p>
              </div>
              <div className="modal-footer">
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowSubmitModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Confirm Submission'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
