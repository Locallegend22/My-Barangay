const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { initDatabase, runQuery, getAll, getOne, saveDatabase, db } = require('./database');

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

app.get('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        const user = getOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, phone: user.phone, address: user.address, role: user.role, photo_url: user.photo_url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        const { first_name, last_name, phone, address } = req.body;
        runQuery('UPDATE users SET first_name = ?, last_name = ?, phone = ?, address = ? WHERE id = ?', 
            [first_name, last_name, phone, address, req.user.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const users = getAll('SELECT id, email, first_name, last_name, phone, address, role, created_at FROM users');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { email, first_name, last_name, phone, address, role } = req.body;
        runQuery('UPDATE users SET email = ?, first_name = ?, last_name = ?, phone = ?, address = ?, role = ? WHERE id = ?', 
            [email, first_name, last_name, phone, address, role, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/document-types', async (req, res) => {
    try {
        const types = getAll('SELECT * FROM document_types');
        const mappedTypes = types.map(t => ({
            ...t,
            status: t.is_active ? 'active' : 'inactive'
        }));
        res.json(mappedTypes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/document-types', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, slug, description, fee, requirements, status } = req.body;
        const is_active = status === 'active' ? 1 : 0;
        runQuery('INSERT INTO document_types (name, slug, description, fee, requirements, is_active) VALUES (?, ?, ?, ?, ?, ?)', 
            [name, slug, description, fee, requirements || '', is_active]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/document-types/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, slug, description, fee, requirements, status } = req.body;
        const is_active = status === 'active' ? 1 : 0;
        runQuery('UPDATE document_types SET name = ?, slug = ?, description = ?, fee = ?, requirements = ?, is_active = ? WHERE id = ?', 
            [name, slug, description, fee, requirements || '', is_active, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/document-types/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM document_types WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/documents', authenticateToken, async (req, res) => {
    try {
        let documents;
        if (req.user.role === 'admin') {
            documents = getAll(`
                SELECT d.*, u.first_name, u.last_name 
                FROM documents d 
                LEFT JOIN users u ON d.user_id = u.id
                ORDER BY d.created_at DESC
            `);
        } else {
            documents = getAll('SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        }
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/my-documents', authenticateToken, async (req, res) => {
    try {
        const documents = getAll('SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/documents', authenticateToken, async (req, res) => {
    try {
        const { type, fee, applicant_name, description, payment_method } = req.body;
        const tracking_code = 'DOC-' + Date.now().toString(36).toUpperCase();
        runQuery('INSERT INTO documents (user_id, tracking_code, type, fee, applicant_name, description, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [req.user.id, tracking_code, type, fee || 0, applicant_name, description, payment_method]);
        res.json({ success: true, tracking_code });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/documents/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { status, remarks } = req.body;
        runQuery('UPDATE documents SET status = ?, remarks = ? WHERE id = ?', [status, remarks, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/documents/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM documents WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/officials', async (req, res) => {
    try {
        const officials = getAll('SELECT * FROM officials');
        res.json(officials);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/officials', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, position, term, photo_url } = req.body;
        runQuery('INSERT INTO officials (name, position, term, photo_url) VALUES (?, ?, ?, ?)', [name, position, term, photo_url || null]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/officials/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, position, term, photo_url } = req.body;
        runQuery('UPDATE officials SET name = ?, position = ?, term = ?, photo_url = ? WHERE id = ?', [name, position, term, photo_url, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/officials/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM officials WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/ordinances', async (req, res) => {
    try {
        const ordinances = getAll('SELECT * FROM ordinances');
        res.json(ordinances);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ordinances', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { title, ordinance_number, category, status, description, date_enacted } = req.body;
        runQuery('INSERT INTO ordinances (title, ordinance_number, category, status, description, date_enacted) VALUES (?, ?, ?, ?, ?, ?)', 
            [title, ordinance_number, category, status, description, date_enacted || null]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/ordinances/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { title, description, status, date_enacted } = req.body;
        runQuery('UPDATE ordinances SET title = ?, description = ?, status = ?, date_enacted = ? WHERE id = ?', [title, description, status, date_enacted, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/ordinances/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM ordinances WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/projects', async (req, res) => {
    try {
        const projects = getAll('SELECT * FROM projects');
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/projects', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { title, description, status, budget, target_date } = req.body;
        runQuery('INSERT INTO projects (name, description, status, budget, target_date) VALUES (?, ?, ?, ?, ?)', [title, description, status, budget, target_date || null]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/projects/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, description, status, budget, start_date } = req.body;
        runQuery('UPDATE projects SET name = ?, description = ?, status = ?, budget = ?, start_date = ? WHERE id = ?', [name, description, status, budget, start_date, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/projects/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM projects WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/budget', async (req, res) => {
    try {
        const budget = getAll('SELECT * FROM budget');
        res.json(budget);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/budget', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { year, category, amount, description } = req.body;
        runQuery('INSERT INTO budget (year, category, amount, description) VALUES (?, ?, ?, ?)', [year, category, amount, description]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/budget/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM budget WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/events', async (req, res) => {
    try {
        const events = getAll('SELECT * FROM events');
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/events', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { title, event_date, location, event_type, description } = req.body;
        runQuery('INSERT INTO events (name, event_date, location, event_type, description) VALUES (?, ?, ?, ?, ?)', [title, event_date, location, event_type, description]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/events/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, date, location, description } = req.body;
        runQuery('UPDATE events SET name = ?, date = ?, location = ?, description = ? WHERE id = ?', [name, date, location, description, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/events/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM events WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/announcements', async (req, res) => {
    try {
        const announcements = getAll('SELECT * FROM announcements ORDER BY date DESC');
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/announcements', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { title, content, category, priority } = req.body;
        runQuery('INSERT INTO announcements (title, content, category, priority) VALUES (?, ?, ?, ?)', [title, content, category, priority]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/announcements/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { title, content, date, priority } = req.body;
        runQuery('UPDATE announcements SET title = ?, content = ?, date = ?, priority = ? WHERE id = ?', [title, content, date, priority, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/announcements/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM announcements WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/hotlines', async (req, res) => {
    try {
        const hotlines = getAll('SELECT * FROM hotlines');
        res.json(hotlines);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/hotlines', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, phone, category, description } = req.body;
        runQuery('INSERT INTO hotlines (name, phone, category, description) VALUES (?, ?, ?, ?)', [name, phone, category, description || '']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/hotlines/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, number, category } = req.body;
        runQuery('UPDATE hotlines SET name = ?, number = ?, category = ? WHERE id = ?', [name, number, category, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/hotlines/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM hotlines WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/evacuation-centers', async (req, res) => {
    try {
        const centers = getAll('SELECT * FROM evacuation_centers');
        res.json(centers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/evacuation-centers', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, capacity, address, current_occupancy, facilities } = req.body;
        runQuery('INSERT INTO evacuation_centers (name, capacity, address, current_occupancy, facilities) VALUES (?, ?, ?, ?, ?)', [name, capacity, address, current_occupancy || 0, facilities || '']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/evacuation-centers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, capacity, address, facilities } = req.body;
        runQuery('UPDATE evacuation_centers SET name = ?, capacity = ?, address = ?, facilities = ? WHERE id = ?', [name, capacity, address, facilities, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/evacuation-centers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        runQuery('DELETE FROM evacuation_centers WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/businesses', async (req, res) => {
    try {
        const businesses = getAll(`
            SELECT b.*, u.first_name, u.last_name 
            FROM businesses b 
            LEFT JOIN users u ON b.owner_id = u.id
            ORDER BY b.created_at DESC
        `);
        res.json(businesses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/businesses', authenticateToken, async (req, res) => {
    try {
        const { name, type, address, description, fee, payment_method } = req.body;
        runQuery('INSERT INTO businesses (owner_id, name, type, address, description, fee, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [req.user.id, name, type, address, description || '', fee || 0, payment_method || 'over_the_counter']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/businesses/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { status } = req.body;
        runQuery('UPDATE businesses SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/incidents', authenticateToken, async (req, res) => {
    try {
        let incidents;
        if (req.user.role === 'admin') {
            incidents = getAll('SELECT i.*, u.first_name, u.last_name FROM incidents i LEFT JOIN users u ON i.user_id = u.id ORDER BY i.created_at DESC');
        } else {
            incidents = getAll('SELECT * FROM incidents WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        }
        res.json(incidents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/incidents/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { status, action_taken } = req.body;
        runQuery('UPDATE incidents SET status = ?, action_taken = ? WHERE id = ?', [status, action_taken || '', req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/incidents', authenticateToken, async (req, res) => {
    try {
        const { type, location, description } = req.body;
        runQuery('INSERT INTO incidents (user_id, type, location, description) VALUES (?, ?, ?, ?)', [req.user.id, type, location, description]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const settings = getOne('SELECT * FROM settings LIMIT 1');
        res.json(settings || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/settings/gcash', async (req, res) => {
    try {
        const settings = getOne('SELECT gcash_number FROM settings LIMIT 1');
        res.json({ gcash_number: settings?.gcash_number || '' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/settings/gcash', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { gcash_number } = req.body;
        runQuery('UPDATE settings SET gcash_number = ?', [gcash_number]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/settings', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { gcash_number, business_name } = req.body;
        const existing = getOne('SELECT id FROM settings');
        if (existing) {
            runQuery('UPDATE settings SET gcash_number = ?, business_name = ?', [gcash_number, business_name]);
        } else {
            runQuery('INSERT INTO settings (gcash_number, business_name) VALUES (?, ?)', [gcash_number, business_name]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const usersCount = getAll('SELECT COUNT(*) as count FROM users WHERE role = "resident"')[0]?.count || 0;
        const documentsCount = getAll('SELECT COUNT(*) as count FROM documents WHERE status = "pending"')[0]?.count || 0;
        const businessesCount = getAll('SELECT COUNT(*) as count FROM businesses')[0]?.count || 0;
        const incidentsCount = getAll('SELECT COUNT(*) as count FROM incidents WHERE status = "open"')[0]?.count || 0;
        
        const recentDocuments = getAll(`
            SELECT d.*, u.first_name, u.last_name 
            FROM documents d 
            LEFT JOIN users u ON d.user_id = u.id
            ORDER BY d.created_at DESC
            LIMIT 10
        `);
        
        res.json({ totalResidents: usersCount, pendingDocuments: documentsCount, totalBusinesses: businessesCount, openIncidents: incidentsCount, recentDocuments });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const usersCount = getAll('SELECT COUNT(*) as count FROM users WHERE role = "resident"')[0]?.count || 0;
        const documentsCount = getAll('SELECT COUNT(*) as count FROM documents WHERE status = "pending"')[0]?.count || 0;
        const businessesCount = getAll('SELECT COUNT(*) as count FROM businesses')[0]?.count || 0;
        const incidentsCount = getAll('SELECT COUNT(*) as count FROM incidents WHERE status = "open"')[0]?.count || 0;
        
        const recentDocuments = getAll(`
            SELECT d.*, u.first_name, u.last_name 
            FROM documents d 
            LEFT JOIN users u ON d.user_id = u.id
            ORDER BY d.created_at DESC
            LIMIT 10
        `);
        
        const recentIncidents = getAll(`
            SELECT i.*, u.first_name, u.last_name 
            FROM incidents i 
            LEFT JOIN users u ON i.user_id = u.id
            ORDER BY i.created_at DESC
            LIMIT 10
        `);
        
        res.json({ totalResidents: usersCount, pendingDocuments: documentsCount, totalBusinesses: businessesCount, openIncidents: incidentsCount, recentDocuments, recentIncidents });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer() {
    await initDatabase();
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

startServer().catch(console.error);
