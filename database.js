const { MongoClient } = require('mongodb');

let db = null;
let client = null;

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'barangay';

async function initDatabase() {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    
    await createIndexes();
    await seedData();
    
    console.log('Connected to MongoDB');
    return db;
}

async function createIndexes() {
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('documents').createIndex({ user_id: 1 });
    await db.collection('documentApplications').createIndex({ user_id: 1 });
    await db.collection('businesses').createIndex({ owner_id: 1 });
    await db.collection('incidents').createIndex({ user_id: 1 });
}

async function seedData() {
    const usersCount = await db.collection('users').countDocuments();
    if (usersCount > 0) return;

    const now = new Date();
    
    await db.collection('users').insertMany([
        { email: 'admin@barangay.gov', password: 'admin123', first_name: 'Admin', last_name: 'User', phone: '09123456789', address: 'Barangay Hall', role: 'admin', photo_url: null, created_at: now },
        { email: 'resident@example.com', password: 'admin123', first_name: 'Juan', last_name: 'Dela Cruz', phone: '09987654321', address: '123 Main Street', role: 'resident', photo_url: null, created_at: now }
    ]);

    await db.collection('officials').insertMany([
        { name: 'Hon. Maria Santos', position: 'Punong Barangay', term: '2022-2025', photo_url: null },
        { name: 'Hon. Jose Garcia', position: 'Kagawad', term: '2022-2025', photo_url: null },
        { name: 'Hon. Ana Reyes', position: 'Kagawad', term: '2022-2025', photo_url: null },
        { name: 'Hon. Carlos Lopez', position: 'Kagawad', term: '2022-2025', photo_url: null },
        { name: 'Hon. Rosa Martinez', position: 'Secretary', term: '2022-2025', photo_url: null },
        { name: 'Hon. Pedro Cruz', position: 'Treasurer', term: '2022-2025', photo_url: null }
    ]);

    await db.collection('documentTypes').insertMany([
        { name: 'Barangay Clearance', description: 'Official clearance from barangay', price: 50, requirements: 'Valid ID' },
        { name: 'Certificate of Residency', description: 'Proof of residency', price: 50, requirements: 'Valid ID, Proof of address' },
        { name: 'Business Permit', description: 'Permit for business operations', price: 200, requirements: 'Business name, Valid ID' },
        { name: 'Certificate of Indigency', description: 'Proof of financial need', price: 0, requirements: 'Valid ID' },
        { name: 'Barangay ID', description: 'Official barangay identification', price: 100, requirements: 'Valid ID, Photo' }
    ]);

    await db.collection('announcements').insertMany([
        { title: 'Barangay Assembly', content: 'Monthly assembly this Saturday at 9 AM', date: now, priority: 'high' },
        { title: 'Health Services', content: 'Free medical check-up next week', date: now, priority: 'medium' }
    ]);

    await db.collection('events').insertMany([
        { name: 'Barangay Fiesta', date: new Date('2026-03-25'), location: 'Barangay Hall', description: 'Annual celebration' },
        { name: 'Medical Mission', date: new Date('2026-04-10'), location: 'Barangay Plaza', description: 'Free medical services' }
    ]);

    await db.collection('ordinances').insertMany([
        { title: 'Ordinance No. 001', description: 'Anti-littering ordinance', status: 'active', date_enacted: now },
        { title: 'Ordinance No. 002', description: 'Noise control ordinance', status: 'active', date_enacted: now }
    ]);

    await db.collection('projects').insertMany([
        { name: 'Road Paving Project', description: 'Paving of main road', status: 'ongoing', budget: 500000, start_date: now },
        { name: 'Water System Improvement', description: 'Upgrade water supply', status: 'planned', budget: 300000, start_date: now }
    ]);

    await db.collection('budget').insertMany([
        { year: 2026, category: 'Infrastructure', amount: 1000000, description: 'Road and drainage' },
        { year: 2026, category: 'Health', amount: 500000, description: 'Medical services' },
        { year: 2026, category: 'Education', amount: 300000, description: 'School programs' }
    ]);

    await db.collection('hotlines').insertMany([
        { name: 'Barangay Hall', number: '123-4567', category: 'barangay' },
        { name: 'Police', number: '911', category: 'emergency' },
        { name: 'Fire Department', number: '912', category: 'emergency' }
    ]);

    await db.collection('evacuationCenters').insertMany([
        { name: 'Barangay Hall', capacity: 100, address: 'Main Street', facilities: 'Water, Electricity' },
        { name: 'Community Center', capacity: 200, address: 'Park Avenue', facilities: 'Water, Electricity, Restroom' }
    ]);

    await db.collection('settings').insertOne({ gcash_number: '09123456789', business_name: 'Barangay Management System' });
}

function getDb() {
    return db;
}

module.exports = { initDatabase, getDb };
