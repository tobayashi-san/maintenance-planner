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
import { addDays, addWeeks, addMonths, addYears, differenceInCalendarDays, startOfDay, startOfWeek, subYears } from 'date-fns';

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
    crossOriginOpenerPolicy: isHttpsDeployment,
    originAgentCluster: isHttpsDeployment,
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

const dbGetAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const dbAllAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
    });
});

const dbRunAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastID: this.lastID });
    });
});

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

const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const getReminderEmailHtml = (task, headline, intro, actions = []) => getBaseEmailHtml(`
<h2 style="color:#111827;margin-top:0">${escapeHtml(headline)}</h2>
<p>${escapeHtml(intro)}</p>
<div class="task-card">
<div class="label">Task</div><div class="value">${escapeHtml(task.title)}</div>
<div class="label">Due Date</div><div class="value">${escapeHtml(new Date(task.date).toLocaleDateString('de-CH'))}</div>
<div class="label">Description</div><div class="value" style="white-space:pre-wrap">${escapeHtml(task.description || 'Keine Beschreibung.')}</div>
</div>
<div style="text-align:center">${actions.map((action) => `<a href="${action.href}" class="button" style="${action.variant === 'secondary' ? 'background:#0f172a;margin-left:8px;' : ''}">${escapeHtml(action.label)}</a>`).join('')}</div>`);

const getWeeklyDigestEmailHtml = (userName, sections, appUrl) => getBaseEmailHtml(`
<h2 style="color:#111827;margin-top:0">Deine Wartungswoche</h2>
<p>Hallo ${escapeHtml(userName || 'Team')}, hier ist deine personliche Wochenubersicht.</p>
${sections.map((section) => `
    <div style="margin-bottom:24px">
        <div class="label" style="margin-bottom:8px">${escapeHtml(section.title)}</div>
        ${section.items.map((item) => `
            <div class="task-card" style="margin:12px 0">
                <div class="value" style="margin-bottom:8px">${escapeHtml(item.title)}</div>
                <div style="font-size:14px;color:#475569;margin-bottom:10px">
                    Fallig am ${escapeHtml(new Date(item.date).toLocaleDateString('de-CH'))}${item.description ? ` - ${escapeHtml(item.description)}` : ''}
                </div>
                <div>
                    ${item.openHref ? `<a href="${item.openHref}" class="button">Aufgabe offnen</a>` : ''}
                    ${item.completeHref ? `<a href="${item.completeHref}" class="button" style="background:#0f172a;margin-left:8px;">Direkt erledigen</a>` : ''}
                </div>
            </div>
        `).join('')}
    </div>
`).join('')}
<div style="text-align:center">${appUrl ? `<a href="${appUrl}/dashboard" class="button">Portal offnen</a>` : ''}</div>`);

// --- Constants ---
const PORT = process.env.PORT || 3000;

