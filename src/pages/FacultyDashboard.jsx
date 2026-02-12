import { useState, useEffect, useMemo, useRef } from 'react';
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
    <span className="photo-preview" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '4px 0' }}>
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
              width: '74px',
              height: '74px',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 6px 15px rgba(0,0,0,0.15)',
              background: 'var(--gray-100)',
              transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
            onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            {/* Smooth Status Bar at bottom */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: statusColor, zIndex: 3 }}></div>
            
            {file.preview ? (
              <img 
                src={file.preview} 
                alt={file.name} 
                onClick={() => onPreview(file, uploads, idx)}
                style={{ 
                  cursor: 'pointer', 
                  display: 'block', 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover' 
                }} 
              />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '14px', background: '#f1f5f9' }}>📄</span>
            )}

            {!disabled && (
              <button
                style={{ 
                  position: 'absolute', 
                  top: '2px', 
                  right: '2px', 
                  width: '18px', 
                  height: '18px', 
                  borderRadius: '50%', 
                  background: 'rgba(255,255,255,0.9)', 
                  border: '1px solid var(--gray-200)', 
                  color: 'var(--nvsu-red)', 
                  fontSize: '12px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  zIndex: 4,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s'
                }}
                onClick={(e) => {
                  e.preventDefault();
                  onRemove(idx);
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'var(--nvsu-red)'; e.currentTarget.style.color = 'white'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; e.currentTarget.style.color = 'var(--nvsu-red)'; }}
                title="Remove"
              >
                ×
              </button>
            )}

            {idx === displayLimit - 1 && remainingCount > 0 && (
              <div 
                style={{ 
                  position: 'absolute', 
                  inset: 0, 
                  background: 'rgba(0,0,0,0.5)', 
                  backdropFilter: 'blur(2px)', 
                  color: 'white', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '11px', 
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
  const [internalSearch, setInternalSearch] = useState('');
  
  // LIVE CAMERA STATE
  const [cameraState, setCameraState] = useState({
    isActive: false,
    stream: null,
    previewBlob: null,
    facingMode: 'environment',
    loading: false,
    torchAvailable: false,
    torchEnabled: false
  });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const startCamera = async (mode = 'environment') => {
    try {
      setCameraState(prev => ({ ...prev, loading: true, isActive: true, facingMode: mode }));
      
      // Stop existing stream if any
      if (cameraState.stream) {
        cameraState.stream.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      setCameraState(prev => ({ ...prev, stream, loading: false }));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Check for Torch Capability
      const track = stream.getVideoTracks()[0];
      if (track) {
         try {
           const caps = track.getCapabilities();
           if (caps && 'torch' in caps) {
             setCameraState(prev => ({ ...prev, torchAvailable: true }));
           }
         } catch (e) {
           console.log('Torch capability check failed (browser restriction)');
         }
      }

    } catch (err) {
      console.error('Camera Error:', err);
      addToast('Could not access camera. Please check permissions.', 'error');
      setCameraState(prev => ({ ...prev, isActive: false, loading: false }));
    }
  };

  const toggleTorch = async () => {
    if (!cameraState.stream) return;
    const track = cameraState.stream.getVideoTracks()[0];
    if (!track) return;

    try {
      const newState = !cameraState.torchEnabled;
      await track.applyConstraints({
        advanced: [{ torch: newState }]
      });
      setCameraState(prev => ({ ...prev, torchEnabled: newState }));
    } catch (err) {
      console.error('Flash toggle error:', err);
      addToast('Could not toggle flash', 'error');
    }
  };

  const stopCamera = () => {
    if (cameraState.stream) {
      cameraState.stream.getTracks().forEach(track => track.stop());
    }
    setCameraState({
      isActive: false,
      stream: null,
      previewBlob: null,
      facingMode: 'environment',
      loading: false,
      torchAvailable: false,
      torchEnabled: false
    });
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Set canvas dimensions to match video stream
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      setCameraState(prev => ({ ...prev, previewBlob: blob }));
    }, 'image/jpeg', 0.90);
  };

  const handleCameraUpload = async () => {
    if (!cameraState.previewBlob) return;
    
    const file = new File([cameraState.previewBlob], `camera_capture_${Date.now()}.jpg`, {
      type: 'image/jpeg'
    });

    await handleFileUpload(mediaCapture.key, [file]);
    stopCamera();
    setMediaCapture({ isOpen: false, key: null, docName: null });
  };

  const compressImage = async (file) => {
    if (!file.type.startsWith('image/')) return file;
    if (file.size < 500 * 1024) return file; // Skip small files

    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        const MAX_DIM = 1600;
        if (width > height) {
          if (width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          // Cleanup
          URL.revokeObjectURL(objectUrl);
          canvas.width = 0;
          canvas.height = 0;
          
          if (!blob) {
            resolve(file);
            return;
          }
          
          const compressed = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(compressed);
        }, 'image/jpeg', 0.8); // 80% quality is perfect for docs
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };
      
      img.src = objectUrl;
    });
  };

  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  
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
    offset: { x: 0, y: 0 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
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
      // 1. Try to fetch ALL terms from the system (requires RPC)
      const { data: globalTerms, error: rpcError } = await supabase.rpc('get_all_terms');
      
      let terms = [];
      if (!rpcError && globalTerms) {
         terms = [...new Set(globalTerms.map(t => t.term_id))];
      } else {
         // Fallback: Fetch terms this specific faculty has participated in
         console.warn('RPC get_all_terms failed, falling back to local history:', rpcError);
         const { data, error } = await supabase
          .from('checklists')
          .select('term_id')
          .eq('faculty_id', user.id);
        
         if (!error && data) {
            terms = [...new Set(data.map(c => c.term_id))];
         }
      }
      
      // Ensure current live term is always in the list even if no checklist exists yet
      const normSem = (s) => {
         const up = (s || '').toString().toUpperCase().trim();
         if (up === '1') return 'FIRST SEMESTER';
         if (up === '2') return 'SECOND SEMESTER';
         return up;
      };
      const liveTerm = `${settings.academicYear}-${normSem(settings.semester)}`;
      if (!terms.includes(liveTerm)) {
          terms.push(liveTerm);
      }
      
      // Sort terms (newest/descending)
      terms.sort().reverse();
      
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

      // 2. If not found, create one (even for past terms if selected)
      if (!data) {
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

  const progress = useMemo(() => calculateProgress(), [checklist]);

  // Derive uploads map for UI
  const uploads = useMemo(() => {
    const map = {};
    if (!checklist.loading) {
      checklist.subjects.forEach(sub => {
         sub.docs.forEach(doc => {
            if (doc.type) {
               const docIdx = DEFAULT_DOCUMENTS.subjects.indexOf(doc.type);
               if (docIdx > -1) {
                  const k = `subject-${sub.id}-${docIdx}`;
                  if (!map[k]) map[k] = [];
                  map[k].push(doc);
               }
            }
         });
      });
      checklist.other_docs.forEach((od) => {
         if (od && od.name) {
           map[od.name] = od.docs || [];
         }
      });
    }
    return map;
  }, [checklist]);

  const handleAddSubject = async () => {
    if (!subjectForm.name.trim() || !subjectForm.code.trim()) {
      setSubjectError('Subject Name and Code are required.');
      return;
    }

    /* ALLOW PREVIOUS SEMESTER UPLOADS
    if (selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester)) {
      addToast('Cannot manage subjects in past semesters.', 'error');
      return;
    }
    */
    
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

    /* ALLOW PREVIOUS SEMESTER UPLOADS
    if (selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester)) {
      addToast('Cannot manage subjects in past semesters.', 'error');
      return;
    }
    */

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
    /* ALLOW PREVIOUS SEMESTER UPLOADS
    if (selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester)) {
      addToast('Cannot manage subjects in past semesters.', 'error');
      return;
    }
    */

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

  const handleFileUpload = async (key, selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    
    if (!navigator.onLine) {
       addToast('No internet connection. Please check your network.', 'error');
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
         itemId = key;
         docName = key;
      }

      const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
      const newDocs = [];
      const fileList = Array.from(selectedFiles);

      // SEQUENTIAL PROCESSING: Prevents memory spikes on mobile
      for (const file of fileList) {
        if (file.size > MAX_FILE_SIZE) {
          addToast(`File ${file.name} is too large (>20MB).`, 'error');
          continue;
        }

        // 1. COMPRESS (If Image)
        const fileToUpload = await compressImage(file);

        // 2. UPLOAD
        const uniqueSuffix = Math.random().toString(36).substring(2, 8);
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${user.id}/${Date.now()}_${uniqueSuffix}_${cleanName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('checklists')
          .upload(filePath, fileToUpload);

        if (uploadError) {
          console.error(`Upload failed for ${file.name}:`, uploadError);
          addToast(`Failed to upload ${file.name}`, 'error');
          continue;
        }

        // 3. GET SIGNED URL (For immediate UI feedback)
        const { data: signData } = await supabase.storage
          .from('checklists')
          .createSignedUrl(filePath, 3600);

        newDocs.push({
          name: file.name,
          path: filePath,
          size: fileToUpload.size,
          preview: signData?.signedUrl,
          uploadedAt: new Date().toISOString(),
          type: docName 
        });
      }

      if (newDocs.length === 0) {
         setUploadingItems(prev => ({ ...prev, [key]: false }));
         return;
      }

      // Calculate final state
      const updatedSubjects = checklist.subjects.map(s => {
        if (s.id === itemId && type === 'subject') {
           const newRejected = s.rejected_types?.filter(t => t !== docName) || [];
           return { ...s, docs: [...(s.docs || []), ...newDocs], rejected_types: newRejected };
        }
        return s;
      });
      
      const updatedOther = checklist.other_docs.map(o => {
        if (o.name === itemId && type === 'other') {
           return { ...o, docs: [...(o.docs || []), ...newDocs], rejected: false };
        }
        return o;
      });
      
      const nextChecklist = {
        ...checklist,
        subjects: updatedSubjects,
        other_docs: updatedOther,
        status: checklist.status === 'revision' ? 'pending' : checklist.status
      };

      // Update Local State + DB
      setChecklist(nextChecklist);
      await updateChecklistInDB(nextChecklist);
      addToast('Upload Successful', 'success');

    } catch (err) {
      console.error('Batch Upload Error:', err);
      addToast('An error occurred during upload.', 'error');
    } finally {
      setUploadingItems(prev => ({ ...prev, [key]: false }));
    }
  };

  const updateChecklistInDB = async (state) => {
    try {
      if (!state.id) {
        console.error('CRITICAL: Cannot sync to DB - Checklist ID is missing.');
        return false;
      }

      console.log('Initiating DB Sync for Checklist:', state.id);
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
          status: state.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', state.id);
        
      if (error) {
        console.error('DB Sync Error:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        
        if (error.code === '23503' && error.message?.includes('faculty_profiles')) {
          logout();
        }
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('DB Sync Exception:', err);
      return false;
    }
  };

  const removeUpload = async (key, fileIndex) => {
    if (!navigator.onLine) {
       addToast('No internet connection. Cannot remove file.', 'error');
       return;
    }
    const isEditable = true; // Always allow editing for past semesters
    /* ALLOW PREVIOUS SEMESTER UPLOADS
    const isEditable = selectedTerm === 'LIVE' || !isPastTerm(checklist.term_id, settings.academicYear, settings.semester);
    if (!isEditable) {
       addToast('Cannot remove documents from previous semesters.', 'error');
       return;
    }
    */
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
      addToast('Please check your internet connection or try again later.', 'error');
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

  const latestUploadAt = useMemo(() => calculateLatestUpload(), [checklist]);



  // Search Logic (Memoized) - Instant Transparency
  const { visibleSubjects, visibleSubjectColumns, visibleOtherDocs, isSearchActive, hasResults } = useMemo(() => {
    const q = internalSearch.toLowerCase().trim();
    
    if (!q) {
      return { 
        visibleSubjects: checklist.subjects || [], 
        visibleSubjectColumns: DEFAULT_DOCUMENTS.subjects, 
        visibleOtherDocs: checklist.other_docs || [], 
        isSearchActive: false, 
        hasResults: true 
      };
    }

    // Tokenize query for flexible matching
    const tokens = q.split(/\s+/).filter(t => t.length > 0);
    
    const matchText = (text) => {
      if (!text) return false;
      const normalized = text.toString().toLowerCase();
      return tokens.every(token => normalized.includes(token));
    };

    // Document Type Matching
    const matchedSubjectDocs = DEFAULT_DOCUMENTS.subjects.filter(d => matchText(d));
    const isDocumentSearch = matchedSubjectDocs.length > 0;
    
    // Subject Matching
    const matchedSubjects = (checklist.subjects || []).filter(s => {
       const basicMatch = matchText(s.name) || matchText(s.code);
       
       // If it's a doc-specific search (e.g. "Rubrics"), only show subjects that HAVE that doc
       if (isDocumentSearch) {
         const hasDocUpload = s.docs.some(d => matchedSubjectDocs.includes(d.type));
         return basicMatch || hasDocUpload;
       }
       
       return basicMatch;
    });

    let vSubjects = checklist.subjects || [];
    let vColumns = DEFAULT_DOCUMENTS.subjects;

    const hasSubMatch = matchedSubjects.length > 0;

    if (isDocumentSearch && !hasSubMatch) {
      // User searched for a document -> show only subjects that have it
      vColumns = matchedSubjectDocs;
      vSubjects = (checklist.subjects || []).filter(s => 
        s.docs.some(d => matchedSubjectDocs.includes(d.type))
      );
    } else if (hasSubMatch && !isDocumentSearch) {
      vSubjects = matchedSubjects;
    } else if (hasSubMatch && isDocumentSearch) {
      vSubjects = matchedSubjects;
      vColumns = matchedSubjectDocs;
    } else {
      vSubjects = [];
    }

    // Section 2 Logic - Content Aware
    const vOtherDocs = (checklist.other_docs || []).filter(item => {
      const nameMatch = matchText(item.name);
      const hasContent = item.docs && item.docs.length > 0;
      
      // If searching for something that matches a document type name, only show if it has content
      // This minimizes the "hassle" of seeing empty slots during targeted lookups
      return nameMatch && (isDocumentSearch ? hasContent : true);
    });

    const active = !!q;
    const results = vSubjects.length > 0 || vOtherDocs.length > 0;

    return { 
      visibleSubjects: vSubjects, 
      visibleSubjectColumns: vColumns, 
      visibleOtherDocs: vOtherDocs, 
      isSearchActive: active, 
      hasResults: results 
    };
  }, [checklist, internalSearch]);

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
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: viewportWidth < 768 ? 'flex-start' : 'flex-end', 
          marginBottom: viewportWidth < 768 ? '16px' : 'var(--space-6)', 
          flexDirection: viewportWidth < 768 ? 'column' : 'row',
          gap: viewportWidth < 768 ? '12px' : 'var(--space-4)' 
        }}>
          <div>
            <h1 style={{ 
              fontSize: viewportWidth < 768 ? '1.5rem' : 'var(--text-2xl)',
              fontWeight: '900',
              color: 'var(--brand-blue-dark)',
              marginBottom: '4px'
            }}>Welcome, {user?.name}</h1>
            <p className="text-gray" style={{ fontSize: viewportWidth < 768 ? '0.85rem' : '1rem' }}>Faculty Compliance Checklist Dashboard</p>
          </div>

          <div className="history-picker" style={{ 
            display: 'flex', 
            flexDirection: 'row', 
            alignItems: 'flex-end', 
            gap: viewportWidth < 768 ? '8px' : '10px',
            width: viewportWidth < 768 ? '100%' : 'auto',
            flexWrap: 'wrap' 
          }}>
            <div style={{ flex: viewportWidth < 768 ? '1 1 100%' : '1 1 240px' }}>
              <label className="form-label" style={{ 
                fontSize: '9px', 
                textTransform: 'uppercase', 
                fontWeight: '900', 
                color: 'var(--brand-blue)',
                letterSpacing: '0.5px',
                marginBottom: '4px',
                display: 'block'
              }}>
                📂 Term History (Read-Only)
              </label>
                <select 
                  className="form-select" 
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                  style={{ 
                    minWidth: viewportWidth < 768 ? '0' : '220px', 
                    width: '100%',
                    border: '2px solid var(--nvsu-green-dark)',
                    height: viewportWidth < 768 ? '40px' : '48px',
                    fontSize: viewportWidth < 768 ? '0.85rem' : '1rem'
                  }}
                >
                  <option value="LIVE">🟢 Current Term</option>
                  {availableTerms
                    .filter(t => {
                      const normCurrent = `${settings.academicYear}-${settings.semester}`;
                      const parts = t.split('-');
                      if (parts.length < 2) return true;
                      const ay = `${parts[0]}-${parts[1]}`;
                      let sem = parts.slice(2).join(' ').trim().toUpperCase();
                      if (sem === '1') sem = 'FIRST SEMESTER';
                      if (sem === '2') sem = 'SECOND SEMESTER';
                      
                      return `${ay}-${sem}` !== normCurrent;
                    })
                    .map(term => (
                      <option key={term} value={term}>📂 {term.replace(/-/g, ' ')}</option>
                    ))
                  }
                </select>
            </div>
            {selectedTerm !== 'LIVE' && (
              <button 
                className={`btn ${isExporting ? 'btn-secondary' : 'btn-primary'}`}
                style={{ 
                  height: viewportWidth < 768 ? '40px' : '48px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '6px', 
                  flex: viewportWidth < 768 ? '1 1 100%' : '1 1 180px',
                  minWidth: viewportWidth < 768 ? '0' : '200px',
                  fontSize: viewportWidth < 768 ? '0.8rem' : '0.9rem'
                }}
                onClick={handleDownloadArchive}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: 'white' }}></div>
                    <span>{exportProgress.total > 0 ? `${Math.round((exportProgress.current / exportProgress.total) * 100)}%` : '...'}</span>
                  </>
                ) : (
                  <>📥 Download ZIP</>
                )}
              </button>
            )}
          </div>
        </div>



        {/* Premium Statistics Dashboard - Compact Redesign */}
        <div className="dashboard-stats" style={{ 
          gap: viewportWidth < 768 ? '10px' : '16px', 
          marginBottom: '24px', 
          display: 'grid', 
          gridTemplateColumns: viewportWidth < 768 ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))' 
        }}>
          {/* Card 1: Completion */}
          <div 
            className="stat-card" 
            style={{ 
              background: 'linear-gradient(135deg, #ffffff 0%, #e0f2fe 100%)',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: '4px solid var(--brand-blue)',
              boxShadow: '0 12px 20px -5px rgba(26, 67, 128, 0.12)',
              padding: viewportWidth < 768 ? '12px' : '20px',
              borderRadius: viewportWidth < 768 ? '16px' : '20px',
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              cursor: 'default'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div className="stat-label" style={{ color: 'var(--brand-blue)', fontSize: viewportWidth < 768 ? '0.65rem' : '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: viewportWidth < 768 ? '8px' : '12px' }}>Completion Rate</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <div className="stat-value" style={{ color: 'var(--brand-blue-dark)', fontSize: viewportWidth < 768 ? '1.4rem' : '1.8rem', fontWeight: '900', lineHeight: 1 }}>{progress.total}%</div>
              <div style={{ fontSize: viewportWidth < 768 ? '0.65rem' : '0.8rem', fontWeight: '600', color: 'var(--brand-blue)' }}>done</div>
            </div>
            <div style={{ width: '100%', height: viewportWidth < 768 ? '4px' : '6px', background: 'rgba(26, 67, 128, 0.1)', borderRadius: '10px', marginTop: viewportWidth < 768 ? '8px' : '12px', overflow: 'hidden' }}>
              <div style={{ width: `${progress.total}%`, height: '100%', background: 'linear-gradient(to right, var(--brand-blue), var(--brand-blue-light))', borderRadius: '10px', transition: 'width 1.5s ease-out' }}></div>
            </div>
          </div>

          {/* Card 2: Uploaded */}
          <div 
            className="stat-card" 
            style={{ 
              background: 'linear-gradient(135deg, #ffffff 0%, #dcfce7 100%)',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: '4px solid var(--brand-green)',
              boxShadow: '0 12px 20px -5px rgba(0, 104, 55, 0.12)',
              padding: viewportWidth < 768 ? '12px' : '20px',
              borderRadius: viewportWidth < 768 ? '16px' : '20px',
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              cursor: 'default'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div className="stat-label" style={{ color: 'var(--brand-green)', fontSize: viewportWidth < 768 ? '0.65rem' : '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: viewportWidth < 768 ? '8px' : '12px' }}>Uploaded Docs</div>
            <div className="stat-value" style={{ color: 'var(--brand-blue-dark)', fontSize: viewportWidth < 768 ? '1.4rem' : '1.8rem', fontWeight: '900', lineHeight: 1 }}>{progress.uploadedCount || 0}</div>
            <div className="stat-description" style={{ color: 'var(--brand-green)', fontWeight: '600', fontSize: viewportWidth < 768 ? '0.65rem' : '0.75rem', marginTop: viewportWidth < 768 ? '4px' : '8px' }}>Verified & Drafts</div>
          </div>

          {/* Card 3: Pending */}
          <div 
            className="stat-card" 
            style={{ 
              background: 'linear-gradient(135deg, #ffffff 0%, #fef9c3 100%)',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: '4px solid var(--nvsu-yellow-dark)',
              boxShadow: '0 12px 20px -5px rgba(217, 197, 0, 0.12)',
              padding: viewportWidth < 768 ? '12px' : '20px',
              borderRadius: viewportWidth < 768 ? '16px' : '20px',
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              cursor: 'default'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div className="stat-label" style={{ color: '#92400e', fontSize: viewportWidth < 768 ? '0.65rem' : '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: viewportWidth < 768 ? '8px' : '12px' }}>Pending Items</div>
            <div className="stat-value" style={{ color: 'var(--brand-blue-dark)', fontSize: viewportWidth < 768 ? '1.4rem' : '1.8rem', fontWeight: '900', lineHeight: 1 }}>{progress.remainingCount || 0}</div>
            <div className="stat-description" style={{ color: '#b45309', fontWeight: '600', fontSize: viewportWidth < 768 ? '0.65rem' : '0.75rem', marginTop: viewportWidth < 768 ? '4px' : '8px' }}>Next priority</div>
          </div>

          {/* Card 4: Classes */}
          <div 
            className="stat-card" 
            style={{ 
              background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: '4px solid var(--gray-400)',
              boxShadow: '0 12px 20px -5px rgba(0, 0, 0, 0.08)',
              padding: viewportWidth < 768 ? '12px' : '20px',
              borderRadius: viewportWidth < 768 ? '16px' : '20px',
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              cursor: 'default'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div className="stat-label" style={{ color: 'var(--gray-500)', fontSize: viewportWidth < 768 ? '0.65rem' : '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: viewportWidth < 768 ? '8px' : '12px' }}>Classes</div>
            <div className="stat-value" style={{ color: 'var(--brand-blue-dark)', fontSize: viewportWidth < 768 ? '1.4rem' : '1.8rem', fontWeight: '900', lineHeight: 1 }}>{checklist.loading ? "..." : checklist.subjects.length}</div>
            <div className="stat-description" style={{ color: 'var(--gray-600)', fontWeight: '600', fontSize: viewportWidth < 768 ? '0.65rem' : '0.75rem', marginTop: viewportWidth < 768 ? '4px' : '8px' }}>Active Subjects</div>
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
            {/* Stylized Profile Context */}
            <div style={{ 
              background: '#ffffff', 
              borderRadius: '20px', 
              padding: viewportWidth < 768 ? '12px 16px' : '16px 24px', 
              marginBottom: '20px', 
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              border: '1px solid var(--gray-100)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: viewportWidth < 768 ? '12px' : '24px',
              alignItems: 'center'
            }}>
              <div style={{ flex: viewportWidth < 768 ? '1 1 100%' : '1 1 200px' }}>
                <span className="text-gray" style={{ textTransform: 'uppercase', fontSize: '9px', fontWeight: '900', letterSpacing: '0.05em', color: 'var(--brand-blue)', display: 'block', marginBottom: '4px' }}>College / Department</span>
                <span style={{ fontSize: viewportWidth < 768 ? '0.85rem' : '0.95rem', fontWeight: '700', color: 'var(--gray-800)' }}>{checklist.college} — {checklist.department}</span>
              </div>
              
              <div style={{ width: '1px', height: '30px', background: 'var(--gray-100)', display: viewportWidth < 768 ? 'none' : 'block' }}></div>

              <div style={{ flex: viewportWidth < 768 ? '1 1 100%' : '0 1 auto' }}>
                <span className="text-gray" style={{ textTransform: 'uppercase', fontSize: '9px', fontWeight: '900', letterSpacing: '0.05em', color: 'var(--brand-blue)', display: 'block', marginBottom: '4px' }}>Current Term</span>
                <span style={{ fontSize: viewportWidth < 768 ? '0.85rem' : '0.95rem', fontWeight: '700', color: 'var(--gray-800)' }}>{checklist.semester} ({checklist.academicYear})</span>
              </div>

              <div style={{ flex: '0 0 auto', marginLeft: viewportWidth < 768 ? '0' : 'auto' }}>
                <div style={{ 
                  background: 'var(--brand-blue-pale)', 
                  color: 'var(--brand-blue-dark)', 
                  padding: '4px 10px', 
                  borderRadius: '10px', 
                  fontSize: '0.65rem', 
                  fontWeight: '900', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px' 
                }}>
                  FACULTY CONTEXT
                </div>
              </div>
            </div>

        {/* Modern Search Interface */}
        <div style={{ marginBottom: viewportWidth < 768 ? '20px' : '32px', position: 'relative' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            background: '#ffffff', 
            borderRadius: '16px', 
            padding: viewportWidth < 768 ? '0 12px' : '2px 8px 2px 20px', 
            border: '2px solid var(--gray-100)', 
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            height: viewportWidth < 768 ? '48px' : '56px'
          }}
          className="search-container-hover"
          >
            <span style={{ fontSize: viewportWidth < 768 ? '1rem' : '1.2rem', color: 'var(--gray-400)', marginRight: viewportWidth < 768 ? '10px' : '16px' }}>🔍</span>
            <input 
              type="text" 
              placeholder={viewportWidth < 768 ? "Find subjects..." : "Search for subjects, documents, or status..."}
              value={internalSearch}
              onChange={(e) => setInternalSearch(e.target.value)}
              style={{ flex: 1, border: 'none', fontSize: viewportWidth < 768 ? '0.9rem' : '1.05rem', outline: 'none', background: 'transparent', fontWeight: '500', color: 'var(--gray-800)' }}
            />
            {internalSearch && (
              <button 
                onClick={() => setInternalSearch('')}
                style={{ 
                  background: 'var(--gray-100)', 
                  border: 'none', 
                  width: '28px', 
                  height: '28px', 
                  borderRadius: '50%', 
                  color: 'var(--gray-600)', 
                  cursor: 'pointer', 
                  margin: '0 8px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '10px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-200)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--gray-100)'}
              >✕</button>
            )}
          </div>
        </div>

        {/* Search Results Priority Logic: Hide empty sections when searching */}
        {isSearchActive && !hasResults && (
          <div className="card shadow-sm animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-12)', borderRadius: '24px', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: '2px dashed var(--gray-200)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>🔎</div>
            <h3 style={{ color: 'var(--gray-600)', marginBottom: 'var(--space-2)' }}>No matching documents found</h3>
            <p className="text-gray">Try adjusting your keywords or clearing the filter.</p>
            <button className="btn btn-secondary mt-4" onClick={() => setInternalSearch('')}>Clear Search</button>
          </div>
        )}

        {/* Section 1: Documents by Subject */}
        {/* Always show this section so users can manage subjects in any term */}
        {(!isSearchActive || visibleSubjects.length > 0) && (
        <div className="card mb-8" style={{ border: 'none', boxShadow: '0 4px 20px -5px rgba(0,0,0,0.08)', borderRadius: '24px', overflow: 'hidden' }}>
          <div style={{ 
            padding: '24px 32px', 
            background: 'linear-gradient(to right, #f8fafc, #ffffff)', 
            borderBottom: '1px solid var(--gray-100)',
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <h2 className="card-title" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ background: 'var(--brand-blue-pale)', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📚</span>
              Section 1: Documents by Subject {isSearchActive && <span className="text-gray" style={{ fontSize: '0.75em', fontWeight: '500' }}>(Filtered)</span>}
            </h2>
            <button 
                className={`btn btn-secondary ${checklist.error ? 'disabled' : ''}`} 
                style={{ fontSize: '0.85rem', padding: '8px 20px', borderRadius: '12px', background: '#ffffff', border: '1px solid var(--gray-200)', fontWeight: '700', opacity: checklist.error ? 0.5 : 1 }}
                onClick={() => !checklist.error && setShowSubjectManager(true)}
                disabled={!!checklist.error}
              >
                ⚙️ Manage Subjects
              </button>
          </div>
          
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Subjects Taught</th>
                  {visibleSubjectColumns.map((doc, idx) => (
                    <th key={idx}>{doc}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSubjects.length === 0 && (
                   <tr>
                     <td colSpan={visibleSubjectColumns.length + 1} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--gray-500)' }}>
                        {internalSearch ? "No matching subjects found." : (selectedTerm === 'LIVE' || !isPastTerm(checklist.term_id, settings.academicYear, settings.semester)) ? "No subjects added yet. Click 'Manage Subjects' to add your classes." : "No subjects in this term."}
                     </td>
                   </tr>
                )}
                {visibleSubjects.map((subject) => (
                  <tr key={subject.id}>
                    <td data-label="Subject">
                      <strong>{subject.name}</strong>
                    </td>
                    {visibleSubjectColumns.map((doc, docIdx) => {
                      const key = `subject-${subject.id}-${DEFAULT_DOCUMENTS.subjects.indexOf(doc)}`;
                      const hasUpload = uploads[key];
                      const isReadOnly = !!checklist.error; // Prevent actions if there's an error
                      /* const isReadOnly = selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester); */
                      
                      const isRejected = subject.rejected_types?.includes(doc);

                      const isUploading = uploadingItems[key];
                      
                      return (
                        <td key={docIdx} data-label={doc} style={isRejected ? { backgroundColor: '#fff5f5', position: 'relative', borderLeft: '3px solid #ef4444' } : {}}>
                          {isRejected && (
                             <div style={{ 
                               position: 'absolute', 
                               top: 0, 
                               left: 0, 
                               right: 0, 
                               fontSize: '9px', 
                               background: '#ef4444', 
                               color: 'white', 
                               textAlign: 'center', 
                               fontWeight: '900', 
                               padding: '2px 0',
                               letterSpacing: '0.5px'
                             }}>ACTION REQUIRED</div>
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
                                      offset: { x: 0, y: 0 },
                                      isDragging: false,
                                      dragStart: { x: 0, y: 0 },
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
        )}

        {/* Section 2: Other Documents */}
        {((!isSearchActive && visibleOtherDocs.length > 0) || 
          (isSearchActive && visibleOtherDocs.length > 0)) && (
        <div className="card mb-8" style={{ border: 'none', boxShadow: '0 4px 20px -5px rgba(0,0,0,0.08)', borderRadius: '24px', overflow: 'hidden' }}>
          <div style={{ 
            padding: '24px 32px', 
            background: 'linear-gradient(to right, #f8fafc, #ffffff)', 
            borderBottom: '1px solid var(--gray-100)',
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center'
          }}>
            <h2 className="card-title" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ background: 'var(--brand-green-pale)', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📄</span>
              Section 2: Other Documents {isSearchActive && <span className="text-gray" style={{ fontSize: '0.75em', fontWeight: '500' }}>(Filtered)</span>}
            </h2>
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
                {visibleOtherDocs.map((item) => {
                  if (!item) return null;
                  const key = item.name;
                  const hasUpload = uploads[key];
                  
                  const isReadOnly = !!checklist.error; // Prevent actions if there's an error
                  /* const isReadOnly = selectedTerm !== 'LIVE' && isPastTerm(checklist.term_id, settings.academicYear, settings.semester); */
                  
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
                                    offset: { x: 0, y: 0 },
                                    isDragging: false,
                                    dragStart: { x: 0, y: 0 },
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
        )}

        {!hasResults && isSearchActive && (
          <div className="card shadow-nvsu animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-12)', marginTop: 'var(--space-8)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>🔍</div>
            <h2 style={{ color: 'var(--gray-600)', marginBottom: 'var(--space-2)' }}>No Results Found</h2>
            <p className="text-gray mb-6">
              We couldn't find any documents or subjects matching "{internalSearch}".
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => setInternalSearch('')}>
              Show All Documents
            </button>
          </div>
        )}

        {/* Premium Completion Card */}
        <div style={{ 
          background: 'linear-gradient(135deg, var(--brand-blue-dark) 0%, var(--brand-blue) 100%)', 
          borderRadius: '32px', 
          padding: '40px', 
          color: 'white',
          boxShadow: '0 20px 40px -10px rgba(26, 67, 128, 0.3)',
          marginBottom: '64px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Decorative Elements */}
          <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '300px', height: '300px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}></div>
          <div style={{ position: 'absolute', bottom: '-50px', left: '-50px', width: '200px', height: '200px', background: 'rgba(255,255,255,0.03)', borderRadius: '50%' }}></div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '40px', alignItems: 'center', position: 'relative', zIndex: 1 }}>
            <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
              <div style={{ 
                width: '120px', 
                height: '120px', 
                borderRadius: '50%', 
                border: '8px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}>
                <svg width="120" height="120" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                  <circle 
                    cx="60" cy="60" r="50" 
                    fill="transparent" 
                    stroke="rgba(255,255,255,0.8)" 
                    strokeWidth="8" 
                    strokeDasharray={`${(progress.total / 100) * 314} 314`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 1s ease-out' }}
                  />
                </svg>
                <div style={{ fontSize: '1.8rem', fontWeight: '900' }}>{progress.total}%</div>
              </div>
              <p style={{ marginTop: '12px', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>Completion</p>
            </div>

            <div style={{ flex: '1 1 300px' }}>
              <h3 style={{ color: 'white', fontSize: '1.8rem', marginBottom: '12px' }}>Finalize Your Submission</h3>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', maxWidth: '500px', marginBottom: '24px', lineHeight: '1.6' }}>
                Once all documents are uploaded, please submit your checklist for review. Your Chair will be notified immediately of your progress.
              </p>
              
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <button 
                  className="btn btn-primary"
                  style={{ 
                    background: progress.total === 100 ? 'var(--brand-green)' : '#ffffff', 
                    color: progress.total === 100 ? '#ffffff' : 'var(--brand-blue-dark)',
                    padding: '16px 32px',
                    borderRadius: '16px',
                    fontSize: '1rem',
                    fontWeight: '800',
                    border: 'none',
                    boxShadow: '0 10px 20px -5px rgba(0,0,0,0.2)'
                  }}
                  onClick={() => setShowSubmitModal(true)}
                  disabled={checklist.status === 'pending' || checklist.status === 'approved'}
                >
                  {checklist.status === 'approved' ? '✓ Checklist Approved' : checklist.status === 'pending' ? '⏳ Submission Pending' : 'Submit Review Now'}
                </button>

                {checklist.status === 'approved' && (
                  <div style={{ padding: '12px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.2rem' }}>✅</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>Chair has approved your term requirements.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </>)}

        {/* Redesigned Submit Progress Modal */}
        {showSubmitModal && (
          <div 
            className="modal-backdrop" 
            style={{ 
              zIndex: 1300, 
              backgroundColor: 'rgba(0, 0, 0, 0.65)', 
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
          >
            <div 
              className="modal-content" 
              style={{ 
                maxWidth: '650px', 
                width: '100%', 
                borderRadius: '32px', 
                background: '#ffffff', 
                boxShadow: '0 30px 60px -12px rgba(0,0,0,0.3)',
                overflow: 'hidden',
                animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              <div style={{ 
                padding: '32px', 
                background: 'linear-gradient(to right, var(--brand-blue-pale), #ffffff)', 
                borderBottom: '1px solid var(--gray-100)' 
              }}>
                <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '900', color: 'var(--brand-blue-dark)', letterSpacing: '-0.03em' }}>
                  Final Review Summary
                </h3>
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                   <div style={{ px: '12px', py: '4px', background: 'var(--brand-blue)', color: 'white', borderRadius: '30px', fontSize: '0.75rem', fontWeight: '800', padding: '4px 12px' }}>
                    {progress.total}% COMPLETE
                   </div>
                   <span style={{ fontSize: '0.85rem', color: 'var(--gray-500)', fontWeight: '500' }}>Checked on {new Date().toLocaleDateString()}</span>
                </div>
              </div>

              <div style={{ padding: '32px' }}>
                {progress.total === 100 ? (
                  <div style={{ 
                    background: '#f0fdf4', 
                    borderRadius: '20px', 
                    padding: '24px', 
                    border: '1px solid #bbf7d0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px'
                  }}>
                    <div style={{ fontSize: '2.5rem' }}>✨</div>
                    <div>
                      <h4 style={{ margin: 0, color: '#166534', fontWeight: '800' }}>Everything Looks Perfect!</h4>
                      <p style={{ margin: '4px 0 0', color: '#15803d', fontSize: '0.9rem' }}>All required documents have been uploaded and verified.</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ 
                      background: '#fffbeb', 
                      borderRadius: '16px', 
                      padding: '16px 20px', 
                      marginBottom: '24px',
                      borderLeft: '4px solid var(--nvsu-yellow-dark)'
                    }}>
                       <p style={{ margin: 0, fontSize: '0.95rem', color: '#92400e', fontWeight: '600' }}>
                         You still have {100 - progress.total}% to complete.
                       </p>
                    </div>

                    <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--gray-500)', marginBottom: '16px', fontWeight: '800' }}>Missing Documents:</h4>
                    
                    <div style={{ maxHeight: '350px', overflowY: 'auto', borderRadius: '20px', border: '1px solid var(--gray-100)', padding: '16px', background: '#fcfcfc' }}>
                      {getMissingDocuments().subjects.map((sub, i) => (
                        <div key={i} style={{ 
                          marginBottom: '20px', 
                          background: '#ffffff', 
                          padding: '16px', 
                          borderRadius: '16px',
                          border: '1px solid var(--gray-100)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '1rem' }}>📚</span>
                            <strong style={{ color: 'var(--brand-blue-dark)', fontSize: '0.9rem' }}>{sub.name}</strong>
                          </div>
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {sub.docs.map((d, di) => (
                              <li key={di} style={{ 
                                background: '#fef2f2', 
                                color: '#b91c1c', 
                                padding: '4px 10px', 
                                borderRadius: '8px', 
                                fontSize: '0.75rem', 
                                fontWeight: '700',
                                border: '1px solid #fee2e2'
                              }}>
                                ✕ {d}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      
                      {getMissingDocuments().other.length > 0 && (
                        <div style={{ 
                          background: '#ffffff', 
                          padding: '16px', 
                          borderRadius: '16px',
                          border: '1px solid var(--gray-100)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '1rem' }}>📄</span>
                            <strong style={{ color: 'var(--brand-blue-dark)', fontSize: '0.9rem' }}>Other Documents</strong>
                          </div>
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {getMissingDocuments().other.map((d, di) => (
                              <li key={di} style={{ 
                                background: '#fef2f2', 
                                color: '#b91c1c', 
                                padding: '4px 10px', 
                                borderRadius: '8px', 
                                fontSize: '0.75rem', 
                                fontWeight: '700',
                                border: '1px solid #fee2e2'
                              }}>
                                ✕ {d}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <p style={{ marginTop: '24px', fontSize: '0.85rem', color: 'var(--gray-500)', textAlign: 'center', fontWeight: '500', lineHeight: '1.5' }}>
                  By confirming, your Chairperson will be notified to begin the verification process. 
                  You can still update files unless your account is locked by the admin.
                </p>
              </div>

              <div style={{ padding: '24px 32px 32px', display: 'flex', gap: '16px', background: '#f8fafc' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: '14px', borderRadius: '14px', fontWeight: '700' }}
                  onClick={() => setShowSubmitModal(false)}
                  disabled={submitting}
                >
                  Go Back
                </button>
                <button 
                  className="btn btn-primary" 
                  style={{ 
                    flex: 2, 
                    padding: '14px', 
                    borderRadius: '14px', 
                    fontWeight: '800', 
                    fontSize: '1rem',
                    background: 'var(--brand-blue)',
                    boxShadow: '0 10px 20px -5px rgba(26, 67, 128, 0.3)'
                  }}
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? 'Processing...' : 'Confirm Submission'}
                </button>
              </div>
            </div>
          </div>
        )}
        </>)}
      </main>
      {/* Enhanced Image Preview Modal with Panning and Zoom */}
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
                           zoom: 1,
                           offset: {x:0, y:0}
                        }));
                     }
                   }
                 }}
               >
                 REMOVE
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
      {/* Redesigned Subject Manager Modal */}
      {showSubjectManager && (
        <div 
          className="modal-backdrop" 
          style={{ 
            zIndex: 1100,
            backgroundColor: 'rgba(0, 0, 0, 0.6)', 
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
            animation: 'fadeIn 0.3s ease-out'
          }}
          onClick={() => setShowSubjectManager(false)}
        >
          <div 
            className="modal-content" 
            style={{ 
              maxWidth: 'min(750px, 95vw)', 
              width: '100%', 
              maxHeight: '90vh',
              borderRadius: '24px', 
              background: '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideUp 0.3s ease-out'
            }} 
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ 
              padding: viewportWidth < 768 ? '16px 20px' : '24px 32px', 
              background: 'linear-gradient(to right, var(--brand-blue-pale), #ffffff)', 
              borderBottom: '1px solid var(--gray-100)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: viewportWidth < 768 ? '1.1rem' : '1.4rem', fontWeight: '800', color: 'var(--brand-blue-dark)', letterSpacing: '-0.02em' }}>
                  Manage Your Subjects
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                  Enter the subjects you are teaching this term.
                </p>
              </div>
            </div>

            <div className="modal-body" style={{ padding: viewportWidth < 768 ? '16px' : '32px', overflowY: 'auto' }}>
              {/* Add New Subject Form */}
              <div style={{ 
                background: '#f8fafc', 
                padding: '24px', 
                borderRadius: '16px', 
                marginBottom: '32px', 
                border: '1.5px dashed var(--gray-300)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                  <h4 style={{ fontSize: '0.75rem', margin: 0, textTransform: 'uppercase', color: 'var(--brand-blue)', fontWeight: '800', letterSpacing: '1px' }}>
                    Quick Add New Subject
                  </h4>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Subject Code" 
                        value={subjectForm.code}
                        onChange={e => setSubjectForm(prev => ({ ...prev, code: e.target.value }))}
                        style={{ width: '100%', padding: '12px 16px', borderRadius: '12px' }}
                      />
                    </div>
                    <div style={{ flex: 2, minWidth: '220px' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Subject Description / Title" 
                        value={subjectForm.name}
                        onChange={e => setSubjectForm(prev => ({ ...prev, name: e.target.value }))}
                        style={{ width: '100%', padding: '12px 16px', borderRadius: '12px' }}
                      />
                    </div>
                    <button 
                      className="btn btn-primary" 
                      onClick={handleAddSubject}
                      style={{ padding: '0 24px', borderRadius: '12px', height: '48px' }}
                    >
                      <span>Add Class</span>
                    </button>
                  </div>
                  {subjectError && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>⚠️ {subjectError}</p>}
              </div>

              {/* List of Existing Subjects */}
              <div style={{ maxHeight: '350px', overflowY: 'auto', borderRadius: '16px', border: '1px solid var(--gray-100)' }}>
                  <table className="table" style={{ fontSize: '14px', margin: 0 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ padding: '16px', color: 'var(--gray-600)', background: '#f1f5f9' }}>Subject Code</th>
                        <th style={{ padding: '16px', color: 'var(--gray-600)', background: '#f1f5f9' }}>Description</th>
                        <th style={{ width: '60px', textAlign: 'center', padding: '16px', color: 'var(--gray-600)', background: '#f1f5f9' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklist.subjects.map((sub, idx) => (
                        <tr key={sub.id} style={{ borderBottom: '1px solid var(--gray-50)' }}>
                          <td style={{ padding: '12px 16px' }}>
                              <input 
                                defaultValue={sub.code} 
                                onBlur={(e) => {
                                  if (e.target.value !== sub.code) handleUpdateSubject(sub.id, sub.name, e.target.value);
                                }}
                                className="form-input"
                                style={{ padding: '8px 12px', width: '100%', backgroundColor: 'transparent', border: '1px solid transparent' }}
                                onFocus={e => e.target.style.borderColor = 'var(--brand-blue-pale)'}
                                onMouseOver={e => e.target.style.backgroundColor = '#f8fafc'}
                                onMouseOut={e => e.target.style.backgroundColor = 'transparent'}
                              />
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                              <input 
                                defaultValue={sub.name} 
                                onBlur={(e) => {
                                  if (e.target.value !== sub.name) handleUpdateSubject(sub.id, e.target.value, sub.code);
                                }}
                                className="form-input"
                                style={{ padding: '8px 12px', width: '100%', backgroundColor: 'transparent', border: '1px solid transparent' }}
                                onFocus={e => e.target.style.borderColor = 'var(--brand-blue-pale)'}
                                onMouseOver={e => e.target.style.backgroundColor = '#f8fafc'}
                                onMouseOut={e => e.target.style.backgroundColor = 'transparent'}
                              />
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px' }}>
                              <button 
                                className="btn btn-sm destructive"
                                style={{ 
                                  color: '#ef4444', 
                                  background: '#fee2e2', 
                                  border: 'none', 
                                  width: '36px', 
                                  height: '36px', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  borderRadius: '10px',
                                  transition: 'all 0.2s'
                                }} 
                                onClick={() => handleDeleteSubject(sub.id)}
                                onMouseOver={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = 'white'; }}
                                onMouseOut={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#ef4444'; }}
                                title="Delete Subject"
                              >
                                ✕
                              </button>
                          </td>
                        </tr>
                      ))}
                      {checklist.subjects.length === 0 && (
                          <tr>
                            <td colSpan="3" style={{ textAlign: 'center', color: 'var(--gray-500)', padding: '60px 20px', background: '#ffffff' }}>
                              <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.3 }}>📚</div>
                              <p style={{ margin: 0, fontWeight: '600' }}>No subjects added yet.</p>
                              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.7 }}>Add your first class using the form above!</p>
                            </td>
                          </tr>
                      )}
                    </tbody>
                  </table>
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--gray-100)', padding: viewportWidth < 768 ? '16px' : '24px 32px', display: 'flex' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowSubjectManager(false)}
                style={{ width: viewportWidth < 768 ? '100%' : 'auto', marginLeft: 'auto', padding: '12px 32px', borderRadius: '12px', fontWeight: '800' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Redesigned Media Capture Choice Modal */}
      {mediaCapture.isOpen && !cameraState.isActive && (
        <div 
          className="modal-backdrop" 
          style={{ 
            zIndex: 1200, 
            backgroundColor: 'rgba(0, 0, 0, 0.6)', 
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
            animation: 'fadeIn 0.3s ease-out'
          }}
          onClick={() => setMediaCapture({ isOpen: false, key: null, docName: null })}
        >
          <div 
            className="modal-content" 
            style={{ 
              maxWidth: '450px', 
              width: '100%', 
              borderRadius: '24px', 
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              background: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              animation: 'slideUp 0.3s ease-out'
            }} 
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ 
              padding: '24px 24px 16px', 
              background: 'linear-gradient(to right, var(--brand-blue-pale), #ffffff)', 
              borderBottom: '1px solid var(--gray-100)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: 'var(--brand-blue-dark)', letterSpacing: '-0.02em' }}>
                  Select Method
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--gray-500)', fontWeight: '500' }}>
                  {mediaCapture.docName}
                </p>
              </div>
              <button 
                onClick={() => setMediaCapture({ isOpen: false, key: null, docName: null })} 
                style={{ 
                  background: 'white', 
                  border: '1px solid var(--gray-200)', 
                  width: '36px', 
                  height: '36px', 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  cursor: 'pointer', 
                  color: 'var(--gray-600)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'var(--gray-50)'; e.currentTarget.style.color = 'var(--nvsu-red)'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'var(--gray-600)'; }}
              >✕</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                
                {/* NEW: LIVE IN-APP CAMERA (MOST STABLE) */}
                <button 
                  onClick={() => startCamera('environment')}
                  style={{ 
                    cursor: 'pointer',
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '20px',
                    padding: '24px', 
                    borderRadius: '20px', 
                    background: 'var(--brand-blue)',
                    border: 'none',
                    textAlign: 'left',
                    color: 'white',
                    boxShadow: '0 10px 20px rgba(26, 67, 128, 0.2)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 15px 30px rgba(26, 67, 128, 0.3)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 10px 20px rgba(26, 67, 128, 0.2)';
                  }}
                >
                  <div style={{ fontSize: '2.8rem' }}>📸</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: '900', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>In-App Camera</span>
                    <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>Take a photo now</span>
                  </div>
                </button>

                {/* Gallery Option - Expanded to 1fr */}
                <label 
                  style={{ 
                    cursor: 'pointer',
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '20px',
                    padding: '24px', 
                    borderRadius: '20px', 
                    background: '#f8fafc',
                    border: '2px solid var(--gray-100)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = 'var(--brand-green)';
                    e.currentTarget.style.background = '#f0fdf4';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = 'var(--gray-100)';
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileUpload(mediaCapture.key, e.target.files);
                      }
                      setMediaCapture({ isOpen: false, key: null, docName: null });
                      e.target.value = null; 
                    }}
                    hidden 
                  />
                  <div style={{ fontSize: '2.8rem' }}>🖼️</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: '900', fontSize: '1.2rem', color: 'var(--brand-blue-dark)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Photo Library</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>Choose from Gallery</span>
                  </div>
                </label>

              </div>
              
              <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.85rem', color: 'var(--gray-400)', fontWeight: '500' }}>
                For the best experience, use the <b>In-App Camera</b>.
              </p>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '0 24px 24px' }}>
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', padding: '12px', borderRadius: '12px', fontWeight: '700' }}
                onClick={() => setMediaCapture({ isOpen: false, key: null, docName: null })}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE CAMERA MODAL OVERLAY */}
      {cameraState.isActive && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 1300,
          background: '#000',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Integrated Header */}
          <div style={{ 
            padding: '24px 20px', 
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            color: 'white',
            zIndex: 2000,
            position: 'absolute',
            top: 0,
            right: 0,
            left: 0,
            pointerEvents: 'none'
          }}>
            <div style={{ textAlign: 'left' }}>
              <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', textShadow: '0 2px 8px rgba(0,0,0,0.8)', letterSpacing: '-0.02em' }}>
                {mediaCapture.docName}
              </h4>
            </div>
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                stopCamera();
              }}
              style={{ 
                background: 'rgba(255,255,255,0.2)', 
                border: '1px solid rgba(255,255,255,0.4)', 
                color: 'white', 
                fontSize: '1.2rem', 
                cursor: 'pointer', 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                backdropFilter: 'blur(10px)',
                pointerEvents: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}
            >✕</button>
          </div>

          {/* Viewport */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {cameraState.loading && (
              <div style={{ color: 'white' }}>Starting camera...</div>
            )}
            
            {/* The Video Feed */}
            <video 
              ref={videoRef}
              autoPlay 
              playsInline 
              muted
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover',
                display: cameraState.previewBlob ? 'none' : 'block' 
              }}
            />

            {/* Photo Preview (Captured) */}
            {cameraState.previewBlob && (
              <img 
                src={URL.createObjectURL(cameraState.previewBlob)}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                alt="Captured"
              />
            )}

            {/* Canvas (Hidden, used for snapping) */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>

          {/* Combined Header replaces old overlay */}

          {/* Controls Area */}
          <div style={{ 
            padding: '30px 20px 60px', 
            background: 'black', 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            zIndex: 10
          }}>
            {!cameraState.previewBlob ? (
              <>
                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-around', alignItems: 'center' }}>
                  {/* Switch Camera */}
                  <div style={{ textAlign: 'center' }}>
                    <button 
                      onClick={() => startCamera(cameraState.facingMode === 'user' ? 'environment' : 'user')}
                      style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '12px', borderRadius: '50%', width: '56px', height: '56px', fontSize: '1.4rem' }}
                    >🔄</button>
                  </div>
                  
                  {/* Capture Button */}
                  <button 
                    onClick={capturePhoto}
                    style={{ 
                      width: '82px', 
                      height: '82px', 
                      borderRadius: '50%', 
                      background: 'white', 
                      border: '6px solid rgba(255,255,255,0.3)',
                      cursor: 'pointer',
                      boxShadow: '0 0 20px rgba(255,255,255,0.2)',
                      padding: 0
                    }}
                  />

                  {/* Flash/Torch Toggle */}
                  <div style={{ textAlign: 'center' }}>
                    <button 
                      onClick={toggleTorch}
                      disabled={!cameraState.torchAvailable}
                      style={{ 
                        background: cameraState.torchEnabled ? 'var(--nvsu-yellow)' : 'rgba(255,255,255,0.15)', 
                        border: '1px solid rgba(255,255,255,0.3)', 
                        color: cameraState.torchEnabled ? '#000' : '#fff', 
                        padding: '12px', 
                        borderRadius: '50%', 
                        width: '56px', 
                        height: '56px',
                        fontSize: '1.4rem',
                        transition: 'all 0.2s',
                        opacity: cameraState.torchAvailable ? 1 : 0.2
                      }}
                    >
                      {cameraState.torchEnabled ? '⚡' : '🚫'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <button 
                  className="btn btn-secondary"
                  onClick={() => setCameraState(prev => ({ ...prev, previewBlob: null }))}
                  style={{ borderRadius: '12px', padding: '12px 24px', background: '#333', color: 'white', border: 'none' }}
                >
                  RETAKE
                </button>
                
                <button 
                  className="btn btn-primary"
                  onClick={handleCameraUpload}
                  style={{ borderRadius: '12px', padding: '12px 32px', background: 'var(--brand-blue)', fontWeight: '800' }}
                >
                  USE PHOTO
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
