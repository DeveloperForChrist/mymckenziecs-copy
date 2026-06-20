'use client';

/**
 * Experimental peer-to-peer WebRTC + BroadcastChannel / Supabase signaling.
 * For meetings that should work without operating your own signaling stack, prefer
 * {@link HostedVideoMeeting} (Jitsi embed) or another hosted SFU (Daily, LiveKit Cloud, 100ms).
 */

import {
  Camera,
  CameraOff,
  Check,
  Clipboard,
  FileText,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import type { RealtimeChannel } from '@supabase/supabase-js';
import styles from './WebRtcMeeting.module.css';

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
  footerAction?: ReactNode;
  onLeave?: () => void;
};

export default function WebRtcMeeting({
  roomName,
  displayName = 'Participant',
  className,
  videoGridClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  footerAction,
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
  const [localReady, setLocalReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [roomCopied, setRoomCopied] = useState(false);

  const initials = useMemo(() => {
    const source = displayName.trim() || 'Participant';
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }, [displayName]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return roomName;
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomName);
    return url.toString();
  }, [roomName]);

  const defaultMode = !className && !videoGridClassName && !primaryButtonClassName && !secondaryButtonClassName;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setRoomCopied(true);
      window.setTimeout(() => setRoomCopied(false), 1800);
    } catch {
      setRoomCopied(false);
    }
  };

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
    setRemoteReady(false);
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
        setRemoteReady(true);
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
        setLocalReady(true);
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
      setLocalReady(false);
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
  const gridClass = videoGridClassName
    ? `${styles.videoGrid} ${videoGridClassName}`
    : styles.videoGrid;

  if (callEnded && !onLeave) {
    return (
      <div className={className || styles.endedState}>
        <p>You left the call.</p>
        <button type="button" className={primaryCls || styles.controlButton} onClick={joinAgain}>
          <PhoneOff size={16} />
          Join again
        </button>
      </div>
    );
  }

  return (
    <div className={className || styles.meetingShell}>
      {defaultMode && (
        <header className={styles.topBar}>
          <div className={styles.brandBlock}>
            <span className={styles.brandMark}>M</span>
            <div>
              <p className={styles.eyebrow}>Client portal video room</p>
              <h1 className={styles.title}>Secure consultation with MyMcKenzieCS</h1>
            </div>
          </div>
          <div className={styles.sessionMeta}>
            <span className={styles.statusPill}>
              <span className={styles.statusDot} />
              {status}
            </span>
          </div>
        </header>
      )}

      <div className={defaultMode ? styles.mainLayout : undefined}>
        <main className={defaultMode ? styles.stage : undefined}>
          {error && <p className={styles.error}>{error}</p>}
          {signalingNote && !error && <p className={styles.notice}>{signalingNote}</p>}

          <div className={gridClass}>
            <div className={styles.videoTile}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`${styles.video} ${videoMuted ? styles.mutedVideo : ''}`}
              />
              {(!localReady || videoMuted) && (
                <div className={styles.tileOverlay}>
                  <span className={styles.participantAvatar}>{initials || 'Y'}</span>
                </div>
              )}
              <div className={styles.tileLabel}>
                <span className={styles.nameBadge}>
                  <UserRound size={14} />
                  <span>You{displayName ? ` (${displayName})` : ''}</span>
                </span>
                {audioMuted && (
                  <span className={styles.qualityBadge}>
                    <MicOff size={14} />
                    Muted
                  </span>
                )}
              </div>
            </div>
            <div className={styles.videoTile}>
              <video ref={remoteVideoRef} autoPlay playsInline className={styles.video} />
              {!remoteReady && (
                <div className={styles.tileOverlay}>
                  <div className={styles.emptyParticipant}>
                    <span className={styles.participantAvatar}>
                      <UsersRound size={38} />
                    </span>
                    <strong>Waiting for the other participant</strong>
                    <span>Keep this room open. The call connects as soon as they join with the same invite.</span>
                  </div>
                </div>
              )}
              <div className={styles.tileLabel}>
                <span className={styles.nameBadge}>
                  <UsersRound size={14} />
                  <span>Participant</span>
                </span>
                {!remoteReady && <span className={styles.qualityBadge}>Waiting</span>}
              </div>
            </div>
          </div>

          <div className={styles.callControls}>
            <button
              type="button"
              className={`${primaryCls || styles.controlButton} ${audioMuted ? styles.activeMute : ''}`}
              onClick={toggleAudio}
              disabled={!!error || callEnded}
            >
              {audioMuted ? <MicOff size={17} /> : <Mic size={17} />}
              {audioMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              className={`${primaryCls || styles.controlButton} ${videoMuted ? styles.activeMute : ''}`}
              onClick={toggleVideo}
              disabled={!!error || callEnded}
            >
              {videoMuted ? <CameraOff size={17} /> : <Camera size={17} />}
              {videoMuted ? 'Start camera' : 'Stop camera'}
            </button>
            <button
              type="button"
              className={`${secondaryCls || styles.controlButton} ${!secondaryCls ? styles.dangerButton : ''}`}
              onClick={leave}
            >
              <PhoneOff size={17} />
              Leave call
            </button>
            {footerAction}
          </div>
        </main>

        {defaultMode && (
          <aside className={styles.sidePanel} aria-label="Call details">
            <div className={styles.panelHeading}>
              <div>
                <h2>Session details</h2>
                <p>Use this room for client portal consultations and litigant support calls.</p>
              </div>
              <span className={styles.panelIcon}>
                <ShieldCheck size={18} />
              </span>
            </div>

            <div className={styles.panelList}>
              <div className={styles.panelItem}>
                <ShieldCheck size={17} />
                <div>
                  <strong>Private room link</strong>
                  <span>Only people with this invite can attempt to join this room.</span>
                </div>
              </div>
              <div className={styles.panelItem}>
                <FileText size={17} />
                <div>
                  <strong>Consultation ready</strong>
                  <span>Designed for client updates, document walkthroughs, and case-preparation meetings.</span>
                </div>
              </div>
              <div className={styles.panelItem}>
                <Sparkles size={17} />
                <div>
                  <strong>Browser based</strong>
                  <span>No app install needed. Camera and microphone permissions are requested by your browser.</span>
                </div>
              </div>
            </div>

            <div>
              <p className={styles.eyebrow}>Invite link</p>
              <div className={styles.copyRow}>
                <code className={styles.roomCode}>{shareUrl}</code>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={copyInvite}
                  aria-label={roomCopied ? 'Invite copied' : 'Copy invite link'}
                  title={roomCopied ? 'Copied' : 'Copy invite link'}
                >
                  {roomCopied ? <Check size={16} /> : <Clipboard size={16} />}
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
