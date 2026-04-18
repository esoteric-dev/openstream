'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface User {
  plan: string;
  subscription?: { status: string; currentPeriodEnd: string | null } | null;
}

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    features: ['3 Destinations', '720p HD Quality', 'Basic Analytics'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    features: ['10 Destinations', '1080p Full HD', 'Priority Support', 'Scheduled Streams'],
    highlight: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: '$49',
    features: ['Unlimited Destinations', '4K Ultra HD', 'Team Management', 'Custom Branding'],
  },
];

export default function BillingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(plan: string) {
    setUpgrading(plan);
    try {
      const { url } = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      window.location.href = url;
    } catch {
      setUpgrading(null);
    }
  }

  if (loading) return <p className="text-gray-400">Loading...</p>;

  const currentPlan = user?.plan ?? 'free';

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-gray-400 mt-1">Manage your subscription</p>
      </div>

      {user?.subscription && (
        <div className="bg-slate-800 rounded-xl p-5 mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">Current subscription</p>
            <p className="font-medium capitalize">{user.subscription.status}</p>
            {user.subscription.currentPeriodEnd && (
              <p className="text-xs text-gray-500 mt-0.5">
                Renews {new Date(user.subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          <button
            onClick={async () => {
              const { url } = await apiFetch('/api/billing/portal');
              window.location.href = url;
            }}
            className="text-sm text-purple-400 hover:text-purple-300 transition"
          >
            Manage billing →
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {PLANS.map(plan => {
          const isCurrent = currentPlan === plan.id;
          return (
            <div
              key={plan.id}
              className={`rounded-xl p-6 flex flex-col ${
                plan.highlight
                  ? 'bg-purple-900 border-2 border-purple-500'
                  : 'bg-slate-800'
              }`}
            >
              <div className="mb-4">
                <h2 className="text-xl font-bold">{plan.name}</h2>
                <p className="text-3xl font-bold mt-1">
                  {plan.price}<span className="text-base font-normal text-gray-400">/mo</span>
                </p>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="text-sm text-gray-300 flex items-center gap-2">
                    <span className="text-purple-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="text-center py-2 rounded-lg border border-slate-600 text-sm text-gray-400">
                  Current plan
                </div>
              ) : plan.id === 'free' ? null : (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={upgrading === plan.id}
                  className={`py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                    plan.highlight
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'border border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white'
                  }`}
                >
                  {upgrading === plan.id ? 'Redirecting...' : `Upgrade to ${plan.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