// --- Helpers ---
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const generateCalendarToken = () => crypto.randomBytes(32).toString('hex');
const normalizeAppUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
const parseAssigneeIds = (value) => {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};
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
const getReminderStageOffsets = (leadDays) => {
    const maxLead = Number(leadDays) || 0;
    const stages = new Set();
    if (maxLead > 0) stages.add(maxLead);
    [30, 7, 1].forEach((candidate) => {
        if (maxLead >= candidate) stages.add(candidate);
    });
    stages.add(0);
    stages.add(-1);
    return [...stages].sort((a, b) => b - a);
};
const getReminderStageLabel = (daysUntil) => {
    if (daysUntil > 1) return `in ${daysUntil} Tagen fallig`;
    if (daysUntil === 1) return 'morgen fallig';
    if (daysUntil === 0) return 'heute fallig';
    return 'seit gestern uberfallig';
};
const getReminderSubject = (task, daysUntil) => {
    if (daysUntil > 1) return `Erinnerung: ${task.title} ist in ${daysUntil} Tagen fallig`;
    if (daysUntil === 1) return `Erinnerung: ${task.title} ist morgen fallig`;
    if (daysUntil === 0) return `Heute fallig: ${task.title}`;
    return `Uberfallig: ${task.title}`;
};
const buildTaskPath = (task) => {
    const params = new URLSearchParams({ taskId: task.originalTaskId || task.id });
    if (task.occurrenceDate) params.set('occurrenceDate', task.occurrenceDate);
    return `/dashboard?${params.toString()}`;
};
const buildAbsoluteAppUrl = (appUrl, pathWithQuery) => {
    const base = normalizeAppUrl(appUrl);
    return base ? `${base}${pathWithQuery}` : null;
};
const buildEmailOpenLink = (appUrl, task) => buildAbsoluteAppUrl(appUrl, buildTaskPath(task));
const buildEmailActionToken = (payload) => jwt.sign(payload, SECRET_KEY, { expiresIn: '14d' });
const buildEmailCompleteLink = (task, userId) => {
    const token = buildEmailActionToken({
        action: 'complete',
        userId,
        taskId: task.originalTaskId || task.id,
        occurrenceDate: task.occurrenceDate || task.date,
    });
    return `/api/email/action?token=${encodeURIComponent(token)}`;
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
const loadExpandedTaskInstances = async (start, end) => {
    const taskRows = await dbAllAsync("SELECT * FROM tasks");
    const overrideRows = await dbAllAsync("SELECT * FROM task_occurrence_overrides");
    const tasks = taskRows.map((task) => ({ ...task, assigneeIds: parseAssigneeIds(task.assigneeIds) }));
    const overrides = overrideRows.map((row) => ({ ...row, skipped: Boolean(row.skipped) }));
    return expandTasksForCalendar(tasks, overrides, start, end).filter((task) => task.status !== 'completed' && task.status !== 'canceled');
};
const createOrUpdateOccurrenceOverride = async (taskId, occurrenceDate, payload) => {
    const normalizedOccurrenceDate = normalizeOccurrenceDate(occurrenceDate);
    if (!normalizedOccurrenceDate) throw new Error('Invalid occurrenceDate');

    const existing = await dbGetAsync(
        "SELECT id FROM task_occurrence_overrides WHERE taskId = ? AND occurrenceDate = ?",
        [taskId, normalizedOccurrenceDate]
    );

    const id = existing?.id || crypto.randomUUID();
    await dbRunAsync(
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
            id,
            taskId,
            normalizedOccurrenceDate,
            payload.date || null,
            payload.status || 'pending',
            payload.completionNote || null,
            payload.skipped ? 1 : 0,
            payload.updatedBy || null,
            payload.updatedAt || new Date().toISOString(),
        ]
    );
};
const reserveDispatch = async ({ kind, userId, taskId = '', occurrenceDate = '', dispatchKey }) => {
    const result = await dbRunAsync(
        `INSERT OR IGNORE INTO notification_dispatches (id, kind, userId, taskId, occurrenceDate, dispatchKey, sentAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), kind, userId, taskId, occurrenceDate, dispatchKey, new Date().toISOString()]
    );
    return result.changes > 0;
};
const buildReminderActions = (appUrl, task, userId) => {
    const openHref = buildEmailOpenLink(appUrl, task);
    const completePath = buildEmailCompleteLink(task, userId);
    return [
        openHref ? { href: openHref, label: 'Aufgabe offnen' } : null,
        appUrl ? { href: buildAbsoluteAppUrl(appUrl, completePath), label: 'Direkt erledigen', variant: 'secondary' } : null,
    ].filter(Boolean);
};
const sendReminderEmail = async (cfg, appUrl, user, task, daysUntil) => {
    const intro = `Die Aufgabe "${task.title}" ist ${getReminderStageLabel(daysUntil)}.`;
    const html = getReminderEmailHtml(task, getReminderSubject(task, daysUntil), intro, buildReminderActions(appUrl, task, user.id));
    await cfg.transporter.sendMail({
        from: cfg.from,
        to: user.email,
        subject: getReminderSubject(task, daysUntil),
        html,
        text: `${task.title} - fallig am ${new Date(task.date).toLocaleDateString('de-CH')}.`,
    });
};
const sendWeeklyDigestEmail = async (cfg, appUrl, user, upcomingTasks, overdueTasks) => {
    const toDigestItem = (task) => ({
        title: task.title,
        date: task.date,
        description: task.description || '',
        openHref: buildEmailOpenLink(appUrl, task),
        completeHref: appUrl ? buildAbsoluteAppUrl(appUrl, buildEmailCompleteLink(task, user.id)) : null,
    });

    const sections = [];
    if (overdueTasks.length > 0) {
        sections.push({ title: 'Uberfallig', items: overdueTasks.map(toDigestItem) });
    }
    if (upcomingTasks.length > 0) {
        sections.push({ title: 'Diese Woche fallig', items: upcomingTasks.map(toDigestItem) });
    }
    if (sections.length === 0) return;

    await cfg.transporter.sendMail({
        from: cfg.from,
        to: user.email,
        subject: 'Deine Wartungswoche',
        html: getWeeklyDigestEmailHtml(user.name, sections, normalizeAppUrl(appUrl)),
        text: `Uberfallig: ${overdueTasks.length}, diese Woche fallig: ${upcomingTasks.length}`,
    });
};
const renderCalendarFeed = (res, taskRows, overrideRows) => {
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
};
const serveCalendarFeed = (req, res) => {
    const token = String(req.params.token || req.query.token || '');
    if (!token) return res.status(401).send('Unauthorized');

    db.get("SELECT id FROM users WHERE calendarToken = ?", [token], (err, user) => {
        if (err || !user) return res.status(403).send('Forbidden');

        db.all("SELECT * FROM tasks", [], (taskErr, taskRows) => {
            if (taskErr) return res.status(500).send('Error');
            db.all("SELECT * FROM task_occurrence_overrides", [], (overrideErr, overrideRows) => {
                if (overrideErr) return res.status(500).send('Error');
                renderCalendarFeed(res, taskRows, overrideRows);
            });
        });
    });
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
    const assigneeIds = Array.isArray(task.assigneeIds) ? task.assigneeIds : parseAssigneeIds(task.assigneeIds);
    return assigneeIds.includes(user.id);
};
const canManageTask = (task, user) => {
    if (!task || !user) return false;
    if (user.role === 'admin') return true;
    const assigneeIds = Array.isArray(task.assigneeIds) ? task.assigneeIds : parseAssigneeIds(task.assigneeIds);
    return assigneeIds.includes(user.id);
};
const canManageTaskDefinition = (task, user) => {
    if (!task || !user) return false;
    if (user.role === 'admin') return true;
    return task.createdBy === user.id;
};
const canAccessAttachment = (user) => user?.role === 'admin';

// --- Initialization ---
const createDefaultAdmin = () => {
    db.get("SELECT count(*) as count FROM users", async (err, row) => {
        if (!err && row.count === 0) {
            const isProduction = process.env.NODE_ENV === 'production';
            const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').trim();
            const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || '';
            const adminName = (process.env.INITIAL_ADMIN_NAME || 'Admin').trim() || 'Admin';

            if (isProduction) {
                if (!isValidEmail(adminEmail) || adminPassword.length < 12) {
                    console.error('FATAL: No users exist and production bootstrap admin credentials are missing or too weak. Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (min. 12 chars).');
                    process.exit(1);
                }
            }

            const email = isProduction ? adminEmail : 'admin@admin.com';
            const plainPassword = isProduction ? adminPassword : 'admin';
            const id = crypto.randomUUID();
            const password = await bcrypt.hash(plainPassword, 10);
            db.run("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
                [id, adminName, email, password, 'admin'],
                (insertErr) => {
                    if (!insertErr) {
                        if (isProduction) {
                            console.log(`Initial admin created from environment: ${email}`);
                        } else {
                            console.log('Default admin created for development: admin@admin.com / admin');
                        }
                    }
                }
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
    db.run("ALTER TABLE tasks ADD COLUMN createdBy TEXT", () => {});
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
    db.run(`CREATE TABLE IF NOT EXISTS notification_dispatches (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        userId TEXT NOT NULL,
        taskId TEXT NOT NULL DEFAULT '',
        occurrenceDate TEXT NOT NULL DEFAULT '',
        dispatchKey TEXT NOT NULL,
        sentAt TEXT NOT NULL,
        UNIQUE(kind, userId, taskId, occurrenceDate, dispatchKey)
    )`);
    db.run("ALTER TABLE users ADD COLUMN calendarToken TEXT", () => {
        db.all("SELECT id FROM users WHERE calendarToken IS NULL", [], (err, rows) => {
            if (!err && rows) {
                rows.forEach(r => {
                    db.run("UPDATE users SET calendarToken = ? WHERE id = ?", [generateCalendarToken(), r.id]);
                });
            }
        });
    });
};

// Run after initDb() — SQLite serializes ops so no race condition
createDefaultAdmin();
migrateDb();

// --- Background Jobs ---
const sendReminderNotifications = async (now) => {
    const cfg = await getSmtpTransport();
    if (!cfg) return;

    const appUrl = normalizeAppUrl(await getPublicAppUrl());
    const taskRows = await dbAllAsync("SELECT MAX(COALESCE(reminderDays, 0)) as maxReminder FROM tasks");
    const maxReminderDays = Number(taskRows?.[0]?.maxReminder || 0);
    const rangeStart = addDays(startOfDay(now), -2);
    const rangeEnd = addDays(startOfDay(now), Math.max(maxReminderDays, 30) + 2);
    const taskInstances = await loadExpandedTaskInstances(rangeStart, rangeEnd);

    for (const task of taskInstances) {
        if (!task.assigneeIds?.length) continue;

        const daysUntil = differenceInCalendarDays(startOfDay(new Date(task.date)), startOfDay(now));
        const stages = getReminderStageOffsets(task.reminderDays);
        if (!stages.includes(daysUntil)) continue;

        const assigneeRows = await dbAllAsync(
            `SELECT id, name, email, role FROM users WHERE id IN (${task.assigneeIds.map(() => '?').join(',')})`,
            task.assigneeIds
        );

        for (const user of assigneeRows.filter((entry) => entry.email)) {
            const dispatchKey = `stage:${daysUntil}`;
            const reserved = await reserveDispatch({
                kind: 'task-reminder',
                userId: user.id,
                taskId: task.originalTaskId || task.id,
                occurrenceDate: task.occurrenceDate || task.date,
                dispatchKey,
            });

            if (!reserved) continue;

            try {
                await sendReminderEmail(cfg, appUrl, user, task, daysUntil);
                if (!task.isRecurringInstance) {
                    await dbRunAsync("UPDATE tasks SET lastReminderSent = ? WHERE id = ?", [now.toISOString(), task.originalTaskId || task.id]);
                }
            } catch (error) {
                console.error('Failed to send reminder email', error);
            }
        }
    }
};

const sendWeeklyDigests = async (now) => {
    if (now.getDay() !== 1) return;

    const cfg = await getSmtpTransport();
    if (!cfg) return;

    const appUrl = normalizeAppUrl(await getPublicAppUrl());
    const users = await dbAllAsync("SELECT id, name, email, role FROM users WHERE email IS NOT NULL AND email != ''");
    const start = startOfDay(now);
    const end = addDays(start, 7);
    const allTasks = await loadExpandedTaskInstances(subYears(start, 5), end);
    const weekKey = startOfWeek(now, { weekStartsOn: 1 }).toISOString().slice(0, 10);

    for (const user of users) {
        const userTasks = allTasks.filter((task) => task.assigneeIds?.includes(user.id));
        const overdueTasks = userTasks.filter((task) => differenceInCalendarDays(startOfDay(new Date(task.date)), start) < 0);
        const upcomingTasks = userTasks.filter((task) => {
            const daysUntil = differenceInCalendarDays(startOfDay(new Date(task.date)), start);
            return daysUntil >= 0 && daysUntil <= 7;
        });
        if (overdueTasks.length === 0 && upcomingTasks.length === 0) continue;

        const reserved = await reserveDispatch({
            kind: 'weekly-digest',
            userId: user.id,
            dispatchKey: weekKey,
        });
        if (!reserved) continue;

        try {
            await sendWeeklyDigestEmail(cfg, appUrl, user, upcomingTasks, overdueTasks);
        } catch (error) {
            console.error('Failed to send weekly digest', error);
        }
    }
};

const runNotificationJobs = async () => {
    try {
        const now = new Date();
        await sendReminderNotifications(now);
        await sendWeeklyDigests(now);
    } catch (error) {
        console.error('Notification job failed', error);
    }
};
setInterval(runNotificationJobs, 60 * 60 * 1000);
setTimeout(runNotificationJobs, 5000);

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
            const newCalendarToken = generateCalendarToken();
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
            const newCalendarToken = generateCalendarToken();
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
        else if (req.user?.role === 'admin') res.json(rows);
        else res.json((rows || []).map(({ id, name, role }) => ({ id, name, email: '', role })));
    });
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    const { id, name, email, password, role } = req.body;
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (!password) return res.status(400).json({ error: 'Password is required' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const calendarToken = generateCalendarToken();
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

app.post('/api/tasks', authenticateToken, (req, res) => {
    const t = req.body;
    const interval = parseInt(t.recurrenceInterval, 10);
    if (isNaN(interval) || interval < 1) {
        return res.status(400).json({ error: 'recurrenceInterval must be a positive integer' });
    }
    const createdBy = req.user.role === 'admin' && t.createdBy ? t.createdBy : req.user.id;
    const assigneeIds = req.user.role === 'admin'
        ? (Array.isArray(t.assigneeIds) ? t.assigneeIds : [])
        : [req.user.id];
    db.run(`INSERT INTO tasks (id, title, date, description, status, recurrence, recurrenceInterval, recurrenceEndDate, assigneeIds, reminderDays, categoryId, completionNote, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.title, t.date, t.description, t.status, t.recurrence, interval, t.recurrenceEndDate, JSON.stringify(assigneeIds), t.reminderDays || 0, t.categoryId, t.completionNote || null, createdBy],
        (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ ...t, assigneeIds, createdBy });
        }
    );
});

