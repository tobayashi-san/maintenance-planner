import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import { config } from 'dotenv';
import db, { initDb } from './db.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import { addDays, addWeeks, addMonths, addYears, subYears } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config(); // Load .env

// --- Security: warn if JWT_SECRET is weak ---
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY || SECRET_KEY === 'secure-random-secret-key-12345' || SECRET_KEY.length < 32) {
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: JWT_SECRET is missing or too weak. Set a strong secret in .env before running in production.');
        process.exit(1);
    } else {
        console.warn('WARNING: JWT_SECRET is weak. Set a strong secret in .env for production.');
    }
}

const app = express();

const appUrl = (process.env.APP_URL || '').trim();
const isHttpsDeployment = appUrl.startsWith('https://');

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            upgradeInsecureRequests: isHttpsDeployment ? [] : null,
        },
    },
    strictTransportSecurity: isHttpsDeployment,
}));
app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173'),
    credentials: true,
}));
app.use(express.json());

// Initialize Database
initDb();

// Uploads folder
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}-${file.originalname}`)
});

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'application/zip',
]);

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${file.mimetype}`));
        }
    },
});

// --- Email Helper ---
const getSmtpTransport = async () => {
    return new Promise((resolve) => {
        db.get("SELECT value FROM settings WHERE key = 'smtp'", (err, row) => {
            if (err || !row) resolve(null);
            else {
                try {
                    const settings = JSON.parse(row.value);
                    const transporter = nodemailer.createTransport({
                        host: settings.host,
                        port: settings.port,
                        auth: { user: settings.user, pass: settings.password }
                    });
                    resolve({ transporter, from: settings.fromEmail });
                } catch (e) { resolve(null); }
            }
        });
    });
};

const getSetting = (key) => new Promise((resolve) => {
    db.get("SELECT value FROM settings WHERE key = ?", [key], (err, row) => {
        if (err || !row) resolve(null);
        else resolve(row.value);
    });
});

const getPublicAppUrl = async () => {
    const savedUrl = await getSetting('publicAppUrl');
    return savedUrl || process.env.APP_URL || null;
};

const getBaseEmailHtml = (content) => `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:'Segoe UI',sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f4f4f4}
.container{max-width:600px;margin:20px auto;background:#fff;border-radius:4px;overflow:hidden;border:1px solid #e5e7eb}
.header{background:#1d4ed8;color:#fff;padding:20px;text-align:center}
.header h1{margin:0;font-size:20px;font-weight:600}
.content{padding:24px}
.task-card{background:#f8fafc;border-left:3px solid #1d4ed8;padding:12px 16px;margin:16px 0;border-radius:2px}
.label{font-size:11px;text-transform:uppercase;color:#6b7280;font-weight:600;letter-spacing:0.05em;margin-bottom:2px}
.value{font-size:14px;color:#111827;margin-bottom:12px;font-weight:500}
.footer{background:#f8fafc;padding:16px;text-align:center;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb}
.button{display:inline-block;padding:10px 20px;background:#1d4ed8;color:white;text-decoration:none;border-radius:4px;font-weight:600;margin-top:16px}
</style></head><body>
<div class="container">
<div class="header"><h1>Wartungskalender</h1></div>
<div class="content">${content}</div>
<div class="footer"><p>&copy; ${new Date().getFullYear()} Wartungskalender</p></div>
</div></body></html>`;

const getReminderEmailHtml = (task, appUrl) => getBaseEmailHtml(`
<h2 style="color:#111827;margin-top:0">Task Due Soon</h2>
<p>This task is due in <strong>${task.reminderDays} day(s)</strong>.</p>
<div class="task-card">
<div class="label">Task</div><div class="value">${task.title}</div>
<div class="label">Due Date</div><div class="value">${new Date(task.date).toLocaleDateString()}</div>
<div class="label">Description</div><div class="value" style="white-space:pre-wrap">${task.description || 'No description.'}</div>
</div>
<div style="text-align:center">${appUrl ? `<a href="${appUrl}" class="button">View Dashboard</a>` : ''}</div>`);

// --- Constants ---
const PORT = process.env.PORT || 3000;

