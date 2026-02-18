export default function Loading() {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #240724 0%, #240724 50%, #240724 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div
          className="animate-spin"
          style={{
            width: 28,
            height: 28,
            border: '3px solid rgba(255, 255, 255, 0.35)',
            borderTopColor: '#ffffff',
            borderRadius: '9999px',
          }}
        />
        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Loading...</div>
      </div>
    </div>
  );
}
