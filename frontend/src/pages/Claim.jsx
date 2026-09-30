import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Claim() {
  const { claim, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await claim(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not claim this account');
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="mb-2 font-display text-3xl font-bold">Set up your account</h1>
      <p className="mb-8 text-sm text-muted">
        If an advisor ran your digital maturity assessment with you, your account is already
        set up under the email they used — set a password here to log in and access it yourself.
      </p>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">
            Email your advisor used
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm text-text outline-none focus:border-amber"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">
            Create a password
          </span>
          <input
            type="password"
            required
            minLength={6}
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
          {loading ? 'Setting up…' : 'Set password & log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have a password?{' '}
        <Link to="/login" className="text-teal hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
