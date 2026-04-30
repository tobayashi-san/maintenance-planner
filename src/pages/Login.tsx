import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useLocation, useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const login = useStore((state) => state.login);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const saved = localStorage.getItem('theme');
        if (saved) document.documentElement.setAttribute('data-theme', saved);
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const success = await login({ email, password });
        if (success) {
            const params = new URLSearchParams(location.search);
            const redirect = params.get('redirect');
            navigate(redirect || '/dashboard');
        } else {
            setError('Invalid email or password');
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div style={{ marginBottom: '1.75rem' }}>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Wartungskalender</h1>
                    <p className="text-muted">Sign in to your account</p>
                </div>

                <form onSubmit={handleLogin}>
                    {error && (
                        <div style={{ padding: '0.625rem 0.75rem', marginBottom: '1.25rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '13px' }}>
                            {error}
                        </div>
                    )}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '13px' }}>Email</label>
                        <input
                            className="input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="user@domain.com"
                            autoFocus
                        />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '13px' }}>Password</label>
                        <input
                            className="input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.5rem' }}>
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