// --- Helpers ---
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const normalizeOccurrenceDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const toUtcTimestamp = (date) => new Date(date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
const toDateValue = (date) => new Date(date).toISOString().split('T')[0].replace(/-/g, '');
const escapeIcs = (str) => (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const foldLine = (line) => {
    if (line.length <= 75) return line;
    let result = line.substring(0, 75);
    for (let i = 75; i < line.length; i += 74) {
        result += '\r\n ' + line.substring(i, i + 74);
    }
    return result;
};
const getOccurrenceKey = (taskId, occurrenceDate) => `${taskId}::${new Date(occurrenceDate).toISOString()}`;
const getDateWithOffset = (date, amount, recurrence) => {
    switch (recurrence) {
        case 'daily':
            return addDays(date, amount);
        case 'weekly':
            return addWeeks(date, amount);
        case 'monthly':
            return addMonths(date, amount);
        case 'yearly':
            return addYears(date, amount);
        default:
            return date;
    }
};
const expandTasksForCalendar = (tasks, overrides, start, end) => {
    const instances = [];
    const overrideMap = new Map((overrides || []).map((override) => [getOccurrenceKey(override.taskId, override.occurrenceDate), override]));

    tasks.forEach((task) => {
        if (!task.date) return;
        const taskDate = new Date(task.date);

        if (task.recurrence === 'none') {
            if (taskDate >= start && taskDate <= end) {
                instances.push({
                    ...task,
                    originalTaskId: task.id,
                    occurrenceDate: task.date,
                    date: task.date,
                    status: task.status,
                    completionNote: task.completionNote || null,
                });
            }
            return;
        }

        let currentDate = new Date(taskDate);
        const recurrenceEnd = task.recurrenceEndDate ? new Date(task.recurrenceEndDate) : end;
        const effectiveEnd = recurrenceEnd < end ? recurrenceEnd : end;

        while (currentDate <= effectiveEnd) {
            const occurrenceDate = currentDate.toISOString();
            const override = overrideMap.get(getOccurrenceKey(task.id, occurrenceDate));
            const displayDate = override?.date ? new Date(override.date) : new Date(currentDate);

            if (!override?.skipped && displayDate >= start && displayDate <= end) {
                instances.push({
                    ...task,
                    id: `${task.id}__${occurrenceDate}`,
                    originalTaskId: task.id,
                    occurrenceDate,
                    date: displayDate.toISOString(),
                    status: override?.status || task.status || 'pending',
                    completionNote: override?.completionNote ?? task.completionNote ?? null,
                });
            }

            currentDate = getDateWithOffset(currentDate, task.recurrenceInterval || 1, task.recurrence);
        }
    });

    overrides.forEach((override) => {
        if (!override?.date || override.skipped) return;
        const task = tasks.find((entry) => entry.id === override.taskId);
        if (!task || task.recurrence === 'none') return;
        const alreadyIncluded = instances.some((instance) =>
            instance.originalTaskId === override.taskId && instance.occurrenceDate === new Date(override.occurrenceDate).toISOString()
        );
        const movedDate = new Date(override.date);
        if (!alreadyIncluded && movedDate >= start && movedDate <= end) {
            instances.push({
                ...task,
                id: `${task.id}__${override.occurrenceDate}`,
                originalTaskId: task.id,
                occurrenceDate: new Date(override.occurrenceDate).toISOString(),
                date: movedDate.toISOString(),
                status: override.status || task.status || 'pending',
                completionNote: override.completionNote ?? task.completionNote ?? null,
            });
        }
    });

    return instances.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// --- Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const authenticateDownload = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1];
    const token = bearerToken || req.query.token;
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

const canManageTaskOccurrence = (task, user) => {
    if (!task || !user) return false;
    if (user.role === 'admin') return true;
    try {
        const assigneeIds = JSON.parse(task.assigneeIds || '[]');
        return assigneeIds.includes(user.id);
    } catch {
        return false;
    }
};
const canManageTask = (task, user) => {
    if (!task || !user) return false;
    if (user.role === 'admin') return true;
    try {
        const assigneeIds = JSON.parse(task.assigneeIds || '[]');
        return assigneeIds.includes(user.id);
    } catch {
        return false;
    }
};

// --- Initialization ---
const createDefaultAdmin = () => {
    db.get("SELECT count(*) as count FROM users", async (err, row) => {
        if (!err && row.count === 0) {
            const id = crypto.randomUUID();
            const password = await bcrypt.hash('admin', 10);
            db.run("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
                [id, 'Admin', 'admin@admin.com', password, 'admin'],
                (err) => { if (!err) console.log('Default admin created: admin@admin.com / admin'); }
            );
        }
    });
};

const migrateDb = () => {
    db.run("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, color TEXT)");
    db.run("ALTER TABLE tasks ADD COLUMN reminderDays INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE tasks ADD COLUMN lastReminderSent TEXT", () => {});
    db.run("ALTER TABLE tasks ADD COLUMN categoryId TEXT", () => {});
    db.run("ALTER TABLE tasks ADD COLUMN completionNote TEXT", () => {});
    db.run(`CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        recurrence TEXT DEFAULT 'none',
        recurrenceInterval INTEGER DEFAULT 1,
        recurrenceEndDate TEXT,
        assigneeIds TEXT DEFAULT '[]',
        reminderDays INTEGER DEFAULT 0,
        categoryId TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS task_attachments (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        filename TEXT NOT NULL,
        originalName TEXT NOT NULL,
        size INTEGER,
        uploadedAt TEXT
    )`);
    db.run("ALTER TABLE users ADD COLUMN calendarToken TEXT", () => {
        db.all("SELECT id FROM users WHERE calendarToken IS NULL", [], (err, rows) => {
            if (!err && rows) {
                rows.forEach(r => {
                    db.run("UPDATE users SET calendarToken = ? WHERE id = ?", [crypto.randomBytes(16).toString('hex'), r.id]);
                });
            }
        });
    });
};

// Run after initDb() — SQLite serializes ops so no race condition
createDefaultAdmin();
migrateDb();

// --- Background Jobs ---
const checkReminders = async () => {
    const now = new Date();
    db.all("SELECT * FROM tasks WHERE reminderDays > 0 AND status != 'completed'", async (err, tasks) => {
        if (err || !tasks) return;
        for (const task of tasks) {
            const dueDate = new Date(task.date);
            const reminderDate = new Date(dueDate);
            reminderDate.setDate(dueDate.getDate() - task.reminderDays);
            const sameDay = reminderDate.toDateString() === now.toDateString();
            const alreadySentToday = task.lastReminderSent && new Date(task.lastReminderSent).toDateString() === now.toDateString();
            if (sameDay && !alreadySentToday) {
                const assignees = JSON.parse(task.assigneeIds || '[]');
                if (assignees.length > 0) {
                    const cfg = await getSmtpTransport();
                    const appUrl = await getPublicAppUrl();
                    if (cfg) {
                        const emails = await Promise.all(assignees.map(uid => new Promise(resolve => {
                            db.get("SELECT email FROM users WHERE id = ?", [uid], (e, r) => resolve(r ? r.email : null));
                        })));
                        const validEmails = emails.filter(e => e);
                        if (validEmails.length > 0) {
                            cfg.transporter.sendMail({
                                from: cfg.from, to: validEmails.join(', '),
                                subject: `Reminder: ${task.title} is due in ${task.reminderDays} day(s)`,
                                html: getReminderEmailHtml(task, appUrl)
                            }, (error) => {
                                if (!error) db.run("UPDATE tasks SET lastReminderSent = ? WHERE id = ?", [now.toISOString(), task.id]);
                            });
                        }
                    }
                }
            }
        }
    });
};
setInterval(checkReminders, 60 * 60 * 1000);
setTimeout(checkReminders, 5000);

// --- Rate Limiters ---
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const calendarLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many requests',
    standardHeaders: true,
    legacyHeaders: false,
});

// ============================================================
// ROUTES
// ============================================================

// 1. Auth
app.post('/api/auth/login', loginLimiter, (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
        const { password: _, ...userWithoutPassword } = user;
        
        // Ensure calendarToken exists (lazy generation if missing)
        if (!user.calendarToken) {
            const newCalendarToken = crypto.randomBytes(16).toString('hex');
            db.run("UPDATE users SET calendarToken = ? WHERE id = ?", [newCalendarToken, user.id]);
            userWithoutPassword.calendarToken = newCalendarToken;
        }

        res.json({ user: userWithoutPassword, token });
    });
});

