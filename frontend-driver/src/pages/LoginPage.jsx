/**
 * src/pages/LoginPage.jsx
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/AuthContext';

export default function LoginPage() {
  const { t }        = useTranslation();
  const { login }    = useAuth();
  const navigate     = useNavigate();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      padding: 20,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🚛</div>
        <h1 style={{ color: '#f1f5f9', margin: '8px 0 4px', fontSize: 24, fontWeight: 700 }}>
          ELD Driver
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
          Electronic Logging Device
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 340 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>
            {t('email')}
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              width: '100%', padding: '12px 14px',
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 10, color: '#f1f5f9', fontSize: 15,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>
            {t('password')}
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              width: '100%', padding: '12px 14px',
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 10, color: '#f1f5f9', fontSize: 15,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: 14,
            background: '#450a0a', border: '1px solid #ef4444',
            borderRadius: 8, color: '#fca5a5', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: '14px 0',
            background: loading ? '#334155' : '#3b82f6',
            border: 'none', borderRadius: 10,
            color: '#fff', fontWeight: 700, fontSize: 16,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? t('loading') : t('login')}
        </button>
      </form>
    </div>
  );
}
