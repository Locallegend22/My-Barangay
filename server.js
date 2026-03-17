const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { initDatabase, runQuery, getAll, getOne, saveDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'barangay-system-secret-key-2024';

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: 0,
    cacheControl: true
}));

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access denied' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
}

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, first_name, last_name, phone, address, role } = req.body;
        
        const existing = getOne('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        const userRole = role || 'resident';
        
        const result = runQuery(
            'INSERT INTO users (email, password, first_name, last_name, phone, address, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [email, password, first_name, last_name, phone, address, userRole]
        );
        
        if (result.success) {
            const user = getOne('SELECT id, email, first_name, last_name, role FROM users WHERE email = ?', [email]);
            const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ token, user });
        } else {
            res.status(500).json({ error: 'Failed to register' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = getOne('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        if (user.password !== password) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                phone: user.phone,
                address: user.address,
                role: user.role,
                photo_url: user.photo_url
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/profile', authenticateToken, (req, res) => {
    const user = getOne('SELECT id, email, first_name, last_name, phone, address, role, photo_url, created_at FROM users WHERE id = ?', [req.user.id]);
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

app.put('/api/auth/profile', authenticateToken, (req, res) => {
    const { first_name, last_name, phone, address } = req.body;
    
    const result = runQuery(
        'UPDATE users SET first_name = ?, last_name = ?, phone = ?, address = ? WHERE id = ?',
        [first_name, last_name, phone, address, req.user.id]
    );
    
    if (result.success) {
        const user = getOne('SELECT id, email, first_name, last_name, phone, address, role FROM users WHERE id = ?', [req.user.id]);
        res.json(user);
    } else {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

app.post('/api/auth/profile/photo', authenticateToken, upload.single('photo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const photoUrl = '/uploads/' + req.file.filename;
    runQuery('UPDATE users SET photo_url = ? WHERE id = ?', [photoUrl, req.user.id]);
    
    res.json({ photo_url: photoUrl });
});

const DOCUMENT_FEES = {
    'barangay_clearance': 100,
    'certificate_of_indigency': 50,
    'certificate_of_residency': 75,
    'business_permit': 200,
    'cedula': 15,
    'building_permit': 500,
    'death_certificate_request': 50,
    'birth_certificate_request': 50
};

app.get('/api/documents/fees', (req, res) => {
    res.json(DOCUMENT_FEES);
});

app.get('/api/documents', authenticateToken, (req, res) => {
    let documents;
    if (req.user.role === 'admin' || req.user.role === 'staff') {
        documents = getAll(`
            SELECT d.*, u.first_name, u.last_name, u.email 
            FROM documents d 
            LEFT JOIN users u ON d.user_id = u.id 
            ORDER BY d.created_at DESC
        `);
    } else {
        documents = getAll('SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    }
    res.json(documents);
});

app.post('/api/documents', authenticateToken, (req, res) => {
    const { type, applicant_name, description, payment_method } = req.body;
    const fee = DOCUMENT_FEES[type] || 0;
    const tracking_code = 'BRG-' + uuidv4().substring(0, 8).toUpperCase();
    
    const result = runQuery(
        'INSERT INTO documents (user_id, type, applicant_name, description, fee, payment_method, tracking_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, type, applicant_name, description, fee, payment_method, tracking_code]
    );
    
    if (result.success) {
        const doc = getOne('SELECT * FROM documents WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(doc);
    } else {
        res.status(500).json({ error: 'Failed to create document' });
    }
});

app.get('/api/documents/:id', authenticateToken, (req, res) => {
    const doc = getOne('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (doc) {
        if (doc.user_id === req.user.id || req.user.role === 'admin') {
            res.json(doc);
        } else {
            res.status(403).json({ error: 'Access denied' });
        }
    } else {
        res.status(404).json({ error: 'Document not found' });
    }
});

app.delete('/api/documents/:id', authenticateToken, (req, res) => {
    const doc = getOne('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
    }
    
    if (doc.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = runQuery('DELETE FROM documents WHERE id = ?', [req.params.id]);
    if (result.success) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

app.put('/api/documents/:id/status', authenticateToken, requireRole('admin'), (req, res) => {
    const { status, payment_status, remarks } = req.body;
    
    let updates = [];
    let params = [];
    
    if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
    }
    
    if (payment_status) {
        updates.push('payment_status = ?');
        params.push(payment_status);
    }
    
    if (remarks !== undefined) {
        updates.push('remarks = ?');
        params.push(remarks);
    }
    
    if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
    }
    
    let sql = 'UPDATE documents SET ' + updates.join(', ') + ', updated_at = CURRENT_TIMESTAMP';
    params.push(req.params.id);
    sql += ' WHERE id = ?';
    
    const result = runQuery(sql, params);
    
    if (result.success) {
        const doc = getOne('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        res.json(doc);
    } else {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

app.get('/api/appointments', authenticateToken, (req, res) => {
    let appointments;
    if (req.user.role === 'admin' || req.user.role === 'staff') {
        appointments = getAll(`
            SELECT a.*, u.first_name, u.last_name, d.type as document_type 
            FROM appointments a 
            LEFT JOIN users u ON a.user_id = u.id 
            LEFT JOIN documents d ON a.document_id = d.id
            ORDER BY a.appointment_date DESC
        `);
    } else {
        appointments = getAll('SELECT * FROM appointments WHERE user_id = ? ORDER BY appointment_date DESC', [req.user.id]);
    }
    res.json(appointments);
});

app.post('/api/appointments', authenticateToken, (req, res) => {
    const { document_id, appointment_date, appointment_time } = req.body;
    
    const result = runQuery(
        'INSERT INTO appointments (user_id, document_id, appointment_date, appointment_time) VALUES (?, ?, ?, ?)',
        [req.user.id, document_id, appointment_date, appointment_time]
    );
    
    if (result.success) {
        const appointment = getOne('SELECT * FROM appointments WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(appointment);
    } else {
        res.status(500).json({ error: 'Failed to create appointment' });
    }
});

app.get('/api/incidents', authenticateToken, (req, res) => {
    let incidents;
    if (req.user.role === 'admin' || req.user.role === 'staff') {
        incidents = getAll(`
            SELECT i.*, u.first_name, u.last_name 
            FROM incidents i 
            LEFT JOIN users u ON i.reporter_id = u.id 
            ORDER BY i.created_at DESC
        `);
    } else {
        incidents = getAll('SELECT * FROM incidents WHERE reporter_id = ? ORDER BY created_at DESC', [req.user.id]);
    }
    res.json(incidents);
});

app.post('/api/incidents', authenticateToken, (req, res) => {
    const { type, description, location } = req.body;
    
    const result = runQuery(
        'INSERT INTO incidents (reporter_id, type, description, location) VALUES (?, ?, ?, ?)',
        [req.user.id, type, description, location]
    );
    
    if (result.success) {
        const incident = getOne('SELECT * FROM incidents WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(incident);
    } else {
        res.status(500).json({ error: 'Failed to report incident' });
    }
});

app.put('/api/incidents/:id/status', authenticateToken, requireRole('admin'), (req, res) => {
    const { status } = req.body;
    
    const result = runQuery('UPDATE incidents SET status = ? WHERE id = ?', [status, req.params.id]);
    
    if (result.success) {
        const incident = getOne('SELECT * FROM incidents WHERE id = ?', [req.params.id]);
        res.json(incident);
    } else {
        res.status(500).json({ error: 'Failed to update incident' });
    }
});

app.get('/api/officials', (req, res) => {
    const officials = getAll('SELECT * FROM officials ORDER BY sort_order ASC');
    res.json(officials);
});

app.post('/api/officials', authenticateToken, requireRole('admin'), (req, res) => {
    const { name, position, phone, email, office_hours } = req.body;
    
    const maxOrder = getOne('SELECT MAX(sort_order) as max FROM officials');
    const sortOrder = (maxOrder?.max || 0) + 1;
    
    const result = runQuery(
        'INSERT INTO officials (name, position, phone, email, office_hours, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [name, position, phone, email, office_hours, sortOrder]
    );
    
    if (result.success) {
        const official = getOne('SELECT * FROM officials WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(official);
    } else {
        res.status(500).json({ error: 'Failed to add official' });
    }
});

app.get('/api/announcements', (req, res) => {
    const announcements = getAll('SELECT * FROM announcements ORDER BY created_at DESC');
    res.json(announcements);
});

app.post('/api/announcements', authenticateToken, requireRole('admin'), (req, res) => {
    const { title, content, category, priority } = req.body;
    
    const result = runQuery(
        'INSERT INTO announcements (title, content, category, priority) VALUES (?, ?, ?, ?)',
        [title, content, category, priority]
    );
    
    if (result.success) {
        const announcement = getOne('SELECT * FROM announcements WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(announcement);
    } else {
        res.status(500).json({ error: 'Failed to create announcement' });
    }
});

app.get('/api/events', (req, res) => {
    const events = getAll('SELECT * FROM events ORDER BY event_date ASC');
    res.json(events);
});

app.post('/api/events', authenticateToken, requireRole('admin'), (req, res) => {
    const { title, description, event_date, location, event_type } = req.body;
    
    const result = runQuery(
        'INSERT INTO events (title, description, event_date, location, event_type) VALUES (?, ?, ?, ?, ?)',
        [title, description, event_date, location, event_type]
    );
    
    if (result.success) {
        const event = getOne('SELECT * FROM events WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(event);
    } else {
        res.status(500).json({ error: 'Failed to create event' });
    }
});

app.get('/api/businesses', (req, res) => {
    const businesses = getAll(`
        SELECT b.*, u.first_name, u.last_name 
        FROM businesses b 
        LEFT JOIN users u ON b.owner_id = u.id
        ORDER BY b.created_at DESC
    `);
    res.json(businesses);
});

app.post('/api/businesses', authenticateToken, (req, res) => {
    const { name, type, address } = req.body;
    
    const result = runQuery(
        'INSERT INTO businesses (owner_id, name, type, address) VALUES (?, ?, ?, ?)',
        [req.user.id, name, type, address]
    );
    
    if (result.success) {
        const business = getOne('SELECT * FROM businesses WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(business);
    } else {
        res.status(500).json({ error: 'Failed to register business' });
    }
});

app.put('/api/businesses/:id/status', authenticateToken, requireRole('admin'), (req, res) => {
    const { permit_status } = req.body;
    
    const result = runQuery('UPDATE businesses SET permit_status = ? WHERE id = ?', [permit_status, req.params.id]);
    
    if (result.success) {
        const business = getOne('SELECT * FROM businesses WHERE id = ?', [req.params.id]);
        res.json(business);
    } else {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

app.get('/api/budget', (req, res) => {
    const reports = getAll('SELECT * FROM budget_reports ORDER BY report_date DESC');
    res.json(reports);
});

app.post('/api/budget', authenticateToken, requireRole('admin'), (req, res) => {
    const { title, description, amount, category, report_date } = req.body;
    
    const result = runQuery(
        'INSERT INTO budget_reports (title, description, amount, category, report_date) VALUES (?, ?, ?, ?, ?)',
        [title, description, amount, category, report_date]
    );
    
    if (result.success) {
        const report = getOne('SELECT * FROM budget_reports WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(report);
    } else {
        res.status(500).json({ error: 'Failed to add budget report' });
    }
});

app.get('/api/ordinances', (req, res) => {
    const ordinances = getAll('SELECT * FROM ordinances ORDER BY created_at DESC');
    res.json(ordinances);
});

app.post('/api/ordinances', authenticateToken, requireRole('admin'), (req, res) => {
    const { title, description, category, ordinance_number } = req.body;
    
    const result = runQuery(
        'INSERT INTO ordinances (title, description, category, ordinance_number) VALUES (?, ?, ?, ?)',
        [title, description, category, ordinance_number]
    );
    
    if (result.success) {
        const ordinance = getOne('SELECT * FROM ordinances WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(ordinance);
    } else {
        res.status(500).json({ error: 'Failed to add ordinance' });
    }
});

app.get('/api/hotlines', (req, res) => {
    const hotlines = getAll('SELECT * FROM hotlines ORDER BY category ASC');
    res.json(hotlines);
});

app.get('/api/evacuation-centers', (req, res) => {
    const centers = getAll('SELECT * FROM evacuation_centers');
    res.json(centers);
});

// Document Types
app.get('/api/document-types', (req, res) => {
    const types = getAll('SELECT * FROM document_types ORDER BY name ASC');
    res.json(types);
});

app.post('/api/document-types', authenticateToken, requireRole('admin'), (req, res) => {
    const { name, slug, description, fee } = req.body;
    const result = runQuery(
        'INSERT INTO document_types (name, slug, description, fee) VALUES (?, ?, ?, ?)',
        [name, slug, description, fee]
    );
    if (result.success) {
        const type = getOne('SELECT * FROM document_types WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(type);
    } else {
        res.status(500).json({ error: 'Failed to add document type' });
    }
});

app.put('/api/document-types/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const { name, description, fee, is_active } = req.body;
    const result = runQuery(
        'UPDATE document_types SET name = ?, description = ?, fee = ?, is_active = ? WHERE id = ?',
        [name, description, fee, is_active, req.params.id]
    );
    if (result.success) {
        const type = getOne('SELECT * FROM document_types WHERE id = ?', [req.params.id]);
        res.json(type);
    } else {
        res.status(500).json({ error: 'Failed to update document type' });
    }
});

app.delete('/api/document-types/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const result = runQuery('DELETE FROM document_types WHERE id = ?', [req.params.id]);
    res.json({ success: result.success });
});

// Projects
app.get('/api/projects', (req, res) => {
    const projects = getAll('SELECT * FROM projects ORDER BY created_at DESC');
    res.json(projects);
});

app.post('/api/projects', authenticateToken, requireRole('admin'), (req, res) => {
    const { title, description, budget, status, target_date } = req.body;
    const result = runQuery(
        'INSERT INTO projects (title, description, budget, status, target_date) VALUES (?, ?, ?, ?, ?)',
        [title, description, budget, status, target_date]
    );
    if (result.success) {
        const project = getOne('SELECT * FROM projects WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(project);
    } else {
        res.status(500).json({ error: 'Failed to add project' });
    }
});

app.put('/api/projects/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const { title, description, budget, status, target_date, completed_date } = req.body;
    const result = runQuery(
        'UPDATE projects SET title = ?, description = ?, budget = ?, status = ?, target_date = ?, completed_date = ? WHERE id = ?',
        [title, description, budget, status, target_date, completed_date, req.params.id]
    );
    if (result.success) {
        const project = getOne('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        res.json(project);
    } else {
        res.status(500).json({ error: 'Failed to update project' });
    }
});

app.delete('/api/projects/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const result = runQuery('DELETE FROM projects WHERE id = ?', [req.params.id]);
    res.json({ success: result.success });
});

// Events
app.delete('/api/events/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const result = runQuery('DELETE FROM events WHERE id = ?', [req.params.id]);
    res.json({ success: result.success });
});

// Announcements
app.delete('/api/announcements/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const result = runQuery('DELETE FROM announcements WHERE id = ?', [req.params.id]);
    res.json({ success: result.success });
});

// Hotlines
app.post('/api/hotlines', authenticateToken, requireRole('admin'), (req, res) => {
    const { name, phone, category, description } = req.body;
    const result = runQuery(
        'INSERT INTO hotlines (name, phone, category, description) VALUES (?, ?, ?, ?)',
        [name, phone, category, description]
    );
    if (result.success) {
        const hotline = getOne('SELECT * FROM hotlines WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(hotline);
    } else {
        res.status(500).json({ error: 'Failed to add hotline' });
    }
});

app.delete('/api/hotlines/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const result = runQuery('DELETE FROM hotlines WHERE id = ?', [req.params.id]);
    res.json({ success: result.success });
});

// Evacuation Centers
app.get('/api/evacuation-centers', (req, res) => {
    const centers = getAll('SELECT * FROM evacuation_centers');
    res.json(centers);
});

app.post('/api/evacuation-centers', authenticateToken, requireRole('admin'), (req, res) => {
    const { name, address, capacity, current_occupancy } = req.body;
    const result = runQuery(
        'INSERT INTO evacuation_centers (name, address, capacity, current_occupancy) VALUES (?, ?, ?, ?)',
        [name, address, capacity, current_occupancy || 0]
    );
    if (result.success) {
        const center = getOne('SELECT * FROM evacuation_centers WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(center);
    } else {
        res.status(500).json({ error: 'Failed to add evacuation center' });
    }
});

app.put('/api/evacuation-centers/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const { name, address, capacity, current_occupancy } = req.body;
    const result = runQuery(
        'UPDATE evacuation_centers SET name = ?, address = ?, capacity = ?, current_occupancy = ? WHERE id = ?',
        [name, address, capacity, current_occupancy, req.params.id]
    );
    if (result.success) {
        const center = getOne('SELECT * FROM evacuation_centers WHERE id = ?', [req.params.id]);
        res.json(center);
    } else {
        res.status(500).json({ error: 'Failed to update evacuation center' });
    }
});

app.delete('/api/evacuation-centers/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const result = runQuery('DELETE FROM evacuation_centers WHERE id = ?', [req.params.id]);
    res.json({ success: result.success });
});

// Officials
app.put('/api/officials/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const { name, position, phone, email, office_hours } = req.body;
    const result = runQuery(
        'UPDATE officials SET name = ?, position = ?, phone = ?, email = ?, office_hours = ? WHERE id = ?',
        [name, position, phone, email, office_hours, req.params.id]
    );
    if (result.success) {
        const official = getOne('SELECT * FROM officials WHERE id = ?', [req.params.id]);
        res.json(official);
    } else {
        res.status(500).json({ error: 'Failed to update official' });
    }
});

app.delete('/api/officials/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const result = runQuery('DELETE FROM officials WHERE id = ?', [req.params.id]);
    res.json({ success: result.success });
});

// Ordinances
app.delete('/api/ordinances/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const result = runQuery('DELETE FROM ordinances WHERE id = ?', [req.params.id]);
    res.json({ success: result.success });
});

app.get('/api/dashboard/stats', authenticateToken, requireRole('admin'), (req, res) => {
    const totalResidents = getOne('SELECT COUNT(*) as count FROM users WHERE role = ?', ['resident'])?.count || 0;
    const totalDocuments = getOne('SELECT COUNT(*) as count FROM documents')?.count || 0;
    const pendingDocuments = getOne('SELECT COUNT(*) as count FROM documents WHERE status = ?', ['pending'])?.count || 0;
    const totalIncidents = getOne('SELECT COUNT(*) as count FROM incidents')?.count || 0;
    const openIncidents = getOne('SELECT COUNT(*) as count FROM incidents WHERE status = ?', ['open'])?.count || 0;
    const totalBusinesses = getOne('SELECT COUNT(*) as count FROM businesses')?.count || 0;
    
    const recentDocuments = getAll('SELECT d.*, u.first_name, u.last_name FROM documents d LEFT JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT 5');
    const recentIncidents = getAll('SELECT i.*, u.first_name, u.last_name FROM incidents i LEFT JOIN users u ON i.reporter_id = u.id ORDER BY i.created_at DESC LIMIT 5');
    
    res.json({
        totalResidents,
        totalDocuments,
        pendingDocuments,
        totalIncidents,
        openIncidents,
        totalBusinesses,
        recentDocuments,
        recentIncidents
    });
});

app.get('/api/users', authenticateToken, requireRole('admin'), (req, res) => {
    const users = getAll('SELECT id, email, password, first_name, last_name, phone, address, role, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
});

app.put('/api/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const { first_name, last_name, email, password, phone, role, address } = req.body;
    
    let updates = [];
    let params = [];
    
    if (first_name !== undefined) { updates.push('first_name = ?'); params.push(first_name); }
    if (last_name !== undefined) { updates.push('last_name = ?'); params.push(last_name); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (password) { updates.push('password = ?'); params.push(password); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }
    
    if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
    }
    
    params.push(req.params.id);
    const sql = 'UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?';
    const result = runQuery(sql, params);
    
    if (result.success) {
        const user = getOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
        res.json(user);
    } else {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.delete('/api/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const result = runQuery('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (result.success) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

app.put('/api/users/:id/role', authenticateToken, requireRole('admin'), (req, res) => {
    const { role } = req.body;
    const result = runQuery('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    if (result.success) {
        const user = getOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
        res.json(user);
    } else {
        res.status(500).json({ error: 'Failed to update role' });
    }
});

app.get('/api/businesses', (req, res) => {
    const businesses = getAll(`
        SELECT b.*, u.first_name, u.last_name 
        FROM businesses b 
        LEFT JOIN users u ON b.owner_id = u.id
        ORDER BY b.created_at DESC
    `);
    res.json(businesses);
});

app.post('/api/businesses', authenticateToken, (req, res) => {
    const { name, type, address } = req.body;
    
    const result = runQuery(
        'INSERT INTO businesses (owner_id, name, type, address) VALUES (?, ?, ?, ?)',
        [req.user.id, name, type, address]
    );
    
    if (result.success) {
        const business = getOne('SELECT * FROM businesses WHERE id = ?', [getAll('SELECT last_insert_rowid() as id')[0].id]);
        res.json(business);
    } else {
        res.status(500).json({ error: 'Failed to register business' });
    }
});

app.put('/api/businesses/:id/status', authenticateToken, requireRole('admin'), (req, res) => {
    const { permit_status } = req.body;
    const result = runQuery('UPDATE businesses SET permit_status = ? WHERE id = ?', [permit_status, req.params.id]);
    if (result.success) {
        const business = getOne('SELECT * FROM businesses WHERE id = ?', [req.params.id]);
        res.json(business);
    } else {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

app.get('/api/search/documents', authenticateToken, (req, res) => {
    const { tracking_code } = req.query;
    const doc = getOne('SELECT * FROM documents WHERE tracking_code = ?', [tracking_code]);
    res.json(doc || { error: 'Document not found' });
});

app.get('/api/settings/gcash', (req, res) => {
    const setting = getOne('SELECT value FROM settings WHERE key = ?', ['gcash_number']);
    res.json({ gcash_number: setting?.value || '' });
});

app.put('/api/settings/gcash', authenticateToken, requireRole('admin'), (req, res) => {
    const { gcash_number } = req.body;
    const existing = getOne('SELECT id FROM settings WHERE key = ?', ['gcash_number']);
    if (existing) {
        runQuery('UPDATE settings SET value = ? WHERE key = ?', [gcash_number, 'gcash_number']);
    } else {
        runQuery('INSERT INTO settings (key, value) VALUES (?, ?)', ['gcash_number', gcash_number]);
    }
    res.json({ success: true, gcash_number });
});

async function startServer() {
    await initDatabase();
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
