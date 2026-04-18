'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Stream {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  rtmpKey: string;
  destination: { id: string; platform: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  offline: 'bg-gray-600 text-gray-300',
  live: 'bg-green-600 text-white',
  scheduled: 'bg-blue-600 text-white',
  ended: 'bg-slate-600 text-gray-400',
};

export default function SchedulePage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', scheduledAt: '', scheduledEndAt: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const all: Stream[] = await apiFetch('/api/streams');
      setStreams(all.filter(s => s.scheduledAt || s.status === 'scheduled'));
    } catch { }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await apiFetch('/api/streams', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          scheduledAt: form.scheduledAt,
          ...(form.scheduledEndAt ? { scheduledEndAt: form.scheduledEndAt } : {}),
        }),
      });
      setForm({ title: '', scheduledAt: '', scheduledEndAt: '' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Cancel and delete this scheduled stream?')) return;
    await apiFetch(`/api/streams/${id}`, { method: 'DELETE' });
    setStreams(s => s.filter(x => x.id !== id));
  }

  // Group by date for calendar-like display
  const grouped: Record<string, Stream[]> = {};
  for (const s of streams) {
    const key = s.scheduledAt
      ? new Date(s.scheduledAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'Unscheduled';
    grouped[key] = [...(grouped[key] ?? []), s];
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-gray-400 mt-1">Plan and manage upcoming streams</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + Schedule Stream
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Schedule a Stream</h2>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                  placeholder="My Scheduled Stream"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                  required
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <p className="text-xs text-gray-500">
                If you have a pre-recorded video set on this stream, it will start automatically at the scheduled time.
                Otherwise, connect your streaming software to the RTMP key before the scheduled time.
              </p>
              <div>
                <label className="block text-sm text-gray-300 mb-1">End Time <span className="text-gray-500">(optional)</span></label>
                <input
                  type="datetime-local"
                  value={form.scheduledEndAt}
                  onChange={e => setForm(f => ({ ...f, scheduledEndAt: e.target.value }))}
                  min={form.scheduledAt || new Date().toISOString().slice(0, 16)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to run until you stop it manually.
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={creating} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">
                  {creating ? 'Scheduling...' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : streams.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 mb-4">No scheduled streams</p>
          <button onClick={() => setShowForm(true)} className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg text-sm font-medium">
            Schedule your first stream
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dateStreams]) => (
            <div key={date}>
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">{date}</h2>
              <div className="space-y-2">
                {dateStreams.map(s => (
                  <div key={s.id} className="bg-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-[60px]">
                        {s.scheduledAt ? (
                          <>
                            <p className="text-lg font-bold text-purple-400">
                              {new Date(s.scheduledAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-500">—</p>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{s.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {s.destination.length} destination{s.destination.length !== 1 ? 's' : ''}
                          {s.scheduledEndAt
                            ? ` · until ${new Date(s.scheduledEndAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                            : ' · until stopped'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[s.status]}`}>
                        {s.status}
                      </span>
                      <Link href={`/dashboard/streams/${s.id}`} className="text-xs text-purple-400 hover:text-purple-300">
                        Manage →
                      </Link>
                      <button onClick={() => handleDelete(s.id)} className="text-xs text-gray-500 hover:text-red-400">
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
