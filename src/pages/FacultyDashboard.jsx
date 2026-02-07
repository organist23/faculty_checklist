import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import DeadlineBanner from '../components/DeadlineBanner';
import { useSystem } from '../context/SystemContext';
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

const PhotoGrid = ({ uploads, onRemove, disabled, deadline, onPreview }) => {
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
              <img 
                src={file.preview} 
                alt={file.name} 
                onClick={() => onPreview(file, uploads, idx)}
                style={{ cursor: 'pointer' }} 
              />
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
  const { confirm, showAlert } = useConfirm();
  
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
  const [uploadingItems, setUploadingItems] = useState({}); // Track uploading status per item key
  
  // Enhanced Preview State
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    imageSrc: null,
    files: [], // Array of all files in the current group
    currentIndex: 0,
    zoom: 1,
    contextKey: null // Track context for removal
  });

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
               // Status sync
               if (payload.new.status === 'revision' && payload.old.status !== 'revision') {
                  // Updates requested notification suppressed as per request
               } else if (payload.new.status === 'approved') {
                  addToast('Checklist Approved!', 'success');
               }
            }
            fetchChecklist(true); // Silent update for realtime events
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

  const fetchChecklist = async (isBackground = false) => {
    try {
      if (!isBackground) {
        setChecklist(prev => ({ ...prev, loading: true }));
      }
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
        // Batched Hydration
        const hydrateDocs = async (dataPayload) => {
          const subjects = dataPayload.subjects || [];
          const other = dataPayload.other_docs || [];
          
          // 1. Collect all paths
          const allPaths = [];
          
          subjects.forEach(sub => {
             if (sub.docs) sub.docs.forEach(d => allPaths.push(d.path));
          });
          other.forEach(item => {
             if (item.docs) item.docs.forEach(d => allPaths.push(d.path));
          });

          if (allPaths.length === 0) {
             return { subjects, other };
          }

          // 2. Batch Request Signed URLs
          const { data: signedData, error: signError } = await supabase.storage
            .from('checklists')
            .createSignedUrls(allPaths, 3600);

          if (signError) {
             console.error('Error signing URLs:', signError);
             return { subjects, other };
          }

          // 3. Create Lookup Map
          const urlMap = {};
          signedData.forEach(item => {
             if (item.path && item.signedUrl) {
                urlMap[item.path] = item.signedUrl;
             }
          });

          // 4. Map back to structure
          const newSubjects = subjects.map(sub => ({
             ...sub,
             docs: (sub.docs || []).map(d => ({
                ...d,
                preview: urlMap[d.path]
             }))
          }));

          const newOther = other.map(item => ({
             ...item,
             docs: (item.docs || []).map(d => ({
                ...d,
                preview: urlMap[d.path]
             }))
          }));

          return { subjects: newSubjects, other: newOther };
        };

        const { subjects: hydratedSubjects, other: hydratedOther } = await hydrateDocs(data);

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
    
    if (!navigator.onLine) {
       addToast('No internet connection. Please check your network.', 'error');
       return;
    }
    
    // Set specific item as uploading
    setUploadingItems(prev => ({ ...prev, [key]: true }));
    
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
        const updatedSubjects = prev.subjects.map(s => {
          if (s.id === itemId && type === 'subject') {
             // Clear rejection for this specific doc type if it was rejected
             const newRejectedTypes = s.rejected_types 
                 ? s.rejected_types.filter(t => t !== docName)
                 : s.rejected_types;
             
             return { 
                 ...s, 
                 docs: [...s.docs, ...newDocs],
                 rejected_types: newRejectedTypes 
             };
          }
          return s;
        });
        
        const updatedOther = prev.other_docs.map(o => {
          if (o.id === itemId && type === 'other') {
             return { 
                 ...o, 
                 docs: [...o.docs, ...newDocs],
                 rejected: false // Clear rejection flag
             };
          }
          return o;
        });
        
        const newState = {
          ...prev,
          subjects: updatedSubjects,
          other_docs: updatedOther,
          // If the status was 'revision', reset to 'pending' (or active) immediately on upload
          // This allows the faculty to address specific rejections without needing to complete the entire checklist
          status: prev.status === 'revision' ? 'pending' : prev.status
        };

        // Sync with DB
        updateChecklistInDB(newState);

        return newState;
      });

      addToast('Uploaded Successful', 'success');
    } catch (err) {
      console.error('Upload Error:', err);
      addToast('Upload failed: ' + err.message, 'error');
    } finally {
      // Clear specific item uploading status
      setUploadingItems(prev => ({ ...prev, [key]: false }));
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
          status: state.status, // Sync status as well
          updated_at: new Date().toISOString()
        })
        .eq('id', state.id);
        
      if (error) console.error('DB Auto-save failed:', error);
    } catch (err) {
      console.error('DB Update Exception:', err);
    }
  };

  const removeUpload = async (key, fileIndex) => {
    if (!navigator.onLine) {
       addToast('No internet connection. Cannot remove file.', 'error');
       return;
    }
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

      const confirmed = await confirm('Are you sure you want to remove this file?', 'Remove Document');
      if (!confirmed) return;

      // 2. DELETE FROM STORAGE (Only if path exists)
      if (docToRemove.path) {
        const { error: storageError } = await supabase.storage
          .from('checklists')
          .remove([docToRemove.path]);
        
        if (storageError) {
          console.error('Storage Remove Error (Non-fatal):', storageError);
          // We continue to remove from DB to prevent "ghost" files that can't be deleted
        }
      } else {
        console.warn('Document has no path, skipping storage deletion and removing from DB only.');
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
    if (!navigator.onLine) {
       addToast('No internet connection. Cannot submit checklist.', 'error');
       return;
    }
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
        {checklist.error && (
          <div className="card shadow-nvsu animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-12)', marginTop: 'var(--space-8)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>🔌</div>
            <h2 style={{ color: 'var(--nvsu-red)', marginBottom: 'var(--space-2)' }}>Connection Error</h2>
            <p className="text-gray mb-6">
              {checklist.error.includes('fetch') || !navigator.onLine 
                ? "We're having trouble reaching the server. Please check your internet connection."
                : checklist.error}
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => fetchChecklist()}>
              🔄 Retry Connection
            </button>
          </div>
        )}

        {!checklist.error && (<>
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

        {checklist.status === 'revision' && (
          <div className="alert alert-warning animate-pulse-yellow" style={{ marginBottom: 'var(--space-6)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderLeft: '4px solid #f59e0b' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <strong style={{ display: 'block' }}>Updates Requested by Admin</strong>
              <span style={{ fontSize: 'var(--text-sm)' }}>The Chair has rejected one or more documents. Please replace the missing files to proceed.</span>
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
                      <strong>{subject.name}</strong>
                    </td>
                    {DEFAULT_DOCUMENTS.subjects.map((doc, docIdx) => {
                      const key = `subject-${subject.id}-${docIdx}`;
                      const hasUpload = uploads[key];
                      const isReadOnly = selectedTerm !== 'LIVE';
                      
                      const isRejected = subject.rejected_types?.includes(doc);

                      const isUploading = uploadingItems[key];
                      
                      return (
                        <td key={docIdx} data-label={doc} style={isRejected ? { backgroundColor: '#fee2e2', position: 'relative', border: '1px solid #ef4444' } : {}}>
                          {isRejected && (
                             <div style={{ position: 'absolute', top: 0, left: 0, right: 0, fontSize: '9px', background: '#ef4444', color: 'white', textAlign: 'center', fontWeight: 'bold', padding: '1px' }}>REJECTED</div>
                          )}
                          <div className="file-cell" style={{ textAlign: 'right', justifyContent: 'flex-end', display: 'flex', paddingTop: isRejected ? '12px' : '0' }}>
                            {isUploading ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--brand-blue)', fontSize: '12px', fontWeight: 'bold' }}>
                                <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: 'var(--brand-blue)', borderWidth: '2px' }}></div>
                                Uploading...
                              </div>
                            ) : hasUpload ? (
                              <div className="file-present">
                                <PhotoGrid 
                                  uploads={uploads[key]} 
                                  onRemove={isReadOnly ? null : (idx) => removeUpload(key, idx)} 
                                  disabled={isReadOnly}
                                  deadline={checklist.deadline}
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
                  
                  const isRejected = item.rejected;
                  
                  return (
                    <tr key={idx}>
                      <td data-label="Document" style={isRejected ? { backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444' } : {}}>
                        <strong>{item.name || 'Unknown Document'}</strong>
                        {isRejected && <div style={{ fontSize: '10px', color: '#b91c1c', fontWeight: 'bold', marginTop: '4px' }}>⚠️ ACTION REQUIRED: RE-UPLOAD</div>}
                      </td>
                        <td data-label="Status" style={{ verticalAlign: 'middle', backgroundColor: isRejected ? '#fee2e2' : 'transparent' }}>
                          {uploadingItems[key] ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--brand-blue)', fontSize: '12px', fontWeight: 'bold', width: '100%', justifyContent: 'flex-end', padding: '10px' }}>
                                <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: 'var(--brand-blue)', borderWidth: '2px' }}></div>
                                Uploading...
                              </div>
                          ) : !hasUpload ? (
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
                              />
                                {!isReadOnly && (
                                  <label className="btn-add-mini" title="Add more documents">
                                    +
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
                {checklist.status === 'approved' ? 'Already Approved' : checklist.status === 'pending' ? 'Submission Pending' : 'Submit for Review'}
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
        </>)}
      </main>
      {/* Image Preview Modal */}
      {previewState.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.9)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }} onClick={() => setPreviewState(prev => ({ ...prev, isOpen: false }))}>
          <div className="modal-content" style={{ width: '100%', height: '100%', background: 'transparent', boxShadow: 'none', padding: 0, position: 'relative' }} onClick={e => e.stopPropagation()}>
             
             {/* Toolbar */}
             <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '10px', zIndex: 10 }}>
               <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setPreviewState(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.5, 3) }))}>➕ Zoom In</button>
               <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setPreviewState(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.5, 0.5) }))}>➖ Zoom Out</button>
               
               {/* Remove Button - Only if not read-only (LIVE term) */}
               {selectedTerm === 'LIVE' && (
                  <button 
                    className="btn btn-sm" 
                    style={{ background: 'rgba(220, 38, 38, 0.9)', color: 'white', border: 'none', marginLeft: '10px' }}
                    onClick={async () => {
                       const confirmed = await confirm('Are you sure you want to remove this file?', 'Remove Document');
                       if (confirmed) {
                          removeUpload(previewState.contextKey, previewState.currentIndex);
                          setPreviewState(prev => ({ ...prev, isOpen: false }));
                       }
                    }}
                  >
                    🗑️ Remove
                  </button>
               )}

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
    </div>
  );
}
