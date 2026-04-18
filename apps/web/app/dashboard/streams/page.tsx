'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Destination {
  id: string;
  platform: string;
  status: string;
}

interface Stream {
  id: string;
  title: string;
  status: string;
  rtmpKey: string;
  destination: Destination[];
  createdAt: string;
  scheduledAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  offline: 'bg-gray-600 text-gray-200',
  live: 'bg-green-600 text-white',
  scheduled: 'bg-blue-600 text-white',
  ended: 'bg-slate-600 text-gray-300',
};

export default function StreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function loadStreams() {
    try {
      const data = await apiFetch('/api/streams');
      setStreams(data);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadStreams(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await apiFetch('/api/streams', { method: 'POST', body: JSON.stringify({ title }) });
      setTitle('');
      setShowForm(false);
      loadStreams();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this stream?')) return;
    try {
      await apiFetch(`/api/streams/${id}`, { method: 'DELETE' });
      setStreams(s => s.filter(x => x.id !== id));
    } catch {}
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Streams</h1>
          <p className="text-gray-400 mt-1">Manage your multistream sessions</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + New Stream
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Create Stream</h2>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Stream Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="My Awesome Stream"
                  required
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {creating ? 'Creating...' : 'Create'}
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
          <p className="text-gray-400 mb-4">No streams yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg text-sm font-medium transition"
          >
            Create your first stream
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {streams.map(stream => (
            <div key={stream.id} className="bg-slate-800 rounded-xl p-5 flex items-center justify-between">
              <Link href={`/dashboard/streams/${stream.id}`} className="flex-1 min-w-0 group">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-medium group-hover:text-purple-300 transition">{stream.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[stream.status] ?? STATUS_COLORS.offline}`}>
                    {stream.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-mono truncate">{stream.rtmpKey}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {stream.destination.length} destination{stream.destination.length !== 1 ? 's' : ''}
                  {' · '}
                  {new Date(stream.createdAt).toLocaleDateString()}
                </p>
              </Link>
              <div className="flex items-center gap-4 ml-4 shrink-0">
                <Link
                  href={`/dashboard/streams/${stream.id}`}
                  className="text-purple-400 hover:text-purple-300 text-sm transition"
                >
                  Manage →
                </Link>
                <button
                  onClick={() => handleDelete(stream.id)}
                  className="text-gray-500 hover:text-red-400 text-sm transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
