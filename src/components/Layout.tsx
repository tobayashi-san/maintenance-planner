import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Download, LogOut, Calendar, LayoutDashboard, Settings, Sun, Moon } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useNotification } from '../context/NotificationContext';

type InstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const Layout: React.FC = () => {
    const { user, logout } = useStore();
    const { notifications, unreadCount, markAsRead, markAllAsRead, notificationPermission, requestBrowserPermission } = useNotification();
    const navigate = useNavigate();
    const location = useLocation();
    const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
    const [isInboxOpen, setIsInboxOpen] = useState(false);
    const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
    const isSecureBrowserContext = typeof window !== 'undefined' && window.isSecureContext;

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, [dark]);

    useEffect(() => {
        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setInstallPrompt(event as InstallPromptEvent);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const isActive = (path: string) =>
        location.pathname === path || (path === '/' && location.pathname === '/dashboard');

    const installApp = async () => {
        if (!installPrompt) return;
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
    };

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    Wartungskalender
                </div>
                <nav className="sidebar-nav">
                    <Link to="/" className={`nav-item${isActive('/') ? ' active' : ''}`}>
                        <LayoutDashboard size={16} /> Dashboard
                    </Link>
                    <Link to="/calendar" className={`nav-item${isActive('/calendar') ? ' active' : ''}`}>
                        <Calendar size={16} /> Calendar
                    </Link>
                    {user?.role === 'admin' && (
                        <Link to="/admin" className={`nav-item${isActive('/admin') ? ' active' : ''}`}>
                            <Settings size={16} /> Admin
                        </Link>
                    )}
                </nav>
            </aside>
            <div className="main-content">
                <header className="top-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {!isSecureBrowserContext && (
                            <div className="top-header-warning">
                                PWA und Web-Benachrichtigungen brauchen HTTPS oder localhost. Auf internen http://10.x-Adressen blockiert der Browser beides.
                            </div>
                        )}
                        {installPrompt && (
                            <button onClick={installApp} className="btn btn-ghost" title="App installieren" style={{ padding: '0.375rem 0.625rem' }}>
                                <Download size={16} /> Install
                            </button>
                        )}
                        {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
                            <button onClick={requestBrowserPermission} className="btn btn-ghost" title="Browser-Benachrichtigungen aktivieren" style={{ padding: '0.375rem 0.625rem' }}>
                                <Bell size={16} /> Alerts
                            </button>
                        )}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setIsInboxOpen((open) => !open)}
                                className="btn btn-ghost"
                                title="Erinnerungen"
                                style={{ padding: '0.375rem', position: 'relative' }}
                            >
                                <Bell size={16} />
                                {unreadCount > 0 && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-2px',
                                        right: '-2px',
                                        minWidth: '18px',
                                        height: '18px',
                                        borderRadius: '999px',
                                        background: 'var(--danger)',
                                        color: '#fff',
                                        fontSize: '11px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0 4px'
                                    }}>
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                            {isInboxOpen && (
                                <div style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 10px)',
                                    right: 0,
                                    width: '360px',
                                    maxHeight: '420px',
                                    overflowY: 'auto',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
                                    zIndex: 20
                                }}>
                                    <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>Erinnerungen</div>
                                            <div className="text-muted">{notifications.length} Eintrag(e)</div>
                                        </div>
                                        <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem' }} onClick={markAllAsRead}>
                                            Alles gelesen
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {notifications.length === 0 ? (
                                            <div style={{ padding: '1rem' }} className="text-muted">Keine aktiven Erinnerungen.</div>
                                        ) : (
                                            notifications.map((notification) => (
                                                <button
                                                    key={notification.id}
                                                    type="button"
                                                    onClick={() => {
                                                        markAsRead(notification.id);
                                                        setIsInboxOpen(false);
                                                        navigate('/dashboard');
                                                    }}
                                                    style={{
                                                        textAlign: 'left',
                                                        padding: '0.9rem 1rem',
                                                        border: 'none',
                                                        borderBottom: '1px solid var(--border-color)',
                                                        background: notification.read ? 'var(--bg-card)' : 'var(--primary-light)',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 600, marginBottom: '0.15rem' }}>{notification.title}</div>
                                                    <div className="text-muted">{notification.message}</div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => setDark(d => !d)}
                            className="btn btn-ghost"
                            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                            style={{ padding: '0.375rem' }}
                        >
                            {dark ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                        <div style={{ textAlign: 'right' }}>
                            <Link to="/profile" style={{ display: 'block', fontWeight: 500, fontSize: '13px', color: 'var(--text-main)' }}>
                                {user?.name}
                            </Link>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{user?.email}</div>
                        </div>
                        <button onClick={handleLogout} className="btn btn-ghost" title="Logout" style={{ padding: '0.375rem' }}>
                            <LogOut size={16} />
                        </button>
                    </div>
                </header>
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default Layout;
