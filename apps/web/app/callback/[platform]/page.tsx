'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

export default function OAuthCallbackPage() {
  const { platform } = useParams<{ platform: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(`Authorization denied: ${error}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received.');
      return;
    }

    if (!getToken()) {
      router.replace('/login');
      return;
    }

    apiFetch(`/api/platforms/oauth/${platform}/callback`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
      .then(data => {
        setStatus('success');
        setMessage(`${data.channelName ?? platform} connected successfully!`);
        setTimeout(() => router.push('/dashboard/platforms'), 2000);
      })
      .catch(err => {
        setStatus('error');
        setMessage(err.message || 'Failed to connect platform.');
      });
  }, []);

  const ICONS: Record<string, string> = {
    youtube: '▶️',
    twitch: '🎮',
    facebook: '👤',
    linkedin: '💼',
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4 text-3xl">
          {status === 'processing' ? '⏳' : status === 'success' ? ICONS[platform] ?? '✅' : '❌'}
        </div>

        <h1 className="text-xl font-semibold capitalize mb-2">
          {status === 'processing' ? `Connecting ${platform}…` :
           status === 'success' ? `${platform} Connected!` :
           'Connection Failed'}
        </h1>

        <p className="text-gray-400 text-sm mb-6">{message ||
          (status === 'processing' ? 'Exchanging authorization tokens…' : '')
        }</p>

        {status === 'success' && (
          <p className="text-xs text-gray-500">Redirecting to platforms page…</p>
        )}

        {status === 'error' && (
          <button
            onClick={() => router.push('/dashboard/platforms')}
            className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg text-sm font-medium transition"
          >
            Back to Platforms
          </button>
        )}
      </div>
    </div>
  );
}
