import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Register() {
  const { register, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'business',
    business_name: '',
    sector: '',
    advisor_code: (searchParams.get('code') || '').toUpperCase(),
  });
  const [sectors, setSectors] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/sectors');
        if (!cancelled) setSectors(data.sectors || []);
      } catch {
        // Sector list is only needed for the dropdown; submit will still
        // surface a clear error if sector ends up missing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await register({
        ...form,
        business_name: form.role === 'business' ? form.business_name : undefined,
        sector: form.role === 'business' ? form.sector : undefined,
        advisor_code: form.role === 'business' ? form.advisor_code.trim() || undefined : undefined,
      });
      navigate(user.role === 'advisor' ? '/advisor' : '/assessment', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="mb-2 font-display text-3xl font-bold">Create your account</h1>
      <p className="mb-8 text-sm text-muted">Join as a business owner or advisor.</p>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">Name</span>
          <input
            required
            value={form.name}
            onChange={update('name')}
            className="w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm outline-none focus:border-amber"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">Email</span>
          <input
            type="email"
            required
            value={form.email}
            onChange={update('email')}
            className="w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm outline-none focus:border-amber"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={update('password')}
            className="w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm outline-none focus:border-amber"
          />
        </label>

        <fieldset>
          <legend className="mb-1.5 text-xs font-mono uppercase tracking-wide text-muted">Role</legend>
          <div className="grid grid-cols-2 gap-2">
            {['business', 'advisor'].map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setForm((f) => ({ ...f, role }))}
                className={`rounded-xl border px-3 py-2.5 text-sm capitalize transition ${
                  form.role === role
                    ? 'border-amber bg-amber/15 text-amber'
                    : 'border-border text-muted hover:text-text'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </fieldset>

        {form.role === 'business' && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">
                Business name
              </span>
              <input
                value={form.business_name}
                onChange={update('business_name')}
                className="w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm outline-none focus:border-amber"
                placeholder="Optional"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">
                Business sector
              </span>
              <select
                required
                value={form.sector}
                onChange={update('sector')}
                className="w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm outline-none focus:border-amber"
              >
                <option value="" disabled>
                  Select your sector…
                </option>
                {sectors.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted">
                We tailor your assessment questions and roadmap to your sector.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-mono uppercase tracking-wide text-muted">
                Advisor code
              </span>
              <input
                value={form.advisor_code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, advisor_code: e.target.value.toUpperCase() }))
                }
                placeholder="Optional"
                maxLength={20}
                className="w-full rounded-xl border border-border bg-ink px-3 py-2.5 text-sm uppercase outline-none focus:border-amber"
              />
              <span className="mt-1 block text-xs text-muted">
                If an advisor gave you a code, enter it here to link your account to them.
              </span>
            </label>
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-amber py-2.5 text-sm font-semibold text-ink transition hover:bg-amber/90 disabled:opacity-60"
        >
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="text-teal hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