app.put('/api/auth/password', authenticateToken, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    db.get("SELECT password FROM users WHERE id = ?", [req.user.id], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.sendStatus(404);
        const match = await bcrypt.compare(currentPassword, row.password);
        if (!match) return res.status(401).json({ error: 'Current password incorrect' });
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.run("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, req.user.id], (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ message: 'Password updated' });
        });
    });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get("SELECT id, name, email, role, calendarToken FROM users WHERE id = ?", [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.sendStatus(404);
        
        // Lazy generation for existing logged in users
        if (!user.calendarToken) {
            const newCalendarToken = crypto.randomBytes(16).toString('hex');
            db.run("UPDATE users SET calendarToken = ? WHERE id = ?", [newCalendarToken, user.id]);
            user.calendarToken = newCalendarToken;
        }
        res.json(user);
    });
});

// 2. Users
app.get('/api/users', authenticateToken, (req, res) => {
    db.all("SELECT id, name, email, role FROM users", [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    const { id, name, email, password, role } = req.body;
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (!password) return res.status(400).json({ error: 'Password is required' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const calendarToken = crypto.randomBytes(16).toString('hex');
    db.run("INSERT INTO users (id, name, email, password, role, calendarToken) VALUES (?, ?, ?, ?, ?, ?)",
        [id, name, email, hashedPassword, role, calendarToken],
        (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ id, name, email, role, calendarToken });
        }
    );
});

app.put('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
    const { name, email, role } = req.body;
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    db.run("UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?",
        [name, email, role, req.params.id],
        (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ message: 'User updated' });
        }
    );
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: 'User deleted' });
    });
});

