'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Stream {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  destination: { platform: string }[];
}

export default function AnalyticsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/streams')
      .then(setStreams)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = streams.length;
  const live = streams.filter(s => s.status === 'live').length;
  const ended = streams.filter(s => s.status === 'ended').length;

  const platformCounts: Record<string, number> = {};
  for (const s of streams) {
    for (const d of s.destination) {
      platformCounts[d.platform] = (platformCounts[d.platform] ?? 0) + 1;
    }
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-gray-400 mt-1">Overview of your streaming activity</p>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-6 mb-8">
            <StatCard label="Total Streams" value={total} />
            <StatCard label="Currently Live" value={live} highlight={live > 0} />
            <StatCard label="Completed" value={ended} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-slate-800 rounded-xl p-6">
              <h2 className="text-base font-semibold mb-4">Platform Usage</h2>
              {Object.keys(platformCounts).length === 0 ? (
                <p className="text-gray-500 text-sm">No destination data yet</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(platformCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([platform, count]) => (
                      <div key={platform} className="flex items-center justify-between">
                        <span className="text-sm capitalize text-gray-300">{platform}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full"
                              style={{ width: `${Math.min(100, (count / total) * 100)}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-400 w-4 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="bg-slate-800 rounded-xl p-6">
              <h2 className="text-base font-semibold mb-4">Recent Streams</h2>
              {streams.length === 0 ? (
                <p className="text-gray-500 text-sm">No streams yet</p>
              ) : (
                <div className="space-y-3">
                  {streams.slice(0, 5).map(s => (
                    <div key={s.id} className="flex items-center justify-between">
                      <span className="text-sm text-gray-300 truncate max-w-[160px]">{s.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        s.status === 'live' ? 'bg-green-700 text-green-200' : 'bg-slate-600 text-gray-400'
                      }`}>{s.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-600 mt-6">
            Detailed per-stream analytics (viewer counts, engagement, platform metrics) will be available in a future update.
          </p>
        </>
      )}
    </>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-6 ${highlight ? 'bg-green-900/30 border border-green-700' : 'bg-slate-800'}`}>
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${highlight ? 'text-green-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}
