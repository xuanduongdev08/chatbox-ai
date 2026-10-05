/**
 * ChatPage – authenticated shell: sidebar + top bar + chat window.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Menu } from 'lucide-react';

import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';
import { ThemeToggle } from '../components/ThemeToggle';
import { UserMenu } from '../components/UserMenu';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/AppContext';
import { historyApi, modelsApi } from '../services/api';

const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export default function ChatPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeMessages, setActiveMessages] = useState([]);
  const [sessionKey, setSessionKey] = useState(0); // bumps only when the user switches/creates chat

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => load('dgxai_sidebar_collapsed', false));
  const [mobileOpen, setMobileOpen] = useState(false);

  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [model, setModel] = useState(() => load('dgxai_model', null));
  const [enableRag, setEnableRag] = useState(() => load('dgxai_rag', false));
  const [enableAgent, setEnableAgent] = useState(() => load('dgxai_agent', false));

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await historyApi.list();
      setConversations(data);
    } catch {
      /* keep previous list */
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load the Groq model catalogue
  useEffect(() => {
    modelsApi
      .list()
      .then(({ data }) => {
        setModels(data.models);
        setModel((cur) => (cur && data.models.some((m) => m.id === cur) ? cur : data.default || data.models[0]?.id));
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, []);

  useEffect(() => { if (model) save('dgxai_model', model); }, [model]);
  useEffect(() => { save('dgxai_rag', enableRag); }, [enableRag]);
  useEffect(() => { save('dgxai_agent', enableAgent); }, [enableAgent]);
  useEffect(() => { save('dgxai_sidebar_collapsed', sidebarCollapsed); }, [sidebarCollapsed]);

  const handleSelectConv = useCallback(async (convId) => {
    try {
      const { data } = await historyApi.get(convId);
      setActiveMessages(data.messages || []);
      setActiveConvId(convId);
      setSessionKey((k) => k + 1);
    } catch {
      toast.error(t('chatFailedHistory'));
    }
  }, [t]);

  const handleNewChat = useCallback(() => {
    setActiveConvId(null);
    setActiveMessages([]);
    setSessionKey((k) => k + 1);
  }, []);

  const handleDeleteConv = async (convId) => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await historyApi.delete(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) handleNewChat();
      toast.success(t('deleted'));
    } catch {
      toast.error(t('deleteFailed'));
    }
  };

  const handleRenameConv = async (convId, title) => {
    const prev = conversations;
    setConversations((cs) => cs.map((c) => (c.id === convId ? { ...c, title } : c)));
    try {
      await historyApi.update(convId, { title });
    } catch {
      setConversations(prev);
      toast.error(t('renameFailed'));
    }
  };

  const handlePinConv = async (conv) => {
    try {
      await historyApi.update(conv.id, { pinned: !conv.pinned });
      loadConversations();
    } catch {
      toast.error(t('renameFailed'));
    }
  };

  const activeTitle = conversations.find((c) => c.id === activeConvId)?.title;

  return (
    <div className="app-shell">
      <Sidebar
        conversations={conversations}
        activeConvId={activeConvId}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onCloseMobile={() => setMobileOpen(false)}
        onSelectConv={handleSelectConv}
        onNewChat={handleNewChat}
        onDeleteConv={handleDeleteConv}
        onRenameConv={handleRenameConv}
        onPinConv={handlePinConv}
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn mobile-only" onClick={() => setMobileOpen(true)} aria-label="Menu">
              <Menu size={22} />
            </button>
            {activeTitle
              ? <h1 className="topbar-title">{activeTitle}</h1>
              : <h1 className="topbar-brand gradient-text">DGXAI</h1>}
          </div>
          <div className="topbar-right">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <ChatWindow
          key={sessionKey}
          conversationId={activeConvId}
          initialMessages={activeMessages}
          user={user}
          models={models}
          modelsLoading={modelsLoading}
          model={model}
          onModelChange={setModel}
          enableRag={enableRag}
          enableAgent={enableAgent}
          onToggleRag={() => { setEnableRag((r) => !r); if (enableAgent) setEnableAgent(false); }}
          onToggleAgent={() => { setEnableAgent((a) => !a); if (enableRag) setEnableRag(false); }}
          onConversationCreated={setActiveConvId}
          onConversationsChanged={loadConversations}
        />
      </main>
    </div>
  );
}