// 3. Tasks
app.get('/api/tasks', authenticateToken, (req, res) => {
    db.all("SELECT * FROM tasks", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const tasks = rows.map(t => ({ ...t, assigneeIds: t.assigneeIds ? JSON.parse(t.assigneeIds) : [] }));
        res.json(tasks);
    });
});

app.post('/api/tasks', authenticateToken, requireAdmin, (req, res) => {
    const t = req.body;
    const interval = parseInt(t.recurrenceInterval, 10);
    if (isNaN(interval) || interval < 1) {
        return res.status(400).json({ error: 'recurrenceInterval must be a positive integer' });
    }
    db.run(`INSERT INTO tasks (id, title, date, description, status, recurrence, recurrenceInterval, recurrenceEndDate, assigneeIds, reminderDays, categoryId, completionNote)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.title, t.date, t.description, t.status, t.recurrence, interval, t.recurrenceEndDate, JSON.stringify(t.assigneeIds), t.reminderDays || 0, t.categoryId, t.completionNote || null],
        (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json(t);
        }
    );
});

app.put('/api/tasks/:id', authenticateToken, requireAdmin, (req, res) => {
    const t = req.body;
    const interval = parseInt(t.recurrenceInterval, 10);
    if (isNaN(interval) || interval < 1) {
        return res.status(400).json({ error: 'recurrenceInterval must be a positive integer' });
    }
    db.run(`UPDATE tasks SET title=?, date=?, description=?, status=?, recurrence=?, recurrenceInterval=?, recurrenceEndDate=?, assigneeIds=?, reminderDays=?, categoryId=?, completionNote=? WHERE id=?`,
        [t.title, t.date, t.description, t.status, t.recurrence, interval, t.recurrenceEndDate, JSON.stringify(t.assigneeIds), t.reminderDays || 0, t.categoryId, t.completionNote || null, req.params.id],
        (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json(t);
        }
    );
});

app.put('/api/tasks/:id/status', authenticateToken, (req, res) => {
    const { status, completionNote } = req.body;
    const allowedStatuses = ['pending', 'completed', 'canceled'];
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    db.get("SELECT * FROM tasks WHERE id = ?", [req.params.id], (taskErr, task) => {
        if (taskErr) return res.status(500).json({ error: taskErr.message });
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (!canManageTask(task, req.user)) {
            return res.status(403).json({ error: 'Not allowed to update this task' });
        }

        db.run(
            "UPDATE tasks SET status = ?, completionNote = ? WHERE id = ?",
            [status, completionNote || null, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({
                    ...task,
                    assigneeIds: task.assigneeIds ? JSON.parse(task.assigneeIds) : [],
                    status,
                    completionNote: completionNote || null,
                });
            }
        );
    });
});

app.delete('/api/tasks/:id', authenticateToken, requireAdmin, (req, res) => {
    // Also delete attachments from disk
    db.all("SELECT filename FROM task_attachments WHERE taskId = ?", [req.params.id], (err, rows) => {
        if (!err && rows) {
            rows.forEach(row => {
                const filePath = path.join(uploadsDir, row.filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            });
            db.run("DELETE FROM task_attachments WHERE taskId = ?", [req.params.id]);
        }
        db.run("DELETE FROM tasks WHERE id = ?", [req.params.id], (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ message: 'Task deleted' });
        });
    });
});

// 4. Attachments
app.get('/api/tasks/:id/attachments', authenticateToken, (req, res) => {
    db.all("SELECT * FROM task_attachments WHERE taskId = ?", [req.params.id], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows || []);
    });
});

app.post('/api/tasks/:id/attachments', authenticateToken, requireAdmin, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const id = crypto.randomUUID();
    const { filename, originalname, size } = req.file;
    db.run("INSERT INTO task_attachments (id, taskId, filename, originalName, size, uploadedAt) VALUES (?, ?, ?, ?, ?, ?)",
        [id, req.params.id, filename, originalname, size, new Date().toISOString()],
        (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ id, taskId: req.params.id, filename, originalName: originalname, size, uploadedAt: new Date().toISOString() });
        }
    );
});

app.delete('/api/attachments/:id', authenticateToken, requireAdmin, (req, res) => {
    db.get("SELECT filename FROM task_attachments WHERE id = ?", [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Attachment not found' });
        const filePath = path.join(uploadsDir, row.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        db.run("DELETE FROM task_attachments WHERE id = ?", [req.params.id], (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ message: 'Attachment deleted' });
        });
    });
});

app.get('/api/uploads/:filename', authenticateDownload, (req, res) => {
    const filename = req.params.filename;
    // Prevent path traversal: resolve and ensure file is within uploadsDir
    const filePath = path.resolve(uploadsDir, filename);
    if (!filePath.startsWith(path.resolve(uploadsDir) + path.sep)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath);
});

// 4b. Occurrence overrides
app.get('/api/tasks/occurrences', authenticateToken, (req, res) => {
    db.all("SELECT * FROM task_occurrence_overrides", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json((rows || []).map((row) => ({
            ...row,
            skipped: Boolean(row.skipped),
        })));
    });
});

app.put('/api/tasks/:id/occurrences', authenticateToken, (req, res) => {
    const occurrenceDate = normalizeOccurrenceDate(req.body.occurrenceDate);
    const overrideDate = req.body.date ? normalizeOccurrenceDate(req.body.date) : null;

    if (!occurrenceDate) {
        return res.status(400).json({ error: 'A valid occurrenceDate is required' });
    }

    db.get("SELECT id, assigneeIds FROM tasks WHERE id = ?", [req.params.id], (taskErr, task) => {
        if (taskErr) return res.status(500).json({ error: taskErr.message });
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (!canManageTaskOccurrence(task, req.user)) {
            return res.status(403).json({ error: 'Not allowed to update this occurrence' });
        }

        const payload = {
            id: crypto.randomUUID(),
            taskId: req.params.id,
            occurrenceDate,
            date: overrideDate,
            status: req.body.status || 'pending',
            completionNote: req.body.completionNote || null,
            skipped: req.body.skipped ? 1 : 0,
            updatedBy: req.user.id,
            updatedAt: new Date().toISOString(),
        };

        db.run(
            `INSERT INTO task_occurrence_overrides (id, taskId, occurrenceDate, date, status, completionNote, skipped, updatedBy, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(taskId, occurrenceDate) DO UPDATE SET
                date = excluded.date,
                status = excluded.status,
                completionNote = excluded.completionNote,
                skipped = excluded.skipped,
                updatedBy = excluded.updatedBy,
                updatedAt = excluded.updatedAt`,
            [
                payload.id,
                payload.taskId,
                payload.occurrenceDate,
                payload.date,
                payload.status,
                payload.completionNote,
                payload.skipped,
                payload.updatedBy,
                payload.updatedAt,
            ],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ...payload, skipped: Boolean(payload.skipped) });
            }
        );
    });
});

app.delete('/api/tasks/:id/occurrences', authenticateToken, (req, res) => {
    const occurrenceDate = normalizeOccurrenceDate(req.query.occurrenceDate);
    if (!occurrenceDate) {
        return res.status(400).json({ error: 'A valid occurrenceDate is required' });
    }

    db.get("SELECT id, assigneeIds FROM tasks WHERE id = ?", [req.params.id], (taskErr, task) => {
        if (taskErr) return res.status(500).json({ error: taskErr.message });
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (!canManageTaskOccurrence(task, req.user)) {
            return res.status(403).json({ error: 'Not allowed to reset this occurrence' });
        }

        db.run(
            "DELETE FROM task_occurrence_overrides WHERE taskId = ? AND occurrenceDate = ?",
            [req.params.id, occurrenceDate],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Occurrence override removed' });
            }
        );
    });
});

// 5. Templates
app.get('/api/templates', authenticateToken, (req, res) => {
    db.all("SELECT * FROM templates", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json((rows || []).map(t => ({ ...t, assigneeIds: t.assigneeIds ? JSON.parse(t.assigneeIds) : [] })));
    });
});

app.post('/api/templates', authenticateToken, requireAdmin, (req, res) => {
    const t = req.body;
    db.run(`INSERT INTO templates (id, title, description, recurrence, recurrenceInterval, recurrenceEndDate, assigneeIds, reminderDays, categoryId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.title, t.description, t.recurrence || 'none', t.recurrenceInterval || 1, t.recurrenceEndDate, JSON.stringify(t.assigneeIds || []), t.reminderDays || 0, t.categoryId],
        (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json(t);
        }
    );
});

app.put('/api/templates/:id', authenticateToken, requireAdmin, (req, res) => {
    const t = req.body;
    db.run(`UPDATE templates SET title=?, description=?, recurrence=?, recurrenceInterval=?, recurrenceEndDate=?, assigneeIds=?, reminderDays=?, categoryId=? WHERE id=?`,
        [t.title, t.description, t.recurrence || 'none', t.recurrenceInterval || 1, t.recurrenceEndDate, JSON.stringify(t.assigneeIds || []), t.reminderDays || 0, t.categoryId, req.params.id],
        (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json(t);
        }
    );
});

app.delete('/api/templates/:id', authenticateToken, requireAdmin, (req, res) => {
    db.run("DELETE FROM templates WHERE id = ?", [req.params.id], (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: 'Template deleted' });
    });
});

