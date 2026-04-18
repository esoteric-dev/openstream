'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch, getToken } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { getStudioSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';

interface Stream {
  id: string;
  title: string;
  status: string;
}

type Source = 'camera' | 'screen' | 'both';
type StudioStatus = 'idle' | 'requesting' | 'connecting' | 'live' | 'error';

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function StudioPage() {
  const router = useRouter();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [source, setSource] = useState<Source>('camera');
  const [status, setStatus] = useState<StudioStatus>('idle');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const statusRef = useRef<StudioStatus>('idle');

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    apiFetch('/api/streams')
      .then((data: Stream[]) => {
        const active = data.filter(s => s.status !== 'ended');
        setStreams(active);
        if (active.length > 0) setSelectedId(active[0].id);
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => { statusRef.current = status; }, [status]);

  const stopAll = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    if (socketRef.current) {
      socketRef.current.emit('studio:stop');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    camRef.current?.getTracks().forEach(t => t.stop());
    camRef.current = null;
    screenRef.current?.getTracks().forEach(t => t.stop());
    screenRef.current = null;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setElapsed(0);
  }, []);

  async function buildCaptureStream(): Promise<MediaStream> {
    if (source === 'camera') {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      camRef.current = cam;
      return cam;
    }

    if (source === 'screen') {
      const screen = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      screenRef.current = screen;
      return screen;
    }

    // Both: canvas PiP
    const [cam, screen] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: true, audio: true }),
      (navigator.mediaDevices as any).getDisplayMedia({ video: true }),
    ]);
    camRef.current = cam;
    screenRef.current = screen;

    const canvas = canvasRef.current!;
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;

    const camVid = document.createElement('video');
    camVid.srcObject = cam;
    camVid.muted = true;
    await camVid.play();

    const screenVid = document.createElement('video');
    screenVid.srcObject = screen;
    screenVid.muted = true;
    await screenVid.play();

    function draw() {
      ctx.drawImage(screenVid, 0, 0, 1280, 720);
      ctx.drawImage(camVid, 1280 - 324, 720 - 182, 320, 180);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1280 - 324, 720 - 182, 320, 180);
      rafRef.current = requestAnimationFrame(draw);
    }
    draw();

    const canvasStream = canvas.captureStream(30);
    cam.getAudioTracks().forEach(t => canvasStream.addTrack(t));
    return canvasStream;
  }

  async function goLive() {
    if (!selectedId) { setError('Select a stream first'); return; }
    setError('');
    setStatus('requesting');

    let captureStream: MediaStream;
    try {
      captureStream = await buildCaptureStream();
    } catch (err: any) {
      setStatus('error');
      setError(err.name === 'NotAllowedError' ? 'Camera/screen access denied.' : err.message);
      return;
    }

    if (videoRef.current) videoRef.current.srcObject = captureStream;
    setStatus('connecting');

    // Create a fresh socket with auth token for this session
    const socket = getStudioSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('studio:start', { streamId: selectedId });
    });

    socket.on('studio:started', () => {
      setStatus('live');
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

      // Pick best supported format — matroska/webm both work
      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find(t => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';

      const recorder = new MediaRecorder(captureStream, {
        mimeType,
        videoBitsPerSecond: 3_000_000,
        audioBitsPerSecond: 128_000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && socket.connected) {
          e.data.arrayBuffer().then(buf => socket.emit('studio:data', buf));
        }
      };

      recorder.onerror = (e: any) => {
        setError('MediaRecorder error: ' + (e.error?.message ?? 'unknown'));
        stopLive();
      };

      recorder.start(250);
      recorderRef.current = recorder;
    });

    socket.on('studio:error', (msg: string) => {
      setStatus('error');
      setError(msg);
      stopAll();
    });

    socket.on('connect_error', (err) => {
      setStatus('error');
      setError('Cannot reach server: ' + err.message);
      stopAll();
    });

    socket.on('disconnect', () => {
      if (statusRef.current === 'live') {
        setStatus('idle');
        stopAll();
      }
    });
  }

  function stopLive() {
    setStatus('idle');
    stopAll();
  }

  const isLive = status === 'live';
  const isBusy = status === 'requesting' || status === 'connecting';

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">

        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm">← Dashboard</Link>
          <h1 className="text-2xl font-bold">Browser Studio</h1>
          {isLive && (
            <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">
              LIVE · {formatDuration(elapsed)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6">

          {/* Preview + source selector */}
          <div className="col-span-2 space-y-4">
            <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />

              {status === 'idle' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-2">
                  <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  </svg>
                  <p className="text-sm">Preview appears when you go live</p>
                </div>
              )}

              {status === 'requesting' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <p className="text-white text-sm">Allow camera/screen access in your browser…</p>
                </div>
              )}

              {status === 'connecting' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-white text-sm">Starting stream…</p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-900/40 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Source tabs */}
            <div className="bg-slate-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Source</p>
              <div className="flex gap-2">
                {([
                  { id: 'camera', label: '📷 Camera & Mic' },
                  { id: 'screen', label: '🖥️ Screen Share' },
                  { id: 'both',   label: '📷 + 🖥️ Both' },
                ] as { id: Source; label: string }[]).map(opt => (
                  <button
                    key={opt.id}
                    disabled={isLive || isBusy}
                    onClick={() => setSource(opt.id)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition
                      ${source === opt.id ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'}
                      disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {source === 'camera' && 'Streams webcam + microphone.'}
                {source === 'screen' && 'Shares your screen or a window. System audio optional.'}
                {source === 'both' && 'Screen fills the frame; webcam appears in the bottom-right corner.'}
              </p>
            </div>
          </div>

          {/* Right controls */}
          <div className="space-y-4">

            <div className="bg-slate-800 rounded-xl p-4">
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Stream</label>
              {streams.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No streams yet.{' '}
                  <Link href="/dashboard/streams" className="text-purple-400 hover:text-purple-300">Create one →</Link>
                </p>
              ) : (
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  disabled={isLive || isBusy}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 disabled:opacity-40"
                >
                  {streams.map(s => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              )}
            </div>

            <button
              onClick={isLive ? stopLive : goLive}
              disabled={isBusy || !selectedId}
              className={`w-full py-3 rounded-xl text-sm font-bold transition
                ${isLive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
                text-white disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {status === 'requesting' ? 'Requesting access…'
                : status === 'connecting' ? 'Connecting…'
                : isLive ? '⏹  Stop Stream'
                : '▶  Go Live'}
            </button>

            {isLive && (
              <div className="bg-slate-800 rounded-xl p-4 space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wider">Live Stats</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Duration</span>
                  <span className="font-mono text-white">{formatDuration(elapsed)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Source</span>
                  <span className="text-white capitalize">{source}</span>
                </div>
              </div>
            )}

            {!isLive && (
              <div className="bg-slate-800 rounded-xl p-4 text-xs text-gray-400 space-y-2">
                <p className="text-gray-300 font-medium">How it works</p>
                <p>Your browser captures video and streams it to the RTMP server — no OBS needed.</p>
                <p>Add destinations on the stream page to multicast to YouTube, Twitch, etc.</p>
                <p className="text-yellow-500/80">Requires FFmpeg installed on the server.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
