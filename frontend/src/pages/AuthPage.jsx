/**
 * AuthPage – Login / Register with email+password and "Continue with Google"
 * (Google Identity Services; client id is fetched from the backend at runtime).
 */
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, Mail, Sparkles, User, Zap, FileText } from 'lucide-react';

import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../context/AuthContext';
import { useI18n, useTheme } from '../context/AppContext';
import { authApi, errorMessage } from '../services/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** Labelled input with leading icon, optional trailing control and inline error. */
function Field({ id, label, icon, type = 'text', value, onChange, error, autoComplete, trail, placeholder }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`input-wrap ${error ? 'invalid' : ''}`}>
        <span className="lead">{icon}</span>
        <input
          id={id} name={id} type={type} value={value} onChange={onChange}
          autoComplete={autoComplete} placeholder={placeholder}
          className={trail ? 'has-trail' : ''} aria-invalid={!!error}
        />
        {trail && <span className="trail">{trail}</span>}
      </div>
      {error && <div className="field-error" role="alert">{error}</div>}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Google button: official GIS button when configured, otherwise an explanatory fallback. */
function GoogleButton({ onCredential }) {
  const { t, lang } = useI18n();
  const { resolved } = useTheme();
  const [clientId, setClientId] = useState(undefined); // undefined=loading, null=not configured
  const slotRef = useRef(null);
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;

  useEffect(() => {
    authApi.config().then(({ data }) => setClientId(data.google_client_id || null)).catch(() => setClientId(null));
  }, []);

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;

    const render = () => {
      if (cancelled || !window.google?.accounts?.id || !slotRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (res) => cbRef.current(res.credential),
        ux_mode: 'popup',
      });
      slotRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(slotRef.current, {
        type: 'standard',
        theme: resolved === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: Math.min(slotRef.current.offsetWidth || 380, 400),
        locale: lang,
      });
    };

    if (window.google?.accounts?.id) {
      render();
    } else {
      let script = document.querySelector(`script[src="${GSI_SRC}"]`);
      if (!script) {
        script = document.createElement('script');
        script.src = GSI_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
    }
    return () => { cancelled = true; };
  }, [clientId, resolved, lang]);

  if (clientId) return <div className="google-slot" ref={slotRef} />;

  return (
    <button
      id="google-signin-fallback"
      type="button"
      className="btn btn-outline btn-google"
      disabled={clientId === undefined}
      onClick={() => toast.error(t('googleNotConfigured'), { duration: 6000 })}
    >
      <GoogleIcon />
      {t('continueGoogle')}
    </button>
  );
}

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const { t } = useI18n();
  const { user, login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || '/';

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setErrors({}); setFormError(''); }, [mode]);

  if (user) return <Navigate to={redirectTo} replace />;

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const validate = () => {
    const er = {};
    if (isRegister && !form.name.trim()) er.name = t('errName');
    if (!EMAIL_RE.test(form.email.trim())) er.email = t('errEmail');
    if (form.password.length < (isRegister ? 8 : 1)) er.password = t('errPassword');
    if (isRegister && form.confirm !== form.password) er.confirm = t('errMatch');
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;
    setBusy(true);
    try {
      if (isRegister) await register(form.name.trim(), form.email.trim(), form.password);
      else await login(form.email.trim(), form.password);
      toast.success(t(isRegister ? 'registerSuccess' : 'loginSuccess'));
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, t('genericError')));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async (credential) => {
    setFormError('');
    try {
      await loginWithGoogle(credential);
      toast.success(t('loginSuccess'));
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, t('googleFailed')));
    }
  };


  const eyeBtn = (
    <button type="button" className="icon-btn sm" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? t('hidePassword') : t('showPassword')} tabIndex={-1}>
      {showPw ? <EyeOff size={19} /> : <Eye size={19} />}
    </button>
  );

  return (
    <main className="auth-page">
      <div className="auth-theme"><ThemeToggle /></div>

      <section className="auth-left">
        <div className="auth-card" key={mode}>
          <div className="auth-brand">
            <Logo size={44} />
            <span className="gradient-text">DGXAI</span>
          </div>

          <h1>{isRegister ? t('createAccount') : t('welcomeBack')}</h1>
          <p className="auth-sub">{isRegister ? t('registerSub') : t('loginSub')}</p>

          <form onSubmit={submit} noValidate>
            {formError && <div className="form-error" role="alert">{formError}</div>}

            {isRegister && (
              <Field id="name" label={t('fullName')} icon={<User size={19} />} value={form.name} onChange={set('name')} error={errors.name} autoComplete="name" />
            )}
            <Field id="email" label={t('email')} icon={<Mail size={19} />} type="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="email" placeholder="name@example.com" />
            <Field id="password" label={t('password')} icon={<Lock size={19} />} type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} error={errors.password} autoComplete={isRegister ? 'new-password' : 'current-password'} trail={eyeBtn} />
            {isRegister && (
              <Field id="confirm" label={t('confirmPassword')} icon={<Lock size={19} />} type={showPw ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" />
            )}

            {!isRegister && (
              <div className="row-between">
                <button type="button" className="link-btn" onClick={() => toast(t('forgotSoon'), { icon: '🔒' })}>
                  {t('forgotPassword')}
                </button>
              </div>
            )}

            <button id="auth-submit-btn" type="submit" className="btn btn-primary" disabled={busy} style={isRegister ? { marginTop: 8 } : undefined}>
              {busy ? <span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.4)' }} /> : (isRegister ? t('register') : t('login'))}
            </button>
          </form>

          <div className="divider">{t('or')}</div>
          <GoogleButton onCredential={onGoogle} />

          <p className="auth-switch">
            {isRegister ? t('haveAccount') : t('noAccount')}
            <Link id="auth-switch-link" to={isRegister ? '/login' : '/register'} state={location.state}>
              {isRegister ? t('login') : t('register')}
            </Link>
          </p>
        </div>
      </section>

      <aside className="auth-hero" aria-hidden="true">
        <div className="blob a" /><div className="blob b" /><div className="blob c" />
        <div className="hero-grid" />
        <div className="hero-content">
          <Logo size={96} className="hero-logo" />
          <h2 className="hero-title">{t('heroTitle')}</h2>
          <p className="hero-desc">{t('tagline')}</p>
          <ul className="hero-feats">
            <li><span className="fi"><Sparkles size={18} /></span>{t('heroF1')}</li>
            <li><span className="fi"><Zap size={18} /></span>{t('heroF2')}</li>
            <li><span className="fi"><FileText size={18} /></span>{t('heroF3')}</li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
