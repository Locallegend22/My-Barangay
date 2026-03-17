const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;

const DB_PATH = path.join(__dirname, 'barangay.db');

async function initDatabase() {
    const SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }
    
    createTables();
    seedData();
    saveDatabase();
    
    return db;
}

function createTables() {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            first_name TEXT,
            last_name TEXT,
            phone TEXT,
            address TEXT,
            role TEXT DEFAULT 'resident',
            photo_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            type TEXT,
            applicant_name TEXT,
            status TEXT DEFAULT 'pending',
            description TEXT,
            remarks TEXT,
            fee REAL DEFAULT 0,
            payment_method TEXT,
            payment_status TEXT DEFAULT 'unpaid',
            tracking_code TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    
    try { db.run("ALTER TABLE documents ADD COLUMN applicant_name TEXT"); } catch(e) {}
    
    db.run(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            document_id INTEGER,
            appointment_date DATE,
            appointment_time TIME,
            status TEXT DEFAULT 'scheduled',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (document_id) REFERENCES documents(id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_id INTEGER,
            type TEXT,
            description TEXT,
            location TEXT,
            status TEXT DEFAULT 'open',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reporter_id) REFERENCES users(id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS officials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            position TEXT,
            photo_url TEXT,
            phone TEXT,
            email TEXT,
            office_hours TEXT,
            sort_order INTEGER DEFAULT 0
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            category TEXT,
            priority TEXT DEFAULT 'normal',
            image_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER,
            name TEXT,
            type TEXT,
            address TEXT,
            permit_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS budget_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            amount REAL,
            category TEXT,
            report_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS ordinances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            category TEXT,
            ordinance_number TEXT,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            event_date DATE,
            location TEXT,
            event_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS hotlines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            phone TEXT,
            category TEXT,
            description TEXT
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS evacuation_centers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            address TEXT,
            capacity INTEGER,
            current_occupancy INTEGER DEFAULT 0,
            latitude REAL,
            longitude REAL
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS document_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            slug TEXT UNIQUE,
            description TEXT,
            fee REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            budget REAL,
            status TEXT DEFAULT 'planning',
            target_date DATE,
            completed_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            value TEXT
        )
    `);
}

function seedData() {
    const userCount = db.exec("SELECT COUNT(*) as count FROM users")[0]?.values[0][0] || 0;
    
    if (userCount === 0) {
        db.run(`INSERT INTO users (email, password, first_name, last_name, phone, role) VALUES (?, ?, ?, ?, ?, ?)`,
            ['admin@barangay.gov', 'admin123', 'Admin', 'User', '09123456789', 'admin']);
        
        db.run(`INSERT INTO users (email, password, first_name, last_name, phone, address, role) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['resident@example.com', 'admin123', 'Juan', 'Dela Cruz', '09987654321', '123 Main Street', 'resident']);
    }
    
    const officialCount = db.exec("SELECT COUNT(*) as count FROM officials")[0]?.values[0][0] || 0;
    
    if (officialCount === 0) {
        const officials = [
            ['Hon. Maria Santos', 'Barangay Captain', '', '09123456780', 'captain@barangay.gov', 'Mon-Fri: 8AM-5PM', 1],
            ['Hon. Pedro Reyes', 'Barangay Secretary', '', '09123456781', 'secretary@barangay.gov', 'Mon-Fri: 8AM-5PM', 2],
            ['Hon. Ana Garcia', 'Barangay Treasurer', '', '09123456782', 'treasurer@barangay.gov', 'Mon-Fri: 8AM-5PM', 3],
            ['Hon. Jose Cruz', 'Kagawad - Peace and Order', '', '09123456783', 'kagawad1@barangay.gov', 'Mon-Fri: 9AM-4PM', 4],
            ['Hon. Lisa Mendoza', 'Kagawad - Health', '', '09123456784', 'kagawad2@barangay.gov', 'Mon-Fri: 9AM-4PM', 5],
            ['Hon. Mark Torres', 'Kagawad - Infrastructure', '', '09123456785', 'kagawad3@barangay.gov', 'Mon-Fri: 9AM-4PM', 6],
            ['Hon. Sarah Bautista', 'Kagawad - Education', '', '09123456786', 'kagawad4@barangay.gov', 'Mon-Fri: 9AM-4PM', 7],
            ['Hon. Ryan Lim', 'SK Chairman', '', '09123456787', 'sk@barangay.gov', 'Mon-Sat: 10AM-6PM', 8]
        ];
        
        officials.forEach(o => {
            db.run(`INSERT INTO officials (name, position, photo_url, phone, email, office_hours, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`, o);
        });
    }
    
    const announcementCount = db.exec("SELECT COUNT(*) as count FROM announcements")[0]?.values[0][0] || 0;
    
    if (announcementCount === 0) {
        const announcements = [
            ['Barangay Assembly Day', 'All residents are hereby invited to attend the monthly barangay assembly this Saturday at 9:00 AM.', 'general', 'high', ''],
            ['Health Mission Schedule', 'Free medical check-up and medicines will be available this Sunday at the barangay hall.', 'health', 'normal', ''],
            ['Road Clearing Operations', 'The barangay will conduct road clearing operations next week. Please move parked vehicles.', 'infrastructure', 'normal', ''],
            ['New Online Document System', 'We are excited to announce our new online document application system. Please register to avail services.', 'announcement', 'normal', '']
        ];
        
        announcements.forEach(a => {
            db.run(`INSERT INTO announcements (title, content, category, priority, image_url) VALUES (?, ?, ?, ?, ?)`, a);
        });
    }
    
    const hotlinesCount = db.exec("SELECT COUNT(*) as count FROM hotlines")[0]?.values[0][0] || 0;
    
    if (hotlinesCount === 0) {
        const hotlines = [
            ['Barangay Tanod', '09123456001', 'security', '24/7 barangay security patrol'],
            ['Barangay Health Center', '09123456002', 'health', 'Health emergencies and consultations'],
            ['Fire Department', '09123456003', 'fire', 'Fire emergencies'],
            ['Police Station', '09123456004', 'police', 'Law enforcement assistance'],
            ['Emergency Ambulance', '09123456005', 'medical', 'Medical emergencies']
        ];
        
        hotlines.forEach(h => {
            db.run(`INSERT INTO hotlines (name, phone, category, description) VALUES (?, ?, ?, ?)`, h);
        });
    }
    
    const eventsCount = db.exec("SELECT COUNT(*) as count FROM events")[0]?.values[0][0] || 0;
    
    if (eventsCount === 0) {
        const events = [
            ['Monthly Clean-up Drive', 'Community clean-up at the main plaza', '2026-03-15', 'Main Plaza', 'community'],
            ['Health Mission', 'Free medical check-up and medicines', '2026-03-20', 'Barangay Hall', 'health'],
            ['Festa Celebration', 'Annual barangay fiesta celebration', '2026-04-01', 'Barangay Plaza', 'celebration'],
            ['SK General Assembly', 'SK youth assembly and planning', '2026-03-25', 'SK Center', 'meeting'],
            ['Disaster Preparedness Seminar', 'Earthquake and fire drill', '2026-03-30', 'Barangay Hall', 'education']
        ];
        
        events.forEach(e => {
            db.run(`INSERT INTO events (title, description, event_date, location, event_type) VALUES (?, ?, ?, ?, ?)`, e);
        });
    }
    
    const budgetCount = db.exec("SELECT COUNT(*) as count FROM budget_reports")[0]?.values[0][0] || 0;
    
    if (budgetCount === 0) {
        const budgets = [
            ['Barangay Infrastructure Fund', 'Road repair and maintenance', 150000, 'infrastructure', '2026-01-31'],
            ['Health Programs', 'Medical supplies and health missions', 80000, 'health', '2026-01-31'],
            ['Disaster Response Equipment', 'Emergency supplies and training', 50000, 'emergency', '2026-01-31'],
            ['SK Programs', 'Youth activities and trainings', 45000, 'youth', '2026-01-31'],
            ['Office Supplies', 'General administrative expenses', 25000, 'admin', '2026-01-31']
        ];
        
        budgets.forEach(b => {
            db.run(`INSERT INTO budget_reports (title, description, amount, category, report_date) VALUES (?, ?, ?, ?, ?)`, b);
        });
    }
    
    const ordinanceCount = db.exec("SELECT COUNT(*) as count FROM ordinances")[0]?.values[0][0] || 0;
    
    if (ordinanceCount === 0) {
        const ordinances = [
            ['Anti-Littering Ordinance', 'Regulation against improper waste disposal', 'environmental', 'ORD-001-2024'],
            ['Noise Control Ordinance', 'Regulation on permissible noise levels', 'environmental', 'ORD-002-2024'],
            ['Business Permit Ordinance', 'Requirements for operating businesses', 'business', 'ORD-003-2024'],
            ['Curfew Ordinance', 'Curfew hours for minors', 'security', 'ORD-004-2024'],
            ['Pet Ownership Ordinance', 'Regulations for pet owners', 'environmental', 'ORD-005-2024']
        ];
        
        ordinances.forEach(o => {
            db.run(`INSERT INTO ordinances (title, description, category, ordinance_number, status) VALUES (?, ?, ?, ?, ?)`, o);
        });
    }
    
    const evacuationCount = db.exec("SELECT COUNT(*) as count FROM evacuation_centers")[0]?.values[0][0] || 0;
    
    if (evacuationCount === 0) {
        const centers = [
            ['Barangay Hall Evacuation Center', 'Barangay Hall Building', 200, 45],
            ['Main Elementary School Gym', 'P. Gomez Street', 500, 120],
            ['Church Evacuation Center', 'St. John Parish Church', 300, 80],
            ['SK Youth Center', 'SK Building', 100, 25]
        ];
        
        centers.forEach(c => {
            db.run(`INSERT INTO evacuation_centers (name, address, capacity, current_occupancy) VALUES (?, ?, ?, ?)`, c);
        });
    }
    
    const docTypeCount = db.exec("SELECT COUNT(*) as count FROM document_types")[0]?.values[0][0] || 0;
    
    if (docTypeCount === 0) {
        const docTypes = [
            ['Barangay Clearance', 'barangay_clearance', 'Required for employment, travel, and legal purposes', 100],
            ['Certificate of Indigency', 'certificate_of_indigency', 'For government assistance and discounts', 50],
            ['Certificate of Residency', 'certificate_of_residency', 'Proof of residence within the barangay', 75],
            ['Business Permit', 'business_permit', 'For operating a business in the barangay', 200],
            ['Cedula (Community Tax)', 'cedula', 'Annual community tax certificate', 15],
            ['Building Permit', 'building_permit', 'For construction and renovation projects', 500]
        ];
        
        docTypes.forEach(d => {
            db.run(`INSERT INTO document_types (name, slug, description, fee) VALUES (?, ?, ?, ?)`, d);
        });
    }
    
    const projectCount = db.exec("SELECT COUNT(*) as count FROM projects")[0]?.values[0][0] || 0;
    
    if (projectCount === 0) {
        const projects = [
            ['Road Paving Project', 'Paving of 500 meters of barangay roads', 500000, 'completed', '2026-01-31', '2026-01-15'],
            ['Health Center Renovation', 'Renovation and expansion of barangay health center', 300000, 'ongoing', '2026-03-31', null],
            ['Park Improvement', 'Improvement of barangay park facilities', 150000, 'planning', '2026-06-30', null],
            ['Digital Transformation', 'Implementation of online services system', 200000, 'ongoing', '2026-03-31', null]
        ];
        
        projects.forEach(p => {
            db.run(`INSERT INTO projects (title, description, budget, status, target_date, completed_date) VALUES (?, ?, ?, ?, ?, ?)`, p);
        });
    }
}

function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
    return db;
}

function runQuery(sql, params = []) {
    try {
        db.run(sql, params);
        saveDatabase();
        return { success: true };
    } catch (error) {
        console.error('Query error:', error);
        return { success: false, error: error.message };
    }
}

function getAll(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        if (params.length > 0) {
            stmt.bind(params);
        }
        
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push(row);
        }
        stmt.free();
        return results;
    } catch (error) {
        console.error('Query error:', error);
        return [];
    }
}

function getOne(sql, params = []) {
    const results = getAll(sql, params);
    return results[0] || null;
}

module.exports = {
    initDatabase,
    getDb,
    runQuery,
    getAll,
    getOne,
    saveDatabase
};
