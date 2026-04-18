'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useStreamSocket } from '@/lib/socket';
import PlaylistManager, { PlaylistItem } from '@/components/PlaylistManager';
import ConnectedPlatformCards from '@/components/ConnectedPlatformCards';

interface Destination {
  id: string;
  platform: string;
  rtmpUrl: string;
  streamKey: string;
  status: string;
}

interface Stream {
  id: string;
  title: string;
  status: string;
  rtmpKey: string;
  rtmpUrl: string;
  destination: Destination[];
  playlist: PlaylistItem[];
  scheduledAt: string | null;
  createdAt: string;
}

interface ChatMsg {
  platform: string;
  username: string;
  message: string;
  timestamp: string;
}

const STATUS_COLORS: Record<string, string> = {
  offline: 'bg-gray-600 text-gray-200',
  live: 'bg-green-600 text-white animate-pulse',
  scheduled: 'bg-blue-600 text-white',
  ended: 'bg-slate-600 text-gray-400',
  connecting: 'bg-yellow-600 text-white',
  error: 'bg-red-600 text-white',
};

const PLATFORM_COLORS: Record<string, string> = {
  youtube: 'text-red-400',
  twitch: 'text-purple-400',
  facebook: 'text-blue-400',
  studio: 'text-green-400',
};

