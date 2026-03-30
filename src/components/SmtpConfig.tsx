import React, { useState } from 'react';
import { sendEmail } from '../services/emailService';
import { useNotification } from '../context/NotificationContext';
import { useStore, type SmtpSettings } from '../store/useStore';

const SmtpConfig: React.FC = () => {
    const {
        smtpSettings,
        updateSmtpSettings,
        fetchSmtpSettings,
    } = useStore();
    const { showToast } = useNotification();
    const [settings, setSettings] = useState<SmtpSettings>(smtpSettings);
    const [testToEmail, setTestToEmail] = useState('test@example.com');
    const [isTestSending, setIsTestSending] = useState(false);

    React.useEffect(() => { fetchSmtpSettings(); }, []);
    React.useEffect(() => { setSettings(smtpSettings); }, [smtpSettings]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings((prev) => ({ ...prev, [name]: name === 'port' ? parseInt(value) || 0 : value }));
    };

    const handleSave = async () => {
        try {
            await updateSmtpSettings(settings);
            showToast('SMTP settings saved.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Settings could not be saved.', 'error');
        }
    };

    const handleTestEmail = async () => {
        if (!testToEmail) { showToast('Enter a recipient email.', 'error'); return; }
        setIsTestSending(true);
        try {
            await sendEmail(settings, testToEmail, 'Test Email', 'This is a test email from Wartungskalender.');
            showToast('Test email sent!', 'success');
        } catch {
            showToast('Failed to send test email.', 'error');
        } finally {
            setIsTestSending(false);
        }
    };

    const label = (text: string) => (
        <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '13px' }}>{text}</label>
    );

    return (
        <div>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>Configure outgoing email for reminders and test messages.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                    {label('SMTP Host')}
                    <input className="input" type="text" name="host" value={settings.host} onChange={handleChange} />
                </div>
                <div>
                    {label('Port')}
                    <input className="input" type="number" name="port" value={settings.port} onChange={handleChange} />
                </div>
                <div>
                    {label('User')}
                    <input className="input" type="text" name="user" value={settings.user} onChange={handleChange} />
                </div>
                <div>
                    {label('Password')}
                    <input className="input" type="password" name="password" value={settings.password} onChange={handleChange} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                    {label('From Email')}
                    <input className="input" type="email" name="fromEmail" value={settings.fromEmail} onChange={handleChange} />
                </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '0.75rem' }}>Test Configuration</div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        {label('Recipient Email')}
                        <input className="input" type="email" value={testToEmail}
                            onChange={(e) => setTestToEmail(e.target.value)} placeholder="recipient@example.com" />
                    </div>
                    <button className="btn" onClick={handleTestEmail} disabled={isTestSending}
                        style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)' }}>
                        {isTestSending ? 'Sending...' : 'Send Test'}
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
                </div>
            </div>
        </div>
    );
};

export default SmtpConfig;
