'use client'

import dynamic from 'next/dynamic'

const ChatbotNavbar = dynamic(() => import('@/components/chatbot/ChatbotNavbar'), {
  ssr: false,
  loading: () => null,
})

const ChatInterface = dynamic(() => import('@/components/chatbot/ChatInterface'), {
  ssr: false,
  loading: () => null,
})

export default function ChatbotPage() {
  return (
    <div className="purple-gradient-bg app-shell" style={{ color: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ChatbotNavbar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: '35px' }}>
        <div style={{ flex: 1, display: 'flex', width: '100%' }}>
          <main style={{ width: '100%' }}>
            <ChatInterface />
          </main>
        </div>
      </div>
    </div>
  )
}
