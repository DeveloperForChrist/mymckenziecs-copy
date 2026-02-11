import React from 'react';

type LegalPageLayoutProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  children: React.ReactNode;
};

export default function LegalPageLayout({ title, subtitle, meta, children }: LegalPageLayoutProps) {
  const pageStyle = {
    background: 'linear-gradient(180deg, #0f0b1f 0%, #140f2a 45%, #0f0a1a 100%)',
    minHeight: '100vh',
    color: '#f8fafc'
  };

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '3.25rem 1.5rem' }}>
        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <aside
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '24px',
              padding: '1.6rem',
              alignSelf: 'start',
              position: 'sticky',
              top: '2rem',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)'
            }}
          >
            <p style={{ textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.75rem', color: '#c4b5fd' }}>
              MymckenzieCS
            </p>
            <h1 style={{ fontSize: '2.4rem', lineHeight: 1.1, marginTop: '0.75rem' }}>{title}</h1>
            {subtitle && (
              <p style={{ color: '#e2e8f0', marginTop: '0.75rem', fontSize: '1.05rem' }}>{subtitle}</p>
            )}
            {meta && (
              <p style={{ marginTop: '1.5rem', color: 'rgba(226,232,240,0.7)', fontSize: '0.95rem' }}>{meta}</p>
            )}
          </aside>
          <section
            style={{
              background: 'rgba(10, 8, 20, 0.72)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '28px',
              padding: '2.2rem',
              boxShadow: '0 24px 60px rgba(0,0,0,0.4)'
            }}
          >
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
