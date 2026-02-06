import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';

const mockFaculty = [
  { id: '1', name: 'John Doe', department: 'BPED', email: 'johndoe@nvsu.edu.ph', defaultSubjects: ['P.E. 101', 'P.E. 102'] },
  { id: '2', name: 'Jane Smith', department: 'PROF-ED', email: 'janesmith@nvsu.edu.ph', defaultSubjects: ['Prof Ed 1', 'Prof Ed 2'] },
  { id: '3', name: 'Alice Brown', department: 'BSED', email: 'abrown@nvsu.edu.ph', defaultSubjects: ['BSE 1'] },
];

export default function CreateChecklist() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    semester: 'FIRST SEMESTER',
    academicYear: '2025-2026',
    facultyId: '',
    deadline: '',
    subjects: ['']
  });

  const handleFacultyChange = (id) => {
    const faculty = mockFaculty.find(f => f.id === id);
    setFormData({ 
      ...formData, 
      facultyId: id,
      subjects: faculty?.defaultSubjects || []
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Checklist created and assigned successfully!');
    navigate('/admin/dashboard');
  };

  return (
    <div className="create-checklist-page">
      <Header />
      <main className="container" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-8)' }}>
        <button 
          className="btn btn-sm btn-outline"
          style={{ marginBottom: 'var(--space-4)' }}
          onClick={() => navigate('/admin/dashboard')}
        >
          ← Back to Dashboard
        </button>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
          <div>
            <h1>Create New Checklist</h1>
            <p className="text-gray">Assign a new compliance checklist to a faculty member</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <span className={`badge ${step >= 1 ? 'badge-primary' : 'badge-outline'}`}>1. Basic Info</span>
            <span className={`badge ${step >= 2 ? 'badge-primary' : 'badge-outline'}`}>2. Assignment</span>
            <span className={`badge ${step >= 3 ? 'badge-primary' : 'badge-outline'}`}>3. Review</span>
          </div>
        </div>

        <div className="card shadow-nvsu" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <form onSubmit={handleSubmit} style={{ padding: 'var(--space-8)' }}>
            
            {step === 1 && (
              <div className="animate-fade-in">
                <h3 style={{ marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--gray-200)', paddingBottom: 'var(--space-2)' }}>Step 1: Term & Schedule</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="form-group">
                    <label className="form-label">Semester</label>
                    <select 
                      className="form-select"
                      value={formData.semester}
                      onChange={e => setFormData({ ...formData, semester: e.target.value })}
                    >
                      <option>FIRST SEMESTER</option>
                      <option>SECOND SEMESTER</option>
                      <option>SUMMER</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Academic Year</label>
                    <select 
                      className="form-select"
                      value={formData.academicYear}
                      onChange={e => setFormData({ ...formData, academicYear: e.target.value })}
                    >
                      <option>2025-2026</option>
                      <option>2024-2025</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Submission Deadline</label>
                  <input 
                    type="datetime-local" 
                    className="form-input"
                    value={formData.deadline}
                    onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                    required
                  />
                  <small className="text-gray">Faculty cannot upload after this time unless extended.</small>
                </div>
                <div style={{ marginTop: 'var(--space-8)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>Next Step →</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fade-in">
                <h3 style={{ marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--gray-200)', paddingBottom: 'var(--space-2)' }}>Step 2: Faculty & Subjects</h3>
                <div className="form-group">
                  <label className="form-label">Assign to Faculty</label>
                  <select 
                    className="form-select"
                    value={formData.facultyId}
                    onChange={e => handleFacultyChange(e.target.value)}
                    required
                  >
                    <option value="">Select a faculty member...</option>
                    {mockFaculty.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.department})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Assigned Subjects</label>
                  {!formData.facultyId ? (
                    <div className="alert alert-info">
                      Please select a faculty member to see their assigned subjects.
                    </div>
                  ) : formData.subjects.length === 0 ? (
                    <div className="alert alert-warning">
                      This faculty member has no assigned subjects. Please manage subjects in the <strong style={{cursor: 'pointer', textDecoration: 'underline'}} onClick={() => navigate('/admin/faculty/manage')}>Manage Faculty</strong> section.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', backgroundColor: 'var(--gray-50)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
                      {formData.subjects.map((sub, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className="badge badge-primary" style={{ minWidth: '24px', textAlign: 'center' }}>{idx + 1}</span>
                          <span style={{ fontWeight: '500' }}>{sub}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 'var(--space-8)', display: 'flex', justifyContent: 'space-between' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
                  <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>Next Step →</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="animate-fade-in">
                <h3 style={{ marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--gray-200)', paddingBottom: 'var(--space-2)' }}>Step 3: Review & Confirm</h3>
                <div style={{ backgroundColor: 'var(--gray-50)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-6)' }}>
                  <div className="grid grid-cols-2 gap-4" style={{ marginBottom: 'var(--space-4)' }}>
                    <div>
                      <small className="text-gray" style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>FACULTY</small>
                      <div style={{ fontSize: 'var(--text-lg)' }}><strong>{mockFaculty.find(f => f.id === formData.facultyId)?.name}</strong></div>
                    </div>
                    <div>
                      <small className="text-gray" style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>Term</small>
                      <div>{formData.semester}, AY {formData.academicYear}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <small className="text-gray" style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>Deadline</small>
                    <div style={{ color: 'var(--brand-red)' }}><strong>{new Date(formData.deadline).toLocaleString()}</strong></div>
                  </div>
                  <div>
                    <small className="text-gray" style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>Subjects ({formData.subjects.length})</small>
                    <ul style={{ marginTop: 'var(--space-1)' }}>
                      {formData.subjects.map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="alert alert-info" style={{ marginBottom: 'var(--space-8)' }}>
                  ℹ️ This will create a compliance checklist with 12 required documents for each subject and 13 general administrative documents.
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setStep(2)}>← Back</button>
                  <button type="submit" className="btn btn-primary btn-lg">Create & Assign Checklist</button>
                </div>
              </div>
            )}

          </form>
        </div>
      </main>
    </div>
  );
}
