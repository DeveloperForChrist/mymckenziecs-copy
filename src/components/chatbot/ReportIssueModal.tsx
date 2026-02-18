"use client"

type ReportIssueModalProps = {
  isOpen: boolean
  issue: string
  problem: string
  onIssueChange: (value: string) => void
  onProblemChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
}

export default function ReportIssueModal({
  isOpen,
  issue,
  problem,
  onIssueChange,
  onProblemChange,
  onCancel,
  onSubmit
}: ReportIssueModalProps) {
  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: '#1a1a1a',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px', color: '#ffffff' }}>
          Report Issue
        </h2>
        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)', marginBottom: '24px' }}>
          Help us improve by describing the issue with this response
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#ffffff' }}>
            What&apos;s the issue? *
          </label>
          <input
            type="text"
            value={issue}
            onChange={(e) => onIssueChange(e.target.value)}
            placeholder="e.g., Incorrect information, Unhelpful response..."
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '16px',
              background: 'rgba(255,255,255,0.9)',
              color: '#1a1a1a',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#ffffff' }}>
            Describe the problem *
          </label>
          <textarea
            value={problem}
            onChange={(e) => onProblemChange(e.target.value)}
            placeholder="Please provide details about what went wrong..."
            rows={4}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '16px',
              background: 'rgba(255,255,255,0.9)',
              color: '#1a1a1a',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '2px solid rgba(255,255,255,0.5)',
              background: 'transparent',
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#ffffff',
              color: '#1a1a1a',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Submit Report
          </button>
        </div>
      </div>
    </div>
  )
}
