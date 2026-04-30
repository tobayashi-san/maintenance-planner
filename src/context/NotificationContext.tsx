import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { addDays, parseISO, startOfDay, subYears } from 'date-fns';
import { useStore } from '../store/useStore';
import { getTasksForRange } from '../utils/recurrence';
import { generateId } from '../utils/id';

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

export interface InboxNotification {
    id: string;
    title: string;
    message: string;
    dueDate: string;
    taskId: string;
    occurrenceDate: string;
    createdAt: string;
    read: boolean;
}

interface NotificationContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    notifications: InboxNotification[];
    unreadCount: number;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    notificationPermission: NotificationPermission | 'unsupported';
    requestBrowserPermission: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const NOTIFICATION_READ_KEY = 'wartungskalender-notification-read-state';
const NOTIFICATION_SENT_KEY = 'wartungskalender-notification-browser-sent';

const readStateFromStorage = (): Record<string, boolean> => {
    try {
        return JSON.parse(localStorage.getItem(NOTIFICATION_READ_KEY) || '{}');
    } catch {
        return {};
    }
};

const sentStateFromStorage = (): Record<string, boolean> => {
    try {
        return JSON.parse(localStorage.getItem(NOTIFICATION_SENT_KEY) || '{}');
    } catch {
        return {};
    }
};

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [readState, setReadState] = useState<Record<string, boolean>>(readStateFromStorage);
    const [browserSentState, setBrowserSentState] = useState<Record<string, boolean>>(sentStateFromStorage);
    const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
        typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
    );
    const { user, tasks, occurrenceOverrides } = useStore();

    const reminderNotifications = useMemo(() => {
        if (!user) return [];

        const now = startOfDay(new Date());
        const rangeStart = subYears(now, 1);
        const rangeEnd = addDays(now, 30);
        const visibleTasks = getTasksForRange(tasks, occurrenceOverrides, rangeStart, rangeEnd);

        return visibleTasks
            .filter((task) => {
                if (!task.assigneeIds.includes(user.id) || !task.reminderDays || task.reminderDays <= 0) return false;
                if (task.status === 'completed' || task.status === 'canceled') return false;
                const dueDate = startOfDay(parseISO(task.date));
                const reminderStart = addDays(dueDate, -task.reminderDays);
                return reminderStart <= now && dueDate >= now;
            })
            .map((task) => {
                const id = `reminder:${task.originalTaskId}:${task.occurrenceDate}`;
                return {
                    id,
                    title: task.title,
                    message: `Fallig am ${new Date(task.date).toLocaleDateString('de-CH')} - Erinnerung ${task.reminderDays} Tag(e) vorher`,
                    dueDate: task.date,
                    taskId: task.originalTaskId,
                    occurrenceDate: task.occurrenceDate,
                    createdAt: task.occurrenceDate,
                    read: Boolean(readState[id]),
                } satisfies InboxNotification;
            })
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }, [user, tasks, occurrenceOverrides, readState]);

    useEffect(() => {
        const activeIds = new Set(reminderNotifications.map((notification) => notification.id));

        setReadState((prev) => {
            const next = Object.fromEntries(
                Object.entries(prev).filter(([key]) => activeIds.has(key))
            );
            return Object.keys(next).length === Object.keys(prev).length ? prev : next;
        });

        setBrowserSentState((prev) => {
            const next = Object.fromEntries(
                Object.entries(prev).filter(([key]) => activeIds.has(key))
            );
            return Object.keys(next).length === Object.keys(prev).length ? prev : next;
        });
    }, [reminderNotifications]);

    useEffect(() => {
        localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(readState));
    }, [readState]);

    useEffect(() => {
        localStorage.setItem(NOTIFICATION_SENT_KEY, JSON.stringify(browserSentState));
    }, [browserSentState]);

    useEffect(() => {
        if (permission !== 'granted') return;

        reminderNotifications.forEach((notification) => {
            if (browserSentState[notification.id]) return;
            const body = notification.message;

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistration().then((registration) => {
                    if (registration) {
                        registration.showNotification(notification.title, {
                            body,
                            tag: notification.id,
                            icon: '/icons/app-icon.svg',
                            badge: '/icons/app-icon.svg',
                            data: { url: '/dashboard' },
                        });
                    } else {
                        new Notification(notification.title, { body, tag: notification.id });
                    }
                    setBrowserSentState((prev) => ({ ...prev, [notification.id]: true }));
                });
            } else {
                new Notification(notification.title, { body, tag: notification.id });
                setBrowserSentState((prev) => ({ ...prev, [notification.id]: true }));
            }
        });
    }, [reminderNotifications, permission, browserSentState]);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = generateId();
        setToasts((prev) => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 3000);
    };

    const markAsRead = (id: string) => {
        setReadState((prev) => ({ ...prev, [id]: true }));
    };

    const markAllAsRead = () => {
        setReadState((prev) => {
            const next = { ...prev };
            reminderNotifications.forEach((notification) => {
                next[notification.id] = true;
            });
            return next;
        });
    };

    const requestBrowserPermission = async () => {
        if (typeof Notification === 'undefined') {
            setPermission('unsupported');
            return;
        }
        const result = await Notification.requestPermission();
        setPermission(result);
    };

    const unreadCount = reminderNotifications.filter((notification) => !notification.read).length;

    return (
        <NotificationContext.Provider
            value={{
                showToast,
                notifications: reminderNotifications,
                unreadCount,
                markAsRead,
                markAllAsRead,
                notificationPermission: permission,
                requestBrowserPermission,
            }}
        >
            {children}
            <div className="toast-container">
                {toasts.map((toast) => (
                    <div key={toast.id} className={`toast ${toast.type}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                            <span>{toast.message}</span>
                            <button onClick={() => setToasts((prev) => prev.filter((entry) => entry.id !== toast.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </NotificationContext.Provider>
    );
};
