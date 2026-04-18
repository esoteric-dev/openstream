'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface HostedPage {
  id: string;
  slug: string;
  title: string;
  customDomain: string | null;
  streamId: string | null;
  stream?: { id: string; title: string; status: string } | null;
  createdAt: string;
}

interface Stream {
  id: string;
  title: string;
  status: string;
}

export default function PagesPage() {
  const [pages, setPages] = useState<HostedPage[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPage, setEditPage] = useState<HostedPage | null>(null);
  const [form, setForm] = useState({ slug: '', title: '', streamId: '', customDomain: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [pagesData, streamsData] = await Promise.all([
      apiFetch('/api/pages').catch(() => []),
      apiFetch('/api/streams').catch(() => []),
    ]);
    setPages(pagesData);
    setStreams(streamsData);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditPage(null);
    setForm({ slug: '', title: '', streamId: '', customDomain: '' });
    setError('');
    setShowForm(true);
  }

  function openEdit(page: HostedPage) {
    setEditPage(page);
    setForm({
      slug: page.slug,
      title: page.title,
      streamId: page.streamId ?? '',
      customDomain: page.customDomain ?? '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      slug: form.slug,
      title: form.title,
      streamId: form.streamId || undefined,
      customDomain: form.customDomain || undefined,
    };
    try {
      if (editPage) {
        await apiFetch(`/api/pages/${editPage.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/api/pages', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this hosted page?')) return;
    await apiFetch(`/api/pages/${id}`, { method: 'DELETE' });
    setPages(p => p.filter(x => x.id !== id));
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Hosted Pages</h1>
          <p className="text-gray-400 mt-1">Branded public live pages for your audience</p>
        </div>
        <button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-medium transition">
          + New Page
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">{editPage ? 'Edit Page' : 'Create Hosted Page'}</h2>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                  placeholder="My Live Stream"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Slug</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm whitespace-nowrap">/live/</span>
                  <input
                    value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    required
                    minLength={3}
                    placeholder="my-stream"
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Link to Stream (optional)</label>
                <select
                  value={form.streamId}
                  onChange={e => setForm(f => ({ ...f, streamId: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">— None —</option>
                  {streams.map(s => (
                    <option key={s.id} value={s.id}>{s.title} ({s.status})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Custom Domain (optional)</label>
                <input
                  value={form.customDomain}
                  onChange={e => setForm(f => ({ ...f, customDomain: e.target.value }))}
                  placeholder="live.yourdomain.com"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={saving} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">
                  {saving ? 'Saving...' : editPage ? 'Save Changes' : 'Create Page'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : pages.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 mb-2">No hosted pages yet</p>
          <p className="text-sm text-gray-500 mb-4">Create a branded page where viewers can watch your live stream.</p>
          <button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg text-sm font-medium">
            Create your first page
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map(page => (
            <div key={page.id} className="bg-slate-800 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium">{page.title}</h3>
                  {page.stream && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      page.stream.status === 'live' ? 'bg-green-700 text-green-200' : 'bg-slate-600 text-gray-400'
                    }`}>
                      {page.stream.status === 'live' ? '● Live' : page.stream.status}
                    </span>
                  )}
                </div>
                <a
                  href={`/live/${page.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-400 hover:underline"
                >
                  {baseUrl}/live/{page.slug}
                </a>
                {page.customDomain && (
                  <p className="text-xs text-gray-500 mt-0.5">Custom: {page.customDomain}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => openEdit(page)} className="text-sm text-gray-400 hover:text-white transition">
                  Edit
                </button>
                <button onClick={() => handleDelete(page.id)} className="text-sm text-gray-500 hover:text-red-400 transition">
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