app.put('/api/tasks/:id', authenticateToken, (req, res) => {
    const t = req.body;
    const interval = parseInt(t.recurrenceInterval, 10);
    if (isNaN(interval) || interval < 1) {
        return res.status(400).json({ error: 'recurrenceInterval must be a positive integer' });
    }
    db.get("SELECT * FROM tasks WHERE id = ?", [req.params.id], (taskErr, task) => {
        if (taskErr) return res.status(500).json({ error: taskErr.message });
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (!canManageTaskDefinition(task, req.user)) {
            return res.status(403).json({ error: 'Not allowed to edit this task' });
        }

        const assigneeIds = req.user.role === 'admin'
            ? (Array.isArray(t.assigneeIds) ? t.assigneeIds : [])
            : parseAssigneeIds(task.assigneeIds || '[]');
        const createdBy = task.createdBy || req.user.id;

        db.run(`UPDATE tasks SET title=?, date=?, description=?, status=?, recurrence=?, recurrenceInterval=?, recurrenceEndDate=?, assigneeIds=?, reminderDays=?, categoryId=?, completionNote=? WHERE id=?`,
            [t.title, t.date, t.description, t.status, t.recurrence, interval, t.recurrenceEndDate, JSON.stringify(assigneeIds), t.reminderDays || 0, t.categoryId, t.completionNote || null, req.params.id],
            (err) => {
                if (err) res.status(500).json({ error: err.message });
                else res.json({ ...t, assigneeIds, createdBy });
            }
        );
    });
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

app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
    db.get("SELECT * FROM tasks WHERE id = ?", [req.params.id], (taskErr, task) => {
        if (taskErr) return res.status(500).json({ error: taskErr.message });
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (!canManageTaskDefinition(task, req.user)) {
            return res.status(403).json({ error: 'Not allowed to delete this task' });
        }

        // Also delete attachments from disk
        db.all("SELECT filename FROM task_attachments WHERE taskId = ?", [req.params.id], (err, rows) => {
            if (!err && rows) {
                rows.forEach(row => {
                    const filePath = path.join(uploadsDir, row.filename);
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                });
                db.run("DELETE FROM task_attachments WHERE taskId = ?", [req.params.id]);
            }
            db.run("DELETE FROM tasks WHERE id = ?", [req.params.id], (deleteErr) => {
                if (deleteErr) res.status(500).json({ error: deleteErr.message });
                else res.json({ message: 'Task deleted' });
            });
        });
    });
});

