# Barangay Management System - Technical Specification

## 1. Project Overview

**Project Name:** Barangay Management System (BarangayHub)
**Type:** Full-stack Web Application
**Core Functionality:** A comprehensive digital platform for barangay operations, enabling residents to access services online while providing staff with efficient administrative tools.
**Target Users:** 
- Residents (primary)
- Barangay Staff/Admin
- Business Owners
- SK Officials

---

## 2. Technology Stack

### Backend
- **Runtime:** Node.js v18+
- **Framework:** Express.js
- **Database:** SQLite (for simplicity/portability)
- **Authentication:** JWT tokens
- **File Upload:** Multer

### Frontend
- **Styling:** Tailwind CSS v3
- **Icons:** Lucide Icons
- **Fonts:** Inter, Poppins (Google Fonts)

---

## 3. UI/UX Specification

### Color Palette
| Role | Color | Hex |
|------|-------|-----|
| Primary | Forest Green | #166534 |
| Primary Light | Emerald | #10b981 |
| Primary Dark | Dark Green | #14532d |
| Secondary | Amber | #f59e0b |
| Secondary Light | Yellow | #fbbf24 |
| Accent | Red | #dc2626 |
| Background | Off-white | #f8fafc |
| Surface | White | #ffffff |
| Text Primary | Slate 900 | #0f172a |
| Text Secondary | Slate 500 | #64748b |
| Border | Slate 200 | #e2e8f0 |

### Typography
- **Headings:** Poppins (600, 700)
- **Body:** Inter (400, 500)
- **Sizes:**
  - H1: 2.5rem (40px)
  - H2: 2rem (32px)
  - H3: 1.5rem (24px)
  - H4: 1.25rem (20px)
  - Body: 1rem (16px)
  - Small: 0.875rem (14px)

### Layout
- **Max Width:** 1440px
- **Sidebar:** 280px fixed (desktop), collapsible (mobile)
- **Responsive Breakpoints:**
  - Mobile: < 768px
  - Tablet: 768px - 1024px
  - Desktop: > 1024px

### Components
- Cards with subtle shadows (shadow-sm, hover:shadow-md)
- Buttons: rounded-lg, transitions
- Forms: floating labels, validation states
- Tables: striped, sortable headers
- Modals: centered, overlay backdrop

---

## 4. Database Schema

### Users
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  address TEXT,
  role TEXT DEFAULT 'resident', -- resident, admin, staff, business
  photo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Documents
```sql
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT, -- clearance, certificate, permit
  status TEXT DEFAULT 'pending', -- pending, processing, ready, completed
  description TEXT,
  fee REAL,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'unpaid',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Appointments
```sql
CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  document_id INTEGER,
  appointment_date DATE,
  appointment_time TIME,
  status TEXT DEFAULT 'scheduled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (document_id) REFERENCES documents(id)
);
```

### Blotter/Incidents
```sql
CREATE TABLE incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER,
  type TEXT,
  description TEXT,
  location TEXT,
  status TEXT DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id)
);
```

### Officials
```sql
CREATE TABLE officials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  position TEXT,
  photo_url TEXT,
  phone TEXT,
  email TEXT,
  office_hours TEXT,
  sort_order INTEGER
);
```

### Announcements
```sql
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  content TEXT,
  category TEXT,
  priority TEXT DEFAULT 'normal',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Businesses
```sql
CREATE TABLE businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER,
  name TEXT,
  type TEXT,
  address TEXT,
  permit_status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
```

### Budget Reports
```sql
CREATE TABLE budget_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  amount REAL,
  category TEXT,
  report_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Ordinances
```sql
CREATE TABLE ordinances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  category TEXT,
  ordinance_number TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Feature Specifications

### 5.1 Online Document Services
- **Document Types:** Barangay Clearance, Certificate of Indigency, Certificate of Residency, Business Permit, Cedula
- **Application Form:** Multi-step form with validation
- **Status Tracking:** Visual progress indicator (Pending → Processing → Ready → Completed)
- **Fee Calculator:** Dynamic fee calculation based on document type
- **Payment Options:** GCash, PayMaya, Bank Transfer (mock integration)

