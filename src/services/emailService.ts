import { type SmtpSettings } from '../store/useStore';

export const sendEmail = async (
    _settings: SmtpSettings,
    to: string,
    subject: string,
    body: string,
    html?: string,
    icalEvent?: string,
    recipientUserIds?: string[]
): Promise<void> => {
    // Call the local backend API
    const token = localStorage.getItem('token');
    const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ to, subject, body, html, icalEvent, recipientUserIds })
    });

    if (!response.ok) {
        throw new Error('Failed to send email via backend');
    }
};
