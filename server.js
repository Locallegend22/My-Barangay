const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { initDatabase, getDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barangay-system-secret-key-2024';

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
        const db = getDb();
        
        const existing = await db.collection('users').findOne({ email });
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        const userRole = role || 'resident';
        const now = new Date();
        
        const result = await db.collection('users').insertOne({
            email, password, first_name, last_name, phone, address, role: userRole, photo_url: null, created_at: now
        });
        
        const user = await db.collection('users').findOne({ email });
        const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user._id, email: user.email, first_name: user.first_name, last_name: user.last_name, phone: user.phone, address: user.address, role: user.role, photo_url: user.photo_url } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Seed demo accounts endpoint
app.post('/api/seed', async (req, res) => {
    try {
        const db = getDb();
        const now = new Date();
        
        await db.collection('users').updateOne(
            { email: 'admin@barangay.gov' },
            { $setOnInsert: { email: 'admin@barangay.gov', password: 'admin123', first_name: 'Admin', last_name: 'User', phone: '09123456789', address: 'Barangay Hall', role: 'admin', photo_url: null, created_at: now } },
            { upsert: true }
        );
        
        await db.collection('users').updateOne(
            { email: 'resident@example.com' },
            { $setOnInsert: { email: 'resident@example.com', password: 'admin123', first_name: 'Juan', last_name: 'Dela Cruz', phone: '09987654321', address: '123 Main Street', role: 'resident', photo_url: null, created_at: now } },
            { upsert: true }
        );
        
        res.json({ success: true, message: 'Demo accounts seeded' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDb();
        
        const user = await db.collection('users').findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        if (user.password !== password) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: {
                id: user._id,
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
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ id: user._id, email: user.email, first_name: user.first_name, last_name: user.last_name, phone: user.phone, address: user.address, role: user.role, photo_url: user.photo_url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { first_name, last_name, phone, address } = req.body;
        await db.collection('users').updateOne(
            { _id: new ObjectId(req.user.id) },
            { $set: { first_name, last_name, phone, address } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const users = await db.collection('users').find({}, { projection: { password: 0 } }).toArray();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { email, first_name, last_name, phone, address, role } = req.body;
        await db.collection('users').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { email, first_name, last_name, phone, address, role } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/document-types', async (req, res) => {
    try {
        const db = getDb();
        const types = await db.collection('documentTypes').find().toArray();
        res.json(types);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/document-types', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { name, description, price, requirements } = req.body;
        await db.collection('documentTypes').insertOne({ name, description, price, requirements });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/document-types/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { name, description, price, requirements } = req.body;
        await db.collection('documentTypes').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { name, description, price, requirements } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/document-types/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        await db.collection('documentTypes').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/documents', async (req, res) => {
    try {
        const db = getDb();
        const documents = await db.collection('documentApplications').find().toArray();
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/my-documents', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const documents = await db.collection('documentApplications').find({ user_id: new ObjectId(req.user.id) }).toArray();
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/documents', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { type, applicant_name, description, payment_method } = req.body;
        const now = new Date();
        const result = await db.collection('documentApplications').insertOne({
            user_id: new ObjectId(req.user.id),
            type,
            applicant_name,
            description,
            payment_method,
            status: 'pending',
            created_at: now
        });
        res.json({ success: true, id: result.insertedId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/documents/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { status, remarks } = req.body;
        await db.collection('documentApplications').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status, remarks, updated_at: new Date() } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/officials', async (req, res) => {
    try {
        const db = getDb();
        const officials = await db.collection('officials').find().toArray();
        res.json(officials);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/officials', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { name, position, term, photo_url } = req.body;
        await db.collection('officials').insertOne({ name, position, term, photo_url });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/officials/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { name, position, term, photo_url } = req.body;
        await db.collection('officials').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { name, position, term, photo_url } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/officials/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        await db.collection('officials').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/ordinances', async (req, res) => {
    try {
        const db = getDb();
        const ordinances = await db.collection('ordinances').find().toArray();
        res.json(ordinances);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ordinances', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { title, description, status, date_enacted } = req.body;
        await db.collection('ordinances').insertOne({ title, description, status, date_enacted: new Date(date_enacted) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/ordinances/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { title, description, status, date_enacted } = req.body;
        await db.collection('ordinances').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { title, description, status, date_enacted: new Date(date_enacted) } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/ordinances/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        await db.collection('ordinances').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/projects', async (req, res) => {
    try {
        const db = getDb();
        const projects = await db.collection('projects').find().toArray();
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/projects', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { name, description, status, budget, start_date } = req.body;
        await db.collection('projects').insertOne({ name, description, status, budget: parseInt(budget), start_date: new Date(start_date) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/projects/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { name, description, status, budget, start_date } = req.body;
        await db.collection('projects').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { name, description, status, budget: parseInt(budget), start_date: new Date(start_date) } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/projects/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        await db.collection('projects').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/budget', async (req, res) => {
    try {
        const db = getDb();
        const budget = await db.collection('budget').find().toArray();
        res.json(budget);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/budget', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { year, category, amount, description } = req.body;
        await db.collection('budget').insertOne({ year: parseInt(year), category, amount: parseInt(amount), description });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/budget/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        await db.collection('budget').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/events', async (req, res) => {
    try {
        const db = getDb();
        const events = await db.collection('events').find().toArray();
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/events', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { name, date, location, description } = req.body;
        await db.collection('events').insertOne({ name, date: new Date(date), location, description });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/events/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { name, date, location, description } = req.body;
        await db.collection('events').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { name, date: new Date(date), location, description } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/events/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        await db.collection('events').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/announcements', async (req, res) => {
    try {
        const db = getDb();
        const announcements = await db.collection('announcements').find().toArray();
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/announcements', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { title, content, date, priority } = req.body;
        await db.collection('announcements').insertOne({ title, content, date: new Date(date), priority });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/announcements/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { title, content, date, priority } = req.body;
        await db.collection('announcements').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { title, content, date: new Date(date), priority } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/announcements/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        await db.collection('announcements').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/hotlines', async (req, res) => {
    try {
        const db = getDb();
        const hotlines = await db.collection('hotlines').find().toArray();
        res.json(hotlines);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/hotlines', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { name, number, category } = req.body;
        await db.collection('hotlines').insertOne({ name, number, category });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/hotlines/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { name, number, category } = req.body;
        await db.collection('hotlines').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { name, number, category } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/hotlines/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        await db.collection('hotlines').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/evacuation-centers', async (req, res) => {
    try {
        const db = getDb();
        const centers = await db.collection('evacuationCenters').find().toArray();
        res.json(centers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/evacuation-centers', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { name, capacity, address, facilities } = req.body;
        await db.collection('evacuationCenters').insertOne({ name, capacity: parseInt(capacity), address, facilities });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/evacuation-centers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { name, capacity, address, facilities } = req.body;
        await db.collection('evacuationCenters').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { name, capacity: parseInt(capacity), address, facilities } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/evacuation-centers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        await db.collection('evacuationCenters').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/businesses', async (req, res) => {
    try {
        const db = getDb();
        const businesses = await db.collection('businesses').find().toArray();
        res.json(businesses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/businesses', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { name, type, address, description } = req.body;
        await db.collection('businesses').insertOne({
            owner_id: new ObjectId(req.user.id),
            name, type, address, description,
            status: 'pending',
            created_at: new Date()
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/businesses/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { status } = req.body;
        await db.collection('businesses').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/incidents', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const incidents = await db.collection('incidents').find({ user_id: new ObjectId(req.user.id) }).toArray();
        res.json(incidents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/incidents', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const { type, location, description } = req.body;
        await db.collection('incidents').insertOne({
            user_id: new ObjectId(req.user.id),
            type, location, description,
            status: 'pending',
            created_at: new Date()
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const db = getDb();
        const settings = await db.collection('settings').findOne({});
        res.json(settings || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/settings', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const db = getDb();
        const { gcash_number, business_name } = req.body;
        await db.collection('settings').updateOne({}, { $set: { gcash_number, business_name } }, { upsert: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const db = getDb();
        const usersCount = await db.collection('users').countDocuments();
        const documentsCount = await db.collection('documentApplications').countDocuments();
        const businessesCount = await db.collection('businesses').countDocuments();
        const incidentsCount = await db.collection('incidents').countDocuments();
        res.json({ usersCount, documentsCount, businessesCount, incidentsCount });
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
