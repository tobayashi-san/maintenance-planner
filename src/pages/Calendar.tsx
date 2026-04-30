import React, { useMemo, useState } from 'react';
import { Plus, Download, Link, CheckCircle2, CalendarDays, RotateCcw, SkipForward } from 'lucide-react';
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import CalendarGrid from '../components/CalendarGrid';
import TaskModal from '../components/TaskModal';
import { useNotification } from '../context/NotificationContext';
import { useStore, type Task } from '../store/useStore';
import { generateICS, downloadICS } from '../utils/icsGenerator';
import { getTasksForRange, type TaskInstance } from '../utils/recurrence';

const Calendar: React.FC = () => {
    const {
        tasks,
        occurrenceOverrides,
        addTask,
        updateTask,
        deleteTask,
        saveOccurrenceOverride,
        deleteOccurrenceOverride,
        user,
        appSettings,
    } = useStore();
    const { showToast } = useNotification();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const rangeStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const visibleTasks = useMemo(
        () => getTasksForRange(tasks, occurrenceOverrides, rangeStart, rangeEnd),
        [tasks, occurrenceOverrides, rangeStart, rangeEnd]
    );

    const selectedTasks = useMemo(() => {
        if (!selectedDate) return [];
        return visibleTasks.filter((task) => new Date(task.date).toDateString() === selectedDate.toDateString());
    }, [selectedDate, visibleTasks]);

    const isPrivateIpv4Host = (host: string) => {
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
        const parts = host.split('.').map(Number);
        if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false;
        if (parts[0] === 10) return true;
        if (parts[0] === 127) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        return false;
    };

    const resolveCalendarBaseUrl = (): { baseUrl: string | null; error: string | null; isInternal: boolean } => {
        const configured = appSettings.publicAppUrl?.trim();
        const fallback = window.location.origin;
        const candidate = configured || fallback;

        if (!candidate) {
            return { baseUrl: null, error: 'Bitte hinterlege unter Admin > App Links eine vollstaendige URL zur App.', isInternal: false };
        }

        try {
            const url = new URL(candidate);
            const host = url.hostname.toLowerCase();
            const isInternal = ['localhost', '127.0.0.1', '::1'].includes(host) || host.endsWith('.local') || isPrivateIpv4Host(host);

            if (!['http:', 'https:'].includes(url.protocol)) {
                return { baseUrl: null, error: 'Die hinterlegte APP_URL muss mit http:// oder https:// beginnen.', isInternal: false };
            }

            return { baseUrl: url.toString().replace(/\/+$/, ''), error: null, isInternal };
        } catch {
            return { baseUrl: null, error: 'Die hinterlegte APP_URL ist ungueltig. Bitte verwende eine vollstaendige URL wie http://10.0.9.120:3000 oder https://calendar.example.com.', isInternal: false };
        }
    };

    const handleExport = () => {
        const icsContent = generateICS(tasks);
        downloadICS('maintenance-calendar.ics', icsContent);
    };

    const copyOutlookUrl = async () => {
        if (!user?.calendarToken) {
            showToast('Calendar token is missing. Please sign in again.', 'error');
            return;
        }

        const { baseUrl, error, isInternal } = resolveCalendarBaseUrl();
        if (!baseUrl) {
            showToast(error || 'Bitte hinterlege eine gueltige Outlook-URL.', 'error');
            return;
        }
        const httpUrl = `${baseUrl}/api/calendar.ics?token=${user.calendarToken}`;
        const outlookUrl = baseUrl.startsWith('https://')
            ? httpUrl.replace(/^https:\/\//i, 'webcal://')
            : httpUrl;

        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(outlookUrl);
            } else {
                const el = document.createElement('textarea');
                el.value = outlookUrl;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
            }
            const message = isInternal
                ? `Interne Kalender-URL kopiert: ${outlookUrl}. Funktioniert am ehesten mit Classic Outlook im selben Netzwerk.`
                : `Outlook-URL kopiert: ${outlookUrl}`;
            showToast(message, 'success');
        } catch {
            showToast(`Konnte Outlook-URL nicht kopieren: ${outlookUrl}`, 'error');
        }
    };

    const handleOccurrenceStatus = async (task: TaskInstance, status: Task['status']) => {
        try {
            const completionNote = status === 'completed'
                ? window.prompt('Abschlussnotiz fur dieses Vorkommen (optional):', task.completionNote || '') || ''
                : task.completionNote || '';

            await saveOccurrenceOverride({
                taskId: task.originalTaskId,
                occurrenceDate: task.occurrenceDate,
                date: task.date,
                status,
                completionNote,
                skipped: false,
            });
            showToast('Vorkommen aktualisiert.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Vorkommen konnte nicht aktualisiert werden.', 'error');
        }
    };

    const handleSkipOccurrence = async (task: TaskInstance) => {
        try {
            await saveOccurrenceOverride({
                taskId: task.originalTaskId,
                occurrenceDate: task.occurrenceDate,
                date: task.date,
                status: 'canceled',
                completionNote: 'Vorkommen ubersprungen',
                skipped: true,
            });
            showToast('Vorkommen ubersprungen.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Vorkommen konnte nicht ubersprungen werden.', 'error');
        }
    };

    const handleMoveOccurrence = async (task: TaskInstance) => {
        const currentValue = task.date.split('T')[0];
        const value = window.prompt('Neues Datum fur dieses Vorkommen (YYYY-MM-DD):', currentValue);
        if (!value) return;

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            showToast('Ungultiges Datum.', 'error');
            return;
        }

        try {
            await saveOccurrenceOverride({
                taskId: task.originalTaskId,
                occurrenceDate: task.occurrenceDate,
                date: parsed.toISOString(),
                status: task.status,
                completionNote: task.completionNote || '',
                skipped: false,
            });
            showToast('Vorkommen verschoben.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Vorkommen konnte nicht verschoben werden.', 'error');
        }
    };

    const handleResetOccurrence = async (task: TaskInstance) => {
        try {
            await deleteOccurrenceOverride(task.originalTaskId, task.occurrenceDate);
            showToast('Serienvorkommen zuruckgesetzt.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Zurucksetzen fehlgeschlagen.', 'error');
        }
    };

    return (
        <div className="container" style={{ display: 'flex', gap: '1.5rem', flexDirection: 'column' }}>
            <div className="calendar-header">
                <div>
                    <h2>Maintenance Calendar</h2>
                    <p className="text-muted">Alle Wartungen im Blick, inklusive Serienvorkommen und Ausnahmen.</p>
                </div>
                <div className="calendar-toolbar">
                    <button onClick={handleExport} className="btn calendar-toolbar-btn">
                        <Download size={15} /> Export ICS
                    </button>
                    <button title="Copy Outlook subscription URL" onClick={copyOutlookUrl} className="btn calendar-toolbar-btn">
                        <Link size={15} /> Outlook URL
                    </button>
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => {
                                setSelectedDate(new Date());
                                setEditingTask(null);
                                setIsModalOpen(true);
                            }}
                            className="btn btn-primary"
                        >
                            <Plus size={15} /> Add Task
                        </button>
                    )}
                </div>
            </div>

            <div className="calendar-layout">
                <CalendarGrid
                    currentDate={currentDate}
                    onDateChange={setCurrentDate}
                    tasks={visibleTasks}
                    onDayClick={(date) => {
                        setSelectedDate(date);
                        setEditingTask(null);
                    }}
                />

                <div className="card calendar-day-panel">
                    <h3 className="calendar-day-title">
                        {selectedDate ? format(selectedDate, 'dd.MM.yyyy') : 'Select a date'}
                    </h3>
                    {selectedDate ? (
                        <div>
                            {user?.role === 'admin' && (
                                <button
                                    onClick={() => {
                                        setEditingTask(null);
                                        setIsModalOpen(true);
                                    }}
                                    className="calendar-add-day-btn"
                                >
                                    + Add Task for this day
                                </button>
                            )}
                            <div className="calendar-task-list">
                                {selectedTasks.length === 0 && (
                                    <p className="text-muted">No tasks for this day.</p>
                                )}
                                {selectedTasks.map((task) => (
                                    <div key={task.id} className="calendar-task-card">
                                        <div className="calendar-task-head">
                                            <div>
                                                <div className="calendar-task-name">{task.title}</div>
                                                {task.description && <div className="calendar-task-description">{task.description}</div>}
                                            </div>
                                            {task.isRecurringInstance && (
                                                <span className="calendar-task-badge">
                                                    {task.hasOverride ? 'Exception' : 'Series'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="calendar-task-meta">
                                            <span style={{ textTransform: 'capitalize' }}>{task.status}</span>
                                            {task.recurrence !== 'none' && (
                                                <span className="calendar-task-chip">
                                                    {task.recurrence}
                                                </span>
                                            )}
                                            {task.completionNote && <span>Note: {task.completionNote}</span>}
                                        </div>

                                        {task.isRecurringInstance && (
                                            <div className="calendar-task-actions">
                                                <button type="button" className="btn calendar-inline-btn" onClick={() => handleOccurrenceStatus(task, 'completed')}>
                                                    <CheckCircle2 size={14} /> Complete
                                                </button>
                                                <button type="button" className="btn calendar-inline-btn" onClick={() => handleMoveOccurrence(task)}>
                                                    <CalendarDays size={14} /> Move
                                                </button>
                                                <button type="button" className="btn calendar-inline-btn" onClick={() => handleSkipOccurrence(task)}>
                                                    <SkipForward size={14} /> Skip
                                                </button>
                                                {task.hasOverride && (
                                                    <button type="button" className="btn calendar-inline-btn" onClick={() => handleResetOccurrence(task)}>
                                                        <RotateCcw size={14} /> Reset
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {user?.role === 'admin' && (
                                            <div className="calendar-task-footer">
                                                <button
                                                    onClick={() => {
                                                        const originalTask = tasks.find((entry) => entry.id === task.originalTaskId);
                                                        setEditingTask(originalTask || null);
                                                        setIsModalOpen(true);
                                                    }}
                                                    className="calendar-link-btn"
                                                >
                                                    Edit Series
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (window.confirm('Delete entire series?')) {
                                                            try {
                                                                await deleteTask(task.originalTaskId);
                                                                showToast('Task deleted.', 'success');
                                                            } catch (error) {
                                                                showToast(error instanceof Error ? error.message : 'Task could not be deleted.', 'error');
                                                            }
                                                        }
                                                    }}
                                                    className="calendar-link-btn danger"
                                                >
                                                    Delete Series
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-muted">Click on a day to view or add tasks.</p>
                    )}
                </div>
            </div>

            <TaskModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={async (task) => {
                    if (editingTask && tasks.some((entry) => entry.id === editingTask.id)) {
                        await updateTask(task);
                    } else {
                        await addTask(task);
                    }
                }}
                initialData={editingTask}
                selectedDate={selectedDate}
            />
        </div>
    );
};

export default Calendar;
