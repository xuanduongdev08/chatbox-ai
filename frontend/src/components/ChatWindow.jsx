/**
 * ChatWindow – Gemini-style chat surface.
 *   welcome screen · markdown answers · copy / regenerate / feedback · stop generating
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';
import {
  BookOpen, Check, Code2, Copy, Download, Lightbulb, Pencil, RefreshCw, Search, ThumbsDown, ThumbsUp,
} from 'lucide-react';

import { useSSE } from '../hooks/useSSE';
import { AgentStatus } from './AgentStatus';
import { MessageInput } from './MessageInput';
import { Logo } from './Logo';
import { errorMessage, resolveFileUrl } from '../services/api';
import { useI18n, useTheme } from '../context/AppContext';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/* ── Copy helper ── */
function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Copy failed');
    }
  }, []);
  return [copied, copy];
}

/* ── Markdown: code block with header + copy ── */
function CodeBlock({ language, code }) {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const [copied, copy] = useCopy();
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{language || 'code'}</span>
        <button onClick={() => copy(code)}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <SyntaxHighlighter
        style={resolved === 'dark' ? oneDark : oneLight}
        language={language || 'text'}
        PreTag="div"
        customStyle={{ margin: 0, padding: '16px', background: 'transparent', fontSize: 14, lineHeight: 1.6 }}
        codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

const mdComponents = {
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    const className = child?.props?.className || '';
    const match = /language-([\w-]+)/.exec(className);
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    return <CodeBlock language={match?.[1]} code={code} />;
  },
  table({ children }) {
    return <div className="table-wrap"><table>{children}</table></div>;
  },
  a({ href, children }) {
    return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
  },
};

const Markdown = memo(function Markdown({ content }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
    </div>
  );
});

/* ── Message rows ── */
function AiAvatar({ working }) {
  return <Logo size={32} className={`ai-avatar ${working ? 'working' : ''}`} />;
}

