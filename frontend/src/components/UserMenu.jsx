import { useCallback, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/AppContext';
import { useClickOutside } from '../hooks/useClickOutside';

export function UserAvatar({ user, size }) {
  const initial = (user?.full_name || user?.email || 'U').trim().charAt(0).toUpperCase();
  const style = size ? { width: size, height: size, fontSize: size * 0.42 } : undefined;
  return (
    <span className="avatar" style={style}>
      {user?.avatar_url ? <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" /> : initial}
    </span>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        id="user-menu-btn"
        className="avatar-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('account')}
        aria-expanded={open}
      >
        <UserAvatar user={user} />
      </button>

      {open && (
        <div className="popover user-pop" role="menu">
          <UserAvatar user={user} />
          <div className="user-pop-name">{user?.full_name || user?.email}</div>
          <div className="user-pop-email">{user?.email}</div>
          <div className="menu-sep" />
          <button id="logout-btn" className="menu-item danger" onClick={logout} role="menuitem">
            <span className="mi-icon"><LogOut size={18} /></span>
            {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}
