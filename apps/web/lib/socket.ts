import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket || !sharedSocket.connected) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    sharedSocket = io(API_URL, {
      autoConnect: true,
      reconnection: true,
      auth: { token },
    });
  }
  return sharedSocket;
}

export function getStudioSocket(): Socket {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return io(API_URL, { auth: { token }, transports: ['websocket'] });
}

export function useStreamSocket(
  streamId: string,
  handlers: {
    onStatus?: (data: { status: string; startedAt?: string; endedAt?: string }) => void;
    onDestinationStatus?: (data: { destinationId: string; platform: string; status: string; error?: string }) => void;
    onChatMessage?: (data: { platform: string; username: string; message: string; timestamp: string }) => void;
    onChatHistory?: (messages: any[]) => void;
  }
) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.emit('join-stream', streamId);

    if (handlers.onStatus) socket.on('stream-status', handlers.onStatus);
    if (handlers.onDestinationStatus) socket.on('destination-status', handlers.onDestinationStatus);
    if (handlers.onChatMessage) socket.on('chat-message', handlers.onChatMessage);
    if (handlers.onChatHistory) socket.on('chat-history', handlers.onChatHistory);

    return () => {
      socket.emit('leave-stream', streamId);
      socket.off('stream-status');
      socket.off('destination-status');
      socket.off('chat-message');
      socket.off('chat-history');
    };
  }, [streamId]);

  const sendMessage = useCallback((message: string, username?: string) => {
    socketRef.current?.emit('chat-message', { streamId, message, username });
  }, [streamId]);

  return { sendMessage };
}
