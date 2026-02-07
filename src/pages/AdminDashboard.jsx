import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import { useSystem } from '../context/SystemContext';
import { useToast } from '../context/ToastContext';
import { formatDistanceToNow, isPast } from 'date-fns';
import { supabase } from '../supabase';

const PremiumDeadlinePicker = ({ value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const [datePart, timePart] = (value || '2026-03-28T04:00').split('T');
  const [year, month, day] = (datePart || '2026-03-28').split('-').map(Number);
  const [hour24, minute] = (timePart || '04:00').split(':').map(Number);
  
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
            <div className="picker-nav">
              <button onClick={() => handleUpdate({ month: month === 1 ? 12 : month - 1, year: month === 1 ? year - 1 : year })}>‹</button>
              <div className="picker-current-month">{months[month-1]} {year}</div>
              <button onClick={() => handleUpdate({ month: month === 12 ? 1 : month + 1, year: month === 12 ? year + 1 : year })}>›</button>
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

export default function AdminDashboard() {
  const { user } = useAuth();
  const { settings, updateSettings } = useSystem();
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filteredChecklists, setFilteredChecklists] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  
  useEffect(() => {
    fetchChecklists();
  }, [settings.semester, settings.academicYear]);

  const fetchChecklists = async () => {
    try {
      setLoading(true);
      const termId = `${settings.academicYear}-${settings.semester}`;
      
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
        .eq('term_id', termId);

      if (error) throw error;

      const formattedData = data.map(c => ({
        id: c.id,
        facultyName: c.faculty_profiles.name,
        email: c.faculty_profiles.email,
        college: c.faculty_profiles.college,
        department: c.faculty_profiles.department,
        submittedAt: c.status === 'pending' || c.status === 'approved' ? c.updated_at : null,
        status: c.status,
        progress: calculateChecklistProgress(c),
        submissionStatus: getSubmissionStatus(c.status === 'pending' || c.status === 'approved' ? c.updated_at : null, settings.deadline),
        semester: settings.semester,
        academicYear: settings.academicYear
      }));

      setChecklists(formattedData);
      setLoading(false);
    } catch (err) {
      console.error('Dashboard Load Error:', err);
      setLoading(false);
    }
  };

  const calculateChecklistProgress = (checklist) => {
    const totalSubjectSlots = checklist.subjects.length * 12;
    const totalOtherSlots = checklist.other_docs.length;
    const totalSlots = totalSubjectSlots + totalOtherSlots;
    
    if (totalSlots === 0) return 0;
    
    const filledSubjectSlots = checklist.subjects.reduce((acc, s) => acc + Math.min(s.docs.length, 12), 0);
    const filledOtherSlots = checklist.other_docs.reduce((acc, o) => acc + (o.docs.length > 0 ? 1 : 0), 0);
    
    return Math.round(((filledSubjectSlots + filledOtherSlots) / totalSlots) * 100);
  };

  const getSubmissionStatus = (submittedAt, deadline) => {
    if (!submittedAt) return 'pending';
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
  }, [checklists, searchTerm, activeFilter, settings.semester, settings.academicYear]);

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

  const applyFilters = () => {
    let filtered = checklists;

    // Semester and Year filter
    filtered = filtered.filter(c => 
      c.semester === settings.semester && 
      c.academicYear === settings.academicYear
    );

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

  const getStatusBadge = (status) => {
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

  const { addToast } = useToast();

  const handleStartNewTerm = () => {
    // Validate Academic Year format (YYYY-YYYY)
    const ayRegex = /^\d{4}-\d{4}$/;
    if (!ayRegex.test(archiveData.academicYear)) {
      addToast('Please enter Academic Year in format YYYY-YYYY', 'error');
      return;
    }

    updateSettings({
      semester: archiveData.semester,
      academicYear: archiveData.academicYear
    });

    setShowArchiveModal(false);
    addToast(`Global state updated to ${archiveData.semester}, A.Y. ${archiveData.academicYear}!`, 'success');
  };

  const handleViewChecklist = (id) => {
    const faculty = checklists.find(c => c.id === id);
    navigate(`/admin/checklist/${id}`, { state: { faculty } });
  };

  // Helper for safe date check
  const isSafePast = (dateStr) => {
    if (!dateStr || isNaN(new Date(dateStr).getTime())) return false;
    return isPast(new Date(dateStr));
  };

  if (loading && checklists.length === 0) {
    return (
      <div className="loading-screen" style={{ color: 'var(--gray-900)' }}>
        <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
          <div className="spinner-large" style={{ marginBottom: 'var(--space-6)' }}></div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: 'var(--space-2)', color: 'var(--nvsu-green-dark)' }}>Loading Dashboard...</h2>
          <p className="text-gray" style={{ fontSize: '0.9rem' }}>Fetching latest faculty compliance data</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      
      <main className="container" style={{ paddingTop: 'var(--space-fluid-md)', paddingBottom: 'var(--space-fluid-md)' }}>
        {/* Page Title */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <h1>Welcome, {user?.name}</h1>
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
                    className="dropdown-item"
                    style={{ color: 'var(--brand-blue)' }}
                    onClick={() => {
                      setArchiveData({
                        semester: settings.semester,
                        academicYear: ''
                      });
                      setShowArchiveModal(true);
                    }}
                  >
                    <span>📦 Archive & Start New Term</span>
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
                      <option value="FIRST SEMESTER">FIRST SEMESTER</option>
                      <option value="SECOND SEMESTER">SECOND SEMESTER</option>
                      <option value="SUMMER">SUMMER</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Academic Year</label>
                    <select 
                      className="form-select"
                      value={settings.academicYear}
                      onChange={(e) => updateSettings({ academicYear: e.target.value })}
                    >
                      <option value="2025-2026">2025-2026</option>
                      <option value="2024-2025">2024-2025</option>
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
            
            {/* Footer Context Helper */}
            <div className="settings-info">
              <span className="info-icon">ℹ️</span> 
              <span>These settings apply to <strong>all faculty checklists</strong> globally.</span>
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
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/admin/faculty/manage')}
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
                        <strong>{checklist.facultyName}</strong><br />
                        <small className="text-gray">{checklist.department}</small>
                      </td>
                      <td data-label="College">{checklist.college}</td>
                      <td data-label="Deadline">
                        {!settings.deadlineEnabled ? (
                          <span className="text-gray italic">N/A (Deadline Off)</span>
                        ) : (
                          <>
                            {new Date(settings.deadline).toLocaleDateString()}<br />
                            <small className="text-gray">
                              {checklist.submittedAt && !isNaN(new Date(checklist.submittedAt).getTime())
                                ? `Submitted ${formatDistanceToNow(new Date(checklist.submittedAt), { addSuffix: true })}`
                                : isSafePast(settings.deadline)
                                  ? `Overdue by ${formatDistanceToNow(new Date(settings.deadline))}`
                                  : `Due ${formatDistanceToNow(new Date(settings.deadline), { addSuffix: true })}`
                              }
                            </small>
                          </>
                        )}
                      </td>
                      <td data-label="Status">{getStatusBadge(checklist.submissionStatus)}</td>
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
                            className="btn-preview"
                            title="Quick Preview"
                            onClick={() => {
                              const profile = {
                                ...checklist,
                                subjects: Array.isArray(checklist.subjects) ? checklist.subjects : [
                                  { id: 'sub-1', name: 'Sample Subject 1', code: 'PE 101' },
                                  { id: 'sub-2', name: 'Sample Subject 2', code: 'PE 102' }
                                ],
                                otherDocuments: [
                                  'Faculty Workload', 'IPCR – Target', 'IPCR – Final with Rating',
                                  'Student Consultation', 'Student Evaluation (FPESf)', 
                                  'Superior\'s Evaluation (FPESu)', 'Classroom Observation',
                                  'Accomplishment Report – Quarter 1', 'Accomplishment Report – Quarter 2',
                                  'Seminar / Training Certificate/s', 'Membership ID / Certificate/s',
                                  'Individual Development Plan', 'Faculty Attendance'
                                ],
                                uploads: checklist.uploads || {}
                              };
                              setPreviewData(profile);
                              setShowPreviewModal(true);
                            }}
                          >
                            👁️
                          </button>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleViewChecklist(checklist.id)}
                          >
                            Review
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

      {/* Archive & Switch Term Modal */}
      {showArchiveModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '450px', border: '2px solid var(--brand-blue)' }}>
            <div className="modal-header" style={{ backgroundColor: 'var(--brand-blue-pale)', borderBottom: '1px solid var(--brand-blue)' }}>
              <h3 className="modal-title" style={{ color: 'var(--brand-blue)' }}>📦 Archive & Start New Term</h3>
            </div>
            <div className="modal-body">
              <p className="mb-4">
                This will **Archive** all current faculty records and switch the system to a fresh semester. All files remain retrievable in Supabase.
              </p>
              
              <div className="card" style={{ padding: 'var(--space-4)', backgroundColor: 'var(--gray-50)', marginBottom: 'var(--space-6)' }}>
                <div className="mb-4">
                  <label className="form-label">New Semester</label>
                  <select 
                    className="form-select"
                    value={archiveData.semester}
                    onChange={(e) => setArchiveData({...archiveData, semester: e.target.value})}
                  >
                    <option value="FIRST SEMESTER">FIRST SEMESTER</option>
                    <option value="SECOND SEMESTER">SECOND SEMESTER</option>
                  </select>
                </div>
                
                <div className="mb-2">
                  <label className="form-label">New Academic Year</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 2026-2027"
                    value={archiveData.academicYear}
                    onChange={(e) => setArchiveData({...archiveData, academicYear: e.target.value})}
                  />
                  <small className="text-gray">Format: YYYY-YYYY (e.g., 2026-2027)</small>
                </div>
              </div>
              
              <div className="alert alert-info" style={{ fontSize: 'var(--text-xs)', display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <span style={{ fontSize: '1.5rem' }}>ℹ️</span>
                <span><strong>Persistence:</strong> Current semester data will be locked and stored as history. It will NOT be deleted.</span>
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid var(--gray-200)' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowArchiveModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleStartNewTerm}
              >
                Archive and Switch
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
                          <td style={{ border: '1px solid black', padding: '5px', textAlign: 'left', fontWeight: 'bold' }}>
                            {subject.name}
                          </td>
                          {[...Array(12)].map((_, idx) => {
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
                       {previewData.otherDocuments.map((doc, idx) => {
                          const key = `other-${idx}`;
                          const upload = previewData.uploads[key];
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
