/**
 * Sidebar — AIZOX design system.
 * Mirrors section-menu-left from DESIGN/aizox.vercel.app/index.html:
 *   - Logo box with icon + text
 *   - Search bar
 *   - New Chat button
 *   - Conversation history list with delete action
 *   - Bottom footer with social links + copyright
 */
import { useState } from 'react';
import { MessageSquare, Plus, Trash2, Search, Bot } from 'lucide-react';

export function Sidebar({
  conversations,
  activeConvId,
  onSelectConv,
  onNewChat,
  onDeleteConv,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = conversations.filter((c) =>
    (c.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="sidebar">
      {/* ── Logo box ── */}
      <div className="sidebar-logo-box">
        <a className="sidebar-logo-link" href="#">
          <div className="sidebar-logo-icon">
            <Bot size={20} color="#0E0E14" />
          </div>
          <span className="sidebar-logo-text">ChatAI Pro</span>
        </a>
      </div>

      {/* ── Search ── */}
      <div className="sidebar-search-wrap">
        <div className="sidebar-search">
          <Search size={15} className="sidebar-search-icon" />
          <input
            className="sidebar-search-input"
            type="text"
            placeholder="Search conversations…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Scrollable inner ── */}
      <div className="sidebar-scroll">
        {/* New Chat */}
        <button id="new-chat-btn" className="new-chat-btn" onClick={onNewChat}>
          <Plus size={15} />
          New Chat
        </button>

        {/* Section title */}
        <div className="sidebar-section-title">Conversations</div>

        {/* Conversation list */}
        <div className="sidebar-conversations">
          {filtered.length === 0 && (
            <div className="empty-list">
              {searchQuery ? 'No results found.' : 'No conversations yet. Start a new chat!'}
            </div>
          )}
          {filtered.map((conv) => (
            <div
              key={conv.id}
              id={`conv-${conv.id}`}
              className={`conv-item ${activeConvId === conv.id ? 'active' : ''}`}
              onClick={() => onSelectConv(conv.id)}
              title={conv.title || 'Untitled'}
            >
              <MessageSquare size={14} className="conv-item-icon" />
              <span className="conv-item-text">
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
                aria-label="Delete conversation"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom footer ── */}
      <div className="sidebar-bot">
        <div className="sidebar-download-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 20.25V3.75C18 2.92 17.33 2.25 16.5 2.25L7.5 2.25C6.67 2.25 6 2.92 6 3.75L6 20.25C6 21.08 6.67 21.75 7.5 21.75H16.5C17.33 21.75 18 21.08 18 20.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 5.25H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Download app
        </div>

        <div className="sidebar-social">
          <a className="social-item" href="https://facebook.com" target="_blank" rel="noreferrer" title="Facebook">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
          </a>
          <a className="social-item" href="https://x.com" target="_blank" rel="noreferrer" title="X / Twitter">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
          <a className="social-item" href="https://discord.com" target="_blank" rel="noreferrer" title="Discord">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
          </a>
          <a className="social-item" href="https://telegram.org" target="_blank" rel="noreferrer" title="Telegram">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          </a>
        </div>

        <div className="sidebar-copyright">©2026 ChatAI Pro. All Rights Reserved.</div>
      </div>
    </aside>
  );
}
