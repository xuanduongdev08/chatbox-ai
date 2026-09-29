/**
 * ChatWindow – Main chat UI with real-time token rendering.
 * Manages message list, streaming state, and SSE connection.
 */
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';
import { Bot, User, Database, Cpu } from 'lucide-react';

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

function TypingIndicator() {
  return (
    <div className="message-row fade-in">
      <div className="message-avatar avatar-ai"><Bot size={14} /></div>
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
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`message-bubble ${isUser ? 'user' : 'ai'}`}>
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{ margin: '8px 0', borderRadius: 8, fontSize: 13 }}
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>{children}</code>
                );
              },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
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

  // Sync initial messages when switching conversations
  useEffect(() => {
    setMessages(initialMessages);
    setStreamingContent('');
  }, [conversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, agentSteps]);

  const handleSend = async (text) => {
    const userMsg = { role: 'user', content: text, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setStreamingContent('');

    const endpoint = enableAgent
      ? `${BASE_URL}/api/v1/agent/stream`
      : `${BASE_URL}/api/v1/chat/stream`;

    const body = enableAgent
      ? { conversation_id: conversationId, message: text, tools: ['web_search', 'sql_query', 'email_sender'] }
      : { conversation_id: conversationId, message: text, enable_rag: enableRag };

    await startStream(endpoint, body, {
      onToken: (accumulated) => setStreamingContent(accumulated),
      onDone: (finalText) => {
        if (finalText) {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: finalText, id: Date.now() + 1 },
          ]);
        }
        setStreamingContent('');
      },
      onError: (errMessage) => {
        toast.error(errMessage || 'Failed to get AI response');
      },
    });
  };

  const handleFileUpload = async (file) => {
    const toastId = toast.loading(`Uploading ${file.name}…`);
    try {
      const { data } = await documentApi.upload(file);
      toast.success(`Indexed ${data.chunk_count} chunks from "${data.filename}"`, { id: toastId });
    } catch (err) {
      toast.error(`Upload failed: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <>
      {/* Messages */}
      <div className="messages-container">
        {isEmpty ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Bot size={32} color="#fff" />
            </div>
            <h2>How can I help you today?</h2>
            <p>
              Ask me anything. I can search the web, reason through problems,
              analyse documents, and more.
            </p>
            <div className="suggestion-chips">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="chip"
                  onClick={() => handleSend(s.replace(/^[^\s]+\s/, ''))}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id || msg.created_at} msg={msg} />
            ))}

            {/* Agent steps */}
            {(agentSteps.length > 0 || (isStreaming && enableAgent)) && (
              <AgentStatus steps={agentSteps} isStreaming={isStreaming} />
            )}

            {/* Streaming response */}
            {isStreaming && streamingContent && (
              <div className="message-row fade-in">
                <div className="message-avatar avatar-ai"><Bot size={14} /></div>
                <div className="message-bubble ai">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingContent}
                  </ReactMarkdown>
                  <span style={{
                    display: 'inline-block',
                    width: 2,
                    height: 14,
                    background: 'var(--accent)',
                    marginLeft: 2,
                    animation: 'bounce 1s infinite',
                    verticalAlign: 'text-bottom',
                  }} />
                </div>
              </div>
            )}

            {/* Typing indicator while waiting for first token */}
            {isStreaming && !streamingContent && !enableAgent && <TypingIndicator />}
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
