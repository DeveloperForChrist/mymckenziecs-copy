'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import WebRtcMeeting from '@/components/video/WebRtcMeeting';

export default function VideoCallPage() {
  const searchParams = useSearchParams();
  const roomParam = searchParams.get('room');
  const nameParam = searchParams.get('name');
  const [roomName, setRoomName] = useState<string>('');
  const [callSession, setCallSession] = useState(0);

  useEffect(() => {
    if (roomParam) {
      setRoomName(roomParam);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id || 'guest';
      setRoomName(`mymckenzie-${uid}-${Date.now()}`);
    });
  }, [roomParam]);

  if (!roomName) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        minHeight: '100vh',
        background: '#000',
        padding: '1rem',
        boxSizing: 'border-box',
      }}
    >
      <WebRtcMeeting
        key={callSession}
        roomName={roomName}
        displayName={nameParam || `Guest ${roomName.slice(-8)}`}
        onLeave={() => setCallSession((s) => s + 1)}
      />
    </div>
  );
}
