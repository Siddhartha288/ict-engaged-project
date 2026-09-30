import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, ClipboardList, Users, Sparkles, Lightbulb } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const linkClass = ({ isActive }) =>
    `text-sm transition-colors ${isActive ? 'text-amber' : 'text-muted hover:text-text'}`;

  return (
    <header className="border-b border-border/80 bg-ink/80 backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/15 text-amber">
            <Sparkles size={16} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-text">
            BizTransform
          </span>
        </Link>

        <nav className="flex items-center gap-5">
          <NavLink to="/problems-solutions" className={linkClass}>
            <span className="inline-flex items-center gap-1.5">
              <Lightbulb size={14} /> Problems &amp; Solutions
            </span>
          </NavLink>
          {isAuthenticated ? (
            <>
              <NavLink to="/dashboard" className={linkClass}>
                <span className="inline-flex items-center gap-1.5">
                  <LayoutDashboard size={14} /> Dashboard
                </span>
              </NavLink>
              <NavLink to="/assessment" className={linkClass}>
                <span className="inline-flex items-center gap-1.5">
                  <ClipboardList size={14} /> Assessment
                </span>
              </NavLink>
              {user?.role === 'advisor' && (
                <NavLink to="/advisor" className={linkClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <Users size={14} /> Advisor
                  </span>
                </NavLink>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm text-muted transition hover:border-amber/40 hover:text-text"
              >
                <LogOut size={14} /> Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={linkClass}>
                Log in
              </NavLink>
              <Link
                to="/register"
                className="rounded-xl bg-amber px-4 py-2 text-sm font-semibold text-ink transition hover:bg-amber/90"
              >
                Get started
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
