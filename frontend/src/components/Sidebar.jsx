/**
 * Sidebar – conversation list navigation with new chat and delete actions.
 */
import { MessageSquare, Plus, Trash2, Bot } from 'lucide-react';

export function Sidebar({ conversations, activeConvId, onSelectConv, onNewChat, onDeleteConv }) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Bot size={18} color="#fff" />
          </div>
          <span className="sidebar-logo-text">ChatAI Pro</span>
        </div>
        <button id="new-chat-btn" className="new-chat-btn" onClick={onNewChat}>
          <Plus size={15} />
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="sidebar-section-title">Conversations</div>
      <div className="sidebar-conversations">
        {conversations.length === 0 && (
          <div style={{ padding: '12px 10px', fontSize: 13, color: 'var(--text-muted)' }}>
            No conversations yet. Start a new chat!
          </div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            id={`conv-${conv.id}`}
            className={`conv-item ${activeConvId === conv.id ? 'active' : ''}`}
            onClick={() => onSelectConv(conv.id)}
          >
            <MessageSquare size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span className="conv-item-text" title={conv.title || 'Untitled'}>
              {conv.title || 'Untitled chat'}
            </span>
            <button
              className="conv-delete-btn"
              id={`delete-conv-${conv.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConv(conv.id);
              }}
              title="Delete conversation"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
