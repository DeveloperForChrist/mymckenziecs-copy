'use client';

/**
 * Hosted video via Jitsi Meet (meet.jit.si): signaling, TURN/SFU, and browser compatibility
 * are handled by Jitsi — no custom signaling server or Supabase Realtime required.
 *
 * For strict privacy/branding, swap `domain` to a self-hosted Jitsi or use Daily.co / 100ms with API keys.
 */

import { useEffect, useRef, useState } from 'react';

type JitsiMeetApi = {
  dispose: () => void;
  executeCommand: (cmd: string, ...args: unknown[]) => void;
  addEventListener: (event: string, handler: (payload: unknown) => void) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (
      domain: string,
      options: Record<string, unknown>
    ) => JitsiMeetApi;
  }
}

const JITSI_SCRIPT = 'https://meet.jit.si/external_api.js';

function sanitizeJitsiRoom(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 200);
}

export type HostedVideoMeetingProps = {
  roomName: string;
  displayName?: string;
  /** Iframe target host (default public meet.jit.si — works immediately, no API key). */
  domain?: string;
  className?: string;
  containerClassName?: string;
  primaryButtonClassName?: string;
  secondaryButtonClassName?: string;
  /** After hang-up, parent can bump `key` to start a fresh embed session. */
  onLeave?: () => void;
};

export default function HostedVideoMeeting({
  roomName,
  displayName = 'Participant',
  domain = 'meet.jit.si',
  className,
  containerClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  onLeave,
}: HostedVideoMeetingProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetApi | null>(null);
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);

  const safeRoom = sanitizeJitsiRoom(roomName);

  useEffect(() => {
    let cancelled = false;
    const existing = document.querySelector(`script[src="${JITSI_SCRIPT}"]`);
    if (existing) {
      if (typeof window !== 'undefined' && window.JitsiMeetExternalAPI) {
        setScriptLoaded(true);
        return () => {
          cancelled = true;
        };
      }
      const id = window.setInterval(() => {
        if (cancelled) return;
        if (window.JitsiMeetExternalAPI) {
          setScriptLoaded(true);
          window.clearInterval(id);
        }
      }, 50);
      const timeout = window.setTimeout(() => window.clearInterval(id), 15000);
      return () => {
        cancelled = true;
        window.clearInterval(id);
        window.clearTimeout(timeout);
      };
    }
    const script = document.createElement('script');
    script.src = JITSI_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (!cancelled) setScriptLoaded(true);
    };
    script.onerror = () => {
      if (!cancelled) setLoadError('Could not load meeting SDK. Check your network or ad blocker.');
    };
    document.head.appendChild(script);
    return () => {
      cancelled = true;
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.JitsiMeetExternalAPI) return;

    const configOverwrite = {
      prejoinPageEnabled: false,
      startWithAudioMuted: false,
      startWithVideoMuted: false,
      enableWelcomePage: false,
      disableDeepLinking: true,
    };

    const interfaceConfigOverwrite = {
      TOOLBAR_BUTTONS: [
        'microphone',
        'camera',
        'desktop',
        'fullscreen',
        'fodeviceselection',
        'hangup',
        'chat',
        'raisehand',
        'tileview',
        'settings',
        'videoquality',
        'filmstrip',
      ],
      SHOW_JITSI_WATERMARK: false,
      SHOW_PROMOTIONAL_CLOSE_PAGE: false,
      SHOW_WATERMARK_FOR_GUESTS: false,
      DISABLE_VIDEO_BACKGROUND: true,
      TOOLBAR_ALWAYS_VISIBLE: true,
    };

    const api = new window.JitsiMeetExternalAPI(domain, {
      roomName: safeRoom,
      parentNode: containerRef.current,
      width: '100%',
      height: '100%',
      configOverwrite,
      interfaceConfigOverwrite,
      userInfo: {
        displayName,
      },
    });

    api.addEventListener('audioMuteStatusChanged', (payload) => {
      setAudioMuted(Boolean((payload as { muted?: boolean })?.muted));
    });

    api.addEventListener('videoMuteStatusChanged', (payload) => {
      setVideoMuted(Boolean((payload as { muted?: boolean })?.muted));
    });

    api.addEventListener('videoConferenceLeft', () => {
      onLeaveRef.current?.();
    });

    apiRef.current = api;

    return () => {
      api.dispose();
      apiRef.current = null;
    };
  }, [scriptLoaded, safeRoom, domain, displayName]);

  const toggleAudio = () => {
    apiRef.current?.executeCommand('toggleAudio');
    setAudioMuted((m) => !m);
  };

  const toggleVideo = () => {
    apiRef.current?.executeCommand('toggleVideo');
    setVideoMuted((m) => !m);
  };

  const hangup = () => {
    apiRef.current?.executeCommand('hangup');
  };

  const primaryCls = primaryButtonClassName ?? '';
  const secondaryCls = secondaryButtonClassName ?? primaryCls;

  return (
    <div className={className}>
      {loadError && (
        <p style={{ color: '#b91c1c', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{loadError}</p>
      )}
      <div
        ref={containerRef}
        className={containerClassName}
        style={{
          width: '100%',
          minHeight: 420,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#000',
        }}
      />
      <p style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.82rem', lineHeight: 1.45 }}>
        Hosted meeting on <strong>{domain}</strong> — share room name <code style={{ fontSize: '0.85em' }}>{safeRoom}</code> so
        others can join the same call (no app signup required on the public server).
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem' }}>
        <button type="button" className={primaryCls || undefined} onClick={toggleAudio} disabled={!!loadError}>
          {audioMuted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className={primaryCls || undefined} onClick={toggleVideo} disabled={!!loadError}>
          {videoMuted ? 'Start camera' : 'Stop camera'}
        </button>
        <button type="button" className={secondaryCls || undefined} onClick={hangup}>
          Leave call
        </button>
      </div>
    </div>
  );
}
