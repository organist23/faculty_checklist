import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import DeadlineBanner from '../components/DeadlineBanner';
import { useSystem } from '../context/SystemContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { supabase } from '../supabase';
import { isPastTerm } from '../utils/termHelpers';

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
  const { user, logout } = useAuth();
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
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [uploadingItems, setUploadingItems] = useState({}); // Track uploading status per item key
  const [showSubjectManager, setShowSubjectManager] = useState(false);
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '' });
  const [subjectError, setSubjectError] = useState('');
  
  // Media Capture Modal State
  const [mediaCapture, setMediaCapture] = useState({
    isOpen: false,
    key: null,
    docName: null
  });

  // Enhanced Preview State
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    imageSrc: null,
    files: [], // Array of all files in the current group
    currentIndex: 0,
    zoom: 1,
    contextKey: null // Track context for removal
  });

  // Auto-switch to LIVE view when global settings change (e.g. Admin starts new semester)
  useEffect(() => {
    if (settings.semester && settings.academicYear) {
       console.log('Global settings changed, switching to LIVE view.');
       setSelectedTerm('LIVE');
    }
  }, [settings.semester, settings.academicYear]);

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
      
      // Smart Auto-Switch Logic REMOVED/DISABLED:
      // We should NOT force switch the user to a newer term if they explicitly selected something else.
      // The default behavior should be to respect the user's selection or default to LIVE only on initial load.
      /*
      if (settings.semester && settings.academicYear) {
          const currentTermId = `${settings.academicYear}-${settings.semester}`;
          const newerTerm = terms.find(t => t > currentTermId);
          if (newerTerm && selectedTerm === 'LIVE') {
             console.log('Found newer term than settings, auto-switching:', newerTerm);
             setSelectedTerm(newerTerm);
          }
      }
      */
    } catch (err) {
      console.error('Fetch Terms Error:', err);
    }
  };

  const fetchChecklist = async (isBackground = false) => {
    try {
      if (!isBackground) {
        setChecklist(prev => ({ ...prev, loading: true }));
      }
      const normalize = (s) => {
        if (!s) return s;
        const up = s.toString().toUpperCase().trim();
        if (up === '1') return 'FIRST SEMESTER';
        if (up === '2') return 'SECOND SEMESTER';
        return up;
      };

      const normSem = normalize(settings.semester);
      const termId = selectedTerm === 'LIVE' 
        ? `${settings.academicYear}-${normSem}` 
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
        const initialSubjects = [];

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

          
          const parts = data.term_id.split('-');
          const ay = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : settings.academicYear;
          const sem = parts.length >= 3 ? parts.slice(2).join(' ') : settings.semester;

          setChecklist({
            id: data.id,
            term_id: data.term_id,
            status: data.status,
            college: user.college,
            department: user.department,
            semester: sem,
            academicYear: ay,
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
      
      // CRITICAL: Handle "Ghost Faculty" (Profile deleted but session active)
      if (err.code === '23503' && err.message?.includes('faculty_profiles')) {
        console.warn('Faculty profile not found. Forcing logout.');
        logout();
        return;
      }

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
    checklist.other_docs.forEach((od) => {
       if (od && od.name) {
         uploads[od.name] = od.docs || [];
       }
    });
  }

  const handleAddSubject = async () => {
    if (!subjectForm.name.trim() || !subjectForm.code.trim()) {
      setSubjectError('Subject Name and Code are required.');
      return;
    }

    if (selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester)) {
      addToast('Cannot manage subjects in past semesters.', 'error');
      return;
    }
    
    // Check for duplicate code + name combination to prevent exact duplicates
    const normalizedName = subjectForm.name.trim().toLowerCase();
    const normalizedCode = subjectForm.code.trim().toLowerCase();
    if (checklist.subjects.some(s => s.name.toLowerCase() === normalizedName && s.code.toLowerCase() === normalizedCode)) {
      setSubjectError('This exact subject already exists.');
      return;
    }

    setSubjectError('');
    const newId = `sub-${Date.now()}`;
    
    const newSubject = {
      id: newId,
      name: subjectForm.name.trim(),
      code: subjectForm.code.trim(),
      course: 'N/A', 
      section: 'N/A',
      docs: []
    };

    // Optimistic Update
    const newSubjects = [...checklist.subjects, newSubject];
    setChecklist(prev => ({ ...prev, subjects: newSubjects }));
    setSubjectForm({ name: '', code: '' });
    addToast('Subject added successfully!', 'success');

    try {
      const { error } = await supabase
        .from('checklists')
        .update({
          subjects: newSubjects.map(s => ({
            ...s,
            docs: (s.docs || []).map(d => ({ ...d, preview: undefined })) // Clean preview URLs
          })),
          updated_at: new Date().toISOString()
        })
        .eq('id', checklist.id);

      if (error) {
        throw error;
        // In a real app, rollback optimistic update here
      }
    } catch (err) {
      console.error('Error adding subject:', err);
      addToast('Failed to save subject to server.', 'error');
    }
  };

  const handleDeleteSubject = async (subjectId) => {
    const subject = checklist.subjects.find(s => s.id === subjectId);
    if (!subject) return;

    if (selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester)) {
      addToast('Cannot manage subjects in past semesters.', 'error');
      return;
    }

    if (subject.docs && subject.docs.length > 0) {
      const confirmed = await confirm(
        `This subject has ${subject.docs.length} uploaded document(s). Deleting it will PERMANENTLY REMOVE these documents. Continue?`,
        'Delete Subject & Files'
      );
      if (!confirmed) return;
      
      try {
        // Attempt to delete files from storage
        const paths = subject.docs.map(d => d.path);
        if (paths.length > 0) {
           await supabase.storage.from('checklists').remove(paths);
        }
      } catch (e) {
        console.error('Error deleting files:', e);
      }
    } else {
      const confirmed = await confirm('Are you sure you want to delete this subject?', 'Delete Subject');
      if (!confirmed) return;
    }

    // Optimistic
    const newSubjects = checklist.subjects.filter(s => s.id !== subjectId);
    setChecklist(prev => ({ ...prev, subjects: newSubjects }));
    addToast('Subject deleted.', 'info');

    try {
      await supabase
        .from('checklists')
        .update({
          subjects: newSubjects.map(s => ({
            ...s,
            docs: (s.docs || []).map(d => ({ ...d, preview: undefined }))
          })),
          updated_at: new Date().toISOString()
        })
        .eq('id', checklist.id);
    } catch (err) {
      console.error('Error deleting subject:', err);
      addToast('Failed to sync deletion.', 'error');
    }
  };

  const handleUpdateSubject = async (id, newName, newCode) => {
    if (selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester)) {
      addToast('Cannot manage subjects in past semesters.', 'error');
      return;
    }

    // Optimistic
    const newSubjects = checklist.subjects.map(s => 
      s.id === id ? { ...s, name: newName, code: newCode } : s
    );
    setChecklist(prev => ({ ...prev, subjects: newSubjects }));
    addToast('Subject updated.', 'success');

    try {
      await supabase
        .from('checklists')
        .update({
          subjects: newSubjects.map(s => ({
            ...s,
            docs: (s.docs || []).map(d => ({ ...d, preview: undefined }))
          })),
          updated_at: new Date().toISOString()
        })
        .eq('id', checklist.id);
    } catch (err) {
      console.error('Error update subject:', err);
      addToast('Failed to sync update.', 'error');
    }
  };

  const handleDownloadArchive = async () => {
    const termName = selectedTerm === 'LIVE' 
        ? `${settings.academicYear}-${settings.semester}` 
        : selectedTerm;

    // Calculate total files for progress and validation
    const totalFiles = (checklist.subjects || []).reduce((acc, s) => acc + (s.docs || []).length, 0) +
                       (checklist.other_docs || []).reduce((acc, o) => acc + (o.docs || []).length, 0);

    if (totalFiles === 0) {
      addToast('No documents found for the selected semester.', 'info');
      return;
    }

    const readableTerm = termName.split('-').length >= 3 
        ? `AY ${termName.split('-').slice(0, 2).join('-')} - ${termName.split('-').slice(2).join(' ')}`
        : termName;

    const isConfirmed = await confirm(
      `Download ZIP archive for ${readableTerm}? (${totalFiles} documents)`,
      'Confirm Download'
    );

    if (!isConfirmed) return;

    try {
      setIsExporting(true);
      const zip = new JSZip();
      
      setExportProgress({ current: 0, total: totalFiles });
      let processed = 0;

      const mainFolder = zip.folder(`My_Compliance_${termName}`);

      // 1. Subjects
      const subjectFolder = mainFolder.folder('Section 1 - Subjects');
      for (const sub of checklist.subjects) {
        const subSubFolder = subjectFolder.folder(sub.name);
        for (const doc of (sub.docs || [])) {
          const typeFolder = subSubFolder.folder(doc.type || 'Other');
          try {
             const { data, error } = await supabase.storage.from('checklists').download(doc.path);
             if (error) throw error;
             typeFolder.file(doc.name, data);
          } catch (e) {
             console.error('Download error:', e);
          }
          processed++;
          setExportProgress({ current: processed, total: totalFiles });
        }
      }

      // 2. Other Docs
      const otherFolder = mainFolder.folder('Section 2 - Other Documents');
      for (const other of checklist.other_docs) {
        const docFolder = otherFolder.folder(other.name);
        for (const docFile of (other.docs || [])) {
          try {
             const { data, error } = await supabase.storage.from('checklists').download(docFile.path);
             if (error) throw error;
             docFolder.file(docFile.name, data);
          } catch (e) {
             console.error('Download error:', e);
          }
          processed++;
          setExportProgress({ current: processed, total: totalFiles });
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `NVSU_Credentials_${user.name.replace(/ /g, '_')}_${termName}.zip`);
      addToast('Archive downloaded successfully!', 'success');
    } catch (err) {
      console.error('Export error:', err);
      addToast('Failed to generate archive: ' + err.message, 'error');
    } finally {
      setIsExporting(false);
      setExportProgress({ current: 0, total: 0 });
    }
  };

  const handleFileUpload = async (key, files) => {
    if (!files || files.length === 0) return;
    
    if (!navigator.onLine) {
       addToast('No internet connection. Please check your network.', 'error');
       return;
    }
    
    if (selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester)) {
       addToast('Cannot upload documents for past semesters.', 'error');
       return;
    }
    
    // Set specific item as uploading
    setUploadingItems(prev => ({ ...prev, [key]: true }));
    
    try {
      let type, itemId, docName;

      // Parse Key
      if (key.startsWith('subject-')) {
         type = 'subject';
         const parts = key.split('-');
         const docIdx = parseInt(parts[parts.length - 1]);
         itemId = parts.slice(1, parts.length - 1).join('-');
         docName = DEFAULT_DOCUMENTS.subjects[docIdx];
      } else {
         type = 'other';
         itemId = key; // itemId is now the document name (e.g. "Faculty Workload")
         docName = key;
      }

      const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
      const newDocs = [];
      for (const file of Array.from(files)) {
        // Size validation
        if (file.size > MAX_FILE_SIZE) {
          addToast(`File ${file.name} exceeds the 20MB limit.`, 'error');
          continue; // Skip this file
        }

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
          size: file.size, // Store file size in bytes
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
          if (o.name === itemId && type === 'other') {
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
        
      if (error) {
        console.error('DB Auto-save failed:', error);
        
        // Handle "Ghost Faculty" on auto-save
        if (error.code === '23503' && error.message?.includes('faculty_profiles')) {
          logout();
        }
      }
    } catch (err) {
      console.error('DB Update Exception:', err);
    }
  };

  const removeUpload = async (key, fileIndex) => {
    if (!navigator.onLine) {
       addToast('No internet connection. Cannot remove file.', 'error');
       return;
    }
    const isEditable = selectedTerm === 'LIVE' || !isPastTerm(checklist.term_id, settings.academicYear, settings.semester);
    if (!isEditable) {
       addToast('Cannot remove documents from previous semesters.', 'error');
       return;
    }
    try {
      let docToRemove;
      let type, itemId, docName;

      // 1. IDENTIFY THE FILE AND METADATA (Read-only check first)
      const currentSnapshot = checklist; 
      
      if (key.startsWith('subject-')) {
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
      } else {
         type = 'other';
         itemId = key; // name
         const item = currentSnapshot.other_docs.find(o => o.name === itemId);
         if (item && item.docs[fileIndex]) {
             docToRemove = item.docs[fileIndex];
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
             if (o.name === itemId) {
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

      addToast('Document removed.', 'success');
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
          deadline={selectedTerm === 'LIVE' ? settings.deadline : checklist.deadline}
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

          <div className="history-picker" style={{ 
            display: 'flex', 
            flexDirection: 'row', 
            alignItems: 'flex-end', 
            gap: '10px',
            width: '100%',
            maxWidth: 'none',
            flexWrap: 'wrap' 
          }}>
            <div style={{ flex: '1 1 240px' }}>
              <label className="form-label" style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--brand-blue)' }}>
                📂 Past Semester History (Read-Only)
              </label>
                <select 
                  className="form-select" 
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                  style={{ minWidth: '220px', border: '2px solid var(--nvsu-green-dark)' }}
                >
                  <option value="LIVE">🟢 Current: {settings.semester} ({settings.academicYear})</option>
                  {availableTerms
                    .filter(t => {
                      const normCurrent = `${settings.academicYear}-${settings.semester}`;
                      // Normalize the archived term for comparison
                      const parts = t.split('-');
                      if (parts.length < 2) return true;
                      const ay = `${parts[0]}-${parts[1]}`;
                      let sem = parts.slice(2).join(' ').trim().toUpperCase();
                      if (sem === '1') sem = 'FIRST SEMESTER';
                      if (sem === '2') sem = 'SECOND SEMESTER';
                      
                      return `${ay}-${sem}` !== normCurrent;
                    })
                    .map(term => (
                      <option key={term} value={term}>📂 Archive: {term.replace(/-/g, ' ')}</option>
                    ))
                  }
                </select>
            </div>
            {selectedTerm !== 'LIVE' && (
              <button 
                className={`btn ${isExporting ? 'btn-secondary' : 'btn-primary'}`}
                style={{ 
                  height: '42px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '8px', 
                  flex: '1 1 180px',
                  minWidth: '200px'
                }}
                onClick={handleDownloadArchive}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: 'white' }}></div>
                    <span>{exportProgress.total > 0 ? `${Math.round((exportProgress.current / exportProgress.total) * 100)}% Bundling...` : 'Processing...'}</span>
                  </>
                ) : (
                  <>📥 Download Semester ZIP</>
                )}
              </button>
            )}
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
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title">Section 1: Documents by Subject</h2>
            {/* Show Manage Subjects for LIVE, Current, or Future terms */}
            {(selectedTerm === 'LIVE' || !isPastTerm(checklist.term_id, settings.academicYear, settings.semester)) && (
              <button 
                className="btn btn-secondary" 
                style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                onClick={() => setShowSubjectManager(true)}
              >
                ⚙️ Manage Subjects
              </button>
            )}
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
                      const isReadOnly = selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester);
                      
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
                                  <button 
                                     className="btn-add-mini" 
                                     title="Add more photos"
                                     onClick={() => setMediaCapture({ isOpen: true, key, docName: doc })}
                                  >
                                    +
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button 
                                className={`upload-btn ${isReadOnly ? 'disabled' : ''}`} 
                                style={{ padding: 'var(--space-2)', minWidth: '80px', alignSelf: 'flex-end', background: 'var(--brand-blue-pale)', border: '1px solid var(--brand-blue)', color: 'var(--brand-blue-dark)' }}
                                onClick={() => !isReadOnly && setMediaCapture({ isOpen: true, key, docName: doc })}
                                disabled={isReadOnly}
                              >
                                <span style={{ fontSize: '14px' }}>📤</span>
                                <span style={{ fontSize: '10px', fontWeight: 'bold' }}>UPLOAD</span>
                              </button>
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
            <h2 className="card-title">Section 2: Other Documents</h2>
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
                {(checklist.other_docs || []).map((item) => {
                  if (!item) return null;
                  const key = item.name;
                  const hasUpload = uploads[key];
                  
                  const isReadOnly = selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester);
                  
                  const isRejected = item.rejected;
                  
                  return (
                    <tr key={item.name}>
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
                            <button 
                                className={`btn btn-sm ${isReadOnly ? 'disabled' : ''}`} 
                                style={{ marginLeft: 'auto', background: 'var(--brand-blue-pale)', border: '2px solid var(--brand-blue)', color: 'var(--brand-blue-dark)', fontWeight: '800' }}
                                onClick={() => !isReadOnly && setMediaCapture({ isOpen: true, key: key, docName: item.name })}
                                disabled={isReadOnly}
                            >
                                📤 UPLOAD PROOF
                            </button>
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
                                  <button 
                                     className="btn-add-mini" 
                                     title="Add more documents"
                                     onClick={() => setMediaCapture({ isOpen: true, key: key, docName: item.name })}
                                  >
                                    +
                                  </button>
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
               
               {/* Remove Button - Editable if LIVE or Future/Current Term */}
               {(selectedTerm === 'LIVE' || (checklist.term_id >= `${settings.academicYear}-${settings.semester}`)) && (
                  <button 
                    className="btn btn-sm" 
                    style={{ background: 'rgba(220, 38, 38, 0.9)', color: 'white', border: 'none', marginLeft: '10px' }}
                    onClick={async () => {
                       const confirmed = await confirm('Are you sure you want to remove this file?', 'Remove Document');
                       if (confirmed) {
                          const currentFiles = previewState.files;
                          const currentIndex = previewState.currentIndex;
                          const contextKey = previewState.contextKey;

                          removeUpload(contextKey, currentIndex);

                          const newFiles = currentFiles.filter((_, idx) => idx !== currentIndex);
                          if (newFiles.length === 0) {
                             setPreviewState(prev => ({ ...prev, isOpen: false }));
                          } else {
                             const nextIndex = currentIndex < newFiles.length ? currentIndex : newFiles.length - 1;
                             setPreviewState(prev => ({
                                ...prev,
                                files: newFiles,
                                currentIndex: nextIndex,
                                imageSrc: newFiles[nextIndex].preview,
                                zoom: 1
                             }));
                          }
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
      {/* Subject Manager Modal */}
      {showSubjectManager && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: '700px', width: '90%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Manage Subjects</h3>
              <button onClick={() => setShowSubjectManager(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
            </div>
            <div className="modal-body">
              {/* Add New Subject Form */}
              <div style={{ background: 'var(--gray-50)', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--gray-200)' }}>
                  <h4 style={{ fontSize: '12px', marginBottom: '10px', textTransform: 'uppercase', color: 'var(--gray-600)', fontWeight: 'bold' }}>Add New Subject</h4>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Subject Code (e.g. IT 101)" 
                      value={subjectForm.code}
                      onChange={e => setSubjectForm(prev => ({ ...prev, code: e.target.value }))}
                      style={{ flex: 1, minWidth: '120px', backgroundColor: '#ffffff' }}
                    />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Descriptive Title" 
                      value={subjectForm.name}
                      onChange={e => setSubjectForm(prev => ({ ...prev, name: e.target.value }))}
                      style={{ flex: 2, minWidth: '200px', backgroundColor: '#ffffff' }}
                    />
                    <button className="btn btn-primary" onClick={handleAddSubject}>Add Subject</button>
                  </div>
                  {subjectError && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>⚠️ {subjectError}</p>}
              </div>

              {/* List of Existing Subjects */}
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <table className="table" style={{ fontSize: '14px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '120px' }}>Code</th>
                        <th>Title</th>
                        <th style={{ width: '60px', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklist.subjects.map(sub => (
                        <tr key={sub.id}>
                          <td style={{ padding: '8px' }}>
                              <input 
                                defaultValue={sub.code} 
                                onBlur={(e) => {
                                  if (e.target.value !== sub.code) handleUpdateSubject(sub.id, sub.name, e.target.value);
                                }}
                                className="form-input"
                                style={{ padding: '4px 8px', width: '100%', backgroundColor: '#ffffff' }}
                              />
                          </td>
                          <td style={{ padding: '8px' }}>
                              <input 
                                defaultValue={sub.name} 
                                onBlur={(e) => {
                                  if (e.target.value !== sub.name) handleUpdateSubject(sub.id, e.target.value, sub.code);
                                }}
                                className="form-input"
                                style={{ padding: '4px 8px', width: '100%', backgroundColor: '#ffffff' }}
                              />
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px' }}>
                              <button 
                                className="btn btn-sm"
                                style={{ color: 'white', background: '#ef4444', border: 'none', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }} 
                                onClick={() => handleDeleteSubject(sub.id)}
                                title="Delete Subject"
                              >
                                ✕
                              </button>
                          </td>
                        </tr>
                      ))}
                      {checklist.subjects.length === 0 && (
                          <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--gray-500)', padding: '20px' }}>No subjects added yet. Add one above!</td></tr>
                      )}
                    </tbody>
                  </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSubjectManager(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
      {/* Media Capture Choice Modal */}
      {mediaCapture.isOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }}>
          <div className="modal" style={{ maxWidth: '400px', width: '95%', borderRadius: 'var(--radius-xl)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--gray-100)', padding: 'var(--space-6) var(--space-6) var(--space-4)' }}>
              <div>
                <h3 className="modal-title" style={{ fontSize: '1.2rem', color: 'var(--brand-blue-dark)' }}>Upload Document</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--gray-500)' }}>{mediaCapture.docName}</p>
              </div>
              <button 
                onClick={() => setMediaCapture({ isOpen: false, key: null, docName: null })} 
                style={{ background: 'var(--gray-100)', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--gray-600)' }}
              >✕</button>
            </div>
            <div className="modal-body" style={{ padding: 'var(--space-8) var(--space-6)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                {/* Camera Option */}
                <label className="camera-btn" style={{ padding: 'var(--space-6) var(--space-4)', height: '140px', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', flexShrink: 0 }}>
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileUpload(mediaCapture.key, e.target.files);
                      }
                      setMediaCapture({ isOpen: false, key: null, docName: null });
                    }}
                    hidden 
                  />
                  <span style={{ fontSize: '3rem', marginBottom: 'var(--space-2)' }}>📸</span>
                  <span style={{ fontWeight: '800', fontSize: 'var(--text-sm)', letterSpacing: '0.5px' }}>TAKE PHOTO</span>
                  <span style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '4px' }}>Using Camera</span>
                </label>

                {/* Gallery Option */}
                <label className="upload-btn" style={{ padding: 'var(--space-6) var(--space-4)', height: '140px', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', borderStyle: 'solid', borderColor: 'var(--brand-green)', display: 'flex', flexDirection: 'column' }}>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileUpload(mediaCapture.key, e.target.files);
                      }
                      setMediaCapture({ isOpen: false, key: null, docName: null });
                    }}
                    hidden 
                  />
                  <span style={{ fontSize: '3rem', marginBottom: 'var(--space-2)' }}>🖼️</span>
                  <span style={{ fontWeight: '800', fontSize: 'var(--text-sm)', letterSpacing: '0.5px' }}>GALLERY</span>
                  <span style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '4px' }}>Choose Existing</span>
                </label>
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: 'none', padding: '0 var(--space-6) var(--space-6)' }}>
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}
                onClick={() => setMediaCapture({ isOpen: false, key: null, docName: null })}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