// 6. Settings (SMTP)
app.post('/api/settings/smtp', authenticateToken, requireAdmin, (req, res) => {
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    stmt.run('smtp', JSON.stringify(req.body), (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: 'SMTP settings saved' });
    });
});

app.get('/api/settings/smtp', authenticateToken, requireAdmin, (req, res) => {
    db.get("SELECT value FROM settings WHERE key = 'smtp'", (err, row) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(row ? JSON.parse(row.value) : {});
    });
});

app.post('/api/settings/app-url', authenticateToken, requireAdmin, (req, res) => {
    const publicAppUrl = (req.body.publicAppUrl || '').trim();
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    stmt.run('publicAppUrl', publicAppUrl, (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ publicAppUrl });
    });
});

app.get('/api/settings/app-url', authenticateToken, async (req, res) => {
    try {
        const publicAppUrl = await getPublicAppUrl();
        res.json({ publicAppUrl: publicAppUrl || '' });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to load APP_URL' });
    }
});

// 7. Categories
app.get('/api/categories', authenticateToken, (req, res) => {
    db.all("SELECT * FROM categories", [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

app.post('/api/categories', authenticateToken, requireAdmin, (req, res) => {
    const { id, name, color } = req.body;
    db.run("INSERT INTO categories (id, name, color) VALUES (?, ?, ?)", [id, name, color], (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ id, name, color });
    });
});

app.delete('/api/categories/:id', authenticateToken, requireAdmin, (req, res) => {
    db.run("DELETE FROM categories WHERE id = ?", [req.params.id], (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: 'Category deleted' });
    });
});

