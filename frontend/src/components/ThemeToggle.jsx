import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition hover:border-amber/40 hover:text-text"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
