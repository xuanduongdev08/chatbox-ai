/**
 * App.jsx – Root application component.
 *
 * UI mirrors AIZOX header-dashboard layout:
 *   - Fixed header with title, mode badges, info/notification dropdowns,
 *     dark-light toggle, user avatar menu.
 *   - Sidebar (section-menu-left) with conversations.
 *   - ChatWindow as the main content area.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import { Database, Cpu, Bell, Info, Sun, Moon, User, LogOut, Settings, ChevronDown } from 'lucide-react';
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
  const [darkMode, setDarkMode] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const userMenuRef = useRef(null);
  const notifRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const { data } = await historyApi.list();
      setConversations(data);
    } catch {
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
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) handleNewChat();
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete conversation');
    }
  };

  const activeConvTitle =
    conversations.find((c) => c.id === activeConvId)?.title ||
    (activeConvId ? 'Chat' : 'New Conversation');

  const notifications = [
    { id: 1, title: 'System update successful', time: '2 days ago' },
    { id: 2, title: 'Version 1.1 has been launched', time: '32 min ago' },
    { id: 3, title: 'New AI model available', time: '1 hour ago' },
  ];

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--Surface)',
            color: 'var(--OnSurface)',
            border: '1px solid var(--Line)',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            borderRadius: 12,
          },
        }}
      />

      <div className="app-layout">
        {/* ── Sidebar ── */}
        <Sidebar
          conversations={conversations}
          activeConvId={activeConvId}
          onSelectConv={handleSelectConv}
          onNewChat={handleNewChat}
          onDeleteConv={handleDeleteConv}
        />

        {/* ── Main chat area ── */}
        <main className="chat-main">
          {/* ── Header Dashboard ── */}
          <div className="header-dashboard">
            {/* Left: title */}
            <div className="header-left">
              <span className="header-title">{activeConvTitle}</span>
            </div>

            {/* Right: controls */}
            <div className="header-grid">
              {/* Mode badges */}
              <div className="toolbar-badges">
                <button
                  id="toggle-rag-btn"
                  className={`mode-badge ${enableRag ? 'active' : ''}`}
                  onClick={() => {
                    setEnableRag((r) => !r);
                    if (enableAgent) setEnableAgent(false);
                  }}
                  title="Toggle RAG document retrieval"
                >
                  <Database size={12} />
                  RAG {enableRag ? 'ON' : 'OFF'}
                </button>
                <button
                  id="toggle-agent-btn"
                  className={`mode-badge ${enableAgent ? 'active' : ''}`}
                  onClick={() => {
                    setEnableAgent((a) => !a);
                    if (enableRag) setEnableRag(false);
                  }}
                  title="Toggle Agentic tool execution"
                >
                  <Cpu size={12} />
                  Agent {enableAgent ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="header-divider" />

              {/* Info */}
              <button className="header-item" title="App info" aria-label="App info">
                <Info size={18} />
              </button>

              {/* Notifications */}
              <div style={{ position: 'relative' }} ref={notifRef}>
                <button
                  className={`header-item ${notifOpen ? 'active' : ''}`}
                  onClick={() => setNotifOpen((o) => !o)}
                  title="Notifications"
                  aria-label="Notifications"
                  aria-expanded={notifOpen}
                >
                  <Bell size={18} />
                  {notifications.length > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: 'var(--Primary)',
                      border: '1.5px solid var(--DarkSurface)',
                    }} />
                  )}
                </button>

                {notifOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 10px)',
                    right: 0,
                    width: 280,
                    background: 'var(--Surface)',
                    border: '1px solid var(--Line)',
                    borderRadius: 16,
                    padding: '16px',
                    zIndex: 100,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>Notifications</span>
                      <span style={{ fontSize: 12, color: 'var(--Primary)', cursor: 'pointer' }}>View All</span>
                    </div>
                    {notifications.map((n) => (
                      <div key={n.id} style={{
                        padding: '10px 0',
                        borderBottom: '1px solid var(--Line)',
                        cursor: 'pointer',
                      }}>
                        <div style={{ fontSize: 13, color: 'var(--OnSurface)', marginBottom: 3 }}>{n.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--Secondary)' }}>{n.time}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Dark / Light toggle */}
              <button
                className="dark-light-btn"
                onClick={() => setDarkMode((d) => !d)}
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label="Toggle dark/light mode"
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              <div className="header-divider" />

              {/* User menu */}
              <div style={{ position: 'relative' }} ref={userMenuRef}>
                <button
                  className="header-user-btn"
                  onClick={() => setUserMenuOpen((o) => !o)}
                  aria-label="User menu"
                  aria-expanded={userMenuOpen}
                >
                  <div className="header-user-initials">U</div>
                </button>

                {userMenuOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 10px)',
                    right: 0,
                    width: 220,
                    background: 'var(--Surface)',
                    border: '1px solid var(--Line)',
                    borderRadius: 16,
                    padding: '12px',
                    zIndex: 100,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}>
                    {/* User info */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 4px 14px',
                      borderBottom: '1px solid var(--Line)',
                      marginBottom: 8,
                    }}>
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--Primary), #0fa870)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 16,
                        color: 'var(--DarkSurface)',
                        flexShrink: 0,
                      }}>U</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--OnSurface)' }}>Dev User</div>
                        <div style={{ fontSize: 12, color: 'var(--Secondary)' }}>dev@example.com</div>
                      </div>
                    </div>

                    {[
                      { icon: <User size={15} />, label: 'Edit Profile' },
                      { icon: <Bell size={15} />, label: 'Notifications' },
                      { icon: <Settings size={15} />, label: 'Settings' },
                    ].map((item) => (
                      <button key={item.label} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        color: 'var(--OnSurface)',
                        fontSize: 13,
                        padding: '9px 8px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        transition: 'background 0.2s',
                        textAlign: 'left',
                      }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--DarkSurface)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                      >
                        <span style={{ color: 'var(--Secondary)' }}>{item.icon}</span>
                        {item.label}
                      </button>
                    ))}

                    <div style={{ borderTop: '1px solid var(--Line)', marginTop: 6, paddingTop: 6 }}>
                      <button style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        color: 'var(--Error)',
                        fontSize: 13,
                        padding: '9px 8px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        transition: 'background 0.2s',
                      }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(216,76,16,0.08)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                      >
                        <LogOut size={15} />
                        Log out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Chat window ── */}
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