// 8. Email
app.post('/api/email/send', authenticateToken, requireAdmin, async (req, res) => {
    const { to, subject, body, icalEvent } = req.body;
    const cfg = await getSmtpTransport();
    if (!cfg) return res.status(400).json({ error: 'SMTP settings not configured' });
    cfg.transporter.sendMail({
        from: cfg.from, to, subject, text: body,
        html: req.body.html || undefined,
        icalEvent: icalEvent ? { content: icalEvent, method: 'request' } : undefined
    }, (error, info) => {
        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Email sent', messageId: info.messageId });
    });
});

// 9. ICS Subscription (calendarToken via query param for Outlook compatibility)
app.get('/api/calendar.ics', calendarLimiter, (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(401).send('Unauthorized');
    // Find user by calendarToken
    db.get("SELECT id FROM users WHERE calendarToken = ?", [token], (err, user) => {
        if (err || !user) return res.status(403).send('Forbidden');

        db.all("SELECT * FROM tasks", [], (taskErr, taskRows) => {
            if (taskErr) return res.status(500).send('Error');
            db.all("SELECT * FROM task_occurrence_overrides", [], (overrideErr, overrideRows) => {
                if (overrideErr) return res.status(500).send('Error');

                const tasks = taskRows.map((task) => ({ ...task, assigneeIds: task.assigneeIds ? JSON.parse(task.assigneeIds) : [] }));
                const overrides = (overrideRows || []).map((row) => ({ ...row, skipped: Boolean(row.skipped) }));
                const rangeStart = subYears(new Date(), 1);
                const rangeEnd = addYears(new Date(), 3);
                const instances = expandTasksForCalendar(tasks, overrides, rangeStart, rangeEnd);
                const now = toUtcTimestamp(new Date());
                const ics = [
                    'BEGIN:VCALENDAR',
                    'VERSION:2.0',
                    'PRODID:-//Wartungskalender//EN',
                    'CALSCALE:GREGORIAN',
                    'METHOD:PUBLISH',
                    'X-WR-CALNAME:Wartungskalender',
                    'X-WR-TIMEZONE:Europe/Zurich',
                    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
                    'X-PUBLISHED-TTL:PT6H',
                ];

                instances.forEach((task) => {
                    const startDate = toDateValue(task.date);
                    const nextDate = addDays(new Date(task.date), 1);
                    const endDate = toDateValue(nextDate);

                    ics.push('BEGIN:VEVENT');
                    ics.push(`UID:${task.originalTaskId}-${startDate}@wartungskalender`);
                    ics.push(`DTSTAMP:${now}`);
                    ics.push(`DTSTART;VALUE=DATE:${startDate}`);
                    ics.push(`DTEND;VALUE=DATE:${endDate}`);
                    ics.push('X-MICROSOFT-CDO-ALLDAYEVENT:TRUE');
                    ics.push('TRANSP:TRANSPARENT');
                    ics.push(`SUMMARY:${escapeIcs(task.title)}`);
                    if (task.description) ics.push(`DESCRIPTION:${escapeIcs(task.description)}`);
                    if (task.completionNote) ics.push(`COMMENT:${escapeIcs(task.completionNote)}`);
                    ics.push(`STATUS:${task.status === 'completed' ? 'COMPLETED' : task.status === 'canceled' ? 'CANCELLED' : 'CONFIRMED'}`);
                    ics.push('END:VEVENT');
                });

                ics.push('END:VCALENDAR');

                res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
                res.setHeader('Content-Disposition', 'inline; filename="wartungskalender.ics"');
                res.setHeader('Cache-Control', 'no-store');
                res.send(ics.map(foldLine).join('\r\n') + '\r\n');
            });
        });
    });
});

// 10. Health
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serve Static Frontend only in production to avoid confusion during Vite dev
if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.json({
            status: 'ok',
            message: 'Development API server is running. Open the frontend on http://localhost:5173',
        });
    });
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
