import net from 'net';
import { prisma } from '@multistream/db';
import { io } from '../index.js';

/**
 * Chat Aggregator
 * Connects to platform chat APIs and fans all messages into a unified Socket.IO stream.
 * Supports: YouTube (polling), Twitch (IRC), Facebook (webhook — handled separately).
 */

interface ChatMessage {
  streamId: string;
  platform: string;
  username: string;
  message: string;
  platformMsgId?: string;
}

// Active polling/connection handles per stream
const activeYouTubePollers = new Map<string, ReturnType<typeof setInterval>>();
const activeTwitchConnections = new Map<string, net.Socket>();

async function broadcastAndStore(msg: ChatMessage) {
  io.to(`stream:${msg.streamId}`).emit('chat-message', {
    platform: msg.platform,
    username: msg.username,
    message: msg.message,
    timestamp: new Date().toISOString(),
  });

  // Persist to DB (fire-and-forget — don't block the broadcast)
  prisma.chatMessage.create({
    data: {
      streamId: msg.streamId,
      platform: msg.platform,
      username: msg.username,
      message: msg.message,
    },
  }).catch((err: Error) => console.error('Failed to save chat message:', err.message));
}

// --- YouTube ---

export async function startYouTubeChat(streamId: string, liveChatId: string, accessToken: string) {
  if (activeYouTubePollers.has(streamId)) return;

  let pageToken: string | undefined;

  const poll = async () => {
    try {
      const params = new URLSearchParams({
        liveChatId,
        part: 'snippet,authorDetails',
        maxResults: '200',
        ...(pageToken ? { pageToken } : {}),
      });

      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/liveChat/messages?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) {
        console.error('YouTube chat poll error:', res.status);
        return;
      }

      const data: any = await res.json();
      pageToken = data.nextPageToken;

      for (const item of data.items ?? []) {
        await broadcastAndStore({
          streamId,
          platform: 'youtube',
          username: item.authorDetails?.displayName ?? 'Unknown',
          message: item.snippet?.displayMessage ?? '',
          platformMsgId: item.id,
        });
      }
    } catch (err: any) {
      console.error('YouTube chat error:', err.message);
    }
  };

  // Poll every 2 seconds (YouTube's minimum recommended interval)
  const interval = setInterval(poll, 2000);
  activeYouTubePollers.set(streamId, interval);
  console.log(`YouTube chat started for stream ${streamId}`);
}

export function stopYouTubeChat(streamId: string) {
  const interval = activeYouTubePollers.get(streamId);
  if (interval) {
    clearInterval(interval);
    activeYouTubePollers.delete(streamId);
    console.log(`YouTube chat stopped for stream ${streamId}`);
  }
}

// --- Twitch IRC ---

export function startTwitchChat(streamId: string, channelName: string, accessToken: string) {
  if (activeTwitchConnections.has(streamId)) return;

  const socket = new net.Socket();
  const channel = channelName.toLowerCase().replace('#', '');

  socket.connect(6667, 'irc.chat.twitch.tv', () => {
    socket.write(`PASS oauth:${accessToken}\r\n`);
    socket.write(`NICK ${channel}\r\n`);
    socket.write(`JOIN #${channel}\r\n`);
    socket.write('CAP REQ :twitch.tv/tags\r\n'); // Request display-name metadata
    console.log(`Twitch chat connected for stream ${streamId} (channel: ${channel})`);
  });

  let buffer = '';
  socket.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\r\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      // Respond to PINGs to keep connection alive
      if (line.startsWith('PING')) {
        socket.write('PONG :tmi.twitch.tv\r\n');
        continue;
      }

      // Parse PRIVMSG (chat message)
      const match = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
      if (match) {
        const username = match[1];
        const message = match[2];
        broadcastAndStore({ streamId, platform: 'twitch', username, message });
      }

      // Also parse display-name from tags if present
      const taggedMatch = line.match(/^@[^ ]*display-name=([^;]+)[^ ]* :(\w+)!\S+ PRIVMSG #\w+ :(.+)$/);
      if (taggedMatch) {
        const username = taggedMatch[1] || taggedMatch[2];
        const message = taggedMatch[3];
        broadcastAndStore({ streamId, platform: 'twitch', username, message });
      }
    }
  });

  socket.on('error', (err) => console.error(`Twitch IRC error for ${streamId}:`, err.message));
  socket.on('close', () => {
    activeTwitchConnections.delete(streamId);
    console.log(`Twitch chat disconnected for stream ${streamId}`);
  });

  activeTwitchConnections.set(streamId, socket);
}

export function stopTwitchChat(streamId: string) {
  const socket = activeTwitchConnections.get(streamId);
  if (socket) {
    socket.destroy();
    activeTwitchConnections.delete(streamId);
  }
}

// --- Facebook (webhook-based) ---
// Facebook sends POST requests to /api/webhooks/facebook when chat messages arrive.
// The webhook handler calls this function.
export async function handleFacebookChatMessage(
  streamId: string,
  username: string,
  message: string
) {
  await broadcastAndStore({ streamId, platform: 'facebook', username, message });
}

// --- Lifecycle: start/stop all chat for a stream ---

export async function startChatAggregation(streamId: string) {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    include: {
      user: { include: { platforms: true } },
      destination: true,
    },
  });
  if (!stream) return;

  for (const platform of stream.user.platforms) {
    if (!platform.accessToken) continue;

    // Check token expiry
    if (platform.expiresAt && platform.expiresAt < new Date()) {
      console.warn(`Platform ${platform.type} token expired for user ${stream.userId}`);
      continue;
    }

    switch (platform.type) {
      case 'youtube':
        // We need the liveChatId — fetch it from the YouTube live broadcast
        fetchYouTubeLiveChatId(platform.accessToken)
          .then(liveChatId => {
            if (liveChatId) startYouTubeChat(streamId, liveChatId, platform.accessToken);
          })
          .catch(err => console.error('Could not get YouTube live chat ID:', err.message));
        break;

      case 'twitch':
        if (platform.channelName) {
          startTwitchChat(streamId, platform.channelName, platform.accessToken);
        }
        break;
    }
  }
}

export function stopChatAggregation(streamId: string) {
  stopYouTubeChat(streamId);
  stopTwitchChat(streamId);
}

async function fetchYouTubeLiveChatId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&broadcastStatus=active',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data: any = await res.json();
  return data.items?.[0]?.snippet?.liveChatId ?? null;
}
