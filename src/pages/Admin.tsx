import React, { useState } from 'react';
import { useStore, type Template } from '../store/useStore';
import UserList from '../components/UserList';
import UserModal from '../components/UserModal';
import SmtpConfig from '../components/SmtpConfig';
import AppConfig from '../components/AppConfig';
import CategoryManager from '../components/CategoryManager';
import TemplateManager from '../components/TemplateManager';
import TaskModal from '../components/TaskModal';
import { Plus } from 'lucide-react';
import { generateId } from '../utils/id';

type Tab = 'users' | 'categories' | 'templates' | 'smtp' | 'app';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'user';
}

const TABS: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'categories', label: 'Categories' },
    { id: 'templates', label: 'Templates' },
    { id: 'app', label: 'App Links' },
    { id: 'smtp', label: 'Email (SMTP)' },
];

const Admin: React.FC = () => {
    const { users, addUser, updateUser, deleteUser, addTask } = useStore();
    const [activeTab, setActiveTab] = useState<Tab>('users');
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [taskFromTemplate, setTaskFromTemplate] = useState<any | null>(null);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

    const handleApplyTemplate = (template: Template) => {
        setTaskFromTemplate({
            id: generateId(),
            title: template.title,
            description: template.description,
            date: new Date().toISOString(),
            status: 'pending',
            recurrence: template.recurrence,
            recurrenceInterval: template.recurrenceInterval,
            recurrenceEndDate: template.recurrenceEndDate,
            assigneeIds: template.assigneeIds,
            reminderDays: template.reminderDays,
            categoryId: template.categoryId,
        });
        setIsTaskModalOpen(true);
    };

    return (
        <div style={{ maxWidth: '900px' }}>
            {/* Page header */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Administration</h2>
                <p className="text-muted">Manage users, categories, templates, app links and email settings.</p>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem', gap: '0' }}>
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '0.5rem 1rem',
                            fontSize: '13px',
                            fontWeight: 500,
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                            color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            marginBottom: '-1px',
                            transition: 'color 0.15s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'users' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                        <button className="btn btn-primary"
                            onClick={() => { setEditingUser(null); setIsUserModalOpen(true); }}>
                            <Plus size={14} /> Add User
                        </button>
                    </div>
                    <UserList
                        users={users}
                        onEdit={u => { setEditingUser(u); setIsUserModalOpen(true); }}
                        onDelete={id => { if (confirm('Delete user?')) deleteUser(id); }}
                    />
                </div>
            )}

            {activeTab === 'categories' && (
                <div className="card">
                    <CategoryManager />
                </div>
            )}

            {activeTab === 'templates' && (
                <TemplateManager onApply={handleApplyTemplate} />
            )}

            {activeTab === 'smtp' && (
                <div className="card">
                    <SmtpConfig />
                </div>
            )}

            {activeTab === 'app' && (
                <div className="card">
                    <AppConfig />
                </div>
            )}

            {/* Modals */}
            <UserModal
                isOpen={isUserModalOpen}
                onClose={() => setIsUserModalOpen(false)}
                onSubmit={async (u) => { if (editingUser) await updateUser(u); else await addUser(u); }}
                initialData={editingUser}
            />
            <TaskModal
                isOpen={isTaskModalOpen}
                onClose={() => { setIsTaskModalOpen(false); setTaskFromTemplate(null); }}
                onSubmit={async (task) => addTask(task)}
                initialData={taskFromTemplate}
            />
        </div>
    );
};

export default Admin;
