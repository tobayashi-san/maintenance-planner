import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Open database in the DB folder or root
const dbPath = join(__dirname, '../DB/database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

export const initDb = () => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            role TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT,
            date TEXT,
            description TEXT,
            status TEXT,
            recurrence TEXT,
            recurrenceInterval INTEGER,
            recurrenceEndDate TEXT,
            assigneeIds TEXT -- JSON string
        )`);

        // Settings table for SMTP
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS task_occurrence_overrides (
            id TEXT PRIMARY KEY,
            taskId TEXT NOT NULL,
            occurrenceDate TEXT NOT NULL,
            date TEXT,
            status TEXT,
            completionNote TEXT,
            skipped INTEGER DEFAULT 0,
            updatedBy TEXT,
            updatedAt TEXT,
            UNIQUE(taskId, occurrenceDate)
        )`);
    });
};

export default db;
