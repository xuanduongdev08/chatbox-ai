/**
 * MessageInput – Gemini-style pill composer with attachment previews:
 *   - Live preview cards above prompt for uploaded documents and images.
 *   - Drag & drop and clipboard paste (Ctrl+V) for images/files.
 *   - + menu with separate "Upload document" and "Upload image".
 *   - RAG / Agent chips · model picker · mic · send / stop.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Cpu, Database, FileText, Image as ImageIcon, Mic, Plus, Square, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { ModelSelector } from './ModelSelector';
import { documentApi, errorMessage, resolveFileUrl } from '../services/api';
import { useI18n } from '../context/AppContext';
import { useClickOutside } from '../hooks/useClickOutside';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'tiff'];

function isImageFile(file) {
  if (file.type && file.type.startsWith('image/')) return true;
  const ext = (file.name || '').split('.').pop().toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

export function MessageInput({
  onSend, isStreaming, onCancel,
  models, modelsLoading, model, onModelChange,
  enableRag, enableAgent, onToggleRag, onToggleAgent,
  draft,
}) {
  const { t, lang } = useI18n();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [plusOpen, setPlusOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const textareaRef = useRef(null);
  const docInputRef = useRef(null);
  const imgInputRef = useRef(null);
  const plusRef = useRef(null);
  const recogRef = useRef(null);

  const closePlus = useCallback(() => setPlusOpen(false), []);
  useClickOutside(plusRef, closePlus, plusOpen);

  // External draft (e.g. "edit message")
  useEffect(() => {
    if (draft?.text !== undefined) {
      setText(draft.text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [draft]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

  useEffect(() => () => recogRef.current?.stop?.(), []);

  // Upload handler for any file/image
  const processUpload = useCallback(
    async (file) => {
      if (!file) return;
      const isImg = isImageFile(file);
      const attId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const preview = isImg ? URL.createObjectURL(file) : null;

      const newAtt = {
        id: attId,
        name: file.name || (isImg ? 'image.png' : 'document'),
        file_type: isImg ? 'image' : 'document',
        preview,
        url: null,
        uploading: true,
        size: file.size,
      };

      setAttachments((prev) => [...prev, newAtt]);
      const toastId = toast.loading(t('uploading', { name: file.name }));

      try {
        const { data } = await documentApi.upload(file);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === attId
              ? {
                  ...a,
                  uploading: false,
                  url: data.url,
                  safe_name: data.safe_name,
                  file_type: data.file_type || (isImg ? 'image' : 'document'),
                }
              : a
          )
        );

        if (!isImg) {
          // If a document was uploaded, auto-enable RAG so it can be queried immediately
          if (!enableRag) onToggleRag?.();
          toast.success(
            data.chunk_count > 0
              ? t('uploadedDoc', { n: data.chunk_count, name: data.filename })
              : t('uploaded', { name: data.filename }),
            { id: toastId }
          );
        } else {
          toast.success(t('uploaded', { name: data.filename }), { id: toastId });
        }
      } catch (err) {
        setAttachments((prev) => prev.filter((a) => a.id !== attId));
        toast.error(t('uploadFailed', { err: errorMessage(err) }), { id: toastId });
      }
    },
    [enableRag, onToggleRag, t]
  );

  const removeAttachment = (id) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (isStreaming) return;

    if (attachments.some((a) => a.uploading)) {
      toast('Vui lòng đợi tệp tải lên hoàn tất…', { icon: '⏳' });
      return;
    }

    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  // Clipboard paste support (Ctrl+V images / screenshots)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          processUpload(file);
        }
      }
    }
  };

  // Drag and drop support
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(processUpload);
    }
  };

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error(t('micUnsupported')); return; }
    if (listening) { recogRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    const base = text ? text + ' ' : '';
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join('');
      setText(base + transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recogRef.current = rec;
    rec.start();
    setListening(true);
  };

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(processUpload);
    }
    e.target.value = '';
    setPlusOpen(false);
  };

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  return (
    <div className="composer-wrap">
      <div
        className={`composer ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* ── Attachments Preview Row (Gemini-style) ── */}
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((att) => {
              const isImg = att.file_type === 'image' || (att.preview || (att.url && /\.(png|jpe?g|webp|gif|bmp|svg|ico|tiff)$/i.test(att.url)));
              const displaySrc = att.preview || resolveFileUrl(att.url);
              return (
                <div
                  key={att.id}
                  className={`att-card ${isImg ? 'is-img' : ''}`}
                  title={att.name}
                >
                  {isImg && displaySrc ? (
                    <img
                      src={displaySrc}
                      alt={att.name}
                      className="att-card-img"
                    />
                  ) : (
                    <>
                      <div className="att-card-badge">
                        {(att.name.split('.').pop() || 'DOC').toUpperCase().slice(0, 4)}
                      </div>
                      <div className="att-card-name">{att.name}</div>
                    </>
                  )}
                  <button
                    type="button"
                    className="att-card-remove"
                    onClick={() => removeAttachment(att.id)}
                    title={t('removeAttachment')}
                    aria-label={t('removeAttachment')}
                  >
                    <X size={13} />
                  </button>
                  {att.uploading && (
                    <div className="att-card-loading">
                      <div className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <textarea
          ref={textareaRef}
          id="message-input"
          className="composer-text"
          placeholder={t('askPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
          aria-label={t('askPlaceholder')}
        />

        <div className="composer-bar">
          <div className="composer-left" ref={plusRef}>
            <button
              id="attach-btn"
              type="button"
              className={`icon-btn ${plusOpen ? 'active' : ''}`}
              onClick={() => setPlusOpen((o) => !o)}
              aria-label={t('attach')}
              title={t('attach')}
              aria-expanded={plusOpen}
            >
              <Plus size={22} />
            </button>

            {plusOpen && (
              <div className="popover plus-pop" role="menu">
                <button
                  className="menu-item"
                  onClick={() => docInputRef.current?.click()}
                  role="menuitem"
                >
                  <span className="mi-icon"><FileText size={18} /></span>
                  {t('uploadFile')}
                </button>
                <button
                  className="menu-item"
                  onClick={() => imgInputRef.current?.click()}
                  role="menuitem"
                >
                  <span className="mi-icon"><ImageIcon size={18} /></span>
                  {t('uploadImage')}
                </button>
              </div>
            )}

            {/* Hidden file inputs */}
            <input
              ref={docInputRef}
              type="file"
              id="file-upload-input"
              className="sr-only"
              multiple
              accept=".pdf,.txt,.docx,.doc,.md,.csv,.json"
              onChange={handleFileInput}
              tabIndex={-1}
            />
            <input
              ref={imgInputRef}
              type="file"
              id="image-upload-input"
              className="sr-only"
              multiple
              accept="image/*"
              onChange={handleFileInput}
              tabIndex={-1}
            />

            <button
              id="toggle-rag-btn"
              type="button"
              className={`chip-toggle ${enableRag ? 'on' : ''}`}
              onClick={onToggleRag}
              title={t('ragHint')}
              aria-pressed={enableRag}
            >
              <Database size={16} /><span className="chip-label">{t('rag')}</span>
            </button>
            <button
              id="toggle-agent-btn"
              type="button"
              className={`chip-toggle ${enableAgent ? 'on' : ''}`}
              onClick={onToggleAgent}
              title={t('agentHint')}
              aria-pressed={enableAgent}
            >
              <Cpu size={16} /><span className="chip-label">{t('agent')}</span>
            </button>
          </div>

          <div className="composer-right">
            <ModelSelector models={models} loading={modelsLoading} value={model} onChange={onModelChange} />
            <button
              id="mic-btn"
              type="button"
              className={`icon-btn mic-btn ${listening ? 'listening' : ''}`}
              onClick={toggleMic}
              aria-label={t('mic')}
              title={t('mic')}
            >
              <Mic size={20} />
            </button>
            {isStreaming ? (
              <button id="cancel-stream-btn" className="stop-btn" onClick={onCancel} title={t('stop')} aria-label={t('stop')}>
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                id="send-message-btn"
                className="send-btn"
                onClick={handleSend}
                disabled={!hasContent}
                title={t('send')}
                aria-label={t('send')}
              >
                <ArrowUp size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="composer-hint">{t('disclaimer')}</div>
    </div>
  );
}
