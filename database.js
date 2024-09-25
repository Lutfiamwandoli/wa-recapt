const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('bot_data.db');

// Buat tabel jika belum ada
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job TEXT,
        hunter TEXT,
        worker TEXT,
        fee INTEGER,
        hunterFee REAL,
        workerFee REAL,
        adminFee REAL,
        status TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS categories (
        name TEXT PRIMARY KEY
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS category_members (
        category TEXT,
        contactId TEXT,
        FOREIGN KEY(category) REFERENCES categories(name)
    )`);
});

module.exports = db;
