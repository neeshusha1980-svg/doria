import { useEffect, useState } from 'react';
import { LoaderCircle, LogIn, Plus, ShieldCheck, X } from 'lucide-react';
import { auth, type AuthModalMode } from '../lib/auth';
import { getApiErrorMessage } from '../apiErrors';

type AuthDialogProps = {
  onAuthenticated: () => Promise<void> | void;
};

export default function AuthDialog({ onAuthenticated }: AuthDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthModalMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const googleEnabled = String(import.meta.env.VITE_GOOGLE_AUTH_ENABLED || '').toLowerCase() === 'true';

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const custom = event as CustomEvent<{ mode?: AuthModalMode }>;
      setMode(custom.detail?.mode === 'signup' ? 'signup' : 'signin');
      setError('');
      setOpen(true);
    };
    window.addEventListener('doria-open-auth', handleOpen);
    return () => window.removeEventListener('doria-open-auth', handleOpen);
  }, []);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        const cleanName = name.trim() || email.split('@')[0] || 'Creator';
        await auth.signUpWithEmail(email.trim(), password, cleanName);
      } else {
        await auth.signInWithEmail(email.trim(), password);
      }
      setOpen(false);
      setPassword('');
      await onAuthenticated();
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          mode === 'signup'
            ? 'Could not create your account. Check your email and password (at least 8 characters).'
            : 'Invalid email or password. Please try again.'
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !busy) setOpen(false);
      }}
    >
      <form
        className="create-modal"
        onSubmit={handleSubmit}
        aria-label={mode === 'signup' ? 'Create Doria account' : 'Sign in to Doria'}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">
              <ShieldCheck size={13} /> DORIA ACCOUNT
            </span>
            <h2>{mode === 'signup' ? 'Create account' : 'Sign in'}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => !busy && setOpen(false)}
            aria-label="Close authentication dialog"
          >
            <X size={19} />
          </button>
        </div>

        <p className="panel-sub">
          {mode === 'signup'
            ? 'Create an independent Doria account to build worlds, earn Starlits, and connect with friends.'
            : 'Sign in with your Doria email and password.'}
        </p>

        {mode === 'signup' && (
          <label className="form-field">
            Display name
            <input
              required
              minLength={2}
              maxLength={40}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Star Creator"
            />
          </label>
        )}

        <label className="form-field">
          Email address
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="form-field">
          Password
          <input
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button className="button-primary full-button" type="submit" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle className="spin" size={16} />{' '}
              {mode === 'signup' ? 'Creating account…' : 'Signing in…'}
            </>
          ) : mode === 'signup' ? (
            <>
              <Plus size={16} /> Create account
            </>
          ) : (
            <>
              <LogIn size={16} /> Sign in
            </>
          )}
        </button>

        {googleEnabled && (
          <button
            type="button"
            className="onboarding-secondary"
            disabled={busy}
            onClick={() => void auth.signInWithGoogle()}
          >
            Continue with Google
          </button>
        )}

        <button
          type="button"
          className="onboarding-text-button"
          disabled={busy}
          onClick={() => {
            setMode(current => (current === 'signin' ? 'signup' : 'signin'));
            setError('');
          }}
        >
          {mode === 'signin'
            ? 'Need an account? Create one'
            : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
