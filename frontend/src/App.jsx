/**
 * App.jsx – Root application component.
 * Manages conversations, toolbar mode toggles, and wires Sidebar + ChatWindow.
 */
import { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { Database, Cpu } from 'lucide-react';
import toast from 'react-hot-toast';

import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { historyApi } from './services/api';

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeMessages, setActiveMessages] = useState([]);
  const [enableRag, setEnableRag] = useState(false);
  const [enableAgent, setEnableAgent] = useState(false);

  // Load conversation list on mount
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const { data } = await historyApi.list();
      setConversations(data);
    } catch {
      // If auth fails, start with empty state (demo mode)
      setConversations([]);
    }
  };

  const handleSelectConv = useCallback(async (convId) => {
    setActiveConvId(convId);
    try {
      const { data } = await historyApi.get(convId);
      setActiveMessages(data.messages || []);
    } catch {
      setActiveMessages([]);
    }
  }, []);

  const handleNewChat = () => {
    setActiveConvId(null);
    setActiveMessages([]);
  };

  const handleDeleteConv = async (convId) => {
    try {
      await historyApi.delete(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConvId === convId) handleNewChat();
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete conversation');
    }
  };

  const activeConvTitle = conversations.find(c => c.id === activeConvId)?.title
    || (activeConvId ? 'Chat' : 'New Conversation');

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
          },
        }}
      />

      <div className="app-layout">
        {/* Sidebar */}
        <Sidebar
          conversations={conversations}
          activeConvId={activeConvId}
          onSelectConv={handleSelectConv}
          onNewChat={handleNewChat}
          onDeleteConv={handleDeleteConv}
        />

        {/* Main chat area */}
        <main className="chat-main">
          {/* Toolbar */}
          <div className="chat-toolbar">
            <span className="toolbar-title">{activeConvTitle}</span>
            <div className="toolbar-badges">
              <button
                id="toggle-rag-btn"
                className={`badge badge-rag ${enableRag ? 'active' : ''}`}
                onClick={() => {
                  setEnableRag(r => !r);
                  if (enableAgent) setEnableAgent(false);
                }}
                title="Toggle RAG document retrieval"
              >
                <Database size={11} />
                RAG {enableRag ? 'ON' : 'OFF'}
              </button>
              <button
                id="toggle-agent-btn"
                className={`badge badge-agent ${enableAgent ? 'active' : ''}`}
                onClick={() => {
                  setEnableAgent(a => !a);
                  if (enableRag) setEnableRag(false);
                }}
                title="Toggle Agentic tool execution"
              >
                <Cpu size={11} />
                Agent {enableAgent ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Chat window */}
          <ChatWindow
            key={activeConvId || 'new'}
            conversationId={activeConvId}
            initialMessages={activeMessages}
            enableRag={enableRag}
            enableAgent={enableAgent}
            onConversationCreated={(id) => {
              setActiveConvId(id);
              loadConversations();
            }}
          />
        </main>
      </div>
    </>
  );
}
