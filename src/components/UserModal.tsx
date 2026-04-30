import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { sendEmail } from '../services/emailService';
import { useStore, type User } from '../store/useStore';
import { getWelcomeEmailHtml } from '../utils/emailTemplates';
import { generateId } from '../utils/id';
import { useNotification } from '../context/NotificationContext';

interface UserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (user: User & { password?: string }) => Promise<void>;
    initialData?: User | null;
}

const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: 500,
    fontSize: '0.875rem',
};

const baseInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.625rem',
    borderRadius: '4px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-body)',
    color: 'var(--text-main)',
};

const UserModal: React.FC<UserModalProps> = ({ isOpen, onClose, onSubmit, initialData }) => {
    const { smtpSettings } = useStore();
    const { showToast } = useNotification();
    const [formData, setFormData] = useState<User>({
        id: '',
        name: '',
        email: '',
        role: 'user',
    });
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
            setPassword('');
        } else {
            const array = new Uint8Array(12);
            crypto.getRandomValues(array);
            setFormData({
                id: generateId(),
                name: '',
                email: '',
                role: 'user',
            });
            setPassword(Array.from(array, (value) => value.toString(36)).join('').slice(0, 12));
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const generatePassword = () => {
        const array = new Uint8Array(12);
        crypto.getRandomValues(array);
        setPassword(Array.from(array, (value) => value.toString(36)).join('').slice(0, 12));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            await onSubmit({ ...formData, password });
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'User could not be saved.', 'error');
            return;
        }

        if (!initialData) {
            showToast(`Sending welcome email to ${formData.email}...`, 'info');
            try {
                const plainTextBody = `Hello ${formData.name},\n\nYour account has been created.\n\nLogin details:\nEmail: ${formData.email}\nPassword: ${password}\n\nPlease change your password after login.`;
                const htmlBody = getWelcomeEmailHtml(formData.name, formData.email, password);

                await sendEmail(
                    smtpSettings,
                    formData.email,
                    'Welcome to Maintenance Calendar',
                    plainTextBody,
                    htmlBody
                );
                showToast('Welcome email sent!', 'success');
            } catch (err) {
                console.error(err);
                showToast('Failed to send welcome email.', 'error');
            }
        }

        onClose();
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }}>
            <div className="card" style={{ width: '100%', maxWidth: '500px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3>{initialData ? 'Edit User' : 'Add User'}</h3>
                    <button onClick={onClose} className="btn btn-ghost" style={{ padding: '0.25rem' }}>
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={fieldLabelStyle}>Name</label>
                        <input
                            className="input"
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={fieldLabelStyle}>Email</label>
                        <input
                            className="input"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                    </div>

                    {!initialData && (
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={fieldLabelStyle}>Initial Password</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="text"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    style={baseInputStyle}
                                />
                                <button
                                    type="button"
                                    onClick={generatePassword}
                                    className="btn"
                                    style={{ border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--text-main)' }}
                                >
                                    Generate
                                </button>
                            </div>
                            <small className="text-muted">User will receive this via email.</small>
                        </div>
                    )}

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={fieldLabelStyle}>Role</label>
                        <select
                            className="input"
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                        >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn"
                            style={{ border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--text-main)' }}
                        >
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserModal;
