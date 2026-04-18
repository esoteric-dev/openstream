'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface ConnectedPlatform {
    id: string;
    type: string;
    channelName: string | null;
    channelId: string | null;
    pageId: string | null;
    pageName: string | null;
}

interface Props {
    streamId: string;
    streamTitle: string;
    existingPlatforms: string[]; // platform types already added as destinations
    onDestinationAdded: (destination: any) => void;
}

const PLATFORM_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    youtube: { label: 'YouTube', color: 'text-red-400', bg: 'bg-red-600', icon: '▶' },
    twitch: { label: 'Twitch', color: 'text-purple-400', bg: 'bg-purple-600', icon: '🎮' },
    facebook: { label: 'Facebook', color: 'text-blue-400', bg: 'bg-blue-600', icon: '📘' },
};

export default function ConnectedPlatformCards({ streamId, streamTitle, existingPlatforms, onDestinationAdded }: Props) {
    const [platforms, setPlatforms] = useState<ConnectedPlatform[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        apiFetch('/api/platforms')
            .then((data: ConnectedPlatform[]) => {
                // Filter to only platforms that support auto-broadcast creation
                setPlatforms(data.filter(p => ['youtube', 'twitch', 'facebook'].includes(p.type)));
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    async function handleAddPlatform(platform: ConnectedPlatform) {
        setCreating(platform.id);
        setError(null);
        try {
            const destination = await apiFetch(`/api/platforms/${platform.id}/create-broadcast`, {
                method: 'POST',
                body: JSON.stringify({ streamId, title: streamTitle }),
            });
            onDestinationAdded(destination);
        } catch (err: any) {
            setError(err.message || 'Failed to create broadcast');
        } finally {
            setCreating(null);
        }
    }

    if (loading) {
        return (
            <div className="text-sm text-gray-500 py-3 text-center">
                Loading connected platforms…
            </div>
        );
    }

    if (platforms.length === 0) {
        return (
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-400 mb-2">No platforms connected yet</p>
                <a
                    href="/dashboard/platforms"
                    className="text-sm text-purple-400 hover:text-purple-300 font-medium transition"
                >
                    Connect platforms →
                </a>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Quick Connect
            </h3>

            {error && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-sm text-red-300">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-2">
                {platforms.map(platform => {
                    const meta = PLATFORM_META[platform.type] ?? { label: platform.type, color: 'text-gray-400', bg: 'bg-slate-600', icon: '🔗' };
                    const isAlreadyAdded = existingPlatforms.includes(platform.type);
                    const isCreating = creating === platform.id;

                    return (
                        <div
                            key={platform.id}
                            className="flex items-center justify-between bg-slate-700/60 rounded-lg px-4 py-3 border border-slate-600/50"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center text-sm font-bold`}>
                                    {meta.icon}
                                </div>
                                <div>
                                    <p className={`text-sm font-medium ${meta.color}`}>{meta.label}</p>
                                    <p className="text-xs text-gray-500">
                                        {platform.pageName
                                            ? `${platform.channelName} · ${platform.pageName}`
                                            : platform.channelName ?? 'Connected'}
                                    </p>
                                </div>
                            </div>

                            {isAlreadyAdded ? (
                                <span className="text-xs text-green-400/70 font-medium px-2 py-1 rounded bg-green-900/20">
                                    Added
                                </span>
                            ) : (
                                <button
                                    onClick={() => handleAddPlatform(platform)}
                                    disabled={isCreating || !!creating}
                                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                                >
                                    {isCreating ? (
                                        <>
                                            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Creating…
                                        </>
                                    ) : (
                                        'Add to Stream'
                                    )}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
