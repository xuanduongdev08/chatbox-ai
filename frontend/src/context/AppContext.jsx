import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translate } from '../i18n';

/* ─────────────────────────────── Theme ─────────────────────────────── */
const ThemeContext = createContext(null);

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => localStorage.getItem('dgxai_theme') || 'system');
  const [resolved, setResolved] = useState(() =>
    document.documentElement.getAttribute('data-theme') || 'dark'
  );

  useEffect(() => {
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
      const next = dark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#131314' : '#ffffff');
      setResolved(next);
    };
    apply();
    if (mode !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);

  const setMode = useCallback((m) => {
    localStorage.setItem('dgxai_theme', m);
    setModeState(m);
  }, []);

  const toggle = useCallback(() => setMode(resolved === 'dark' ? 'light' : 'dark'), [resolved, setMode]);

  const value = useMemo(() => ({ mode, resolved, setMode, toggle }), [mode, resolved, setMode, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/* ─────────────────────────────── I18n ──────────────────────────────── */
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('dgxai_lang') || 'vi');

  const setLang = useCallback((l) => {
    localStorage.setItem('dgxai_lang', l);
    document.documentElement.setAttribute('lang', l);
    setLangState(l);
  }, []);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
