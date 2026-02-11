"use client";
import { useEffect, useState } from 'react';

export default function CaseSummaryPage() {
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");

  return (
    <>
      <header>
        <nav className="navbar" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px',
          background: 'linear-gradient(135deg, #270427 0%, #2d0f47 50%, #1a0420 100%)',
          height: '70px', position: 'sticky', top: 0, zIndex: 1000
        }}>
          <div className="nav-logo">
            <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ffffff', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>MymckenzieCS</span>
          </div>
          <ul className="nav-menu" style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0, gap: '10px' }}>
            <li className="nav-item">
              <a href="/dashboard" className="nav-link" style={{
                padding: '10px 18px', color: '#ffffff', background: '#3b0a6b',
                fontSize: '1.12rem', borderRadius: '30px', transition: '0.25s ease', fontWeight: 'bold', textDecoration: 'none', display: 'block'
              }}>Go to Dashboard</a>
            </li>
          </ul>
        </nav>
      </header>
      <main style={{
        background: 'linear-gradient(135deg, #270427 0%, #2d0f47 50%, #1a0420 100%)',
        minHeight: '100vh',
        color: '#ffffff'
      }}>
        <div style={{ padding: 40, color: '#fff' }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Case Summary</h2>
          <p style={{ marginBottom: 20 }}>Case-specific summaries require a saved Case Profile. Open <a href="/settings">Settings → Case Profile</a> to create one.</p>
        </div>
      </main>
    </>
  )
}
