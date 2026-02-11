import type { ReactNode } from 'react'

type AppTopbarProps = {
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
  className?: string
}

export default function AppTopbar({ left, center, right, className }: AppTopbarProps) {
  return (
    <header className={`app-topbar ${className || ''}`.trim()}>
      <div className="app-topbar-inner">
        <div className="app-topbar-left">{left}</div>
        <div className="app-topbar-center">{center}</div>
        <div className="app-topbar-right">{right}</div>
      </div>
    </header>
  )
}
