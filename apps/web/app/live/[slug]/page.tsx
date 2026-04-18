'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

interface PageData {
  id: string;
  title: string;
  slug: string;
  stream?: {
    id: string;
    title: string;
    status: string;
    rtmpKey: string;
  } | null;
  user: { name: string };
}

interface ChatMsg {
  platform: string;
  username: string;
  message: string;
  timestamp: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
const SRS_HTTP_URL = process.env.NEXT_PUBLIC_SRS_HTTP_URL || 'http://localhost:8080';

const PLATFORM_COLORS: Record<string, string> = {
  youtube: 'text-red-400',
  twitch: 'text-purple-400',
  facebook: 'text-blue-400',
  studio: 'text-green-400',
};

export default function LivePage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PageData | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/pages/public/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setPage)
      .catch(code => { if (code === 404) setNotFound(true); })
      .finally(() => setLoading(false));
  }, [slug]);

  // Load HLS.js and attach the stream
  useEffect(() => {
    if (!page?.stream || page.stream.status !== 'live' || !videoRef.current) return;

    const hlsUrl = `${SRS_HTTP_URL}/live/${page.stream.rtmpKey}.m3u8`;

    const tryHls = async () => {
      const { default: Hls } = await import('hls.js');
      if (Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true });
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoRef.current!);
        return () => hls.destroy();
      } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = hlsUrl;
      }
    };

    tryHls().catch(console.error);
  }, [page]);

  // Socket.IO for live chat
  useEffect(() => {
    if (!page?.stream) return;
    const streamId = page.stream.id;

    import('socket.io-client').then(({ io }) => {
      const socket = io(API_URL);
      socket.emit('join-stream', streamId);

      socket.on('chat-history', (msgs: ChatMsg[]) => setChat(msgs));
      socket.on('chat-message', (msg: ChatMsg) => {
        setChat(prev => [...prev.slice(-200), msg]);
      });

      return () => { socket.disconnect(); };
    });
  }, [page?.stream?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-gray-400">Loading...</p>
    </div>
  );

  if (notFound || !page) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
        <p className="text-gray-400">This live page doesn&apos;t exist or has been removed.</p>
      </div>
    </div>
  );

  const isLive = page.stream?.status === 'live';

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-purple-400">{page.user.name}</span>
          {isLive && (
            <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded font-bold animate-pulse">● LIVE</span>
          )}
        </div>
        <h1 className="text-sm text-gray-400">{page.title}</h1>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Video player */}
        <div className="flex-1 bg-black flex items-center justify-center">
          {isLive ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              controls
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-center px-8">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📡</span>
              </div>
              <h2 className="text-xl font-semibold mb-2">
                {page.stream ? 'Stream is offline' : 'No stream connected'}
              </h2>
              <p className="text-gray-400 text-sm">
                {page.stream
                  ? `${page.stream.title} will go live soon.`
                  : 'The host hasn\'t connected a stream to this page yet.'}
              </p>
            </div>
          )}
        </div>

        {/* Chat sidebar */}
        <aside className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="font-semibold text-sm">Live Chat</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {chat.length === 0 ? (
              <p className="text-gray-600 text-xs text-center pt-8">No messages yet</p>
            ) : (
              chat.map((msg, i) => (
                <div key={i} className="text-sm break-words">
                  <span className={`font-medium ${PLATFORM_COLORS[msg.platform] ?? 'text-gray-300'} mr-1 text-xs`}>
                    [{msg.platform}]
                  </span>
                  <span className="text-purple-300 font-medium mr-1">{msg.username}:</span>
                  <span className="text-gray-200">{msg.message}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
        </aside>
      </div>
    </div>
  );
}
