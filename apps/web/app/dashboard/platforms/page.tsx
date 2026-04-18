'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Platform {
  id: string;
  type: string;
  channelName: string | null;
  channelId: string | null;
  createdAt: string;
}

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  youtube:  { label: 'YouTube',  color: 'bg-red-600' },
  twitch:   { label: 'Twitch',   color: 'bg-purple-600' },
  facebook: { label: 'Facebook', color: 'bg-blue-600' },
  linkedin: { label: 'LinkedIn', color: 'bg-blue-500' },
  twitter:  { label: 'Twitter / X', color: 'bg-slate-600' },
  tiktok:   { label: 'TikTok',   color: 'bg-pink-600' },
};

const CONNECTABLE = ['youtube', 'twitch', 'facebook'];

export default function PlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/platforms')
      .then(setPlatforms)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect(type: string) {
    setConnecting(type);
    try {
      const { url } = await apiFetch(`/api/platforms/oauth/${type}`, { method: 'POST' });
      window.location.href = url;
    } catch {
      setConnecting(null);
    }
  }

  async function handleDisconnect(id: string) {
    if (!confirm('Disconnect this platform?')) return;
    try {
      await apiFetch(`/api/platforms/${id}`, { method: 'DELETE' });
      setPlatforms(p => p.filter(x => x.id !== id));
    } catch {}
  }

  const connectedTypes = new Set(platforms.map(p => p.type));

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Platforms</h1>
        <p className="text-gray-400 mt-1">Connect your streaming accounts</p>
      </div>

      {platforms.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Connected</h2>
          <div className="space-y-3">
            {platforms.map(p => {
              const meta = PLATFORM_META[p.type] ?? { label: p.type, color: 'bg-slate-600' };
              return (
                <div key={p.id} className="bg-slate-800 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${meta.color} flex items-center justify-center text-xs font-bold`}>
                      {meta.label[0]}
                    </div>
                    <div>
                      <p className="font-medium">{meta.label}</p>
                      <p className="text-xs text-gray-400">{p.channelName ?? 'Connected'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(p.id)}
                    className="text-sm text-gray-500 hover:text-red-400 transition"
                  >
                    Disconnect
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Available</h2>
        <div className="grid grid-cols-2 gap-4">
          {CONNECTABLE.map(type => {
            const meta = PLATFORM_META[type];
            const connected = connectedTypes.has(type);
            return (
              <div key={type} className="bg-slate-800 rounded-xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg ${meta.color} flex items-center justify-center font-bold`}>
                    {meta.label[0]}
                  </div>
                  <p className="font-medium">{meta.label}</p>
                </div>
                {connected ? (
                  <span className="text-xs text-green-400 font-medium">Connected</span>
                ) : (
                  <button
                    onClick={() => handleConnect(type)}
                    disabled={connecting === type}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-medium transition"
                  >
                    {connecting === type ? 'Redirecting...' : 'Connect'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-4">More platforms (LinkedIn, TikTok, Twitter) coming soon.</p>
      </div>
    </>
  );
}