// 4. Attachments
app.get('/api/tasks/:id/attachments', authenticateToken, (req, res) => {
    if (!canAccessAttachment(req.user)) {
        return res.status(403).json({ error: 'Not allowed to access attachments' });
    }
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
    if (!canAccessAttachment(req.user)) {
        return res.status(403).json({ error: 'Not allowed to download attachments' });
    }
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

app.get('/api/email/action', async (req, res) => {
    try {
        const token = String(req.query.token || '');
        if (!token) return res.status(400).send('Missing token');

        const payload = jwt.verify(token, SECRET_KEY);
        if (payload.action !== 'complete' || !payload.userId || !payload.taskId || !payload.occurrenceDate) {
            return res.status(400).send('Invalid token payload');
        }

        const appUrl = normalizeAppUrl(await getPublicAppUrl());
        if (!appUrl) return res.status(400).send('APP_URL is not configured');

        const user = await dbGetAsync("SELECT id, role FROM users WHERE id = ?", [payload.userId]);
        const task = await dbGetAsync("SELECT * FROM tasks WHERE id = ?", [payload.taskId]);
        if (!user || !task) return res.status(404).send('Task or user not found');

        const normalizedTask = { ...task, assigneeIds: parseAssigneeIds(task.assigneeIds) };
        if (!canManageTaskOccurrence(normalizedTask, user)) {
            return res.status(403).send('Not allowed');
        }

        const occurrenceDate = normalizeOccurrenceDate(payload.occurrenceDate);
        const existingOverride = occurrenceDate
            ? await dbGetAsync("SELECT * FROM task_occurrence_overrides WHERE taskId = ? AND occurrenceDate = ?", [task.id, occurrenceDate])
            : null;
        const targetDate = existingOverride?.date || occurrenceDate || task.date;
        const completionNote = 'Per E-Mail als erledigt markiert';

        if (task.recurrence && task.recurrence !== 'none') {
            await createOrUpdateOccurrenceOverride(task.id, occurrenceDate, {
                date: targetDate,
                status: 'completed',
                completionNote,
                skipped: false,
                updatedBy: user.id,
                updatedAt: new Date().toISOString(),
            });
        } else {
            await dbRunAsync(
                "UPDATE tasks SET status = ?, completionNote = ? WHERE id = ?",
                ['completed', completionNote, task.id]
            );
        }

        const redirectPath = `${buildTaskPath({ originalTaskId: task.id, occurrenceDate })}&emailAction=completed`;
        res.redirect(buildAbsoluteAppUrl(appUrl, redirectPath));
    } catch (error) {
        console.error('Email action failed', error);
        res.status(400).send('Invalid or expired action link');
    }
});

// 9. ICS Subscription
app.get('/api/calendar.ics', calendarLimiter, serveCalendarFeed);
app.get('/api/calendar/:token.ics', calendarLimiter, serveCalendarFeed);

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
