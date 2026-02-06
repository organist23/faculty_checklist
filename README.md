# NVSU Faculty Compliance Checklist Management System

A web-based application for managing and monitoring faculty instructional and administrative compliance at Nueva Vizcaya State University (NVSU).

![NVSU Logo](./Logo/educlogo.jpg)

## 🎯 Overview

This system digitizes the NVSU Faculty Compliance Checklist, enabling:
- **Chair/Admin**: Full control over checklist creation, deadline management, review, and approval
- **Faculty**: Upload photo evidence for compliance documents with deadline tracking

## ✨ Features

### For Chair/Admin
- ✅ Create and manage faculty accounts
- ✅ Set global or individual submission deadlines
- ✅ Extend deadlines for specific faculty members
- ✅ Monitor deadline compliance with real-time dashboard
- ✅ Review uploaded photo evidence
- ✅ Return submissions for revision with comments
- ✅ Preview and approve checklists
- ✅ Track submission statistics (on-time, late, overdue)
- ✅ Search and filter faculty by status

### For Faculty
- ✅ View assigned checklist with deadline
- ✅ Live countdown timer showing time remaining
- ✅ Upload photo evidence (JPG, JPEG, PNG only)
- ✅ Track upload progress
- ✅ Submit for review
- ✅ Receive notifications for returned submissions
- ✅ Re-upload after revisions

## 🎨 Design System

The UI is built using **NVSU brand colors** extracted from the official logo:
- **Primary**: Dark Green (#0d5c2f) - Main brand color
- **Accent Red**: (#c41e3a) - Warnings and urgent items
- **Accent Yellow**: (#ffd700) - Approaching deadlines
- **Status Colors**: Green (on-time), Yellow (approaching), Red (overdue), Purple (late)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Modern web browser

### Installation

1. **Clone or navigate to the project directory**
   ```bash
   cd checklist_faculty
   ```

2. **Install dependencies** (already done)
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

### Demo Credentials

**Admin Account:**
- Username: `admin`
- Password: `admin123`

**Faculty Account:**
- Username: `faculty`
- Password: `faculty123`

## 📁 Project Structure

```
checklist_faculty/
├── Logo/
│   └── NVSU_logo.jpg          # University logo
├── src/
│   ├── components/
│   │   ├── Header.jsx         # App header with branding
│   │   └── DeadlineBanner.jsx # Countdown timer component
│   ├── context/
│   │   └── AuthContext.jsx    # Authentication state
│   ├── pages/
│   │   ├── Login.jsx          # Login page
│   │   ├── AdminDashboard.jsx # Chair/Admin dashboard
│   │   ├── FacultyDashboard.jsx # Faculty checklist view
│   │   └── ChecklistView.jsx  # Admin review page
│   ├── App.jsx                # Main app with routing
│   ├── App.css                # Component-specific styles
│   ├── index.css              # Design system & base styles
│   └── main.jsx               # React entry point
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 📋 Document Types

### Documents by Subject (12 per subject)
1. Syllabus
2. Instructional Materials (IMs)
3. Midterm Examination
4. Final Examination
5. Table of Specifications (Midterm)
6. Table of Specifications (Final)
7. Rubrics
8. Quizzes
9. Learning Activities
10. COTED
11. Grading Sheet
12. Class Record

### Other Documents (13 one-time submissions)
1. Faculty Workload
2. IPCR – Target
3. IPCR – Final with Rating
4. Student Consultation
5. Student Evaluation (FPESf)
6. Superior's Evaluation (FPESu)
7. Classroom Observation
8. Accomplishment Report – Quarter 1
9. Accomplishment Report – Quarter 2
10. Seminar/Training Certificates
11. Membership ID/Certificates
12. Individual Development Plan
13. Faculty Attendance

## ⏰ Deadline Management

### Features
- **Global Deadlines**: Set one deadline for all faculty in a semester
- **Individual Deadlines**: Custom deadlines per faculty member
- **Deadline Extensions**: Extend deadlines with reason tracking
- **Live Countdown**: Real-time timer showing days, hours, minutes
- **Status Indicators**:
  - 🟢 Green: More than 7 days remaining
  - 🟡 Yellow: 1-7 days remaining
  - 🔴 Red: Less than 24 hours or overdue
  - 🟣 Purple: Submitted late

### Automated Notifications
- 7 days before deadline
- 3 days before deadline
- 1 day before deadline
- On deadline day
- Daily reminders if overdue

## 🔐 User Roles & Permissions

### Chair/Admin
- Create faculty accounts
- Manage checklists and deadlines
- Review and approve submissions
- Return for revision
- View all statistics

### Faculty
- View assigned checklist
- Upload photo evidence
- Submit for review
- Re-upload after revision
- **Cannot**: Modify deadlines, approve, or view other faculty

## 🎯 Workflow

1. **Admin creates** faculty account and checklist
2. **Admin sets** submission deadline
3. **Faculty uploads** photo evidence before deadline
4. **Faculty submits** for review
5. **Admin reviews** uploaded documents
6. **Admin either**:
   - Returns for revision (with comments), OR
   - Previews and approves
7. **Checklist locked** after approval

## 🛠️ Tech Stack

- **Frontend**: React 18 + Vite
- **Routing**: React Router v6
- **Styling**: Custom CSS with NVSU brand colors
- **Date Handling**: date-fns
- **State Management**: React Context API
- **Future Backend**: Supabase (authentication, database, storage)

## 📊 Database Schema (Planned)

### Tables
- `users` - Authentication and roles
- `faculty_profiles` - Faculty information
- `semesters` - Academic terms
- `checklists` - Main checklist records
- `deadline_extensions` - Extension history
- `subjects` - Subjects per checklist
- `document_types` - Document categories
- `document_submissions` - Upload tracking
- `evidence_photos` - Photo storage
- `revision_comments` - Admin feedback
- `notifications` - User notifications

## 🔄 Current Status

### ✅ Completed (UI Only)
- Login page with authentication
- Admin dashboard with statistics
- Faculty dashboard with upload interface
- Deadline banner with countdown timer
- Checklist review page for admin
- Return for revision workflow
- Approval workflow
- Responsive design
- NVSU brand styling

### 🚧 To Be Implemented
- Supabase integration
- Real file upload to storage
- Email notifications
- User account creation
- Deadline extension interface
- Advanced search and filters
- Export/reporting features
- Mobile app (future)

## 🎨 Design Principles

Following NVSU branding:
- Clean, professional academic interface
- Desktop-first responsive layout
- Prominent deadline indicators
- Color-coded status system
- Accessible contrast ratios
- Touch-friendly buttons (44px minimum)
- Clear visual hierarchy

## 📱 Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (responsive)

## 🤝 Contributing

This is an institutional project for NVSU. For modifications or improvements, please contact the IT Department.

## 📄 License

© 2026 Nueva Vizcaya State University. All rights reserved.

## 📞 Support

For technical support or questions:
- Contact: NVSU IT Department
- Location: Bayombong, Nueva Vizcaya

---

**Built with ❤️ for NVSU Faculty**