### 5.2 Resident Portal
- **Dashboard:** Overview of applications, notifications, quick actions
- **Profile Management:** Edit personal info, upload photo ID
- **Document History:** Table view of all past applications
- **Notifications:** Alert system for document status changes
- **Complaint Filing:** Form with category selection

### 5.3 Transparency & Governance
- **Officials Directory:** Grid layout with photos and contact info
- **Meeting Minutes:** List with search and date filters
- **Budget Reports:** Financial breakdown tables and charts
- **Projects:** Cards showing ongoing/completed initiatives
- **Ordinances:** Searchable list by category

### 5.4 Community Engagement
- **Events Calendar:** Monthly calendar view with event details
- **News Feed:** Card-based announcements with priority badges
- **Discussion Forum:** Topics with replies
- **Volunteer Sign-up:** Form for SK and disaster response programs

### 5.5 Emergency & Safety
- **Hotline Numbers:** Quick-access emergency contacts
- **Incident Reporting:** Quick-report form with location
- **Emergency Alerts:** Banner system for urgent notices
- **Evacuation Centers:** Map placeholder with list and capacity

### 5.6 Business Services
- **Permit Application:** Step-by-step wizard
- **Business Directory:** Searchable business listings
- **Market Schedule:** Weekly schedule table
- **Zoning Info:** Guidelines for business locations

### 5.7 Administrative Backend
- **Dashboard:** Stats overview (applications, incidents, residents)
- **Document Management:** Kanban-style workflow
- **Digital Blotter:** Incident logging with search
- **Resident Database:** Searchable master list
- **Report Generation:** Statistics and exports

### 5.8 Accessibility
- **Responsive Design:** Mobile-first approach
- **Language Toggle:** English/Filipino switch
- **Font Size Controls:** Accessibility options

---

## 6. API Endpoints

### Auth
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/profile
- PUT /api/auth/profile

### Documents
- GET /api/documents
- POST /api/documents
- GET /api/documents/:id
- PUT /api/documents/:id/status

### Appointments
- GET /api/appointments
- POST /api/appointments
- PUT /api/appointments/:id

### Incidents
- GET /api/incidents
- POST /api/incidents
- GET /api/incidents/:id

### Officials
- GET /api/officials

### Announcements
- GET /api/announcements
- POST /api/announcements

### Businesses
- GET /api/businesses
- POST /api/businesses
- PUT /api/businesses/:id/status

### Budget
- GET /api/budget
- POST /api/budget

### Ordinances
- GET /api/ordinances
- POST /api/ordinances

---

## 7. Page Structure

1. **Home** - Landing page with hero, features, quick links
2. **Login/Register** - Authentication pages
3. **Dashboard** - Resident dashboard (authenticated)
4. **Documents** - Application forms and tracking
5. **Profile** - User profile management
6. **Incidents** - Report an incident
7. **Directory** - Officials and businesses
8. **Transparency** - Reports, ordinances, minutes
9. **Community** - Events, news, forum
10. **Emergency** - Hotlines, alerts
11. **Admin Dashboard** - Staff/admin only
12. **Admin Documents** - Document management
13. **Admin Residents** - Resident database
14. **Admin Incidents** - Blotter system
15. **Admin Reports** - Statistics and generation

---

## 8. Acceptance Criteria

### Must Have
- [ ] Responsive layout works on mobile (375px) to desktop (1440px)
- [ ] All 8 feature categories implemented
- [ ] User registration and login functional
- [ ] Document application and status tracking works
- [ ] Admin can manage documents and view dashboard
- [ ] Emergency hotlines visible and accessible
- [ ] Events calendar displays correctly

### Visual Checkpoints
- [ ] Green/amber color scheme applied consistently
- [ ] Cards have proper shadows and hover states
- [ ] Forms show validation feedback
- [ ] Tables are striped and sortable
- [ ] Navigation highlights active page
- [ ] Loading states shown during API calls

---

## 9. File Structure

```
barangay-system/
├── server.js
├── package.json
├── database.js
├── routes/
│   ├── auth.js
│   ├── documents.js
│   ├── appointments.js
│   ├── incidents.js
│   ├── officials.js
│   ├── announcements.js
│   ├── businesses.js
│   ├── budget.js
│   └── ordinances.js
├── public/
│   ├── index.html
│   ├── css/
│   └── js/
└── uploads/
```
