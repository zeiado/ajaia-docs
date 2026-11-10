import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useAuth } from '../auth';
import { message, RequestError } from '../api';

const DEMO_ACCOUNTS = [
  { username: 'alice', name: 'Alice Johnson' },
  { username: 'bob', name: 'Bob Smith' },
  { username: 'carol', name: 'Carol Lee' },
];
const DEMO_PASSWORD = 'ajaia-demo';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) {
    navigate(location.state?.from ?? '/', { replace: true });
  }

  async function submit(event?: FormEvent, asUsername?: string) {
    event?.preventDefault();
    const name = asUsername ?? username;
    setBusy(true);
    setError('');
    try {
      await login(name, asUsername ? DEMO_PASSWORD : password);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof RequestError ? message(err) : 'Sign in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><FileText size={22} /></span>
          <span className="brand-name">Ajaia Docs</span>
        </div>
        <h1>Shared writing, without the friction</h1>
        <p className="login-sub">A lightweight collaborative document editor. Sign in with a demo account to explore owned and shared documents.</p>

        <div className="demo-accounts" aria-label="Quick demo sign in">
          {DEMO_ACCOUNTS.map(account => (
            <button key={account.username} type="button" className="demo-account" disabled={busy} onClick={() => submit(undefined, account.username)}>
              <span className="avatar" aria-hidden="true">{account.name[0]}</span>
              <span className="demo-account-text">
                <strong>{account.name}</strong>
                <small>@{account.username}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="login-divider"><span>or sign in manually</span></div>

        <form onSubmit={submit} className="login-form">
          <label>
            Username
            <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="login-hint">Demo credentials: <code>alice</code>, <code>bob</code> or <code>carol</code> — password <code>{DEMO_PASSWORD}</code></p>
      </div>
    </main>
  );
}