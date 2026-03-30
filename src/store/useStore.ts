import { create } from 'zustand';

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'user';
    calendarToken?: string;
}

export interface Task {
    id: string;
    title: string;
    date: string;
    description: string;
    assigneeIds: string[];
    status: 'pending' | 'completed' | 'canceled';
    recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    recurrenceInterval: number;
    recurrenceEndDate?: string;
    reminderDays?: number;
    categoryId?: string;
    completionNote?: string;
}

export interface TaskOccurrenceOverride {
    id: string;
    taskId: string;
    occurrenceDate: string;
    date?: string | null;
    status: Task['status'];
    completionNote?: string | null;
    skipped: boolean;
    updatedBy?: string;
    updatedAt?: string;
}

export interface Template {
    id: string;
    title: string;
    description: string;
    recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    recurrenceInterval: number;
    recurrenceEndDate?: string;
    assigneeIds: string[];
    reminderDays: number;
    categoryId?: string;
}

export interface Attachment {
    id: string;
    taskId: string;
    filename: string;
    originalName: string;
    size: number;
    uploadedAt: string;
}

export interface Category {
    id: string;
    name: string;
    color: string;
}

export interface SmtpSettings {
    host: string;
    port: number;
    user: string;
    password: string;
    fromEmail: string;
}

export interface AppSettings {
    publicAppUrl: string;
}

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

const defaultSmtpSettings: SmtpSettings = {
    host: 'mail.smtp2go.com',
    port: 2525,
    user: '',
    password: '',
    fromEmail: 'noreply@wartungskalender.com',
};

const defaultAppSettings: AppSettings = {
    publicAppUrl: '',
};

const getToken = () => localStorage.getItem('token');

