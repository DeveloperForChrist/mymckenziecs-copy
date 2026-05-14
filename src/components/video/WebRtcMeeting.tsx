'use client';

/**
 * Experimental peer-to-peer WebRTC + BroadcastChannel / Supabase signaling.
 * For meetings that should work without operating your own signaling stack, prefer
 * {@link HostedVideoMeeting} (Jitsi embed) or another hosted SFU (Daily, LiveKit Cloud, 100ms).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import type { RealtimeChannel } from '@supabase/supabase-js';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function sanitizeRoomChannel(room: string) {
  return `webrtc:${room.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)}`;
}

type HelloPayload = { kind: 'hello'; peerId: string };
type OfferPayload = { kind: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit };
type AnswerPayload = { kind: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit };
type IcePayload = {
  kind: 'ice';
  from: string;
  to: string;
  candidate: RTCIceCandidateInit;
};
type ByePayload = { kind: 'bye'; peerId: string };

export type SignalPayload = HelloPayload | OfferPayload | AnswerPayload | IcePayload | ByePayload;

export type WebRtcMeetingProps = {
  roomName: string;
  displayName?: string;
  className?: string;
  videoGridClassName?: string;
  primaryButtonClassName?: string;
  secondaryButtonClassName?: string;
  onLeave?: () => void;
};

export default function WebRtcMeeting({
  roomName,
  displayName = 'Participant',
  className,
  videoGridClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  onLeave,
}: WebRtcMeetingProps) {
  const myPeerId = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `peer-${Date.now()}`
  );
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  /** Supabase channel must be SUBSCRIBED before broadcast sends work reliably */
  const realtimeReadyRef = useRef(false);
  const signalingSendRef = useRef<(msg: SignalPayload) => void>(() => {});
  const remotePeerIdRef = useRef<string | null>(null);
  const iceBufRef = useRef<RTCIceCandidateInit[]>([]);
  const helloTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopHelloRef = useRef<() => void>(() => {});

  const [status, setStatus] = useState<string>('Starting camera…');
  const [error, setError] = useState<string | null>(null);
  const [signalingNote, setSignalingNote] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [rejoinNonce, setRejoinNonce] = useState(0);

  const flushIce = useCallback(async (pc: RTCPeerConnection) => {
    const buf = iceBufRef.current;
    iceBufRef.current = [];
    for (const c of buf) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* ignore stale candidates */
      }
    }
  }, []);

  const teardownPc = useCallback(() => {
    iceBufRef.current = [];
    remotePeerIdRef.current = null;
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });

    pc.onicecandidate = (ev) => {
      const remote = remotePeerIdRef.current;
      if (!ev.candidate || !remote) return;
      signalingSendRef.current({
        kind: 'ice',
        from: myPeerId.current,
        to: remote,
        candidate: ev.candidate.toJSON(),
      });
    };

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        stopHelloRef.current();
        setStatus('Connected');
      } else if (s === 'disconnected' || s === 'failed' || s === 'closed') {
        setStatus(s === 'failed' ? 'Connection failed' : 'Disconnected');
      }
    };

    return pc;
  }, []);

  const sendOfferTo = useCallback(
    async (remoteId: string) => {
      if (
        pcRef.current?.localDescription?.type === 'offer' &&
        remotePeerIdRef.current === remoteId
      ) {
        return;
      }
      remotePeerIdRef.current = remoteId;
      let pc = pcRef.current;
      if (!pc) pc = createPeerConnection();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signalingSendRef.current({
        kind: 'offer',
        from: myPeerId.current,
        to: remoteId,
        sdp: pc.localDescription!.toJSON(),
      });
      setStatus('Calling…');
    },
    [createPeerConnection]
  );

  useEffect(() => {
    if (callEnded) return;

    let cancelled = false;

    const clearHello = () => {
      if (helloTimerRef.current) {
        clearInterval(helloTimerRef.current);
        helloTimerRef.current = null;
      }
    };
    stopHelloRef.current = clearHello;

    async function run() {
      setError(null);
      setSignalingNote(null);
      realtimeReadyRef.current = false;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: 'user' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const channelName = sanitizeRoomChannel(roomName);
        const supabase = getSupabaseBrowserClient();
        const channel = supabase.channel(channelName, {
          config: { broadcast: { self: true } },
        });
        channelRef.current = channel;

        const bc =
          typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
        broadcastChannelRef.current = bc;

        signalingSendRef.current = (msg: SignalPayload) => {
          try {
            bc?.postMessage(msg);
          } catch {
            /* ignore */
          }
          if (!realtimeReadyRef.current || !channelRef.current) return;
          try {
            channelRef.current.send({
              type: 'broadcast',
              event: 'signaling',
              payload: msg,
            });
          } catch {
            /* queue until subscribed — hello retry handles this */
          }
        };

        const handlePayload = async (msg: SignalPayload) => {
          if (msg.kind === 'hello') {
            if (msg.peerId === myPeerId.current) return;
            if (remotePeerIdRef.current && remotePeerIdRef.current !== msg.peerId) {
              return;
            }
            const cmp = myPeerId.current.localeCompare(msg.peerId);
            if (cmp < 0) {
              await sendOfferTo(msg.peerId);
            } else {
              remotePeerIdRef.current = msg.peerId;
              setStatus('Waiting for peer…');
            }
            return;
          }

          if (msg.kind === 'bye') {
            if (msg.peerId === remotePeerIdRef.current) {
              teardownPc();
              setStatus('Peer left');
            }
            return;
          }

          if ('to' in msg && msg.to !== myPeerId.current) return;

          if (msg.kind === 'offer') {
            remotePeerIdRef.current = msg.from;
            let pc = pcRef.current;
            if (!pc) pc = createPeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            await flushIce(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signalingSendRef.current({
              kind: 'answer',
              from: myPeerId.current,
              to: msg.from,
              sdp: pc.localDescription!.toJSON(),
            });
            setStatus('Connecting…');
            return;
          }

          if (msg.kind === 'answer') {
            const pc = pcRef.current;
            if (!pc) return;
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            await flushIce(pc);
            return;
          }

          if (msg.kind === 'ice') {
            const pc = pcRef.current;
            if (!pc || !pc.remoteDescription) {
              iceBufRef.current.push(msg.candidate);
              return;
            }
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch {
              iceBufRef.current.push(msg.candidate);
            }
          }
        };

        if (bc) {
          bc.onmessage = (ev: MessageEvent<SignalPayload>) => {
            if (cancelled) return;
            const msg = ev.data;
            if (!msg || typeof msg !== 'object') return;
            void handlePayload(msg);
          };
        }

        channel.on('broadcast', { event: 'signaling' }, async ({ payload }) => {
          if (cancelled) return;
          const msg = payload as SignalPayload;
          if (!msg || typeof msg !== 'object') return;
          await handlePayload(msg);
        });

        const sendHello = () => {
          signalingSendRef.current({
            kind: 'hello',
            peerId: myPeerId.current,
          });
        };

        setStatus('Finding peer…');
        sendHello();
        helloTimerRef.current = setInterval(sendHello, 2500);

        channel.subscribe((status, err) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            realtimeReadyRef.current = true;
            setSignalingNote(null);
            sendHello();
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            const detail = err?.message ?? status;
            setSignalingNote(
              `Supabase Realtime: ${detail}. Same-browser tabs still work via tab signaling. Cross-device calls need Realtime enabled in the Supabase dashboard.`
            );
          }
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not access camera or microphone';
        setError(message);
        setStatus('Error');
      }
    }

    run();

    return () => {
      cancelled = true;
      realtimeReadyRef.current = false;
      clearHello();
      try {
        signalingSendRef.current({
          kind: 'bye',
          peerId: myPeerId.current,
        });
      } catch {
        /* ignore */
      }
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      try {
        broadcastChannelRef.current?.close();
      } catch {
        /* ignore */
      }
      broadcastChannelRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      teardownPc();
    };
  }, [roomName, rejoinNonce, callEnded, createPeerConnection, flushIce, sendOfferTo, teardownPc]);

  const toggleAudio = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !audioMuted;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setAudioMuted(next);
  };

  const toggleVideo = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !videoMuted;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    setVideoMuted(next);
  };

  const leave = () => {
    if (onLeave) {
      onLeave();
      return;
    }
    setCallEnded(true);
    setStatus('Left call');
  };

  const joinAgain = () => {
    setCallEnded(false);
    setRejoinNonce((n) => n + 1);
    setStatus('Starting camera…');
    setError(null);
  };

  const primaryCls = primaryButtonClassName ?? '';
  const secondaryCls = secondaryButtonClassName ?? primaryCls;

  if (callEnded && !onLeave) {
    return (
      <div className={className}>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>You left the call.</p>
        <button type="button" className={primaryCls || undefined} onClick={joinAgain}>
          Join again
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      {error && (
        <p style={{ color: '#b91c1c', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{error}</p>
      )}
      {signalingNote && !error && (
        <p style={{ color: '#64748b', marginBottom: '0.75rem', fontSize: '0.82rem', lineHeight: 1.45 }}>
          {signalingNote}
        </p>
      )}
      <div
        className={videoGridClassName}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          minHeight: 360,
          background: '#0a0a0a',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', background: '#111' }}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: 280 }}
          />
          <span
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              padding: '4px 8px',
              borderRadius: 6,
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              fontSize: 12,
            }}
          >
            You{displayName ? ` (${displayName})` : ''}
          </span>
        </div>
        <div style={{ position: 'relative', background: '#111' }}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: 280 }}
          />
          <span
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              padding: '4px 8px',
              borderRadius: 6,
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              fontSize: 12,
            }}
          >
            Remote
          </span>
        </div>
      </div>
      <p style={{ marginTop: '0.75rem', color: '#6b7280', fontSize: '0.875rem' }}>
        {status}
        {roomName ? (
          <>
            {' '}
            · Room: <code style={{ fontSize: '0.8rem' }}>{roomName}</code>
          </>
        ) : null}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem' }}>
        <button
          type="button"
          className={primaryCls || undefined}
          onClick={toggleAudio}
          disabled={!!error || callEnded}
        >
          {audioMuted ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          className={primaryCls || undefined}
          onClick={toggleVideo}
          disabled={!!error || callEnded}
        >
          {videoMuted ? 'Start camera' : 'Stop camera'}
        </button>
        <button type="button" className={secondaryCls || undefined} onClick={leave}>
          Leave call
        </button>
      </div>
    </div>
  );
}
