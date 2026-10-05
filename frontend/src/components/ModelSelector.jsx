import { useCallback, useRef, useState } from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import { useI18n } from '../context/AppContext';
import { useClickOutside } from '../hooks/useClickOutside';

/** "openai/gpt-oss-120b" → "GPT-OSS 120B" style label. */
export function prettyModel(id = '') {
  const name = id.split('/').pop();
  return name
    .replace(/gpt-oss/i, 'GPT-OSS')
    .split('-')
    .map((p) => (/^\d+(\.\d+)?[bkm]?$/i.test(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

/** Gemini-style model picker (opens upward from the composer). */
export function ModelSelector({ models, loading, value, onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  return (
    <div className="model-wrap" ref={ref}>
      <button
        id="model-selector-btn"
        type="button"
        className="model-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={t('chooseModel')}
      >
        <span>{value ? prettyModel(value) : t('model')}</span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="popover model-pop" role="listbox">
          <div className="menu-label">{t('chooseModel')}</div>
          {loading && <div className="sb-empty">{t('loadingModels')}</div>}
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={m.id === value}
              className={`model-opt ${m.id === value ? 'on' : ''}`}
              onClick={() => { onChange(m.id); setOpen(false); }}
            >
              <Sparkles size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div className="model-opt-name">{prettyModel(m.id)}</div>
                <div className="model-opt-sub">
                  {m.owner}{m.context_window ? ` · ${Math.round(m.context_window / 1000)}K ctx` : ''}
                </div>
              </div>
              {m.id === value && <Check size={18} className="mi-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
