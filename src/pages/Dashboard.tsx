import React, { useEffect, useMemo, useState } from 'react';
import { addDays, isAfter, isBefore, isToday, parseISO, startOfDay, subYears } from 'date-fns';
import { BellRing, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { useStore } from '../store/useStore';
import { getTasksForRange, type TaskInstance } from '../utils/recurrence';

const Dashboard: React.FC = () => {
    const { user, tasks, categories, occurrenceOverrides, users, saveOccurrenceOverride, updateTaskStatus } = useStore();
    const { showToast } = useNotification();
    const location = useLocation();
    const navigate = useNavigate();
    const [manualSelectedTask, setManualSelectedTask] = useState<TaskInstance | null>(null);

    const allTaskInstances = useMemo(() => {
        const now = startOfDay(new Date());
        const rangeStart = subYears(now, 5);
        const rangeEnd = addDays(now, 30);
        return getTasksForRange(tasks, occurrenceOverrides, rangeStart, rangeEnd);
    }, [tasks, occurrenceOverrides]);

    const allVisibleTasks = useMemo(() => {
        return allTaskInstances.filter(
            (task) => task.status !== 'completed' && task.status !== 'canceled'
        );
    }, [allTaskInstances]);

    const stats = useMemo(() => {
        const now = startOfDay(new Date());
        const nextWeek = addDays(now, 14);

        return {
            overdue: allVisibleTasks.filter((task) => isBefore(startOfDay(parseISO(task.date)), now)),
            today: allVisibleTasks.filter((task) => isToday(parseISO(task.date))),
            upcoming: allVisibleTasks.filter((task) => {
                const date = startOfDay(parseISO(task.date));
                return isAfter(date, now) && isBefore(date, nextWeek);
            }),
        };
    }, [allVisibleTasks]);

    const reminderTasks = useMemo(() => {
        if (!user) return [];

        const now = startOfDay(new Date());
        return allVisibleTasks.filter((task) => {
            if (!task.assigneeIds.includes(user.id) || !task.reminderDays || task.reminderDays <= 0) return false;
            const dueDate = startOfDay(parseISO(task.date));
            const reminderStart = addDays(dueDate, -task.reminderDays);
            return reminderStart <= now && dueDate >= now;
        });
    }, [allVisibleTasks, user]);

    useEffect(() => {
        reminderTasks.forEach((task) => {
            const key = `in-app-reminder:${task.originalTaskId}:${task.occurrenceDate}`;
            if (!sessionStorage.getItem(key)) {
                showToast(`Erinnerung: ${task.title} ist am ${new Date(task.date).toLocaleDateString('de-CH')} fallig.`, 'info');
                sessionStorage.setItem(key, 'shown');
            }
        });
    }, [reminderTasks, showToast]);

    const deepLinkedTask = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const taskId = params.get('taskId');
        if (!taskId) return null;

        const occurrenceDate = params.get('occurrenceDate');
        return allTaskInstances.find((task) => {
            if (task.originalTaskId !== taskId) return false;
            if (!occurrenceDate) return true;
            return task.occurrenceDate === occurrenceDate;
        }) || null;
    }, [allTaskInstances, location.search]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('emailAction') === 'completed') {
            showToast('Aufgabe wurde direkt aus der E-Mail als erledigt markiert.', 'success');
            params.delete('emailAction');
            navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
        }
    }, [location.pathname, location.search, navigate, showToast]);

    const selectedTask = manualSelectedTask || deepLinkedTask;

    const getCategoryName = (categoryId?: string) => categories.find((category) => category.id === categoryId)?.name || null;
    const getAssigneeNames = (assigneeIds: string[]) =>
        assigneeIds.map((id) => users.find((userEntry) => userEntry.id === id)?.name).filter(Boolean).join(', ');

    const clearSelectedTask = () => {
        setManualSelectedTask(null);
        const params = new URLSearchParams(location.search);
        if (params.has('taskId') || params.has('occurrenceDate')) {
            params.delete('taskId');
            params.delete('occurrenceDate');
            params.delete('emailAction');
            navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
        }
    };

    const handleMarkDone = async (task: TaskInstance) => {
        const completionNote = window.prompt('Abschlussnotiz fur diese Aufgabe (optional):', task.completionNote || '') || '';

        try {
            if (task.isRecurringInstance) {
                await saveOccurrenceOverride({
                    taskId: task.originalTaskId,
                    occurrenceDate: task.occurrenceDate,
                    date: task.date,
                    status: 'completed',
                    completionNote,
                    skipped: false,
                });
            } else {
                await updateTaskStatus(task.id, 'completed', completionNote);
            }

            setManualSelectedTask((current) =>
                current && current.id === task.id
                    ? { ...current, status: 'completed', completionNote }
                    : current
            );
            showToast('Aufgabe als erledigt markiert.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Aufgabe konnte nicht abgeschlossen werden.', 'error');
        }
    };

    if (!user) return <div>Loading...</div>;

    return (
        <>
            <div className="dashboard-shell">
                <div className="dashboard-hero">
                    <div>
                        <div className="dashboard-eyebrow">Wartungsstatus</div>
                        <h2 className="dashboard-title">Dashboard</h2>
                        <p className="dashboard-subtitle">Alle offenen Wartungen im Team, mit Fokus auf heute, die nachsten Tage und deine Erinnerungen.</p>
                    </div>
                    <div className="dashboard-hero-meta">
                        <span>{user.name}</span>
                        <span>{new Date().toLocaleDateString('de-CH')}</span>
                    </div>
                </div>

                <div className="dashboard-stats">
                    <StatCell label="Overdue" value={stats.overdue.length} color="var(--danger)" />
                    <StatCell label="Due Today" value={stats.today.length} color="var(--primary)" />
                    <StatCell label="Next 14 Days" value={stats.upcoming.length} color="var(--success)" />
                </div>

                <div className="dashboard-panel">
                    <div className="dashboard-panel-header">
                        <BellRing size={16} />
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>In-App-Erinnerungen</h3>
                    </div>
                    {reminderTasks.length === 0 ? (
                        <div className="dashboard-empty">Aktuell gibt es fur dich keine aktiven Erinnerungen.</div>
                    ) : (
                        reminderTasks.map((task) => (
                            <button
                                key={`${task.originalTaskId}-${task.occurrenceDate}`}
                                type="button"
                                onClick={() => setManualSelectedTask(task)}
                                className="reminder-card"
                            >
                                <div className="task-row-title">{task.title}</div>
                                <div className="task-row-description">
                                    Fallig am {new Date(task.date).toLocaleDateString('de-CH')} • Erinnerung {task.reminderDays} Tag(e) vorher
                                </div>
                            </button>
                        ))
                    )}
                </div>

                <TaskSection
                    title={`Overdue - ${stats.overdue.length}`}
                    tasks={stats.overdue}
                    getCategoryName={getCategoryName}
                    emptyText="Keine uberfalligen Wartungen."
                    accent="var(--danger)"
                    onSelectTask={setManualSelectedTask}
                    onMarkDone={handleMarkDone}
                />
                <TaskSection
                    title="Today"
                    tasks={stats.today}
                    getCategoryName={getCategoryName}
                    emptyText="Keine Wartungen fur heute."
                    accent="var(--primary)"
                    onSelectTask={setManualSelectedTask}
                    onMarkDone={handleMarkDone}
                />
                <TaskSection
                    title={`Upcoming - ${stats.upcoming.length}`}
                    tasks={stats.upcoming}
                    getCategoryName={getCategoryName}
                    emptyText="Keine anstehenden Wartungen in den nachsten 14 Tagen."
                    accent="var(--text-muted)"
                    onSelectTask={setManualSelectedTask}
                    onMarkDone={handleMarkDone}
                />
            </div>

            {selectedTask && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
                    <div className="card" style={{ width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto', padding: 0, borderRadius: '8px' }}>
                        <div className="task-detail-header">
                            <div>
                                <h3 style={{ margin: 0 }}>{selectedTask.title}</h3>
                                <div className="text-muted">{new Date(selectedTask.date).toLocaleDateString('de-CH')}</div>
                            </div>
                            <button type="button" className="btn btn-ghost" onClick={clearSelectedTask} style={{ padding: '0.25rem' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <InfoRow label="Status" value={selectedTask.status} />
                            <InfoRow label="Kategorie" value={getCategoryName(selectedTask.categoryId) || 'Keine Kategorie'} />
                            <InfoRow label="Zugewiesen an" value={getAssigneeNames(selectedTask.assigneeIds) || 'Niemand'} />
                            <InfoRow label="Wiederholung" value={selectedTask.recurrence === 'none' ? 'Keine' : `${selectedTask.recurrence} alle ${selectedTask.recurrenceInterval || 1}`} />
                            <InfoRow label="Erinnerung" value={selectedTask.reminderDays ? `${selectedTask.reminderDays} Tag(e) vorher` : 'Keine'} />
                            {selectedTask.description && <InfoBlock label="Beschreibung" value={selectedTask.description} />}
                            {selectedTask.completionNote && <InfoBlock label="Abschlussnotiz" value={selectedTask.completionNote} />}
                            {selectedTask.isRecurringInstance && (
                                <InfoRow label="Serienvorkommen" value={selectedTask.hasOverride ? 'Mit Ausnahme/Anderung' : 'Standard-Vorkommen'} />
                            )}
                            {selectedTask.status !== 'completed' && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn btn-primary" onClick={() => handleMarkDone(selectedTask)}>
                                        Done
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const StatCell = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="stat-card">
        <div className="stat-value" style={{ color }}>{value}</div>
        <div className="stat-label">{label}</div>
    </div>
);

const TaskSection = ({
    title,
    tasks,
    getCategoryName,
    emptyText,
    accent,
    onSelectTask,
    onMarkDone,
}: {
    title: string;
    tasks: TaskInstance[];
    getCategoryName: (categoryId?: string) => string | null;
    emptyText: string;
    accent: string;
    onSelectTask: (task: TaskInstance) => void;
    onMarkDone: (task: TaskInstance) => void;
}) => (
    <section className="dashboard-panel">
        <div className="dashboard-section-label" style={{ color: accent }}>
            {title}
        </div>
        {tasks.length === 0 ? (
            <div className="dashboard-empty">{emptyText}</div>
        ) : (
            <div className="task-list">
                {tasks.map((task, index) => (
                    <div
                        key={task.id}
                        className="task-row-shell"
                        style={{
                            borderBottom: index === tasks.length - 1 ? 'none' : '1px solid var(--border-color)',
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => onSelectTask(task)}
                            className="task-row-main"
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="task-row-title">{task.title}</div>
                                {task.description && (
                                    <div className="task-row-description">{task.description}</div>
                                )}
                            </div>
                            <div className="task-row-meta">
                                {getCategoryName(task.categoryId) && (
                                    <span className="task-chip">
                                        {getCategoryName(task.categoryId)}
                                    </span>
                                )}
                                <span className="task-date">
                                    {new Date(task.date).toLocaleDateString('de-CH')}
                                </span>
                            </div>
                        </button>
                        {task.status !== 'completed' && (
                            <div className="task-row-action">
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ padding: '0.45rem 0.8rem' }}
                                    onClick={() => onMarkDone(task)}
                                >
                                    Done
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
    </section>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '1rem', alignItems: 'start' }}>
        <div className="text-muted" style={{ fontWeight: 500 }}>{label}</div>
        <div style={{ textTransform: label === 'Status' ? 'capitalize' : 'none' }}>{value}</div>
    </div>
);

const InfoBlock = ({ label, value }: { label: string; value: string }) => (
    <div>
        <div className="text-muted" style={{ fontWeight: 500, marginBottom: '0.35rem' }}>{label}</div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
);

export default Dashboard;
