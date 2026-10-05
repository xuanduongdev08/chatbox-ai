/**
 * ChatWindow – Main chat UI with real-time token rendering.
 *
 * UI mirrors AIZOX ai-chat-bot.html:
 *   - Dark Surface background
 *   - AI bubbles: Surface bg + Line border
 *   - User bubbles: green-tinted with Primary border
 *   - Avatars: circular, AI gets gradient green
 *   - Typing indicator with Primary-colored dots
 *   - Empty state with floating icon + suggestion chips
 */
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';
import { Bot, User } from 'lucide-react';

import { useSSE } from '../hooks/useSSE';
import { AgentStatus } from './AgentStatus';
import { MessageInput } from './MessageInput';
import { documentApi } from '../services/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const SUGGESTIONS = [
  '✨ Explain quantum computing simply',
  '🔍 Search for the latest AI news',
  '📊 What is Retrieval-Augmented Generation?',
  '🛠️ Write a Python async function',
];

/* ── Markdown code renderer ── */
function CodeBlock({ node, inline, className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || '');
  return !inline && match ? (
    <SyntaxHighlighter
      style={oneDark}
      language={match[1]}
      PreTag="div"
      customStyle={{
        margin: '10px 0',
        borderRadius: 8,
        fontSize: 13,
        background: '#0E0E14',
        border: '1px solid #2A2839',
      }}
      {...props}
    >
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

function TypingIndicator() {
  return (
    <div className="message-row fade-in">
      <div className="message-avatar avatar-ai">
        <Bot size={16} />
      </div>
      <div className="typing-indicator">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`message-row ${isUser ? 'user' : ''}`}>
      <div className={`message-avatar ${isUser ? 'avatar-user' : 'avatar-ai'}`}>
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>
      <div className={`message-bubble ${isUser ? 'user' : 'ai'}`}>
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ code: CodeBlock }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

function StreamingBubble({ content }) {
  return (
    <div className="message-row fade-in">
      <div className="message-avatar avatar-ai">
        <Bot size={15} />
      </div>
      <div className="message-bubble ai">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{ code: CodeBlock }}
        >
          {content}
        </ReactMarkdown>
        <span className="stream-cursor" aria-hidden="true" />
      </div>
    </div>
  );
}

export function ChatWindow({
  conversationId,
  initialMessages = [],
  enableRag,
  enableAgent,
  onConversationCreated,
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [streamingContent, setStreamingContent] = useState('');
  const bottomRef = useRef(null);
  const { isStreaming, agentSteps, startStream, cancelStream } = useSSE();

  // Sync when switching conversations
  useEffect(() => {
    setMessages(initialMessages);
    setStreamingContent('');
  }, [conversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, agentSteps]);

  const handleSend = async (text) => {
    const userMsg = { role: 'user', content: text, id: `u-${Date.now()}` };
    setMessages((prev) => [...prev, userMsg]);
    setStreamingContent('');

    const endpoint = enableAgent
      ? `${BASE_URL}/api/v1/agent/stream`
      : `${BASE_URL}/api/v1/chat/stream`;

    const body = enableAgent
      ? {
          conversation_id: conversationId,
          message: text,
          tools: ['web_search', 'sql_query', 'email_sender'],
        }
      : {
          conversation_id: conversationId,
          message: text,
          enable_rag: enableRag,
        };

    await startStream(endpoint, body, {
      onToken: (accumulated) => setStreamingContent(accumulated),
      onDone: (finalText) => {
        if (finalText) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: finalText, id: `a-${Date.now()}` },
          ]);
        }
        setStreamingContent('');
      },
      onError: (errMessage) => {
        toast.error(errMessage || 'Failed to get AI response');
        setStreamingContent('');
      },
    });
  };

  const handleFileUpload = async (file) => {
    const toastId = toast.loading(`Uploading ${file.name}…`);
    try {
      const { data } = await documentApi.upload(file);
      toast.success(
        `Indexed ${data.chunk_count} chunks from "${data.filename}"`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(
        `Upload failed: ${err.response?.data?.detail || err.message}`,
        { id: toastId }
      );
    }
  };

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <>
      {/* Messages */}
      <div className="messages-container">
        {isEmpty ? (
          /* ── Empty / Welcome state ── */
          <div className="empty-state">
            <div className="empty-state-icon">
              <Bot size={38} color="var(--Primary)" />
            </div>
            <h2>How can I help you today?</h2>
            <p>
              Ask me anything — I can search the web, reason through problems,
              analyse documents, write code, and more.
            </p>
            <div className="suggestion-chips">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="chip"
                  onClick={() => handleSend(s.replace(/^[\S]+\s/, ''))}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id || msg.created_at || Math.random()} msg={msg} />
            ))}

            {/* Agent steps panel */}
            {(agentSteps.length > 0 || (isStreaming && enableAgent)) && (
              <AgentStatus steps={agentSteps} isStreaming={isStreaming} />
            )}

            {/* Streaming bubble with cursor */}
            {isStreaming && streamingContent && (
              <StreamingBubble content={streamingContent} />
            )}

            {/* Typing indicator — waiting for first token */}
            {isStreaming && !streamingContent && !enableAgent && (
              <TypingIndicator />
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        onFileUpload={handleFileUpload}
        isStreaming={isStreaming}
        onCancel={cancelStream}
      />
    </>
  );
}
