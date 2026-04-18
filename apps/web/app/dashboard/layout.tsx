'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, clearToken, getToken } from '@/lib/api';

const NAV = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Streams', href: '/dashboard/streams' },
  { label: 'Schedule', href: '/dashboard/schedule' },
  { label: 'Recordings', href: '/dashboard/recordings' },
  { label: 'Platforms', href: '/dashboard/platforms' },
  { label: 'Analytics', href: '/dashboard/analytics' },
  { label: 'Hosted Pages', href: '/dashboard/pages' },
  { label: 'Team', href: '/dashboard/team' },
  { label: 'Billing', href: '/dashboard/billing' },
];

const EXTERNAL_NAV = [
  { label: '🎙 Studio', href: '/studio' },
  { label: '⚙ Settings', href: '/settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; plan: string } | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    apiFetch('/api/auth/me')
      .then(u => setUser({ name: u.name, plan: u.plan }))
      .catch(() => { clearToken(); router.replace('/login'); });
  }, [router]);

  function handleLogout() {
    clearToken();
    router.push('/');
  }

  const planColors: Record<string, string> = {
    free: 'text-gray-400 bg-gray-700',
    pro: 'text-purple-300 bg-purple-900',
    business: 'text-yellow-300 bg-yellow-900',
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex">
      <aside className="fixed inset-y-0 left-0 w-60 bg-slate-800 border-r border-slate-700 flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <Link href="/" className="text-xl font-bold text-purple-400">MultiStream</Link>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-2.5 rounded-lg text-sm transition ${
                pathname === item.href
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="pt-2 mt-2 border-t border-slate-700 space-y-1">
            {EXTERNAL_NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-slate-700 hover:text-white transition"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        {user && (
          <div className="p-4 border-t border-slate-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold">
                {user.name?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${planColors[user.plan] ?? planColors.free}`}>
                  {user.plan}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full text-sm text-gray-400 hover:text-white py-2 rounded-lg hover:bg-slate-700 transition"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="ml-60 flex-1 p-8">{children}</main>
    </div>
  );
}
