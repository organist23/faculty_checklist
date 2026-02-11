import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import { useSystem } from '../context/SystemContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { formatDistanceToNow, isPast } from 'date-fns';
import { supabase } from '../supabase';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

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

const PremiumDeadlinePicker = ({ value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Robust ISO Parsing (handles YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm)
  const isoMatch = (value || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  const datePart = isoMatch ? isoMatch[1] : '2026-03-28';
  const timePart = isoMatch ? `${isoMatch[2]}:${isoMatch[3]}` : '04:00';
  
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour24, minute] = timePart.split(':').map(Number);
  
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

  const handleUpdate = (updates) => {
    const state = { year, month, day, hour12, minute, ampm, ...updates };
    let h24 = Number(state.hour12);
    if (state.ampm === 'PM' && h24 < 12) h24 += 12;
    if (state.ampm === 'AM' && h24 === 12) h24 = 0;

    const dateStr = `${state.year}-${String(state.month).padStart(2, '0')}-${String(state.day).padStart(2, '0')}`;
    const timeStr = `${String(h24).padStart(2, '0')}:${String(state.minute).padStart(2, '0')}`;
    onChange(`${dateStr}T${timeStr}`);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formattedDisplay = `${months[month-1]} ${day}, ${year} at ${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;

  return (
    <div className="premium-picker" ref={containerRef}>
      <button 
        className="picker-trigger" 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className="picker-icon">📅</span>
        <span className="picker-value">{formattedDisplay}</span>
        <span className={`picker-arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div className="picker-dropdown shadow-nvsu">
          <div className="picker-header">
            <div className="picker-nav" style={{ justifyContent: 'center', gap: '8px' }}>
              <select 
                value={month} 
                onChange={(e) => handleUpdate({ month: Number(e.target.value) })}
                className="picker-select"
              >
                {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select 
                value={year} 
                onChange={(e) => handleUpdate({ year: Number(e.target.value) })}
                className="picker-select"
              >
                {[...Array(11)].map((_, i) => {
                  const y = new Date().getFullYear() - 2 + i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
            </div>
          </div>
          
          <div className="calendar-grid">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
              <div key={d} className="calendar-weekday">{d}</div>
            ))}
            {[...Array(new Date(year, month - 1, 1).getDay())].map((_, i) => (
              <div key={`empty-${i}`} className="calendar-day empty"></div>
            ))}
            {[...Array(daysInMonth(year, month))].map((_, i) => (
              <button 
                key={i + 1} 
                className={`calendar-day ${day === i + 1 ? 'active' : ''}`}
                onClick={() => handleUpdate({ day: i + 1 })}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="time-selector">
            <div className="time-unit">
              <div className="time-label">Hour</div>
              <select value={hour12} onChange={(e) => handleUpdate({ hour12: Number(e.target.value) })}>
                {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
              </select>
            </div>
            <div className="time-unit">
              <div className="time-label">Min</div>
              <select value={minute} onChange={(e) => handleUpdate({ minute: Number(e.target.value) })}>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                ))}
              </select>
            </div>
            <div className="time-unit">
              <div className="time-label">Period</div>
              <select value={ampm} onChange={(e) => handleUpdate({ ampm: e.target.value })}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>
          
          <div className="picker-footer">
            <button className="btn-done" onClick={() => setIsOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

const normalizeSemester = (sem) => {
  if (!sem) return sem;
  return sem.toString().toUpperCase().trim();
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { settings, updateSettings } = useSystem();
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState([]);
  const [globalChecklists, setGlobalChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveProgress, setArchiveProgress] = useState({ current: 0, total: 0 });
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [allTerms, setAllTerms] = useState([]); // Array of { year, sem }
  const [filteredChecklists, setFilteredChecklists] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [error, setError] = useState(null);
  
  useEffect(() => {
    fetchChecklists();
    fetchGlobalStorageData();
    fetchAllTerms();

    const channel = supabase
      .channel('admin-global-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklists' }, (payload) => {
          const termId = `${settings.academicYear}-${settings.semester}`;
          if (payload.new?.term_id === termId || payload.old?.term_id === termId) {
            fetchChecklists(true); 
          }
          fetchGlobalStorageData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [settings.semester, settings.academicYear, settings.deadline]);

  const fetchChecklists = async (isBackground = false) => {
    try {
      setError(null);
      if (!isBackground) setLoading(true);

      const currentAy = settings.academicYear;
      const currentSem = settings.semester;
      const termId = `${currentAy}-${currentSem}`;

      const { data: profiles, error: profileError } = await supabase
        .from('faculty_profiles')
        .select('*')
        .neq('name', 'System Admin');

      if (profileError) throw profileError;

      let query = supabase
        .from('checklists')
        .select(`*, faculty_profiles (name, email, college, department)`)
        .eq('term_id', termId);

      let { data: checklistData, error: checklistError } = await query;
      if (checklistError) throw checklistError;

      // Client-side filter for extra safety and compatibility
      checklistData = (checklistData || []).filter(c => c.faculty_profiles?.name !== 'System Admin');

      const facultyMap = {};
      profiles.forEach(p => {
        facultyMap[p.id] = {
          id: `virtual-${p.id}`,
          facultyName: p.name,
          email: p.email,
          college: p.college,
          department: p.department,
          submittedAt: null,
          status: 'not_started',
          progress: 0,
          submissionStatus: 'pending',
          semester: currentSem,
          academicYear: currentAy,
          raw: { faculty_profiles: p, subjects: [], other_docs: [] }
        };
      });

      const statusPriority = { approved: 4, pending: 3, revision: 2, in_progress: 1, archived: 0 };

      checklistData.forEach(c => {
        const parts = c.term_id.split('-');
        const itemAY = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : currentAy;
        const itemSem = parts.length >= 3 ? parts.slice(2).join(' ') : currentSem;
        const normalizedSem = normalizeSemester(itemSem);

        const progress = calculateChecklistProgress(c);
        const isConsideredSubmitted = (c.status === 'pending' || c.status === 'approved') && progress > 0;
        const displaySubmittedAt = isConsideredSubmitted ? c.updated_at : null;

        const mappedItem = {
          id: c.id,
          facultyName: c.faculty_profiles?.name || 'Unknown',
          email: c.faculty_profiles?.email,
          college: c.faculty_profiles?.college,
          department: c.faculty_profiles?.department,
          submittedAt: displaySubmittedAt,
          status: isConsideredSubmitted ? c.status : 'not_started',
          progress: progress,
          submissionStatus: getSubmissionStatus(displaySubmittedAt, settings.deadline, c.status, progress),
          semester: normalizedSem,
          academicYear: itemAY,
          raw: c
        };

        const existing = facultyMap[c.faculty_id];
        if (existing) {
          if (existing.status === 'not_started' || (statusPriority[mappedItem.status] > statusPriority[existing.status])) {
            facultyMap[c.faculty_id] = mappedItem;
          } else if (statusPriority[mappedItem.status] === statusPriority[existing.status]) {
            if (mappedItem.progress > existing.progress) {
              facultyMap[c.faculty_id] = mappedItem;
            }
          }
        } else {
          facultyMap[`orphan-${c.id}`] = mappedItem;
        }
      });

      setChecklists(Object.values(facultyMap));
      setLoading(false);
    } catch (err) {
      console.error('Dashboard Load Error:', err);
      if (err.code === '23503' || err.code === '42501') {
         logout();
      }
      setLoading(false);
      setError(err.message);
    }
  };

  const fetchGlobalStorageData = async () => {
    try {
      const { data, error } = await supabase.from('checklists').select('subjects, other_docs');
      if (error) throw error;
      setGlobalChecklists(data || []);
    } catch (err) {
      console.error('Global Storage Fetch Error:', err);
    }
  };

  const fetchAllTerms = async () => {
    try {
      const { data, error } = await supabase.from('checklists').select('term_id');
      if (error) throw error;
      
      const terms = [];
      const seen = new Set();
      
      data.forEach(item => {
        if (item.term_id) {
          const parts = item.term_id.split('-');
          if (parts.length >= 2) {
            const year = `${parts[0]}-${parts[1]}`;
            const sem = parts.slice(2).join(' ').trim().toUpperCase();
            
            const key = `${year}|${sem}`;
            if (!seen.has(key)) {
              seen.add(key);
              terms.push({ year, sem });
            }
          }
        }
      });
      
      setAllTerms(terms);
    } catch (err) {
      console.error('Error fetching terms:', err);
    }
  };

  // Derived available terms logic
  const availableYears = (() => {
    // Only show years that actually have data (from checklist) OR the currently active setting.
    // If system is new/empty, this might be just the default '2025-2026' or empty.
    const years = new Set(allTerms.map(t => t.year));
    if (settings.academicYear) years.add(settings.academicYear);
    
    return Array.from(years).sort().reverse();
  })();

  const availableSemesters = (() => {
    // Show semesters that exist for the selected year
    const sems = new Set(allTerms.filter(t => t.year === settings.academicYear).map(t => t.sem));
    // Always include current semester setting
    if (settings.semester) sems.add(settings.semester);
    
    // Strict Filter: Remove numeric tags like "1", "2" if they accidentally exist
    const filteredSems = Array.from(sems).filter(s => s !== '1' && s !== '2');

    // Sort logic: First, Second, Summer, others
    const order = { 'FIRST SEMESTER': 1, 'SECOND SEMESTER': 2, 'SUMMER': 3 };
    return filteredSems.sort((a, b) => (order[a] || 99) - (order[b] || 99));
  })();

  const [storageUsage, setStorageUsage] = useState({ used: 0, total: 1024 * 1024 * 1024 });

  useEffect(() => {
    let totalBytes = 0;
    globalChecklists.forEach(raw => {
      if (!raw) return;
      const allDocs = [
        ...(raw.subjects || []).flatMap(s => s.docs || []),
        ...(raw.other_docs || []).flatMap(o => o.docs || [])
      ];
      allDocs.forEach(d => {
        // Use recorded size if available (even if 0), otherwise estimate 3MB default
        totalBytes += (typeof d.size === 'number' ? d.size : 3 * 1024 * 1024);
      });
    });
    setStorageUsage(prev => ({ ...prev, used: totalBytes }));
  }, [globalChecklists]);

  const calculateChecklistProgress = (checklist) => {
    const totalSubjectSlots = checklist.subjects.length * 12;
    const totalOtherSlots = checklist.other_docs.length;
    const totalSlots = totalSubjectSlots + totalOtherSlots;
    
    if (totalSlots === 0) return 0;
    
    const filledSubjectSlots = checklist.subjects.reduce((acc, s) => acc + Math.min(s.docs.length, 12), 0);
    const filledOtherSlots = checklist.other_docs.reduce((acc, o) => acc + (o.docs.length > 0 ? 1 : 0), 0);
    
    return Math.round(((filledSubjectSlots + filledOtherSlots) / totalSlots) * 100);
  };

  const getSubmissionStatus = (submittedAt, deadline, currentStatus, progress) => {
    // 1. If not submitted yet
    if (!submittedAt) {
      if (deadline && new Date() > new Date(deadline)) return 'overdue';
      return 'pending';
    }
    
    // 2. If submitted, check if it was late
    if (!deadline) return 'on_time';
    try {
      if (new Date(submittedAt) > new Date(deadline)) return 'late';
      return 'on_time';
    } catch (e) {
      return 'on_time';
    }
  };

  const [stats, setStats] = useState({
    total: 0,
    onTime: 0,
    late: 0,
    pending: 0,
    overdue: 0,
    complianceRate: 0
  });
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveData, setArchiveData] = useState({
    semester: 'FIRST SEMESTER',
    academicYear: ''
  });
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsMenuRef = useRef(null);
  
  // PREVIEW MODAL STATE
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [printScale, setPrintScale] = useState(1);

  // Click away listener for settings menu
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

  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setShowSettingsMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    calculateStats();
    applyFilters();
  }, [checklists, searchTerm, activeFilter, settings.semester, settings.academicYear, settings.deadline, settings.deadlineEnabled]);

  const calculateStats = () => {
    const total = checklists.length;
    // If deadline is disabled, count all active checklists that aren't submitted as 'pending' 
    // and ignore 'late'/'overdue' labels
    const onTime = settings.deadlineEnabled 
      ? checklists.filter(c => c.submissionStatus === 'on_time').length
      : checklists.filter(c => c.submittedAt).length;

    const late = settings.deadlineEnabled 
      ? checklists.filter(c => c.submissionStatus === 'late').length
      : 0;

    const pending = settings.deadlineEnabled 
      ? checklists.filter(c => c.submissionStatus === 'pending').length
      : checklists.filter(c => !c.submittedAt).length;

    const overdue = settings.deadlineEnabled 
      ? checklists.filter(c => c.submissionStatus === 'overdue').length
      : 0;

    const complianceRate = total > 0 ? Math.round(((onTime + late) / total) * 100) : 0;

    setStats({ total, onTime, late, pending, overdue, complianceRate });
  };

  const handleExportAndPurge = async (termId) => {
    try {
      setIsArchiving(true);
      const zip = new JSZip();
      
      // Filter checklists by term
      const targets = checklists.filter(c => c.raw?.term_id === termId);
      
      if (targets.length === 0) {
        addToast('No data found for the selected term.', 'info');
        setIsArchiving(false);
        return;
      }

      const totalFiles = targets.reduce((acc, current) => {
        const raw = current.raw;
        return acc + (raw.subjects || []).flatMap(s => s.docs || []).length +
                    (raw.other_docs || []).flatMap(o => o.docs || []).length;
      }, 0);

      setArchiveProgress({ current: 0, total: totalFiles });
      let processed = 0;

      for (const checklistItem of targets) {
        const raw = checklistItem.raw;
        const facultyFolder = zip.folder(`${checklistItem.facultyName} - ${checklistItem.college}`);
        
        // 1. Process Subject Documents
        for (const subject of (raw.subjects || [])) {
          const subjectFolder = facultyFolder.folder(`Section 1 - ${subject.name}`);
          for (const doc of (subject.docs || [])) {
            const docTypeFolder = subjectFolder.folder(doc.type || 'Miscellaneous');
            try {
              const { data, error } = await supabase.storage.from('checklists').download(doc.path);
              if (error) throw error;
              docTypeFolder.file(doc.name, data);
            } catch (e) {
              console.error(`Failed to download ${doc.path}`, e);
            }
            processed++;
            setArchiveProgress(prev => ({ ...prev, current: processed }));
          }
        }

        // 2. Process Other Documents
        const otherFolder = facultyFolder.folder('Section 2 - Other Documents');
        for (const otherDoc of (raw.other_docs || [])) {
          const docFolder = otherFolder.folder(otherDoc.name);
          for (const docFile of (otherDoc.docs || [])) {
            try {
              const { data, error } = await supabase.storage.from('checklists').download(docFile.path);
              if (error) throw error;
              docFolder.file(docFile.name, data);
            } catch (e) {
              console.error(`Failed to download ${docFile.path}`, e);
            }
            processed++;
            setArchiveProgress(prev => ({ ...prev, current: processed }));
          }
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `NVSU_Archive_${termId}_${new Date().toISOString().split('T')[0]}.zip`);
      
      addToast('Archive generated successfully!', 'success');
      setIsArchiving(false);
    } catch (err) {
      console.error('Archiving Error:', err);
      addToast('Failed to generate archive: ' + err.message, 'error');
      setIsArchiving(false);
    }
  };

  const handlePurgeStorage = async (termId) => {
    const isConfirmed = await confirm(
      `CRITICAL ACTION: This will PERMANENTLY delete all photo evidence for ${termId} from the cloud storage to free up space. This cannot be undone. Have you successfully downloaded the ZIP archive?`,
      'Permanent Purge'
    );

    if (!isConfirmed) return;

    try {
      setLoading(true);
      const targets = checklists.filter(c => c.raw?.term_id === termId);
      
      for (const checklistItem of targets) {
        const raw = checklistItem.raw;
        const allPaths = [
          ...(raw.subjects || []).flatMap(s => (s.docs || []).map(d => d.path)),
          ...(raw.other_docs || []).flatMap(o => (o.docs || []).map(d => d.path))
        ];

        if (allPaths.length > 0) {
          // Delete from storage
          const { error: storageError } = await supabase.storage.from('checklists').remove(allPaths);
          if (storageError) console.error('Storage Purge Error:', storageError);
        }

        // Update DB records to nullify doc arrays but keep the statistics
        const updatedSubjects = (raw.subjects || []).map(s => ({ ...s, docs: [] }));
        const updatedOther = (raw.other_docs || []).map(o => ({ ...o, docs: [] }));

        await supabase.from('checklists').update({
          subjects: updatedSubjects,
          other_docs: updatedOther,
          status: 'archived'
        }).eq('id', raw.id);
      }

      addToast(`Cloud storage for ${termId} has been purged. Statistics retained.`, 'success');
      fetchChecklists(); // Refresh dashboard
      fetchGlobalStorageData(); // Refresh storage usage stats
    } catch (err) {
      console.error('Purge Error:', err);
      addToast('Please check your internet connection or try again later.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = checklists;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(c =>
        c.facultyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.college.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (activeFilter !== 'all') {
      if (!settings.deadlineEnabled) {
        if (activeFilter === 'pending') {
          filtered = filtered.filter(c => !c.submittedAt);
        } else if (activeFilter === 'on_time') {
          filtered = filtered.filter(c => c.submittedAt);
        } else if (activeFilter === 'late' || activeFilter === 'overdue') {
          filtered = []; // No late/overdue when deadline is disabled
        }
      } else {
        filtered = filtered.filter(c => c.submissionStatus === activeFilter);
      }
    }

    setFilteredChecklists(filtered);
  };

  const getStatusBadge = (checklist) => {
    if (checklist.status === 'revision') {
      return (
        <span className="badge badge-warning">
          ⚠️ Revision
        </span>
      );
    }

    const status = checklist.submissionStatus;
    const badges = {
      on_time: { class: 'badge-success', icon: '✓', text: 'On Time' },
      late: { class: 'badge-late', icon: '⚠️', text: 'Late' },
      pending: { class: 'badge-info', icon: '⏳', text: 'Pending' },
      overdue: { class: 'badge-danger', icon: '🔴', text: 'Overdue' }
    };
    const badge = badges[status] || badges.pending;
    
    return (
      <span className={`badge ${badge.class}`}>
        {badge.icon} {badge.text}
      </span>
    );
  };

  const handleStartNewTerm = async () => {
    // Validate Academic Year format (YYYY-YYYY)
    const ayRegex = /^\d{4}-\d{4}$/;
    if (!ayRegex.test(archiveData.academicYear)) {
      addToast('Please enter Academic Year in format YYYY-YYYY', 'error');
      return;
    }

    try {
      setLoading(true);
      const targetTermId = `${archiveData.academicYear}-${archiveData.semester}`;

      // 1. Update Global Settings FIRST (Critical Step)
      // This ensures all connected clients switch to the new semester immediately.
      const settingsResult = await updateSettings({
        semester: archiveData.semester,
        academicYear: archiveData.academicYear
      });

      if (!settingsResult.success) throw new Error(settingsResult.error);

      // 2. Fetch all faculty profiles (EXCEPT admin)
      const { data: profiles, error: profileError } = await supabase
        .from('faculty_profiles')
        .select('*')
        .neq('name', 'System Admin');

      if (profileError) {
        console.error('Profile fetch failed:', profileError);
        // We continue even if this fails, as the term switch is the priority
      } else {
        // 3. Prepare bulk checklist initialization (Best Effort)
        const newChecklists = profiles.map(profile => ({
          faculty_id: profile.id,
          term_id: targetTermId,
          status: 'pending',
          subjects: [],
          other_docs: DEFAULT_DOCUMENTS.other.map((name, idx) => ({
            id: `other-${idx}`,
            name,
            docs: []
          }))
        }));

        // 4. Batch upsert to database
        // We wrap this in a try-catch because RLS might block Admin from creating rows for others.
        // If it fails, Faculty Dashboards will "self-heal" (create their own checklist) upon seeing the new term.
        try {
          const { error: upsertError } = await supabase
            .from('checklists')
            .upsert(newChecklists, { onConflict: 'faculty_id,term_id' });
          
          if (upsertError) {
            console.warn('Bulk checklist creation warning (RLS might be restricting Admin):', upsertError);
          }
        } catch (innerErr) {
          console.warn('Bulk checklist creation failed:', innerErr);
        }
      }

      setShowArchiveModal(false);
      fetchAllTerms(); 
      addToast(`Successfully initialized ${archiveData.semester}, A.Y. ${archiveData.academicYear}!`, 'success');
      
      // The useEffect will trigger fetchChecklists automatically due to settings change
    } catch (err) {
      console.error('Initialization Error:', err);
      
      if (err.code === '23503') {
        logout();
      } else {
        addToast('Failed to initialize semester: ' + err.message, 'error');
      }
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handleViewChecklist = async (id) => {
    if (!id) return;

    // Handle Virtual Checklists (Faculty exists but no row in checklists table yet)
    if (id.toString().startsWith('virtual-')) {
      const facultyId = id.replace('virtual-', '');
      const termId = `${settings.academicYear}-${settings.semester}`;
      
      try {
        setLoading(true);
        addToast('Initializing checklist for review...', 'info');

        // Check if it really doesn't exist (double check)
        const { data: existing } = await supabase
          .from('checklists')
          .select('id')
          .eq('faculty_id', facultyId)
          .eq('term_id', termId)
          .maybeSingle();

        if (existing) {
          navigate(`/admin/checklist/${existing.id}`);
          return;
        }

        // Create the checklist row
        const { data: newData, error: createError } = await supabase
          .from('checklists')
          .insert({
            faculty_id: facultyId,
            term_id: termId,
            status: 'pending',
            subjects: [],
            other_docs: DEFAULT_DOCUMENTS.other.map((name, idx) => ({
              id: `other-${idx}`,
              name,
              docs: []
            }))
          })
          .select()
          .single();

        if (createError) throw createError;
        
        navigate(`/admin/checklist/${newData.id}`);
      } catch (err) {
        console.error('Checklist Auto-init Error:', err);
        addToast('Cannot review: This faculty member has no active checklist and initialization failed.', 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Normal navigation for existing checklists
    navigate(`/admin/checklist/${id}`);
  };



  const handleFactoryReset = async () => {
    const isConfirmed = await confirm(
      'DANGER ZONE: This will delete ALL faculty accounts, checklists, and uploaded files. Only the System Admin account will remain. This cannot be undone. Are you sure?',
      'FACTORY RESET'
    );
    
    if (!isConfirmed) return;

    const doubleCheck = await confirm(
      'FINAL WARNING: You are about to wipe the entire database. Pass words and profiles will be lost. To fully reset, you MUST also manually delete users from the Supabase Dashboard > Authentication tab. Proceed?',
      'CONFIRM WIPE'
    );

    if (!doubleCheck) return;

    try {
      setLoading(true);
      
      // 1. Delete ALL files from storage
      const { data: files, error: listError } = await supabase.storage.from('checklists').list('', { limit: 10000 });
      if (!listError && files.length > 0) {
        const paths = files.map(f => f.name); // Using root listing might not get nested files. Recursive delete is hard.
        // Actually, we need to empty buckets. 
        // Best effort: List all known files from DB first
        
        // Fetch all doc paths from DB before deleting rows
        const { data: allChecklists } = await supabase.from('checklists').select('subjects, other_docs');
        const allPaths = (allChecklists || []).flatMap(c => [
           ...(c.subjects || []).flatMap(s => (s.docs || []).map(d => d.path)),
           ...(c.other_docs || []).flatMap(o => (o.docs || []).map(d => d.path))
        ]);
        
        if (allPaths.length > 0) {
           await supabase.storage.from('checklists').remove(allPaths);
        }
      }

      // 2. Delete ALL checklists
      // Use a valid UUID format (NIL UUID) because the column is type UUID, 
      // and comparing against integer 0 causes a "invalid input syntax" error.
      const { error: checklistError } = await supabase
        .from('checklists')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
        
      if (checklistError) throw checklistError;

      // 3. Delete ALL faculty profiles EXCEPT Admin
      // Note: We filter by name usually, or if we have a role field.
      const { error: profileError } = await supabase
        .from('faculty_profiles')
        .delete()
        .neq('name', 'System Admin');
      
      if (profileError) throw profileError;

      setAllTerms([]); // Must explicit clear this to remove old dropdown options
      
      // 4. Reset Global Settings to Factory Defaults
      await updateSettings({
        semester: 'FIRST SEMESTER',
        academicYear: '2025-2026',
        deadline: null
      });

      fetchChecklists();
      
    } catch (err) {
      console.error('Factory Reset Error:', err);
      addToast('Reset Failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header />
      
      <main className="container" style={{ paddingTop: 'var(--space-fluid-md)', paddingBottom: 'var(--space-fluid-md)' }}>
        {/* Page Title */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <h1>Welcome Admin!</h1>
          <p className="text-gray">
            Manage faculty compliance checklists and monitor submission deadlines
          </p>
        </div>

        {/* System Settings (Global) */}
        <div className="semester-selector card shadow-nvsu" style={{ backgroundColor: 'white', border: '1px solid var(--gray-200)' }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title" style={{ color: 'var(--nvsu-green-dark)', margin: 0 }}>System Settings</h2>
            
            <div className="dropdown-container" ref={settingsMenuRef}>
              <button 
                className="btn-icon" 
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                title="More Options"
              >
                <span>⋮</span>
              </button>
              
              {showSettingsMenu && (
                <div className="dropdown-menu">
                  <button 
                    className={`dropdown-item ${error ? 'disabled' : ''}`}
                    style={{ color: 'var(--brand-green)', opacity: error ? 0.5 : 1 }}
                    disabled={!!error}
                    onClick={() => !error && setShowStorageModal(true)}
                  >
                    <span>💾 Storage & Archive Manager</span>
                  </button>
                  <button 
                    className={`dropdown-item ${error ? 'disabled' : ''}`}
                    style={{ color: 'var(--brand-red)', borderTop: '1px solid #eee', opacity: error ? 0.5 : 1 }}
                    disabled={!!error}
                    onClick={() => !error && handleFactoryReset()}
                  >
                    <span>⚠️ Factory Reset (Wipe Data)</span>
                  </button>
                  <button 
                    className={`dropdown-item ${error ? 'disabled' : ''}`}
                    style={{ color: 'var(--brand-blue)', opacity: error ? 0.5 : 1 }}
                    disabled={!!error}
                    onClick={() => {
                      if (error) return;
                      // Smart Suggestion Logic
                      const currentSem = settings.semester;
                      const currentAY = settings.academicYear;
                      let nextSem = 'FIRST SEMESTER';
                      let nextAY = currentAY;

                      if (currentSem === 'FIRST SEMESTER') {
                        nextSem = 'SECOND SEMESTER';
                      } else {
                        // If current is Second or Summer, we move to First Semester of the NEXT academic year
                        nextSem = 'FIRST SEMESTER';
                        try {
                          const years = currentAY.split('-');
                          if (years.length === 2) {
                            const nextStart = parseInt(years[0]) + 1;
                            const nextEnd = parseInt(years[1]) + 1;
                            nextAY = `${nextStart}-${nextEnd}`;
                          }
                        } catch (e) {
                          console.error('AY Parse Error:', e);
                        }
                      }

                      setArchiveData({
                        semester: nextSem,
                        academicYear: nextAY
                      });
                      setShowArchiveModal(true);
                    }}
                  >
                    <span>🚀 Initialize New Semester</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
              
              {/* Group 1: Term Context */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
                  Active Term
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Semester</label>
                    <select 
                      className="form-select"
                      value={settings.semester}
                      onChange={(e) => updateSettings({ semester: e.target.value })}
                    >
                      {availableSemesters.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Academic Year</label>
                    <select 
                      className="form-select"
                      value={settings.academicYear}
                      onChange={(e) => updateSettings({ academicYear: e.target.value })}
                    >
                      {availableYears.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Group 2: Compliance Policy */}
              <div className="settings-group with-border">
                <h3 style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
                  Submission Policy
                </h3>
                
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', background: 'var(--gray-50)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)' }}>
                    <label className="form-label" style={{ margin: 0, color: 'var(--nvsu-green-dark)' }}>Overall Deadline Control</label>
                    <label className="switch-label" style={{ cursor: 'pointer' }}>
                      <div className="switch">
                        <label htmlFor="deadline-toggle" className="sr-only">Toggle Deadline</label>
                        <input 
                          id="deadline-toggle"
                          type="checkbox" 
                          checked={settings.deadlineEnabled}
                          onChange={(e) => updateSettings({ deadlineEnabled: e.target.checked })}
                        />
                        <span className="slider round"></span>
                      </div>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'bold', color: settings.deadlineEnabled ? 'var(--brand-green)' : 'var(--nvsu-red)', textTransform: 'uppercase', minWidth: '70px', textAlign: 'right' }}>
                        {settings.deadlineEnabled ? 'ACTIVE' : 'OFF'}
                      </span>
                    </label>
                  </div>
                  
                  {/* Premium Integrated Picker (UI-UX Pro Max) */}
                  <PremiumDeadlinePicker 
                    value={settings.deadline} 
                    onChange={(val) => updateSettings({ deadline: val })}
                    disabled={!settings.deadlineEnabled}
                  />
                </div>
              </div>
            </div>
            
            <div className="settings-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="info-icon">ℹ️</span> 
                <span>These settings apply to <strong>all faculty checklists</strong> globally.</span>
              </div>
              <div 
                style={{ cursor: 'pointer', fontSize: '11px', color: (storageUsage.used / storageUsage.total) > 0.8 ? 'var(--nvsu-red)' : 'var(--brand-green)', fontWeight: 'bold' }}
                onClick={() => setShowStorageModal(true)}
                title="Click to manage cloud storage"
              >
                ☁️ Storage: {Math.round((storageUsage.used / storageUsage.total) * 100)}% Used
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Dashboard */}
        <div className="dashboard-stats">
          <div className="stat-card green" style={{ color: 'var(--brand-blue)', background: 'var(--brand-blue-pale)' }}>
            <div className="stat-label">Compliance Rate</div>
            <div className="stat-value">{stats.complianceRate}%</div>
            <div className="stat-description">
              Overall goal: 100%
            </div>
          </div>

          <div className="stat-card green" style={{ color: 'var(--brand-blue)' }}>
            <div className="stat-label">Total Faculty</div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-description">
              <span style={{ color: 'var(--brand-blue)', fontWeight: 'bold' }}>↑ Active</span> checklists
            </div>
          </div>

          <div className="stat-card green" style={{ color: 'var(--brand-green)' }}>
            <div className="stat-label">Submitted on Time</div>
            <div className="stat-value">{stats.onTime}</div>
            <div className="stat-description">
              <strong>{stats.total > 0 ? Math.round((stats.onTime / stats.total) * 100) : 0}%</strong> of total
            </div>
          </div>

          <div className="stat-card cyan" style={{ color: 'var(--brand-blue)' }}>
            <div className="stat-label">Submitted Late</div>
            <div className="stat-value">{stats.late}</div>
            <div className="stat-description">
              <strong>{stats.total > 0 ? Math.round((stats.late / stats.total) * 100) : 0}%</strong> of total
            </div>
          </div>

          <div className="stat-card yellow" style={{ color: 'var(--nvsu-yellow-dark)' }}>
            <div className="stat-label">Pending</div>
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-description">
              Waiting for submission
            </div>
          </div>

          <div className="stat-card red" style={{ color: 'var(--nvsu-red)' }}>
            <div className="stat-label">Overdue</div>
            <div className="stat-value">{stats.overdue}</div>
            <div className="stat-description">
              Action required
            </div>
          </div>
        </div>



        {/* Faculty List */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title">Faculty Checklists</h2>
            <button 
              className={`btn btn-primary btn-sm ${error ? 'disabled' : ''}`}
              onClick={() => !error && navigate('/admin/faculty/manage')}
              disabled={!!error}
            >
              + Register/Manage Faculty
            </button>
          </div>

          {/* Search and Filters */}
          <div className="faculty-list-header" style={{ padding: 'var(--space-responsive, var(--space-4))' }}>
            <div className="search-box">
              <span className="search-icon" aria-hidden="true">🔍</span>
              <label htmlFor="faculty-search" className="sr-only">Search faculty</label>
              <input
                id="faculty-search"
                type="text"
                className="form-input search-input"
                placeholder="Search faculty..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="filter-buttons">
              <button
                className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                All
              </button>
              <button
                className={`filter-btn ${activeFilter === 'on_time' ? 'active' : ''}`}
                onClick={() => setActiveFilter('on_time')}
              >
                On Time
              </button>
              <button
                className={`filter-btn ${activeFilter === 'late' ? 'active' : ''}`}
                onClick={() => setActiveFilter('late')}
              >
                Late
              </button>
              <button
                className={`filter-btn ${activeFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setActiveFilter('pending')}
              >
                Pending
              </button>
              <button
                className={`filter-btn ${activeFilter === 'overdue' ? 'active' : ''}`}
                onClick={() => setActiveFilter('overdue')}
              >
                Overdue
              </button>
            </div>
          </div>

          {/* Faculty Table */}
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Faculty Name</th>
                  <th>College</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={`skeleton-${i}`}>
                      <td><div className="skeleton skeleton-text" style={{ width: '150px' }}></div><div className="skeleton skeleton-text" style={{ width: '100px' }}></div></td>
                      <td><div className="skeleton skeleton-text" style={{ width: '60px' }}></div></td>
                      <td><div className="skeleton skeleton-text" style={{ width: '120px' }}></div><div className="skeleton skeleton-text" style={{ width: '80px' }}></div></td>
                      <td><div className="skeleton skeleton-button" style={{ width: '80px' }}></div></td>
                      <td><div className="skeleton skeleton-text" style={{ width: '100px' }}></div></td>
                      <td><div className="skeleton skeleton-button" style={{ width: '60px' }}></div></td>
                    </tr>
                  ))
                ) : filteredChecklists.length === 0 ? (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-state">
                        <div className="empty-icon">📋</div>
                        <div className="empty-title">No checklists found</div>
                        <div className="empty-description">
                          {searchTerm || activeFilter !== 'all' 
                            ? 'Try adjusting your search or filters' 
                            : 'Create a new faculty checklist to get started'}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredChecklists.map((checklist) => (
                    <tr key={checklist.id}>
                      <td data-label="Faculty Name">
                        <strong>{checklist.facultyName}</strong>{" "}
                        <small className="text-gray" style={{ display: 'block' }}>{checklist.department}</small>
                      </td>
                      <td data-label="College">{checklist.college}</td>
                      <td data-label="Deadline">
                        {!settings.deadlineEnabled || !settings.deadline ? (
                          <span className="text-gray italic" style={{ fontSize: '12px' }}>N/A (Deadline Off)</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontWeight: 'bold', color: 'var(--nvsu-green-dark)' }}>
                              {new Date(settings.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              at {new Date(settings.deadline).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid var(--gray-100)' }}>
                              <small className="text-gray" style={{ fontSize: '11px', display: 'block' }}>
                                {checklist.submittedAt && !isNaN(new Date(checklist.submittedAt).getTime())
                                  ? `✅ Submitted ${formatDistanceToNow(new Date(checklist.submittedAt), { addSuffix: true })}`
                                  : isPast(new Date(settings.deadline))
                                    ? <span style={{ color: 'var(--nvsu-red)', fontWeight: 'bold' }}>🚨 Overdue by {formatDistanceToNow(new Date(settings.deadline))}</span>
                                    : `⏳ Due ${formatDistanceToNow(new Date(settings.deadline), { addSuffix: true })}`
                                }
                              </small>
                            </div>
                          </div>
                        )}
                      </td>
                      <td data-label="Status">{getStatusBadge(checklist)}</td>
                      <td data-label="Progress">
                        <div style={{ minWidth: '100px', width: '100%', justifyContent: 'flex-end', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <div className="progress" style={{ width: '100%', maxWidth: '120px' }}>
                            <div 
                              className="progress-bar"
                              style={{ width: `${checklist.progress}%` }}
                            ></div>
                          </div>
                          <small className="text-gray">{checklist.progress}%</small>
                        </div>
                      </td>
                      <td data-label="Actions">
                        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className={`btn-preview-action ${error ? 'disabled' : ''}`}
                          title="Quick Preview"
                          disabled={!!error}
                          onClick={() => {
                            if (error) return;
                            // ... (rest of logic remains same, just updating UI)
                            const raw = checklist.raw;
                            const subjects = raw.subjects || [];
                            const otherDocs = raw.other_docs || [];
                            
                            // Create uploads map
                            const uploadsMap = {};
                            subjects.forEach(sub => {
                              sub.docs?.forEach(doc => {
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

                            otherDocs.forEach(item => {
                              if (item.docs?.length > 0) {
                                uploadsMap[item.name || item.id] = item.docs;
                              }
                            });

                            setPreviewData({
                              ...checklist,
                              subjects: raw.subjects || [],
                              otherDocuments: DEFAULT_DOCUMENTS.other,
                              uploads: uploadsMap
                            });
                            setShowPreviewModal(true);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center', 
                            gap: '6px',
                            background: '#e0f2fe',
                            color: '#0284c7',
                            border: '1px solid #bae6fd',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            cursor: error ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            opacity: error ? 0.5 : 1
                          }}
                          onMouseEnter={(e) => {
                             if(!error) {
                               e.currentTarget.style.background = '#bae6fd';
                               e.currentTarget.style.transform = 'translateY(-1px)';
                             }
                          }}
                          onMouseLeave={(e) => {
                             if(!error) {
                               e.currentTarget.style.background = '#e0f2fe';
                               e.currentTarget.style.transform = 'none';
                             }
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                          <span style={{ fontWeight: '600', fontSize: '14px' }}>Print View</span>
                        </button>
                          <button
                            className={`btn btn-sm btn-primary ${error ? 'disabled' : ''}`}
                            disabled={!!error}
                            style={{ opacity: error ? 0.6 : 1 }}
                            onClick={() => !error && handleViewChecklist(checklist.id)}
                          >
                            Check Files
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Initialize New Term Modal */}
      {showArchiveModal && (
        <div className="modal-backdrop" style={{ zIndex: 10000 }}>
          <div className="modal" style={{ maxWidth: '500px', borderRadius: 'var(--radius-lg)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--gray-100)', padding: '1.5rem 2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🚀</span>
                <h3 className="modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--brand-blue)' }}>Initialize New Semester</h3>
              </div>
            </div>
            
            <div className="modal-body" style={{ padding: '2rem' }}>
              <p className="text-gray mb-6">
                Set the global context for the next academic period. This will switch the dashboard to a fresh view for the new year/semester.
              </p>
              
              <div className="form-group mb-6">
                <label className="form-label">Select Semester</label>
                <select 
                  className="form-select"
                  value={archiveData.semester}
                  onChange={(e) => setArchiveData({...archiveData, semester: e.target.value})}
                  style={{ height: '48px' }}
                >
                  <option value="FIRST SEMESTER">FIRST SEMESTER</option>
                  <option value="SECOND SEMESTER">SECOND SEMESTER</option>
                  <option value="SUMMER">SUMMER</option>
                </select>
              </div>
              
              <div className="form-group mb-6">
                <label className="form-label">Input Academic Year</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 2026-2027"
                  value={archiveData.academicYear}
                  onChange={(e) => setArchiveData({...archiveData, academicYear: e.target.value})}
                  style={{ height: '48px', textTransform: 'uppercase' }}
                />
                <small className="text-gray">Format: YYYY-YYYY</small>
              </div>
              
              <div style={{ background: 'var(--brand-blue-pale)', border: '1px solid #dbeafe', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', gap: '12px' }}>
                <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
                <p style={{ margin: 0, fontSize: '11px', color: '#1e40af', lineHeight: '1.5' }}>
                  <strong>Admin Tip:</strong> Data from the old semester is safely stored. To free up 1GB cloud storage, remember to use the <strong>Storage & Archive Manager</strong> to download photos locally.
                </p>
              </div>
            </div>
            
            <div className="modal-footer" style={{ borderTop: '1px solid var(--gray-100)', padding: '1.5rem 2rem', gap: '10px' }}>
              <button 
                className="btn btn-secondary"
                style={{ flex: 1, height: '44px' }}
                onClick={() => setShowArchiveModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                style={{ flex: 2, height: '44px', fontWeight: 'bold' }}
                onClick={handleStartNewTerm}
              >
                Initialize Semester
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submission Preview Modal */}
      {showPreviewModal && previewData && (
        <div className="modal-backdrop" style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          backgroundColor: 'rgba(0, 0, 0, 0.5)', 
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }} onClick={() => setShowPreviewModal(false)}>
          <div className="modal-content" style={{ 
            backgroundColor: 'white', 
            borderRadius: '8px',
            width: '100%',
            maxWidth: '1200px',
            maxHeight: '95vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }} onClick={e => e.stopPropagation()}>
            {/* Modal Header/Toolbar */}
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

            {/* Scrollable Content */}
            <div className="modal-body" style={{ 
              overflow: 'auto', 
              padding: printScale < 1 ? '10px' : '2rem', // Reduced padding on mobile/scaled view
              flex: 1,
              backgroundColor: '#525659'
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
                    <div style={{ marginBottom: '5px' }}><strong>Faculty Member:</strong> <span style={{ textTransform: 'uppercase', textDecoration: 'underline' }}>{previewData.facultyName}</span></div>
                    <div><strong>College:</strong> <span style={{ textTransform: 'uppercase', textDecoration: 'underline' }}>{previewData.college || 'TEACHER EDUCATION'}</span></div>
                  </div>
                  <div>
                    <div style={{ marginBottom: '5px' }}><strong>Semester & AY:</strong> <span style={{ textTransform: 'uppercase', textDecoration: 'underline' }}>{previewData.semester}, A.Y. {previewData.academicYear}</span></div>
                    <div><strong>Department:</strong> <span style={{ textTransform: 'uppercase', textDecoration: 'underline' }}>{previewData.department || 'PHYSICAL EDUCATION'}</span></div>
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
                      {/* We iterate 12 times for the columns as per DEFAULT_DOCUMENTS structure implied */}
                      {previewData.subjects.map((subject) => (
                        <tr key={subject.id}>
                          <td style={{ border: '1px solid black', padding: '5px', textAlign: 'left' }}>
                            <div style={{ fontWeight: 'bold' }}>{subject.code}</div>
                            <div style={{ fontSize: '8pt', color: '#666', fontWeight: 'normal' }}>{subject.name}</div>
                          </td>
                          {DEFAULT_DOCUMENTS.subjects.map((_, idx) => {
                            const key = `subject-${subject.id}-${idx}`;
                            const upload = previewData.uploads[key];
                            const hasUpload = upload && upload.length > 0;
                            return (
                              <td key={idx} style={{ border: '1px solid black', padding: '5px' }}>
                                {hasUpload ? <span style={{ fontWeight: 'bold' }}>OK</span> : ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Other Documents Table */}
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
                           const upload = previewData.uploads[doc];
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
                      <div style={{ fontWeight: 'bold' }}>Department/Program Chair, {previewData.department || 'BPED'} Department</div>
                    </div>
                    <div>
                      <div style={{ marginBottom: '30px' }}>Approved:</div>
                      <div style={{ borderBottom: '1px solid black', width: '200px', marginBottom: '4px' }}></div>
                      <div style={{ fontWeight: 'bold' }}>Dean, {previewData.college || 'College of Teacher Education'}</div>
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
      {/* Storage Manager Modal */}
      {showStorageModal && (
        <div className="modal-backdrop" style={{ zIndex: 10000 }}>
          <div className="modal" style={{ maxWidth: '600px', borderRadius: 'var(--radius-lg)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--gray-100)', padding: '1.5rem 2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>📂</span>
                <h3 className="modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--nvsu-green-dark)' }}>Storage & Archive Manager</h3>
              </div>
              <button 
                className="btn-icon" 
                onClick={() => setShowStorageModal(false)}
                style={{ fontSize: '1.5rem', opacity: 0.5 }}
              >
                &times;
              </button>
            </div>
            
            <div className="modal-body" style={{ padding: '2rem' }}>
              {/* Added: Real-time Storage Context inside the modal */}
              <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid #eef2f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                  <span style={{ fontWeight: 'bold' }}>Current Cloud Usage (Supabase)</span>
                  <span>{(storageUsage.used / (1024 * 1024)).toFixed(1)} MB / 1024 MB</span>
                </div>
                <div className="progress" style={{ height: '8px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                  <div 
                    className="progress-bar" 
                    style={{ 
                      width: `${Math.min(100, (storageUsage.used / storageUsage.total) * 100)}%`,
                      backgroundColor: (storageUsage.used / storageUsage.total) > 0.8 ? 'var(--nvsu-red)' : 'var(--brand-green)'
                    }}
                  ></div>
                </div>
                { (storageUsage.used / storageUsage.total) > 0.7 && (
                   <p style={{ margin: '8px 0 0 0', fontSize: '10px', color: 'var(--nvsu-red)' }}>
                     ⚠️ Storage is nearing the 1GB limit. Please follow the steps below to free up space.
                   </p>
                )}
              </div>

              {/* Step 1 */}
              <div className="archive-step" style={{ marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid var(--brand-blue)', color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' }}>1</div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--brand-blue)' }}>Download Semester Archive (ZIP)</h4>
                </div>
                
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <select className="form-select" id="archive-term-select" style={{ flex: 1, minWidth: '180px', height: '48px' }}>
                    {[...new Set(checklists.map(c => c.raw?.term_id))].filter(Boolean).map(term => (
                      <option key={term} value={term}>{term}</option>
                    ))}
                  </select>
                  <button 
                    className="btn btn-primary"
                    style={{ height: '48px', padding: '0 1.5rem', fontWeight: 'bold' }}
                    disabled={isArchiving}
                    onClick={() => {
                      const term = document.getElementById('archive-term-select').value;
                      handleExportAndPurge(term);
                    }}
                  >
                    {isArchiving ? `🏗️ Building ZIP...` : '📥 Download Photos'}
                  </button>
                </div>

                {isArchiving && (
                  <div style={{ marginTop: '1rem' }}>
                    <div className="progress" style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px' }}>
                      <div className="progress-bar" style={{ width: `${(archiveProgress.current / archiveProgress.total) * 100}%`, transition: 'width 0.3s ease' }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                      <span className="text-gray" style={{ fontSize: '11px' }}>Collecting high-quality documentation...</span>
                      <span className="text-gray" style={{ fontSize: '11px', fontWeight: 'bold' }}>{archiveProgress.current} / {archiveProgress.total}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Separator Line */}
              <div style={{ height: '1px', background: 'var(--gray-100)', marginBottom: '2.5rem' }}></div>

              {/* Step 2 */}
              <div className="archive-step">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid var(--nvsu-red)', color: 'var(--nvsu-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' }}>2</div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--nvsu-red)' }}>Purge Cloud Storage to Free Space</h4>
                </div>

                <div style={{ background: '#fff1f1', border: '1px solid #fee2e2', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#991b1b', lineHeight: '1.5' }}>
                    <strong>Warning:</strong> Run this <u>ONLY</u> after verified download. This deletes the original photos from the cloud forever.
                  </p>
                </div>

                <button 
                  className="btn btn-danger"
                  style={{ width: '100%', height: '48px', fontWeight: 'bold', background: 'var(--nvsu-red)' }}
                  onClick={() => {
                    const term = document.getElementById('archive-term-select').value;
                    handlePurgeStorage(term);
                  }}
                >
                  🗑️ Purge Selected Term from Cloud
                </button>
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--gray-100)', padding: '1.5rem 2rem' }}>
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', height: '44px' }}
                onClick={() => setShowStorageModal(false)}
              >
                Close Manager
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
