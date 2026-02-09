import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { supabase } from '../supabase';
import { createClient } from '@supabase/supabase-js';

export default function ManageFaculty() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { confirm, showAlert } = useConfirm();
  const [facultyList, setFacultyList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  
  useEffect(() => {
    fetchFaculty();

    const channel = supabase
      .channel('manage-faculty-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'faculty_profiles' }, () => {
        fetchFaculty();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchFaculty = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('faculty_profiles')
        .select('*')
        .order('name');

      if (error) throw error;
      setFacultyList(data);
    } catch (err) {
      console.error('Fetch Faculty Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: 'BPED',
    college: 'CTED',
    password: '',
  });



  const filteredFaculty = facultyList.filter(f => 
    f.name !== 'System Admin' && (
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.department.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) {
      showAlert('No internet connection. Cannot create account.', 'Network Error');
      return;
    }
    setLoading(true);

    try {
      // 1. Create Auth User
      // "Super Stealth" Mode: Use raw fetch to completely bypass the supabase-js client
      // and ensure NO admin session tokens are sent with the request.
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          data: {
            name: formData.name,
            role: 'faculty'
          }
        })
      });

      const authData = await response.json();

      if (!response.ok) {
        throw new Error(authData.msg || authData.error_description || authData.message || 'Failed to create account');
      }

      // Supabase Auth returns the user object inside 'user' or matches the structure
      // We need to normalize it for the next step
      const newUserId = authData.user?.id || authData.id;

      if (!newUserId) {
        throw new Error('User created but ID missing.');
      }


      // The trigger 'on_auth_user_created' in SQL will automatically create the faculty_profile.
      // However, we need to update it with department and other details if the trigger is simple.
      // And we need to initialize their first checklist if it doesn't happen automatically.
      
      // We'll wait a brief moment for the trigger to finish
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { error: profileError } = await supabase
        .from('faculty_profiles')
        .update({
          department: formData.department,
          college: formData.college,
          visible_password: formData.password
        })
        .eq('id', newUserId);

      if (profileError) throw profileError;

      showAlert(`Account created for ${formData.name}!`, 'Success');
      setShowForm(false);
      setFormData({
        name: '',
        email: '',
        department: 'BPED',
        college: 'CTED',
        password: '',
      });
      fetchFaculty();
      
    } catch (err) {
      showAlert(err.message, 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!navigator.onLine) {
      showAlert('No internet connection. Cannot delete account.', 'Network Error');
      return;
    }
    const confirmed = await confirm('Are you sure you want to delete this faculty account?', 'Delete Account');
    if (confirmed) {
      try {
        const { error } = await supabase
          .from('faculty_profiles')
          .delete()
          .eq('id', id);

        if (error) throw error;
        setFacultyList(facultyList.filter(f => f.id !== id));
      } catch (err) {
        showAlert(err.message, 'Error');
      }
    }
  };

  return (
    <div className="manage-faculty-page">
      <Header />
      <main className="container" style={{ paddingTop: 'var(--space-fluid-md)', paddingBottom: 'var(--space-fluid-md)' }}>
        <div className="faculty-list-header mb-fluid" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <button 
              className="btn btn-sm btn-outline mb-2"
              onClick={() => navigate('/admin/dashboard')}
              style={{ padding: 'var(--space-1) var(--space-3)', fontSize: '10px' }}
            >
              ← Back to Dashboard
            </button>
            <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: '800', color: 'var(--nvsu-green-dark)' }}>Manage Faculty Accounts</h1>
            <p className="text-gray" style={{ fontSize: 'var(--text-sm)' }}>Create and manage faculty credentials for the CTED-BPED Office</p>
          </div>
          <button 
            className={`btn ${showForm ? 'btn-secondary' : 'btn-primary'} animate-pulse-green`}
            onClick={() => setShowForm(!showForm)}
            style={{ minWidth: '160px' }}
          >
            {showForm ? '✕ Close Form' : '＋ Add New Faculty'}
          </button>
        </div>

        {showForm && (
          <div className="card shadow-nvsu animate-fade-in" style={{ maxWidth: '600px', marginBottom: 'var(--space-8)' }}>
            <div className="card-header">
              <h2 className="card-title">Create Faculty Account</h2>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 'var(--space-6)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Dr. Maria Santos"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="name@nvsu.edu.ph"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="form-group">
                  <label className="form-label">Assign Password</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. nvsu1234"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={6}
                  />
                  <p className="text-gray" style={{ fontSize: '10px', marginTop: '4px' }}>Must be at least 6 characters</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="form-group">
                  <label className="form-label">College</label>
                  <select 
                    className="form-select"
                    value={formData.college}
                    onChange={e => setFormData({ ...formData, college: e.target.value })}
                  >
                    <option value="CTED">CTED (Teacher Education)</option>
                    <option value="CBA">CBA (Business Admin)</option>
                    <option value="CAS">CAS (Arts and Sciences)</option>
                    <option value="CENG">CENG (Engineering)</option>
                    <option value="CA">CA (Agriculture)</option>
                    <option value="CF">CF (Forestry)</option>
                    <option value="CVMed">CVMed (Vet Med)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <select 
                    className="form-select"
                    value={formData.department}
                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                  >
                    <option value="BPED">BPED (Physical Education)</option>
                    <option value="BEED">BEED (Elementary Education)</option>
                    <option value="BSED">BSED (Secondary Education)</option>
                    <option value="PROF-ED">Professional Education</option>
                  </select>
                </div>
              </div>


              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-8)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--gray-100)' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Create Faculty Account</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="card">
          <div className="faculty-list-header p-4" style={{ borderBottom: '1px solid var(--gray-200)' }}>
              <h2 className="card-title">Registered Faculty</h2>
              <div className="search-box" style={{ maxWidth: '300px', margin: 0 }}>
                <span className="search-icon">🔍</span>
                <label htmlFor="faculty-search-manage" className="sr-only">Search faculty</label>
                <input
                  id="faculty-search-manage"
                  type="text"
                  className="form-input search-input"
                  placeholder="Search faculty..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email Address</th>
                  <th>Password</th>
                  <th>Department</th>
                  <th>College</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={`skeleton-${i}`}>
                      <td><div className="skeleton skeleton-text" style={{ width: '120px' }}></div></td>
                      <td><div className="skeleton skeleton-text" style={{ width: '180px' }}></div></td>
                      <td><div className="skeleton skeleton-text" style={{ width: '100px' }}></div></td>
                      <td><div className="skeleton skeleton-text" style={{ width: '80px' }}></div></td>
                      <td><div className="skeleton skeleton-text" style={{ width: '60px' }}></div></td>
                      <td style={{ textAlign: 'right' }}><div className="skeleton skeleton-button" style={{ width: '60px' }}></div></td>
                    </tr>
                  ))
                ) : filteredFaculty.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--gray-500)' }}>
                      No faculty found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredFaculty.map(f => (
                    <tr key={f.id}>
                      <td data-label="Name"><strong>{f.name}</strong></td>
                      <td data-label="Email Address"><code>{f.email}</code></td>
                      <td data-label="Password"><code style={{ color: 'var(--brand-red)' }}>{f.visible_password || '********'}</code></td>
                      <td data-label="Department">{f.department}</td>
                      <td data-label="College">{f.college}</td>
                      <td data-label="Actions" style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-sm btn-outline"
                          onClick={() => handleDelete(f.id)}
                          style={{ borderColor: 'var(--brand-red)', color: 'var(--brand-red)' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
