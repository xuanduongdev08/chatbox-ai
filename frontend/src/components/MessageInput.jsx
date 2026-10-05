/**
 * MessageInput – Textarea + file attachment + send/stop button.
 *
 * UI mirrors the AIZOX chat input bar:
 *   - Surface background, Line border, rounded-xl pill shape
 *   - Primary green send button
 *   - Red stop button when streaming
 *   - Auto-expands with content (Shift+Enter for newlines)
 */
import { useRef, useState, useEffect } from 'react';
import { Send, Paperclip, Square } from 'lucide-react';

export function MessageInput({ onSend, onFileUpload, isStreaming, onCancel }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [text]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onFileUpload?.(file);
    e.target.value = '';
  };

  return (
    <div className="input-area">
      <div className="input-wrapper">
        {/* File attachment */}
        <label
          className="file-label icon-btn"
          title="Attach document (PDF, TXT, DOCX)"
          aria-label="Attach file"
        >
          <Paperclip size={16} />
          <input
            type="file"
            accept=".pdf,.txt,.docx,.doc"
            onChange={handleFileChange}
            id="file-upload-input"
          />
        </label>

        {/* Auto-expanding textarea */}
        <textarea
          ref={textareaRef}
          id="message-input"
          className="message-textarea"
          placeholder="Message ChatAI Pro… (Shift+Enter for new line)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="Message input"
        />

        {/* Send / Stop button */}
        <div className="input-actions">
          {isStreaming ? (
            <button
              id="cancel-stream-btn"
              className="stop-btn"
              onClick={onCancel}
              title="Stop generation"
              aria-label="Stop generation"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              id="send-message-btn"
              className="send-btn"
              onClick={handleSend}
              disabled={!text.trim()}
              title="Send message"
              aria-label="Send message"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="input-hint">
        ChatAI Pro may make mistakes. Verify important information.
      </div>
    </div>
  );
}
