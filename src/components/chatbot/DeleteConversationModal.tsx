"use client"

type DeleteConversationModalProps = {
  isOpen: boolean
  isDeleting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
  mode?: 'single' | 'all'
}

export default function DeleteConversationModal({
  isOpen,
  isDeleting,
  error,
  onCancel,
  onConfirm,
  mode = 'single',
}: DeleteConversationModalProps) {
  if (!isOpen) return null

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.6)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'linear-gradient(135deg, rgba(39,4,39,0.98), rgba(60,12,70,0.98))',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '14px',
          padding: '18px',
          color: '#f8fafc',
          boxShadow: '0 18px 40px rgba(0,0,0,0.45)'
        }}
      >
        <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
          {mode === 'all' ? 'Delete all conversations?' : 'Delete conversation?'}
        </div>
        <div style={{ fontSize: '14px', color: 'rgba(226,232,240,0.85)', lineHeight: 1.5, marginBottom: '14px' }}>
          {mode === 'all'
            ? 'This will permanently remove every saved conversation from your history and start a fresh chat.'
            : 'This will permanently remove the selected conversation from your history.'}
        </div>
        {error && (
          <div style={{ fontSize: '13px', color: '#fca5a5', marginBottom: '12px' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: '8px',
              padding: '8px 12px',
              cursor: isDeleting ? 'default' : 'pointer',
              opacity: isDeleting ? 0.6 : 1
            }}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: 'rgba(239,68,68,0.2)',
              color: '#fecaca',
              border: '1px solid rgba(239,68,68,0.45)',
              borderRadius: '8px',
              padding: '8px 12px',
              cursor: isDeleting ? 'default' : 'pointer',
              opacity: isDeleting ? 0.7 : 1
            }}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : mode === 'all' ? 'Delete all' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
