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
            tracking_code TEXT,
            type TEXT,
            fee REAL DEFAULT 0,
            applicant_name TEXT,
            status TEXT DEFAULT 'pending',
            description TEXT,
            remarks TEXT,
            payment_method TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS document_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            slug TEXT UNIQUE,
            description TEXT,
            fee REAL DEFAULT 0,
            requirements TEXT,
            is_active INTEGER DEFAULT 1
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS officials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            position TEXT,
            term TEXT,
            photo_url TEXT
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS ordinances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ordinance_number TEXT,
            title TEXT,
            description TEXT,
            category TEXT,
            status TEXT DEFAULT 'active',
            date_enacted DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            status TEXT DEFAULT 'planned',
            budget REAL DEFAULT 0,
            target_date DATETIME,
            start_date DATETIME
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS budget (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER,
            category TEXT,
            amount REAL DEFAULT 0,
            description TEXT
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            event_date DATETIME,
            location TEXT,
            event_type TEXT,
            description TEXT
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            category TEXT,
            priority TEXT DEFAULT 'low'
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
            capacity INTEGER DEFAULT 0,
            address TEXT,
            current_occupancy INTEGER DEFAULT 0,
            facilities TEXT
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER,
            name TEXT,
            type TEXT,
            address TEXT,
            description TEXT,
            fee REAL DEFAULT 0,
            payment_method TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            type TEXT,
            location TEXT,
            description TEXT,
            status TEXT DEFAULT 'pending',
            action_taken TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gcash_number TEXT,
            business_name TEXT
        )
    `);
}

function seedData() {
    const users = getAll('SELECT * FROM users');
    if (users.length > 0) return;
    
    runQuery("INSERT INTO users (email, password, first_name, last_name, phone, address, role) VALUES (?, ?, ?, ?, ?, ?, ?)", 
        ['admin@barangay.gov', 'admin123', 'Admin', 'User', '09123456789', 'Barangay Hall', 'admin']);
    runQuery("INSERT INTO users (email, password, first_name, last_name, phone, address, role) VALUES (?, ?, ?, ?, ?, ?, ?)", 
        ['resident@example.com', 'admin123', 'Juan', 'Dela Cruz', '09987654321', '123 Main Street', 'resident']);
    
    runQuery("INSERT INTO document_types (name, slug, description, fee, requirements, is_active) VALUES (?, ?, ?, ?, ?, ?)",
        ['Barangay Clearance', 'barangay_clearance', 'Official clearance from barangay', 50, 'Valid ID', 1]);
    runQuery("INSERT INTO document_types (name, slug, description, fee, requirements, is_active) VALUES (?, ?, ?, ?, ?, ?)",
        ['Certificate of Residency', 'certificate_of_residency', 'Proof of residency', 50, 'Valid ID, Proof of address', 1]);
    runQuery("INSERT INTO document_types (name, slug, description, fee, requirements, is_active) VALUES (?, ?, ?, ?, ?, ?)",
        ['Business Permit', 'business_permit', 'Permit for business operations', 200, 'Business name, Valid ID', 1]);
    runQuery("INSERT INTO document_types (name, slug, description, fee, requirements, is_active) VALUES (?, ?, ?, ?, ?, ?)",
        ['Certificate of Indigency', 'certificate_of_indigency', 'Proof of financial need', 0, 'Valid ID', 1]);
    runQuery("INSERT INTO document_types (name, slug, description, fee, requirements, is_active) VALUES (?, ?, ?, ?, ?, ?)",
        ['Barangay ID', 'barangay_id', 'Official barangay identification', 100, 'Valid ID, Photo', 1]);
    
    runQuery("INSERT INTO officials (name, position, term) VALUES (?, ?, ?)", ['Hon. Maria Santos', 'Punong Barangay', '2022-2025']);
    runQuery("INSERT INTO officials (name, position, term) VALUES (?, ?, ?)", ['Hon. Jose Garcia', 'Kagawad', '2022-2025']);
    runQuery("INSERT INTO officials (name, position, term) VALUES (?, ?, ?)", ['Hon. Ana Reyes', 'Kagawad', '2022-2025']);
    runQuery("INSERT INTO officials (name, position, term) VALUES (?, ?, ?)", ['Hon. Carlos Lopez', 'Kagawad', '2022-2025']);
    runQuery("INSERT INTO officials (name, position, term) VALUES (?, ?, ?)", ['Hon. Rosa Martinez', 'Secretary', '2022-2025']);
    runQuery("INSERT INTO officials (name, position, term) VALUES (?, ?, ?)", ['Hon. Pedro Cruz', 'Treasurer', '2022-2025']);
    
    runQuery("INSERT INTO announcements (title, content, priority) VALUES (?, ?, ?)", ['Barangay Assembly', 'Monthly assembly this Saturday at 9 AM', 'high']);
    runQuery("INSERT INTO announcements (title, content, priority) VALUES (?, ?, ?)", ['Health Services', 'Free medical check-up next week', 'medium']);
    
    runQuery("INSERT INTO events (name, date, location, description) VALUES (?, ?, ?, ?)", ['Barangay Fiesta', '2026-03-25', 'Barangay Hall', 'Annual celebration']);
    runQuery("INSERT INTO events (name, date, location, description) VALUES (?, ?, ?, ?)", ['Medical Mission', '2026-04-10', 'Barangay Plaza', 'Free medical services']);
    
    runQuery("INSERT INTO ordinances (ordinance_number, title, description, category, status) VALUES (?, ?, ?, ?, ?)", ['ORD-001', 'Anti-Littering Ordinance', 'An ordinance prohibiting littering in public areas', 'environmental', 'active']);
    runQuery("INSERT INTO ordinances (ordinance_number, title, description, category, status) VALUES (?, ?, ?, ?, ?)", ['ORD-002', 'Noise Control Ordinance', 'An ordinance regulating noise levels in residential areas', 'security', 'active']);
    
    runQuery("INSERT INTO projects (name, description, status, budget) VALUES (?, ?, ?, ?)", ['Road Paving Project', 'Paving of main road', 'ongoing', 500000]);
    runQuery("INSERT INTO projects (name, description, status, budget) VALUES (?, ?, ?, ?)", ['Water System Improvement', 'Upgrade water supply', 'planned', 300000]);
    
    runQuery("INSERT INTO budget (year, category, amount, description) VALUES (?, ?, ?, ?)", [2026, 'Infrastructure', 1000000, 'Road and drainage']);
    runQuery("INSERT INTO budget (year, category, amount, description) VALUES (?, ?, ?, ?)", [2026, 'Health', 500000, 'Medical services']);
    runQuery("INSERT INTO budget (year, category, amount, description) VALUES (?, ?, ?, ?)", [2026, 'Education', 300000, 'School programs']);
    
    runQuery("INSERT INTO hotlines (name, number, category) VALUES (?, ?, ?)", ['Barangay Hall', '123-4567', 'barangay']);
    runQuery("INSERT INTO hotlines (name, number, category) VALUES (?, ?, ?)", ['Police', '911', 'emergency']);
    runQuery("INSERT INTO hotlines (name, number, category) VALUES (?, ?, ?)", ['Fire Department', '912', 'emergency']);
    
    runQuery("INSERT INTO evacuation_centers (name, capacity, address, facilities) VALUES (?, ?, ?, ?)", ['Barangay Hall', 100, 'Main Street', 'Water, Electricity']);
    runQuery("INSERT INTO evacuation_centers (name, capacity, address, facilities) VALUES (?, ?, ?, ?)", ['Community Center', 200, 'Park Avenue', 'Water, Electricity, Restroom']);
    
    runQuery("INSERT INTO settings (gcash_number, business_name) VALUES (?, ?)", ['09123456789', 'Barangay Management System']);
}

function runQuery(sql, params = []) {
    try {
        db.run(sql, params);
        saveDatabase();
        return { success: true };
    } catch (e) {
        console.error(e);
        return { success: false, error: e.message };
    }
}

function getAll(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    } catch (e) {
        console.error(e);
        return [];
    }
}

function getOne(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);
        let result = null;
        if (stmt.step()) {
            result = stmt.getAsObject();
        }
        stmt.free();
        return result;
    } catch (e) {
        console.error(e);
        return null;
    }
}

function saveDatabase() {
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
        console.error('Error saving database:', e);
    }
}

function getDb() {
    return { runQuery, getAll, getOne, saveDatabase };
}

module.exports = { initDatabase, runQuery, getAll, getOne, saveDatabase, getDb, db };
