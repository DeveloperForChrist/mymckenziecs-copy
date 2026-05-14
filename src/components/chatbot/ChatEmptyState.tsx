"use client"

type ChatEmptyStateProps = {
  authLoaded: boolean
  hasUser: boolean
}

export default function ChatEmptyState({ authLoaded, hasUser }: ChatEmptyStateProps) {
  if (!authLoaded) return null

  return (
    <div style={{ textAlign: 'center', marginTop: '30px', opacity: 0.85, color: '#ffffff', marginLeft: 0 }}>
      {!hasUser ? (
        <div style={{ maxWidth: '700px', margin: '0 auto', lineHeight: 1.7, fontFamily: 'inherit', fontSize: '17px', fontWeight: 500 }}>
          <p style={{ fontSize: '17px', fontWeight: 500, marginBottom: '20px' }}>
            Welcome to MyMcKenzieCS Assistant.
          </p>
          <p style={{ marginBottom: '20px' }}>
            Ask a question to get clear court information, preparation support, or help organising a client matter.
          </p>
          <p style={{ fontWeight: 600 }}>
            MyMcKenzieCS Assistant provides informational and practice support only. It is not a substitute for legal advice.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: '700px',
            margin: '0 auto',
            lineHeight: 1.7,
            fontFamily: 'inherit',
            fontSize: '17px',
            fontWeight: 500,
            minHeight: '50vh',
          }}
        >
          <p style={{
            fontSize: '2.5rem',
            fontWeight: 500,
            marginBottom: '36px',
            color: '#fff',
            letterSpacing: '0.02em',
            lineHeight: 1.1,
            textAlign: 'center',
            textShadow: '0 2px 12px rgba(39,4,39,0.18)'
          }}>
            I am MyMcKenzieCS Assistant, here to help you <span role="img" aria-label="waving hand">👋</span>
          </p>
        </div>
      )}
    </div>
  )
}
