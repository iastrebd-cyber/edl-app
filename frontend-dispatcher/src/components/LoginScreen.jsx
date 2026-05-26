/**
 * frontend-dispatcher/src/components/LoginScreen.jsx
 *
 * Full-screen login form — cybernetic Fleet OS style.
 * Props: onLoginSuccess: (user) => void
 * Uses { login } from '../auth'.
 */

import { useState } from 'react';
import { login } from '../auth';

const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password.',
  ACCOUNT_LOCKED:      null,   // uses server message
  NETWORK_ERROR:       'Cannot reach server. Check your connection.',
  SERVER_ERROR:        'Server error. Try again in a moment.',
};

export default function LoginScreen({ onLoginSuccess }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError(null);

    const result = await login(email.trim(), password);
    setLoading(false);

    if (result.ok) {
      onLoginSuccess(result.user);
      return;
    }

    if (result.error === 'ACCOUNT_LOCKED') {
      setError(result.message || 'Account locked. Contact your administrator.');
      return;
    }

    setError(ERROR_MESSAGES[result.error] || 'Login failed. Try again.');
  }

  return (
    <div style={{
      position:        'fixed',
      inset:           0,
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      background:      'var(--surface-dim)',
      zIndex:          9999,
    }}>

      {/* Background grid overlay */}
      <div style={{
        position:   'absolute',
        inset:      0,
        background: `
          linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        pointerEvents:  'none',
      }} />

      {/* Glow orb */}
      <div style={{
        position:     'absolute',
        top:          '20%',
        left:         '50%',
        transform:    'translateX(-50%)',
        width:        600,
        height:       300,
        borderRadius: '50%',
        background:   'radial-gradient(ellipse, rgba(0,229,255,0.06) 0%, transparent 70%)',
        pointerEvents:'none',
      }} />

      {/* Card */}
      <div style={{
        position:        'relative',
        width:           400,
        background:      'var(--surface-low)',
        border:          '1px solid var(--outline)',
        borderRadius:    'var(--r-xl)',
        padding:         '36px 32px',
        boxShadow:       '0 0 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,229,255,0.06)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily:    'var(--font-display)',
            fontSize:      22,
            fontWeight:    700,
            color:         'var(--on-surface)',
            letterSpacing: '-0.01em',
            marginBottom:  6,
          }}>
            FLEET<span style={{ color: 'var(--primary)' }}>_COMMAND</span>
          </div>
          <div style={{
            fontFamily:    'var(--font-mono)',
            fontSize:      10,
            color:         'var(--on-surface-dim)',
            letterSpacing: '0.12em',
          }}>
            DISPATCHER PORTAL
          </div>
        </div>

        {/* Divider */}
        <div style={{
          height:       1,
          background:   'linear-gradient(90deg, transparent, var(--outline), transparent)',
          marginBottom: 28,
        }} />

        {/* Form */}
        <form onSubmit={handleSubmit} autoComplete="on">

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display:       'block',
              fontFamily:    'var(--font-mono)',
              fontSize:      10,
              color:         'var(--on-surface-dim)',
              letterSpacing: '0.08em',
              marginBottom:  6,
            }}>
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              autoComplete="username"
              placeholder="dispatcher@carrier.com"
              required
              style={{
                width:        '100%',
                padding:      '10px 14px',
                background:   'var(--surface-mid)',
                border:       '1px solid var(--outline)',
                borderRadius: 'var(--r-md)',
                color:        'var(--on-surface)',
                fontFamily:   'var(--font-body)',
                fontSize:     14,
                outline:      'none',
                transition:   'border-color var(--ease-fast)',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--primary)'; }}
              onBlur={e  => { e.target.style.borderColor = 'var(--outline)'; }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <label style={{
              display:       'block',
              fontFamily:    'var(--font-mono)',
              fontSize:      10,
              color:         'var(--on-surface-dim)',
              letterSpacing: '0.08em',
              marginBottom:  6,
            }}>
              PASSWORD
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                autoComplete="current-password"
                placeholder="••••••••••••"
                required
                style={{
                  width:        '100%',
                  padding:      '10px 42px 10px 14px',
                  background:   'var(--surface-mid)',
                  border:       '1px solid var(--outline)',
                  borderRadius: 'var(--r-md)',
                  color:        'var(--on-surface)',
                  fontFamily:   'var(--font-body)',
                  fontSize:     14,
                  outline:      'none',
                  transition:   'border-color var(--ease-fast)',
                  boxSizing:    'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--primary)'; }}
                onBlur={e  => { e.target.style.borderColor = 'var(--outline)'; }}
              />
              {/* Visibility toggle */}
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position:   'absolute',
                  right:      12,
                  top:        '50%',
                  transform:  'translateY(-50%)',
                  background: 'none',
                  border:     'none',
                  cursor:     'pointer',
                  padding:    0,
                  color:      'var(--on-surface-dim)',
                  fontSize:   14,
                  lineHeight: 1,
                }}
                tabIndex={-1}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              padding:      '10px 14px',
              marginBottom: 16,
              background:   'var(--danger-glow)',
              border:       '1px solid var(--danger)',
              borderRadius: 'var(--r-md)',
              color:        'var(--danger)',
              fontFamily:   'var(--font-mono)',
              fontSize:     11,
              letterSpacing:'0.02em',
              lineHeight:   1.5,
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            style={{
              width:         '100%',
              padding:       '12px',
              background:    loading ? 'var(--surface-high)' : 'var(--primary)',
              color:         loading ? 'var(--on-surface-dim)' : 'var(--on-primary)',
              border:        'none',
              borderRadius:  'var(--r-md)',
              fontFamily:    'var(--font-mono)',
              fontSize:      12,
              fontWeight:    700,
              letterSpacing: '0.1em',
              cursor:        loading ? 'wait' : 'pointer',
              transition:    'all var(--ease-fast)',
              opacity:       (!email.trim() || !password) && !loading ? 0.5 : 1,
            }}
          >
            {loading ? 'AUTHENTICATING…' : 'AUTHENTICATE'}
          </button>
        </form>

        {/* Footer */}
        <div style={{
          marginTop:  24,
          textAlign:  'center',
          fontFamily: 'var(--font-mono)',
          fontSize:   10,
          color:      'var(--on-surface-dim)',
          letterSpacing: '0.04em',
        }}>
          Fleet OS · Dispatcher Access Only
        </div>
      </div>
    </div>
  );
}
