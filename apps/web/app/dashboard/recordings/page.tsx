'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Recording {
  id: string;
  title: string;
  recordingUrl: string;
  createdAt: string;
}

interface StreamOption {
  id: string;
  title: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [streams, setStreams] = useState<StreamOption[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/recordings'),
      apiFetch('/api/streams'),
    ])
      .then(([recs, strs]) => {
        setRecordings(recs);
        setStreams(strs.map((s: any) => ({ id: s.id, title: s.title })));
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  async function handleAddToStream(recordingId: string, targetStreamId: string, streamTitle: string) {
    setAdding(recordingId);
    try {
      await apiFetch(`/api/recordings/${recordingId}/add-to-stream`, {
        method: 'POST',
        body: JSON.stringify({ targetStreamId }),
      });
      setSuccessMsg(`✓ Added to "${streamTitle}"`);
      setOpenDropdown(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to add to stream');
    } finally {
      setAdding(null);
    }
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Recordings</h1>
        <p className="text-gray-400 mt-1">Download or restream your past broadcasts</p>
      </div>

      {successMsg && (
        <div className="mb-4 bg-green-900/30 border border-green-700 rounded-lg px-4 py-2.5 text-sm text-green-300 flex items-center gap-2">
          {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : recordings.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 mb-2">No recordings yet</p>
          <p className="text-sm text-gray-500">
            Recordings are saved automatically when you go live, provided S3/MinIO storage is configured.
          </p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-medium text-gray-400 uppercase px-5 py-3">Stream</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase px-5 py-3">Date</th>
                <th className="text-right text-xs font-medium text-gray-400 uppercase px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {recordings.map(r => (
                <tr key={r.id} className="hover:bg-slate-700/50 transition">
                  <td className="px-5 py-4">
                    <p className="font-medium text-sm">{r.title}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-400">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <a
                        href={r.recordingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-purple-400 hover:text-purple-300 transition"
                      >
                        Watch
                      </a>
                      <a
                        href={r.recordingUrl}
                        download
                        className="text-sm bg-slate-600 hover:bg-slate-500 px-3 py-1.5 rounded transition"
                      >
                        Download
                      </a>

                      {/* Add to Stream dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenDropdown(openDropdown === r.id ? null : r.id)}
                          disabled={!!adding}
                          className="text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-1.5 rounded transition"
                        >
                          {adding === r.id ? 'Adding…' : 'Add to Stream'}
                        </button>

                        {openDropdown === r.id && (
                          <div className="absolute right-0 top-full mt-1 w-56 bg-slate-700 border border-slate-600 rounded-lg shadow-xl z-30 py-1 max-h-48 overflow-y-auto">
                            {streams.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-gray-400">No streams available</p>
                            ) : (
                              streams.map(s => (
                                <button
                                  key={s.id}
                                  onClick={() => handleAddToStream(r.id, s.id, s.title)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition truncate"
                                >
                                  {s.title}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
