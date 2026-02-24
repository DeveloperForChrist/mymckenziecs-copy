import Link from "next/link";
import EnhancedCalendarClient from "@/components/dashboard/EnhancedCalendarClient";

export default function CalendarPage() {
  return (
    <div className="purple-gradient-bg app-shell">
      <div className="app-container">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Link href="/dashboard" className="app-button-secondary">
            Go to Dashboard
          </Link>
        </div>
        <EnhancedCalendarClient />
      </div>
    </div>
  )
}