const authHeaders = (extra?: HeadersInit): HeadersInit => {
    const token = getToken();
    return {
        ...(extra || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, init);
    if (!response.ok) {
        let message = 'Request failed';
        try {
            const data = await response.json();
            message = data.error || data.message || message;
        } catch {
            try {
                message = await response.text();
            } catch {
                message = 'Request failed';
            }
        }
        throw new ApiError(message, response.status);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
};

interface AppState {
    user: User | null;
    users: User[];
    tasks: Task[];
    occurrenceOverrides: TaskOccurrenceOverride[];
    smtpSettings: SmtpSettings;
    appSettings: AppSettings;
    isAuthenticated: boolean;
    isLoading: boolean;
    checkAuth: () => Promise<void>;
    login: (user: Partial<User> & { password?: string }) => Promise<boolean>;
    logout: () => void;
    fetchUsers: () => Promise<void>;
    fetchTasks: () => Promise<void>;
    fetchOccurrenceOverrides: () => Promise<void>;
    addUser: (user: User & { password?: string }) => Promise<void>;
    updateUser: (user: User) => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
    addTask: (task: Task) => Promise<void>;
    updateTask: (task: Task) => Promise<void>;
    updateTaskStatus: (id: string, status: Task['status'], completionNote?: string) => Promise<void>;
    deleteTask: (id: string) => Promise<void>;
    updateSmtpSettings: (settings: SmtpSettings) => Promise<void>;
    fetchSmtpSettings: () => Promise<void>;
    updateAppSettings: (settings: AppSettings) => Promise<void>;
    fetchAppSettings: () => Promise<void>;
    categories: Category[];
    fetchCategories: () => Promise<void>;
    addCategory: (category: Category) => Promise<void>;
    deleteCategory: (id: string) => Promise<void>;
    sendEmail: (to: string[], subject: string, body: string) => Promise<void>;
    changePassword: (current: string, newPass: string) => Promise<void>;
    templates: Template[];
    fetchTemplates: () => Promise<void>;
    addTemplate: (t: Template) => Promise<void>;
    updateTemplate: (t: Template) => Promise<void>;
    deleteTemplate: (id: string) => Promise<void>;
    fetchAttachments: (taskId: string) => Promise<Attachment[]>;
    uploadAttachment: (taskId: string, file: File) => Promise<Attachment>;
    deleteAttachment: (id: string) => Promise<void>;
    saveOccurrenceOverride: (override: Omit<TaskOccurrenceOverride, 'id' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
    deleteOccurrenceOverride: (taskId: string, occurrenceDate: string) => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
    user: null,
    users: [],
    tasks: [],
    occurrenceOverrides: [],
    categories: [],
    templates: [],
    smtpSettings: defaultSmtpSettings,
    appSettings: defaultAppSettings,
    isAuthenticated: false,
    isLoading: true,

    checkAuth: async () => {
        const token = getToken();
        if (!token) {
            set({ isLoading: false, user: null, isAuthenticated: false });
            return;
        }

        try {
            const user = await request<User>('/api/auth/me', {
                headers: authHeaders(),
            });
            set({ user, isAuthenticated: true });
        } catch (error) {
            console.error(error);
            localStorage.removeItem('token');
            set({ user: null, isAuthenticated: false });
        } finally {
            set({ isLoading: false });
        }
    },

    login: async (credentials) => {
        try {
            const data = await request<{ user: User; token: string }>('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials),
            });
            localStorage.setItem('token', data.token);
            set({ user: data.user, isAuthenticated: true });
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    },

    logout: () => {
        localStorage.removeItem('token');
        set({
            user: null,
            users: [],
            tasks: [],
            occurrenceOverrides: [],
            categories: [],
            templates: [],
            isAuthenticated: false,
            smtpSettings: defaultSmtpSettings,
            appSettings: defaultAppSettings,
        });
    },

    fetchUsers: async () => {
        const users = await request<User[]>('/api/users', {
            headers: authHeaders(),
        });
        set({ users });
    },

    fetchTasks: async () => {
        const tasks = await request<Task[]>('/api/tasks', {
            headers: authHeaders(),
        });
        set({ tasks });
    },

    fetchOccurrenceOverrides: async () => {
        const occurrenceOverrides = await request<TaskOccurrenceOverride[]>('/api/tasks/occurrences', {
            headers: authHeaders(),
        });
        set({ occurrenceOverrides });
    },

    addUser: async (user) => {
        const newUser = await request<User>('/api/users', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(user),
        });
        set((state) => ({ users: [...state.users, newUser] }));
    },

    updateUser: async (user) => {
        await request(`/api/users/${user.id}`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(user),
        });
        set((state) => ({
            users: state.users.map((entry) => (entry.id === user.id ? user : entry)),
        }));
    },

    deleteUser: async (id) => {
        await request(`/api/users/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        set((state) => ({
            users: state.users.filter((user) => user.id !== id),
        }));
    },

    addTask: async (task) => {
        const newTask = await request<Task>('/api/tasks', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(task),
        });
        set((state) => ({ tasks: [...state.tasks, newTask] }));
    },

    updateTask: async (task) => {
        const updatedTask = await request<Task>(`/api/tasks/${task.id}`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(task),
        });
        set((state) => ({
            tasks: state.tasks.map((entry) => (entry.id === task.id ? updatedTask : entry)),
        }));
    },

    updateTaskStatus: async (id, status, completionNote) => {
        const updatedTask = await request<Task>(`/api/tasks/${id}/status`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ status, completionNote }),
        });
        set((state) => ({
            tasks: state.tasks.map((entry) => (entry.id === id ? updatedTask : entry)),
        }));
    },

    deleteTask: async (id) => {
        await request(`/api/tasks/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        set((state) => ({
            tasks: state.tasks.filter((task) => task.id !== id),
            occurrenceOverrides: state.occurrenceOverrides.filter((override) => override.taskId !== id),
        }));
    },

    updateSmtpSettings: async (settings) => {
        await request('/api/settings/smtp', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(settings),
        });
        set({ smtpSettings: settings });
    },

    fetchSmtpSettings: async () => {
        const settings = await request<SmtpSettings>('/api/settings/smtp', {
            headers: authHeaders(),
        });
        if (settings && Object.keys(settings).length > 0) {
            set({ smtpSettings: settings });
        }
    },

    updateAppSettings: async (settings) => {
        const saved = await request<AppSettings>('/api/settings/app-url', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(settings),
        });
        set({ appSettings: saved });
    },

    fetchAppSettings: async () => {
        const settings = await request<AppSettings>('/api/settings/app-url', {
            headers: authHeaders(),
        });
        set({ appSettings: settings || defaultAppSettings });
    },

    fetchCategories: async () => {
        const categories = await request<Category[]>('/api/categories', {
            headers: authHeaders(),
        });
        set({ categories });
    },

    addCategory: async (category) => {
        const createdCategory = await request<Category>('/api/categories', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(category),
        });
        set((state) => ({ categories: [...state.categories, createdCategory] }));
    },

    deleteCategory: async (id) => {
        await request(`/api/categories/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        set((state) => ({ categories: state.categories.filter((category) => category.id !== id) }));
    },

    sendEmail: async (to, subject, body) => {
        await request('/api/email/send', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ to, subject, body }),
        });
    },

    changePassword: async (currentPassword, newPassword) => {
        await request('/api/auth/password', {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ currentPassword, newPassword }),
        });
    },

    fetchTemplates: async () => {
        const templates = await request<Template[]>('/api/templates', {
            headers: authHeaders(),
        });
        set({ templates });
    },

    addTemplate: async (template) => {
        const createdTemplate = await request<Template>('/api/templates', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(template),
        });
        set((state) => ({ templates: [...state.templates, createdTemplate] }));
    },

    updateTemplate: async (template) => {
        const updatedTemplate = await request<Template>(`/api/templates/${template.id}`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(template),
        });
        set((state) => ({ templates: state.templates.map((entry) => (entry.id === template.id ? updatedTemplate : entry)) }));
    },

    deleteTemplate: async (id) => {
        await request(`/api/templates/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        set((state) => ({ templates: state.templates.filter((template) => template.id !== id) }));
    },

    fetchAttachments: async (taskId) => {
        return request<Attachment[]>(`/api/tasks/${taskId}/attachments`, {
            headers: authHeaders(),
        });
    },

    uploadAttachment: async (taskId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return request<Attachment>(`/api/tasks/${taskId}/attachments`, {
            method: 'POST',
            headers: authHeaders(),
            body: formData,
        });
    },

    deleteAttachment: async (id) => {
        await request(`/api/attachments/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
    },

    saveOccurrenceOverride: async (override) => {
        const saved = await request<TaskOccurrenceOverride>(`/api/tasks/${override.taskId}/occurrences`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(override),
        });
        set((state) => ({
            occurrenceOverrides: [
                ...state.occurrenceOverrides.filter(
                    (entry) => !(entry.taskId === saved.taskId && entry.occurrenceDate === saved.occurrenceDate)
                ),
                saved,
            ],
        }));
    },

    deleteOccurrenceOverride: async (taskId, occurrenceDate) => {
        const encodedDate = encodeURIComponent(occurrenceDate);
        await request(`/api/tasks/${taskId}/occurrences?occurrenceDate=${encodedDate}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        set((state) => ({
            occurrenceOverrides: state.occurrenceOverrides.filter(
                (entry) => !(entry.taskId === taskId && entry.occurrenceDate === occurrenceDate)
            ),
        }));
    },
}));
