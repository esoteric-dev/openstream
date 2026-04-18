'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Member {
  id: string;
  role: string;
  user: { name: string; email: string };
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'text-purple-300 bg-purple-900',
  manager: 'text-blue-300 bg-blue-900',
  viewer: 'text-gray-300 bg-slate-600',
};

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/team/members')
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-gray-400 mt-1">Manage who has access to your workspace</p>
        </div>
        <button
          disabled
          title="Available on Business plan"
          className="bg-purple-600 opacity-50 cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Invite Member
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : members.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 mb-2">No team members yet</p>
          <p className="text-sm text-gray-500">Upgrade to the Business plan to invite team members.</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-medium text-gray-400 uppercase px-5 py-3">Member</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase px-5 py-3">Email</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase px-5 py-3">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {members.map(m => (
                <tr key={m.id}>
                  <td className="px-5 py-3 text-sm font-medium">{m.user.name}</td>
                  <td className="px-5 py-3 text-sm text-gray-400">{m.user.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-1 rounded font-medium ${ROLE_COLORS[m.role] ?? ROLE_COLORS.viewer}`}>
                      {m.role}
                    </span>
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
