export default function NotFound() {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px',
      color: '#ffffff'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', fontWeight: 600, marginBottom: '8px' }}>Page not found</div>
        <div style={{ opacity: 0.8 }}>The page you are looking for doesn’t exist.</div>
      </div>
    </div>
  );
}
