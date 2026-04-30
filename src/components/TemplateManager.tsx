import React, { useState } from 'react';
import { Plus, Pencil, Trash2, X, Copy } from 'lucide-react';
import { useStore, type Template } from '../store/useStore';
import { useNotification } from '../context/NotificationContext';
import { generateId } from '../utils/id';

interface TemplateManagerProps {
    onApply: (template: Template) => void;
}

const emptyTemplate = (): Template => ({
    id: generateId(),
    title: '',
    description: '',
    recurrence: 'none',
    recurrenceInterval: 1,
    assigneeIds: [],
    reminderDays: 1,
});

const TemplateManager: React.FC<TemplateManagerProps> = ({ onApply }) => {
    const { templates, users, categories, addTemplate, updateTemplate, deleteTemplate } = useStore();
    const { showToast } = useNotification();
    const [editing, setEditing] = useState<Template | null>(null);
    const [isNew, setIsNew] = useState(false);

    const openNew = () => { setEditing(emptyTemplate()); setIsNew(true); };
    const openEdit = (t: Template) => { setEditing({ ...t }); setIsNew(false); };
    const close = () => { setEditing(null); setIsNew(false); };

    const handleSave = async () => {
        if (!editing || !editing.title.trim()) return;
        if (isNew) await addTemplate(editing);
        else await updateTemplate(editing);
        showToast(isNew ? 'Template created.' : 'Template updated.', 'success');
        close();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this template?')) return;
        await deleteTemplate(id);
        showToast('Template deleted.', 'success');
    };

    const toggleAssignee = (userId: string) => {
        if (!editing) return;
        const ids = editing.assigneeIds.includes(userId)
            ? editing.assigneeIds.filter(id => id !== userId)
            : [...editing.assigneeIds, userId];
        setEditing({ ...editing, assigneeIds: ids });
    };

    const getCategoryName = (id?: string) => categories.find(c => c.id === id)?.name;

    const label = (text: string) => (
        <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '13px' }}>{text}</label>
    );

    return (
        <div style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                    <h3 style={{ fontSize: '15px', margin: 0 }}>Templates</h3>
                    <p className="text-muted">Vorlagen für häufige Wartungsaufgaben.</p>
                </div>
                <button className="btn btn-primary" onClick={openNew} style={{ gap: '0.375rem' }}>
                    <Plus size={15} /> New Template
                </button>
            </div>

            {templates.length === 0 ? (
                <p className="text-muted">No templates yet. Create one to speed up task creation.</p>
            ) : (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                    {templates.map((t, i) => (
                        <div key={t.id} style={{
                            display: 'flex', alignItems: 'center', padding: '0.625rem 0.875rem', gap: '0.75rem',
                            borderBottom: i < templates.length - 1 ? '1px solid var(--border-color)' : 'none',
                            background: 'var(--bg-card)'
                        }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 500, fontSize: '14px' }}>{t.title}</div>
                                <div className="text-muted" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {t.recurrence !== 'none' && <span>{t.recurrence}</span>}
                                    {t.reminderDays > 0 && <span>{t.reminderDays}d reminder</span>}
                                    {t.categoryId && <span>{getCategoryName(t.categoryId)}</span>}
                                    {t.assigneeIds.length > 0 && (
                                        <span>{t.assigneeIds.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(', ')}</span>
                                    )}
                                </div>
                            </div>
                            <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '12px', border: '1px solid var(--border-color)' }}
                                onClick={() => onApply(t)} title="Use this template">
                                <Copy size={13} /> Use
                            </button>
                            <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => openEdit(t)}>
                                <Pencil size={14} />
                            </button>
                            <button className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--danger)' }} onClick={() => handleDelete(t.id)}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit / Create Modal */}
            {editing && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
                    <div style={{ width: '100%', maxWidth: '540px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '4px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3 style={{ margin: 0, fontSize: '15px' }}>{isNew ? 'New Template' : 'Edit Template'}</h3>
                            <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={close}><X size={18} /></button>
                        </div>
                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                {label('Title')}
                                <input className="input" type="text" value={editing.title} autoFocus
                                    onChange={e => setEditing({ ...editing, title: e.target.value })}
                                    placeholder="e.g. Monatliche Server-Prüfung" />
                            </div>
                            <div>
                                {label('Description')}
                                <textarea className="input" value={editing.description}
                                    onChange={e => setEditing({ ...editing, description: e.target.value })}
                                    style={{ minHeight: '70px', resize: 'vertical' }}
                                    placeholder="Details, Checkliste..." />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    {label('Category')}
                                    <select className="input" value={editing.categoryId || ''}
                                        onChange={e => setEditing({ ...editing, categoryId: e.target.value || undefined })}>
                                        <option value="">No Category</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    {label('Reminder (Days Before)')}
                                    <input className="input" type="number" min="0" value={editing.reminderDays}
                                        onChange={e => setEditing({ ...editing, reminderDays: parseInt(e.target.value) || 0 })} />
                                </div>
                                <div>
                                    {label('Recurrence')}
                                    <select className="input" value={editing.recurrence}
                                        onChange={e => setEditing({ ...editing, recurrence: e.target.value as Template['recurrence'] })}>
                                        <option value="none">None</option>
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                        <option value="yearly">Yearly</option>
                                    </select>
                                </div>
                                {editing.recurrence !== 'none' && (
                                    <div>
                                        {label('Interval')}
                                        <input className="input" type="number" min="1" value={editing.recurrenceInterval}
                                            onChange={e => setEditing({ ...editing, recurrenceInterval: parseInt(e.target.value) || 1 })} />
                                    </div>
                                )}
                            </div>
                            <div>
                                {label('Default Assignees')}
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {users.map(u => {
                                        const selected = editing.assigneeIds.includes(u.id);
                                        return (
                                            <button key={u.id} type="button" onClick={() => toggleAssignee(u.id)} style={{
                                                padding: '0.3rem 0.75rem', borderRadius: '2px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                                                border: `1px solid ${selected ? 'var(--primary)' : 'var(--border-color)'}`,
                                                background: selected ? 'var(--primary-light)' : 'var(--bg-card)',
                                                color: selected ? 'var(--primary)' : 'var(--text-muted)',
                                            }}>{u.name}</button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                                <button className="btn" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)' }} onClick={close}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleSave}>Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TemplateManager;
