import EnhancedCalendarClient from "@/components/dashboard/EnhancedCalendarClient";

export default function CalendarPage() {
  return (
    <>
      <header>
        <nav className="navbar" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 30px',
          backgroundColor: '#270427',
          borderBottom: '1px solid #E5E7EB',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000
        }}>
          <div className="nav-logo">
            <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ffffff', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>MymckenzieCS</span>
          </div>
          <ul className="nav-menu" style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0, gap: '10px' }}>
            <li className="nav-item">
              <a href="/dashboard" className="nav-link" style={{
                padding: '10px 18px', color: '#ffffff', backgroundColor: '#270427',
                fontSize: '1.12rem', borderRadius: '30px', transition: '0.25s ease',
                fontWeight: 'bold', textDecoration: 'none', display: 'block'
              }}>Go to Dashboard</a>
            </li>
          </ul>
        </nav>
      </header>

      <EnhancedCalendarClient />
    </>
  )
}