function UserMessage({ msg, onEdit }) {
  const { t } = useI18n();
  const [copied, copy] = useCopy();

  let atts = [];
  if (Array.isArray(msg.attachments)) {
    atts = msg.attachments;
  } else if (typeof msg.attachments === 'string') {
    try { atts = JSON.parse(msg.attachments); } catch {}
  }

  return (
    <div className="msg user">
      <div className="user-actions">
        {msg.content && (
          <button className="icon-btn sm" onClick={() => onEdit(msg.content)} title={t('edit')} aria-label={t('edit')}>
            <Pencil size={16} />
          </button>
        )}
        {msg.content && (
          <button className="icon-btn sm" onClick={() => copy(msg.content)} title={t('copy')} aria-label={t('copy')}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        )}
      </div>
      <div className="bubble-user">
        {atts.length > 0 && (
          <div className="msg-attachments">
            {atts.map((a, idx) => {
              const fileUrl = resolveFileUrl(a.url || a.preview);
              const isImg = a.file_type === 'image' || (a.type && a.type.startsWith('image/')) || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(a.name || '');
              return isImg ? (
                <img
                  key={idx}
                  src={fileUrl}
                  alt={a.name}
                  className="msg-att-img"
                  onClick={() => window.open(fileUrl, '_blank')}
                  title={a.name}
                />
              ) : (
                <a
                  key={idx}
                  href={fileUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="msg-att-doc"
                  title={a.name}
                >
                  <span className="doc-badge">{(a.name?.split('.').pop() || 'DOC').toUpperCase().slice(0, 4)}</span>
                  <span className="doc-name">{a.name}</span>
                </a>
              );
            })}
          </div>
        )}
        {msg.content && <div>{msg.content}</div>}
      </div>
    </div>
  );
}

function AiMessage({ msg, isLast, canRegenerate, onRegenerate }) {
  const { t } = useI18n();
  const [copied, copy] = useCopy();
  const [vote, setVote] = useState(null);
  return (
    <div className="msg ai">
      <AiAvatar />
      <div className="ai-body">
        <Markdown content={msg.content} />
        <div className="msg-actions">
          <button className={`icon-btn ${vote === 'up' ? 'on' : ''}`} onClick={() => setVote(vote === 'up' ? null : 'up')} title={t('goodResponse')} aria-label={t('goodResponse')}>
            <ThumbsUp size={17} fill={vote === 'up' ? 'currentColor' : 'none'} />
          </button>
          <button className={`icon-btn ${vote === 'down' ? 'on' : ''}`} onClick={() => setVote(vote === 'down' ? null : 'down')} title={t('badResponse')} aria-label={t('badResponse')}>
            <ThumbsDown size={17} fill={vote === 'down' ? 'currentColor' : 'none'} />
          </button>
          {isLast && canRegenerate && (
            <button className="icon-btn" onClick={onRegenerate} title={t('regenerate')} aria-label={t('regenerate')}>
              <RefreshCw size={17} />
            </button>
          )}
          <button className="icon-btn" onClick={() => copy(msg.content)} title={t('copy')} aria-label={t('copy')}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function StreamingMessage({ content }) {
  return (
    <div className="msg ai">
      <AiAvatar working />
      <div className="ai-body">
        <Markdown content={content} />
        <span className="stream-cursor" aria-hidden="true" />
      </div>
    </div>
  );
}

function TypingMessage() {
  return (
    <div className="msg ai">
      <AiAvatar working />
      <div className="ai-body">
        <div className="typing" aria-label="loading"><span /><span /><span /></div>
      </div>
    </div>
  );
}

/* ── Main component ── */
export function ChatWindow({
  conversationId,
  initialMessages = [],
  user,
  models, modelsLoading, model, onModelChange,
  enableRag, enableAgent, onToggleRag, onToggleAgent,
  onConversationCreated,
  onConversationsChanged,
}) {
  const { t } = useI18n();
  const [messages, setMessages] = useState(initialMessages);
  const [streamingContent, setStreamingContent] = useState('');
  const [draft, setDraft] = useState(null);
  const convIdRef = useRef(conversationId);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const stickRef = useRef(true);
  const { isStreaming, agentSteps, startStream, cancelStream } = useSSE();

  // Only auto-scroll while the user is near the bottom.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => {
    if (stickRef.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, streamingContent, agentSteps]);

  const send = useCallback(
    async (text, attachmentsOrOptions = [], maybeOptions = {}) => {
      let attachments = [];
      let options = {};
      if (Array.isArray(attachmentsOrOptions)) {
        attachments = attachmentsOrOptions;
        options = maybeOptions || {};
      } else if (attachmentsOrOptions && typeof attachmentsOrOptions === 'object') {
        options = attachmentsOrOptions;
      }
      const addUser = options.addUser !== false;

      const cleanAttachments = attachments.map((a) => ({
        name: a.name,
        safe_name: a.safe_name,
        file_type: a.file_type || 'document',
        url: a.url || a.preview,
        size: a.size,
      }));

      if (addUser) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'user',
            content: text,
            attachments: cleanAttachments.length > 0 ? cleanAttachments : undefined,
            id: `u-${Date.now()}`,
          },
        ]);
      }
      setStreamingContent('');
      stickRef.current = true;

      const endpoint = enableAgent ? `${BASE_URL}/api/v1/agent/stream` : `${BASE_URL}/api/v1/chat/stream`;
      const body = enableAgent
        ? { conversation_id: convIdRef.current, message: text, model, tools: ['web_search', 'sql_query', 'email_sender'] }
        : {
            conversation_id: convIdRef.current,
            message: text,
            model,
            enable_rag: enableRag,
            attachments: cleanAttachments.length > 0 ? cleanAttachments : undefined,
          };

      await startStream(endpoint, body, {
        onConversationId: (id) => {
          if (!convIdRef.current) {
            convIdRef.current = id;
            onConversationCreated?.(id);
          }
        },
        onToken: (acc) => setStreamingContent(acc),
        onDone: (finalText) => {
          if (finalText) {
            setMessages((prev) => [...prev, { role: 'assistant', content: finalText, id: `a-${Date.now()}` }]);
          }
          setStreamingContent('');
          onConversationsChanged?.();
        },
        onError: (msg) => toast.error(msg || t('aiFailed')),
      });
    },
    [enableAgent, enableRag, model, startStream, onConversationCreated, onConversationsChanged, t]
  );

  const handleRegenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser || isStreaming) return;
    setMessages((prev) => {
      const copy = [...prev];
      if (copy[copy.length - 1]?.role === 'assistant') copy.pop();
      return copy;
    });
    send(lastUser.content, [], { addUser: false });
  };

  const exportChat = () => {
    const md = messages
      .map((m) => `### ${m.role === 'user' ? 'You' : 'DGXAI'}\n\n${m.content}`)
      .join('\n\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dgxai-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const suggestions = useMemo(
    () => [
      { text: t('sug1'), icon: <Lightbulb size={20} /> },
      { text: t('sug2'), icon: <Search size={20} /> },
      { text: t('sug3'), icon: <BookOpen size={20} /> },
      { text: t('sug4'), icon: <Code2 size={20} /> },
    ],
    [t]
  );

  const firstName = (user?.full_name || user?.email || '').split(/[\s@]/)[0];
  const isEmpty = messages.length === 0 && !isStreaming;
  const lastIsAssistant = messages[messages.length - 1]?.role === 'assistant';

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-inner" style={isEmpty ? { minHeight: '100%', display: 'flex', flexDirection: 'column' } : undefined}>
          {isEmpty ? (
            <div className="welcome">
              <Logo size={64} className="welcome-logo" />
              <h1><span className="gradient-text">{t('greeting', { name: firstName })}</span></h1>
              <h2>{t('greetingSub')}</h2>
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s.text} className="sug-card" onClick={() => send(s.text)}>
                    <span>{s.text}</span>
                    <span className="sug-ico">{s.icon}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.length > 0 && (
                <div className="chat-toolbar">
                  <button className="icon-btn" onClick={exportChat} title={t('exportChat')} aria-label={t('exportChat')}>
                    <Download size={19} />
                  </button>
                </div>
              )}
              {messages.map((msg, i) =>
                msg.role === 'user' ? (
                  <UserMessage key={msg.id || msg.created_at || i} msg={msg} onEdit={(text) => setDraft({ text, n: Date.now() })} />
                ) : (
                  <AiMessage
                    key={msg.id || msg.created_at || i}
                    msg={msg}
                    isLast={i === messages.length - 1}
                    canRegenerate={lastIsAssistant && !isStreaming}
                    onRegenerate={handleRegenerate}
                  />
                )
              )}

              {(agentSteps.length > 0 || (isStreaming && enableAgent && !streamingContent)) && (
                <AgentStatus steps={agentSteps} isStreaming={isStreaming && !streamingContent} />
              )}
              {isStreaming && streamingContent && <StreamingMessage content={streamingContent} />}
              {isStreaming && !streamingContent && !enableAgent && <TypingMessage />}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <MessageInput
        onSend={send}
        isStreaming={isStreaming}
        onCancel={cancelStream}
        models={models}
        modelsLoading={modelsLoading}
        model={model}
        onModelChange={onModelChange}
        enableRag={enableRag}
        enableAgent={enableAgent}
        onToggleRag={onToggleRag}
        onToggleAgent={onToggleAgent}
        draft={draft}
      />
    </div>
  );
}
