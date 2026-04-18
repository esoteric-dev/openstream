'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, clearToken, getToken } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  plan: string;
}

interface Stream {
  id: string;
  title: string;
  rtmpKey: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const rtmpServer = process.env.NEXT_PUBLIC_RTMP_SERVER || 'rtmp://localhost:1935/live';

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    Promise.all([
      apiFetch('/api/auth/me'),
      apiFetch('/api/streams'),
    ]).then(([u, s]) => {
      setUser(u);
      setProfileForm({ name: u.name, email: u.email });
      setStreams(s);
    }).catch(() => { clearToken(); router.replace('/login'); });
  }, [router]);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg('');
    try {
      // Profile update endpoint — add to auth.ts if not present
      await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: profileForm.name }),
      });
      setProfileMsg('Profile updated successfully.');
      setUser(u => u ? { ...u, name: profileForm.name } : u);
    } catch (err: any) {
      setProfileMsg(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-gray-400">Loading...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        {/* Profile */}
        <section className="bg-slate-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Profile</h2>
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Name</label>
              <input
                value={profileForm.name}
                onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Email</label>
              <input
                value={profileForm.email}
                disabled
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed.</p>
            </div>
            {profileMsg && <p className={`text-sm ${profileMsg.includes('success') ? 'text-green-400' : 'text-red-400'}`}>{profileMsg}</p>}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Plan: <span className="text-purple-400 font-medium capitalize">{user.plan}</span>
              </span>
              <button type="submit" disabled={profileSaving} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>

        {/* RTMP Credentials */}
        <section className="bg-slate-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">RTMP Credentials</h2>
          <p className="text-sm text-gray-400 mb-5">
            Use these in OBS or any RTMP-compatible software. Each stream has a unique key.
          </p>

          <div className="mb-4">
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">RTMP Server</label>
            <div className="flex gap-2">
              <code className="flex-1 bg-slate-900 rounded-lg px-4 py-3 text-sm text-purple-300">{rtmpServer}</code>
              <button onClick={() => copyKey(rtmpServer)} className="bg-slate-700 hover:bg-slate-600 px-3 rounded-lg text-sm transition">
                {copiedKey === rtmpServer ? '✓' : 'Copy'}
              </button>
            </div>
          </div>

          {streams.length === 0 ? (
            <p className="text-sm text-gray-500">No streams yet. Create a stream to get your unique stream key.</p>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs text-gray-400 uppercase tracking-wider">Stream Keys</label>
              {streams.map(s => (
                <div key={s.id} className="bg-slate-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">{s.title}</p>
                  <div className="flex gap-2">
                    <code className="flex-1 text-sm text-purple-300 truncate">{s.rtmpKey}</code>
                    <button onClick={() => copyKey(s.rtmpKey)} className="text-xs text-gray-400 hover:text-white px-2 transition">
                      {copiedKey === s.rtmpKey ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Danger zone */}
        <section className="bg-slate-800 rounded-xl p-6 border border-red-900/40">
          <h2 className="text-lg font-semibold text-red-400 mb-3">Danger Zone</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Sign out of all sessions</p>
              <p className="text-xs text-gray-500 mt-0.5">Clear your session token and return to the home page.</p>
            </div>
            <button
              onClick={() => { clearToken(); router.push('/'); }}
              className="border border-red-600 text-red-400 hover:bg-red-600 hover:text-white px-4 py-2 rounded-lg text-sm transition"
            >
              Sign out
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
