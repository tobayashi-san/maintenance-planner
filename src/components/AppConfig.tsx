import React, { useEffect, useState } from 'react';
import { Globe, Link as LinkIcon } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useStore, type AppSettings } from '../store/useStore';

const AppConfig: React.FC = () => {
    const { appSettings, fetchAppSettings, updateAppSettings } = useStore();
    const { showToast } = useNotification();
    const [settings, setSettings] = useState<AppSettings>(appSettings);

    useEffect(() => {
        fetchAppSettings();
    }, []);

    useEffect(() => {
        setSettings(appSettings);
    }, [appSettings]);

    const handleSave = async () => {
        try {
            await updateAppSettings(settings);
            showToast('APP_URL saved.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'APP_URL could not be saved.', 'error');
        }
    };

    return (
        <div>
            <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Globe size={16} />
                    Public App URL
                </h3>
                <p className="text-muted" style={{ marginTop: '0.4rem' }}>
                    Diese Adresse wird fuer Outlook, ICS-Links und Kalender-Links in E-Mails verwendet.
                </p>
            </div>

            <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '13px' }}>
                    APP_URL
                </label>
                <input
                    className="input"
                    type="url"
                    value={settings.publicAppUrl}
                    onChange={(e) => setSettings({ publicAppUrl: e.target.value })}
                    placeholder="https://example.com"
                />
                <p className="text-muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                    Outlook braucht eine oeffentlich erreichbare URL. `localhost` oder `127.0.0.1` funktionieren nicht als Internetkalender.
                </p>
            </div>

            <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '13px', fontWeight: 600, marginBottom: '0.5rem' }}>
                    <LinkIcon size={14} />
                    Verwendung
                </div>
                <div className="text-muted" style={{ display: 'grid', gap: '0.35rem' }}>
                    <div>Outlook-URL im Kalender</div>
                    <div>ICS-Abonnement fuer externe Kalender</div>
                    <div>Direktlinks in Erinnerungs-E-Mails</div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleSave}>Save APP_URL</button>
            </div>
        </div>
    );
};

export default AppConfig;
