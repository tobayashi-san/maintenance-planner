import React, { useState, useEffect, useRef } from 'react';
import { X, Paperclip, Trash2, Download } from 'lucide-react';
import { useStore, type Task, type Attachment } from '../store/useStore';
import { sendEmail } from '../services/emailService';
import { getTaskAssignmentEmailHtml } from '../utils/emailTemplates';
import { generateIcsContent } from '../utils/icsHelper';
import { generateId } from '../utils/id';
import { useNotification } from '../context/NotificationContext';

interface TaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (task: Task) => Promise<void>;
    initialData?: Task | null;
    selectedDate?: Date;
}

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSubmit, initialData, selectedDate }) => {
    const { user, users, smtpSettings, fetchAttachments, uploadAttachment, deleteAttachment } = useStore();
    const { showToast } = useNotification();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canManageAttachments = user?.role === 'admin';

    const [formData, setFormData] = useState<Task>({
        id: '',
        title: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        assigneeIds: [],
        status: 'pending',
        recurrence: 'none',
        recurrenceInterval: 1,
        reminderDays: 0,
        completionNote: '',
    });
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [uploading, setUploading] = useState(false);

    const toLocalDateString = (date: Date) => {
        const offset = date.getTimezoneOffset();
        return new Date(date.getTime() - offset * 60 * 1000).toISOString().split('T')[0];
    };

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                date: new Date(initialData.date).toISOString().split('T')[0],
                reminderDays: initialData.reminderDays ?? 0,
                completionNote: initialData.completionNote ?? '',
            });
            fetchAttachments(initialData.id).then(setAttachments);
        } else {
            setFormData({
                id: generateId(),
                title: '',
                date: selectedDate ? toLocalDateString(selectedDate) : toLocalDateString(new Date()),
                description: '',
                assigneeIds: user ? [user.id] : users.length > 0 ? [users[0].id] : [],
                status: 'pending',
                recurrence: 'none',
                recurrenceInterval: 1,
                reminderDays: 1,
                completionNote: '',
            });
            setAttachments([]);
        }
    }, [fetchAttachments, initialData, isOpen, selectedDate, user, users]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const taskToSave = { ...formData, date: new Date(formData.date).toISOString() };
        try {
            await onSubmit(taskToSave);
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Task could not be saved.', 'error');
            return;
        }

        if (!initialData && taskToSave.assigneeIds.length > 0) {
            const assignees = users.filter(u => taskToSave.assigneeIds.includes(u.id));
            try {
                const icsContent = generateIcsContent(taskToSave);
                await sendEmail(smtpSettings, assignees.map(u => u.email).join(', '),
                    `New Task Assigned: ${taskToSave.title}`,
                    `You have been assigned: ${taskToSave.title}`,
                    getTaskAssignmentEmailHtml(taskToSave.title, taskToSave.date, taskToSave.description),
                    icsContent,
                    taskToSave.assigneeIds);
                showToast(`Email sent to ${assignees.length} assignee(s).`, 'success');
            } catch {
                showToast('Failed to send email notification.', 'error');
            }
        }
        onClose();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !initialData) return;
        setUploading(true);
        try {
            const att = await uploadAttachment(initialData.id, file);
            setAttachments(prev => [...prev, att]);
            showToast('File uploaded.', 'success');
        } catch {
            showToast('Upload failed.', 'error');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteAttachment = async (id: string) => {
        await deleteAttachment(id);
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    };

    const toggleAssignee = (userId: string) => {
        setFormData(prev => ({
            ...prev,
            assigneeIds: prev.assigneeIds.includes(userId)
                ? prev.assigneeIds.filter(id => id !== userId)
                : [...prev.assigneeIds, userId]
        }));
    };

    const label = (text: string) => (
        <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '13px' }}>{text}</label>
    );

    return (
        <div className="modal-overlay">
            <div className="task-modal">
                {/* Header */}
                <div className="task-modal-header">
                    <h3 style={{ margin: 0, fontSize: '15px' }}>{initialData ? 'Edit Task' : 'New Task'}</h3>
                    <button onClick={onClose} className="btn btn-ghost" style={{ padding: '0.25rem' }}>
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="task-modal-form">

                    {/* Title + Category */}
                    <div className="task-modal-grid task-modal-grid-main">
                        <div>
                            {label('Title')}
                            <input className="input" type="text" value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                required placeholder="e.g. Server Backup prüfen" autoFocus />
                        </div>
                        <div>
                            {label('Category')}
                            <select className="input" value={formData.categoryId || ''}
                                onChange={e => setFormData({ ...formData, categoryId: e.target.value || undefined })}>
                                <option value="">No Category</option>
                                {useStore.getState().categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        {label('Description')}
                        <textarea className="input" value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            style={{ minHeight: '80px', resize: 'vertical' }}
                            placeholder="Details, Schritte, Hinweise..." />
                    </div>

                    {/* Assignees */}
                    <div>
                        {label('Assignees')}
                        <div className="task-modal-assignees">
                            {users.map(u => {
                                const selected = formData.assigneeIds.includes(u.id);
                                return (
                                    <button key={u.id} type="button" onClick={() => toggleAssignee(u.id)}
                                        className={`task-modal-assignee ${selected ? 'selected' : ''}`}>
                                        {u.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Date / Reminder / Recurrence */}
                    <div className="task-modal-section task-modal-grid task-modal-grid-meta">
                        <div>
                            {label('Due Date')}
                            <input className="input" type="date" value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })} required />
                        </div>
                        <div>
                            {label('Reminder (Days Before)')}
                            <input className="input" type="number" min="0" max="365"
                                value={formData.reminderDays}
                                onChange={e => setFormData({ ...formData, reminderDays: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div>
                            {label('Status')}
                            <select className="input" value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value as Task['status'] })}>
                                <option value="pending">Pending</option>
                                <option value="completed">Completed</option>
                                <option value="canceled">Canceled</option>
                            </select>
                        </div>
                        <div>
                            {label('Recurrence')}
                            <select className="input" value={formData.recurrence}
                                onChange={e => setFormData({ ...formData, recurrence: e.target.value as Task['recurrence'] })}>
                                <option value="none">None</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                            </select>
                        </div>
                        {formData.recurrence !== 'none' && (
                            <div className="task-modal-recurrence-row">
                                <div className="task-modal-interval">
                                    {label('Interval')}
                                    <input className="input" type="number" min="1"
                                        value={formData.recurrenceInterval}
                                        onChange={e => setFormData({ ...formData, recurrenceInterval: parseInt(e.target.value) })} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    {label('End Date')}
                                    <input className="input" type="date"
                                        value={formData.recurrenceEndDate ? new Date(formData.recurrenceEndDate).toISOString().split('T')[0] : ''}
                                        onChange={e => setFormData({ ...formData, recurrenceEndDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Completion Note */}
                    {formData.status === 'completed' && (
                        <div>
                            {label('Completion Note')}
                            <textarea className="input" value={formData.completionNote || ''}
                                onChange={e => setFormData({ ...formData, completionNote: e.target.value })}
                                style={{ minHeight: '70px', resize: 'vertical' }}
                                placeholder="Was wurde gemacht? Wer hat es erledigt?" />
                        </div>
                    )}

                    {/* Attachments */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            {label('Attachments')}
                            {initialData && canManageAttachments ? (
                                <>
                                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                                    <button type="button" className="btn btn-ghost"
                                        style={{ fontSize: '12px', padding: '0.25rem 0.5rem', border: '1px solid var(--border-color)' }}
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}>
                                        <Paperclip size={14} /> {uploading ? 'Uploading...' : 'Add File'}
                                    </button>
                                </>
                            ) : (
                                <span className="text-muted" style={{ fontSize: '12px' }}>
                                    {initialData ? 'Attachments are available for admins only' : 'Save task first to add attachments'}
                                </span>
                            )}
                        </div>
                        {attachments.length > 0 && (
                            <div className="task-modal-attachments">
                                {attachments.map((att, i) => (
                                    <div key={att.id} className="task-modal-attachment-row" style={{
                                        borderBottom: i < attachments.length - 1 ? '1px solid var(--border-color)' : 'none',
                                    }}>
                                        <Paperclip size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.originalName}</span>
                                        <span className="text-muted" style={{ flexShrink: 0 }}>{formatBytes(att.size)}</span>
                                        <a href={`/api/uploads/${att.filename}?token=${encodeURIComponent(localStorage.getItem('token') || '')}`}
                                            className="btn btn-ghost" style={{ padding: '0.2rem' }} title="Download" target="_blank" rel="noreferrer">
                                            <Download size={14} />
                                        </a>
                                        {canManageAttachments && (
                                            <button type="button" className="btn btn-ghost"
                                                style={{ padding: '0.2rem', color: 'var(--danger)' }}
                                                onClick={() => handleDeleteAttachment(att.id)}>
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {attachments.length === 0 && initialData && (
                            <p className="text-muted">No attachments yet.</p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="task-modal-actions">
                        <button type="button" onClick={onClose} className="btn"
                            style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)' }}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {initialData ? 'Save Changes' : 'Create Task'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TaskModal;
