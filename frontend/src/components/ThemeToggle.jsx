import { Moon, Sun } from 'lucide-react';
import { useTheme, useI18n } from '../context/AppContext';

/** Quick light/dark toggle button. */
export function ThemeToggle({ className = '' }) {
  const { resolved, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <button
      id="theme-toggle-btn"
      className={`icon-btn ${className}`}
      onClick={toggle}
      title={t('toggleTheme')}
      aria-label={t('toggleTheme')}
    >
      {resolved === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
