import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const HOME_BY_ROLE = { admin: '/admin', advisor: '/advisor', business: '/dashboard' };

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(email, password);
      const from = location.state?.from;
      if (from) navigate(from, { replace: true });
      else navigate(HOME_BY_ROLE[user.role] || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="mb-2 font-display text-3xl font-bold">Welcome back</h1>
      <p className="mb-8 text-sm text-muted">Log in to continue your digital journey.</p>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm text-text outline-none focus:border-amber"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm text-text outline-none focus:border-amber"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-amber py-2.5 text-sm font-semibold text-ink transition hover:bg-amber/90 disabled:opacity-60"
        >
          {loading ? 'Signing in…' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <Link to="/register" className="text-teal hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-muted">
        Advisor set up your account?{' '}
        <Link to="/claim" className="text-teal hover:underline">
          Set your password
        </Link>
      </p>
    </div>
  );
}
