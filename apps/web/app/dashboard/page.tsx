'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface User {
  name: string;
  plan: string;
  _count: { streams: number; platforms: number };
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    apiFetch('/api/auth/me').then(setUser).catch(() => {});
  }, []);

  if (!user) return null;

  return (
    <>
      <h1 className="text-2xl font-bold mb-2">Welcome back, {user.name}</h1>
      <p className="text-gray-400 mb-8">Here&apos;s an overview of your account.</p>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard label="Total Streams" value={user._count.streams} />
        <StatCard label="Connected Platforms" value={user._count.platforms} />
        <StatCard label="Current Plan" value={user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} />
      </div>

      <div className="bg-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          <ActionCard title="New Stream" description="Set up a new multistream session" href="/dashboard/streams" />
          <ActionCard title="Connect Platform" description="Add YouTube, Twitch, Facebook and more" href="/dashboard/platforms" />
          <ActionCard title="View Analytics" description="Track your stream performance" href="/dashboard/analytics" />
          <ActionCard title="Upgrade Plan" description="Unlock more destinations and features" href="/dashboard/billing" />
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}

function ActionCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Link href={href} className="block bg-slate-700 hover:bg-slate-600 rounded-lg p-4 transition">
      <p className="font-medium text-white mb-1">{title}</p>
      <p className="text-sm text-gray-400">{description}</p>
    </Link>
  );
}
