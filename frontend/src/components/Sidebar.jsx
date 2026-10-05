/**
 * Sidebar — Gemini-style: collapsible, grouped history (pinned / today / 7 days / older),
 * per-chat menu (pin, rename, delete), settings popover (theme + language).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Check, Globe, Menu, Monitor, Moon, MoreVertical, Pencil, Pin, PinOff, Search, Settings,
  SquarePen, Sun, Trash2, X,
} from 'lucide-react';
import { Logo } from './Logo';
import { useI18n, useTheme } from '../context/AppContext';
import { useClickOutside } from '../hooks/useClickOutside';

const DAY = 24 * 60 * 60 * 1000;

function groupConversations(convs, t) {
  const now = Date.now();
  const startToday = new Date().setHours(0, 0, 0, 0);
  const groups = [
    { key: 'pinned', title: t('pinned'), items: [] },
    { key: 'today', title: t('today'), items: [] },
    { key: 'week', title: t('last7'), items: [] },
    { key: 'older', title: t('older'), items: [] },
  ];
  convs.forEach((c) => {
    const ts = new Date(c.updated_at || c.created_at).getTime();
    if (c.pinned) groups[0].items.push(c);
    else if (ts >= startToday) groups[1].items.push(c);
    else if (now - ts <= 7 * DAY) groups[2].items.push(c);
    else groups[3].items.push(c);
  });
  return groups.filter((g) => g.items.length);
}

function ConvItem({ conv, active, onSelect, onPin, onRename, onDelete }) {
  const { t } = useI18n();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef(null);
  const close = useCallback(() => setMenu(false), []);
  useClickOutside(ref, close, menu);

  const startEdit = () => {
    setMenu(false);
    setDraft(conv.title || '');
    setEditing(true);
  };
  const commit = () => {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== conv.title) onRename(conv.id, v);
  };

  return (
    <div
      ref={ref}
      id={`conv-${conv.id}`}
      className={`sb-item ${active ? 'active' : ''} ${menu ? 'menu-open' : ''}`}
      onClick={() => !editing && onSelect(conv.id)}
      title={conv.title || t('untitled')}
    >
      {editing ? (
        <input
          className="sb-rename"
          autoFocus
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <>
          <span className="sb-item-title">{conv.title || t('untitled')}</span>
          {conv.pinned && <Pin size={13} className="pin-ico" />}
          <button
            className="sb-item-more"
            aria-label="Menu"
            onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}
          >
            <MoreVertical size={17} />
          </button>
        </>
      )}

      {menu && (
        <div className="popover" role="menu" onClick={(e) => e.stopPropagation()}>
          <button className="menu-item" onClick={() => { setMenu(false); onPin(conv); }}>
            <span className="mi-icon">{conv.pinned ? <PinOff size={17} /> : <Pin size={17} />}</span>
            {conv.pinned ? t('unpin') : t('pin')}
          </button>
          <button className="menu-item" onClick={startEdit}>
            <span className="mi-icon"><Pencil size={17} /></span>
            {t('rename')}
          </button>
          <button className="menu-item danger" onClick={() => { setMenu(false); onDelete(conv.id); }}>
            <span className="mi-icon"><Trash2 size={17} /></span>
            {t('delete')}
          </button>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  conversations, activeConvId, collapsed, mobileOpen,
  onToggleCollapse, onCloseMobile, onSelectConv, onNewChat, onDeleteConv, onRenameConv, onPinConv,
}) {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useClickOutside(settingsRef, closeSettings, settingsOpen);

  const filtered = useMemo(
    () => conversations.filter((c) => (c.title || '').toLowerCase().includes(query.toLowerCase())),
    [conversations, query]
  );
  const groups = useMemo(() => groupConversations(filtered, t), [filtered, t]);

  const select = (id) => { onSelectConv(id); onCloseMobile?.(); };
  const newChat = () => { onNewChat(); onCloseMobile?.(); };

  return (
    <>
      {mobileOpen && <div className="sb-scrim" onClick={onCloseMobile} />}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Sidebar">
        <div className="sb-top">
          <button
            id="sidebar-toggle-btn"
            className="icon-btn sb-collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? t('expand') : t('collapse')}
            aria-label={collapsed ? t('expand') : t('collapse')}
          >
            <Menu size={22} />
          </button>
          {mobileOpen && (
            <button className="icon-btn mobile-only" onClick={onCloseMobile} aria-label="Close"><X size={22} /></button>
          )}
          {(!collapsed || mobileOpen) && (
            <div className="sb-brand">
              <Logo size={30} />
              <span className="gradient-text">DGXAI</span>
            </div>
          )}
        </div>

        <button id="new-chat-btn" className="sb-newchat" onClick={newChat} title={t('newChat')}>
          <SquarePen size={20} />
          <span className="sb-label">{t('newChat')}</span>
        </button>

        {searching && !collapsed ? (
          <div className="sb-search">
            <Search size={18} />
            <input
              autoFocus
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('searchChats')}
            />
            <button className="icon-btn sm" onClick={() => { setSearching(false); setQuery(''); }} aria-label="Close search">
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            id="search-chats-btn"
            className="sb-search-btn"
            onClick={() => { if (collapsed) onToggleCollapse(); setSearching(true); }}
            title={t('searchChats')}
          >
            <Search size={20} />
            <span className="sb-label">{t('searchChats')}</span>
          </button>
        )}

        <div className="sb-scroll">
          {groups.length === 0 && (
            <div className="sb-empty">{query ? t('noResults') : t('noChats')}</div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <div className="sb-group-title">{g.title}</div>
              {g.items.map((c) => (
                <ConvItem
                  key={c.id}
                  conv={c}
                  active={activeConvId === c.id}
                  onSelect={select}
                  onPin={onPinConv}
                  onRename={onRenameConv}
                  onDelete={onDeleteConv}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="sb-bottom" ref={settingsRef}>
          {settingsOpen && (
            <div className="popover sb-settings-pop" role="menu">
              <div className="menu-label">{t('theme')}</div>
              <div className="seg" role="radiogroup" aria-label={t('theme')}>
                {[
                  ['light', t('themeLight'), <Sun size={15} key="s" />],
                  ['dark', t('themeDark'), <Moon size={15} key="m" />],
                  ['system', t('themeSystem'), <Monitor size={15} key="d" />],
                ].map(([val, label, icon]) => (
                  <button key={val} className={mode === val ? 'on' : ''} onClick={() => setMode(val)} role="radio" aria-checked={mode === val} title={label}>
                    {icon}
                  </button>
                ))}
              </div>
              <div className="menu-sep" />
              <div className="menu-label">{t('language')}</div>
              {[['vi', 'Tiếng Việt'], ['en', 'English']].map(([code, label]) => (
                <button key={code} className="menu-item" onClick={() => setLang(code)}>
                  <span className="mi-icon"><Globe size={17} /></span>
                  {label}
                  {lang === code && <Check size={17} className="mi-check" />}
                </button>
              ))}
            </div>
          )}
          <button id="settings-btn" className="sb-settings-btn" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen}>
            <Settings size={20} />
            <span className="sb-label">{t('settings')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