export default function StreamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [stream, setStream] = useState<Stream | null>(null);
  const [destStatuses, setDestStatuses] = useState<Record<string, string>>({});
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [addingDest, setAddingDest] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [destForm, setDestForm] = useState({ platform: 'youtube', rtmpUrl: '', streamKey: '' });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const { sendMessage } = useStreamSocket(id, {
    onStatus: (data) => {
      setStream(s => s ? { ...s, status: data.status } : s);
    },
    onDestinationStatus: (data) => {
      setDestStatuses(prev => ({ ...prev, [data.destinationId]: data.status }));
    },
    onChatMessage: (data) => {
      setChat(prev => [...prev.slice(-200), data]);
    },
    onChatHistory: (messages) => {
      setChat(messages);
    },
  });

  useEffect(() => {
    apiFetch(`/api/streams/${id}`)
      .then(data => {
        setStream(data);
        const initial: Record<string, string> = {};
        for (const d of data.destination) initial[d.id] = d.status;
        setDestStatuses(initial);
      })
      .catch(() => router.replace('/dashboard/streams'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  async function handleStart() {
    await apiFetch(`/api/streams/${id}/start`, { method: 'POST' });
    setStream(s => s ? { ...s, status: 'live' } : s);
  }

  async function handleStop() {
    await apiFetch(`/api/streams/${id}/stop`, { method: 'POST' });
    setStream(s => s ? { ...s, status: 'ended' } : s);
  }

  async function handleAddDestination(e: React.FormEvent) {
    e.preventDefault();
    try {
      const dest = await apiFetch(`/api/streams/${id}/destinations`, {
        method: 'POST',
        body: JSON.stringify(destForm),
      });
      setStream(s => s ? { ...s, destination: [...s.destination, dest] } : s);
      setDestForm({ platform: 'youtube', rtmpUrl: '', streamKey: '' });
      setAddingDest(false);
    } catch (err: any) {
      alert(err.message);
    }
  }

  function copyRtmpKey() {
    if (!stream) return;
    navigator.clipboard.writeText(stream.rtmpKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendMessage(chatInput.trim());
    setChatInput('');
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400">Loading...</p>
    </div>
  );
  if (!stream) return null;

  const isLive = stream.status === 'live';
  const rtmpServer = stream.rtmpUrl || 'rtmp://localhost:1935/live';

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/dashboard/streams" className="text-gray-500 hover:text-gray-300 text-sm">← Streams</Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{stream.title}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[stream.status] ?? STATUS_COLORS.offline}`}>
              {stream.status}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          {stream.status === 'offline' || stream.status === 'scheduled' ? (
            <button
              onClick={handleStart}
              className="bg-green-600 hover:bg-green-700 px-5 py-2 rounded-lg text-sm font-medium transition"
            >
              Go Live
            </button>
          ) : stream.status === 'live' ? (
            <button
              onClick={handleStop}
              className="bg-red-600 hover:bg-red-700 px-5 py-2 rounded-lg text-sm font-medium transition"
            >
              End Stream
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-2 space-y-6">

          {/* OBS Setup */}
          <div className="bg-slate-800 rounded-xl p-6">
            <h2 className="text-base font-semibold mb-4">OBS / Streaming Software Setup</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">RTMP Server</label>
                <code className="block bg-slate-900 rounded px-3 py-2 text-sm text-purple-300 break-all">
                  {rtmpServer}
                </code>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Stream Key</label>
                <div className="flex gap-2">
                  <code className="flex-1 block bg-slate-900 rounded px-3 py-2 text-sm text-purple-300 truncate">
                    {stream.rtmpKey}
                  </code>
                  <button
                    onClick={copyRtmpKey}
                    className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded text-xs transition"
                  >
                    {copied ? '✓' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              In OBS: Settings → Stream → Service: Custom → paste the RTMP server and stream key above.
            </p>
          </div>

          {/* Playlist */}
          <div className="bg-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Pre-recorded Playlist</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Upload videos to stream automatically. Use &quot;Go Live&quot; or schedule to start playback.
                </p>
              </div>
              {stream.playlist?.length > 0 && (
                <span className="text-xs text-gray-400 bg-slate-700 px-2 py-1 rounded">
                  {stream.playlist.length} video{stream.playlist.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <PlaylistManager
              streamId={stream.id}
              initialPlaylist={stream.playlist ?? []}
              onPlaylistChange={(pl) => setStream(s => s ? { ...s, playlist: pl } : s)}
            />
          </div>

          {/* Destinations */}
          <div className="bg-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Destinations</h2>
              <button
                onClick={() => setAddingDest(!addingDest)}
                className="bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded text-sm transition"
              >
                {addingDest ? '✕ Close' : '+ Add'}
              </button>
            </div>

            {addingDest && (
              <div className="mb-4 space-y-4">
                {/* Quick Connect — connected platforms */}
                <ConnectedPlatformCards
                  streamId={stream.id}
                  streamTitle={stream.title}
                  existingPlatforms={stream.destination.map(d => d.platform)}
                  onDestinationAdded={(dest) => {
                    setStream(s => s ? { ...s, destination: [...s.destination, dest] } : s);
                  }}
                />

                {/* Manual RTMP toggle */}
                <div className="border-t border-slate-700 pt-3">
                  <button
                    onClick={() => setShowManualForm(!showManualForm)}
                    className="text-xs text-gray-400 hover:text-gray-300 transition"
                  >
                    {showManualForm ? '▾ Hide manual RTMP' : '▸ Or add custom RTMP destination…'}
                  </button>
                </div>

                {showManualForm && (
                  <form onSubmit={handleAddDestination} className="bg-slate-700 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Platform</label>
                        <select
                          value={destForm.platform}
                          onChange={e => setDestForm(f => ({ ...f, platform: e.target.value }))}
                          className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-sm"
                        >
                          {['youtube', 'twitch', 'facebook', 'linkedin', 'tiktok', 'custom'].map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Stream Key</label>
                        <input
                          value={destForm.streamKey}
                          onChange={e => setDestForm(f => ({ ...f, streamKey: e.target.value }))}
                          required
                          placeholder="xxxx-xxxx-xxxx"
                          className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-sm placeholder-gray-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">RTMP URL</label>
                      <input
                        value={destForm.rtmpUrl}
                        onChange={e => setDestForm(f => ({ ...f, rtmpUrl: e.target.value }))}
                        required
                        placeholder="rtmp://a.rtmp.youtube.com/live2"
                        className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-sm placeholder-gray-500"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setShowManualForm(false)} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
                      <button type="submit" className="bg-purple-600 hover:bg-purple-700 px-4 py-1.5 rounded text-sm">Add</button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {stream.destination.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">
                No destinations yet. Add one to start multistreaming.
              </p>
            ) : (
              <div className="space-y-2">
                {stream.destination.map(dest => {
                  const status = destStatuses[dest.id] || dest.status;
                  return (
                    <div key={dest.id} className="flex items-center justify-between bg-slate-700 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-medium capitalize ${PLATFORM_COLORS[dest.platform] ?? 'text-gray-300'}`}>
                          {dest.platform}
                        </span>
                        <span className="text-xs text-gray-500 truncate max-w-[200px]">
                          {dest.rtmpUrl}/{dest.streamKey.slice(0, 8)}…
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.offline}`}>
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column — Chat */}
        <div className="bg-slate-800 rounded-xl flex flex-col" style={{ height: '600px' }}>
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-base font-semibold">Live Chat</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isLive ? 'Aggregated from all platforms' : 'Chat is available when live'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {chat.length === 0 ? (
              <p className="text-gray-600 text-sm text-center pt-8">No messages yet</p>
            ) : (
              chat.map((msg, i) => (
                <div key={i} className="text-sm">
                  <span className={`font-medium ${PLATFORM_COLORS[msg.platform] ?? 'text-gray-300'} mr-1`}>
                    [{msg.platform}]
                  </span>
                  <span className="text-purple-300 mr-1">{msg.username}:</span>
                  <span className="text-gray-200">{msg.message}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={sendChat} className="p-3 border-t border-slate-700 flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Send a message…"
              className="flex-1 bg-slate-700 rounded px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded text-sm transition"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
