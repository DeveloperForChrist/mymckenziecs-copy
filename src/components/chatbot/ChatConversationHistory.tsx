"use client"

import type { MouseEvent } from 'react'
import { useState } from 'react'

type Conversation = {
  id: string
  title: string
  timestamp: string
}

type ChatConversationHistoryProps = {
  loadingHistory: boolean
  conversations: Conversation[]
  formatDate: (isoDate: string) => string
  onOpenConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string, e: MouseEvent) => void
  onDeleteAllConversations?: () => void
}

export default function ChatConversationHistory({
  loadingHistory,
  conversations,
  formatDate,
  onOpenConversation,
  onDeleteConversation,
  onDeleteAllConversations,
}: ChatConversationHistoryProps) {
  const [collapsed, setCollapsed] = useState(false)
  const canDeleteAll = Boolean(onDeleteAllConversations && conversations.length > 0)

  const renderList = (items: Conversation[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map((conv) => (
        <div
          key={conv.id}
          onClick={() => onOpenConversation(conv.id)}
          style={{
            position: 'relative',
            textAlign: 'left',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(15,23,42,0.35)',
            color: '#e2e8f0',
            padding: '7px 10px 28px 10px',
            borderRadius: '10px',
            cursor: 'pointer'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px', lineHeight: 1.3 }}>
            {conv.title || 'Conversation'}
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(226,232,240,0.6)', lineHeight: 1.2 }}>
            {formatDate(conv.timestamp)}
          </div>
          <button
            onClick={(e) => onDeleteConversation(conv.id, e)}
            title="Delete conversation"
            aria-label="Delete conversation"
            style={{
              position: 'absolute',
              right: '8px',
              bottom: '4px',
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(127,29,29,0.35)',
              color: '#fecaca',
              borderRadius: '7px',
              width: '26px',
              height: '20px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <>
      <div style={{
        marginTop: '18px',
        padding: '16px',
        background: 'linear-gradient(180deg, rgba(28, 13, 39, 0.72), rgba(15, 23, 42, 0.42))',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.13)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)'
      }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: collapsed ? 0 : '12px'
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.72)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Conversation history
            </div>
            {!collapsed && (
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(226,232,240,0.52)' }}>
                {conversations.length === 0 ? 'No saved chats yet' : `${conversations.length} saved chat${conversations.length === 1 ? '' : 's'}`}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {canDeleteAll && (
              <button
                type="button"
                onClick={onDeleteAllConversations}
                className="history-clear-button"
                style={{
                  border: '1px solid rgba(248,113,113,0.28)',
                  background: 'rgba(127,29,29,0.18)',
                  color: '#fca5a5',
                  borderRadius: '999px',
                  minHeight: '28px',
                  padding: '0 10px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  transition: 'border-color 0.16s ease, background 0.16s ease, color 0.16s ease, transform 0.16s ease',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18"></path>
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                </svg>
                Clear history
              </button>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="history-collapse-button"
              style={{
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.86)',
                borderRadius: '999px',
                width: '30px',
                height: '30px',
                cursor: 'pointer',
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'border-color 0.16s ease, background 0.16s ease, transform 0.16s ease'
              }}
              aria-label={collapsed ? 'Expand conversation history' : 'Collapse conversation history'}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }}
              >
                <path d="m18 15-6-6-6 6"></path>
              </svg>
            </button>
          </div>
        </div>
        {!collapsed && loadingHistory ? (
          <div style={{ fontSize: '12px', color: 'rgba(226,232,240,0.7)' }}>Loading history…</div>
        ) : !collapsed && conversations.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'rgba(226,232,240,0.7)' }}>No conversations yet.</div>
        ) : !collapsed ? (
          <div
            className="history-scroll"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              height: '268px',
              overflowY: 'scroll',
              overflowX: 'hidden',
              paddingRight: '10px',
              paddingLeft: '2px',
              scrollbarGutter: 'stable'
            }}
          >
            {renderList(conversations)}
          </div>
        ) : null}
      </div>
      <style jsx>{`
        .history-clear-button:hover {
          border-color: rgba(248, 113, 113, 0.48) !important;
          background: rgba(127, 29, 29, 0.28) !important;
          color: #fecaca !important;
          transform: translateY(-1px);
        }

        .history-collapse-button:hover {
          border-color: rgba(255, 255, 255, 0.34) !important;
          background: rgba(255, 255, 255, 0.12) !important;
          transform: translateY(-1px);
        }

        .history-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(233, 196, 255, 0.75) rgba(255, 255, 255, 0.05);
          scrollbar-gutter: stable;
        }

        .history-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .history-scroll::-webkit-scrollbar-track {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(15, 23, 42, 0.22));
          border: 1px solid rgba(236, 72, 153, 0.18);
          border-radius: 999px;
          margin: 4px 0;
        }

        .history-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(255, 226, 246, 0.94), rgba(240, 171, 252, 0.9), rgba(217, 70, 239, 0.78));
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          box-shadow: inset 0 0 0 1px rgba(36, 8, 47, 0.28), 0 1px 7px rgba(236, 72, 153, 0.28);
          min-height: 26px;
        }

        .history-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(255, 238, 250, 0.98), rgba(244, 190, 255, 0.95), rgba(232, 121, 249, 0.88));
          box-shadow: inset 0 0 0 1px rgba(36, 8, 47, 0.22), 0 2px 10px rgba(232, 121, 249, 0.34);
        }

        .history-scroll::-webkit-scrollbar-button {
          display: none;
          width: 0;
          height: 0;
        }
      `}</style>
    </>
  )
}
