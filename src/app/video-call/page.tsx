'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import WebRtcMeeting from '@/components/video/WebRtcMeeting';
import styles from '@/components/video/WebRtcMeeting.module.css';

export default function VideoCallPage() {
  return (
    <Suspense fallback={<VideoCallLoading />}>
      <VideoCallContent />
    </Suspense>
  );
}

function VideoCallContent() {
  const searchParams = useSearchParams();
  const roomParam = searchParams.get('room');
  const nameParam = searchParams.get('name');
  const viewerParam = searchParams.get('viewer');
  const [roomName, setRoomName] = useState<string>('');

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
    return <VideoCallLoading />;
  }

  return (
    <WebRtcMeeting
      roomName={roomName}
      displayName={nameParam || `Guest ${roomName.slice(-8)}`}
      hideRoomChrome={viewerParam === 'client'}
    />
  );
}

function VideoCallLoading() {
  return (
    <div className={styles.endedState}>
      <p>Preparing your video room...</p>
    </div>
  );
}
