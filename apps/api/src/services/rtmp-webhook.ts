import express from 'express';
import { prisma } from '@multistream/db';
import { setStreamStatus, setDestinationStatus } from './redis.js';
import { spawnFFmpegWorker } from '../workers/ffmpeg-worker.js';
import { io } from '../index.js';

/**
 * RTMP Webhook Handler for SRS (Simple Realtime Server)
 * SRS calls these endpoints when streams connect/disconnect
 * Reference: https://github.com/ossrs/srs/wiki/v4_EN_HTTPCallback
 */

interface SRSWebhookPayload {
  action: string; // on_connect, on_close, on_publish, on_unpublish, on_dvr
  client_id: string;
  ip: string;
  vhost: string;
  app: string;
  stream: string; // This is the RTMP key
  param: string;
}

export function setupRTMPWebhook(app: express.Application) {
  /**
   * Called when a publisher connects to RTMP server
   * Validates stream key and updates stream status
   */
  app.post('/api/webhooks/rtmp/on-publish', async (req, res) => {
    const payload: SRSWebhookPayload = req.body;
    console.log('RTMP on-publish:', payload);
    
    try {
      // Find stream by RTMP key
      const stream = await prisma.stream.findUnique({
        where: { rtmpKey: payload.stream },
        include: { destination: true }
      });
      
      if (!stream) {
        console.error('Stream not found for key:', payload.stream);
        res.json({ code: 1 }); // Reject connection
        return;
      }
      
      // Update stream status to live
      await prisma.stream.update({
        where: { id: stream.id },
        data: { status: 'live' }
      });
      
      // Set Redis status
      await setStreamStatus(stream.id, 'live', {
        startedAt: new Date().toISOString(),
        clientId: payload.client_id
      });
      
      // Spawn FFmpeg worker to multistream to all destinations
      if (stream.destination.length > 0) {
        await spawnFFmpegWorker(stream);
      }
      
      // Notify connected clients via WebSocket
      io.to(`stream:${stream.id}`).emit('stream-status', {
        status: 'live',
        startedAt: new Date().toISOString()
      });
      
      res.json({ code: 0 }); // Accept connection
    } catch (error) {
      console.error('Error in on-publish webhook:', error);
      res.json({ code: 1 });
    }
  });
  
  /**
   * Called when a publisher disconnects
   * Cleans up FFmpeg workers and updates status
   */
  app.post('/api/webhooks/rtmp/on-unpublish', async (req, res) => {
    const payload: SRSWebhookPayload = req.body;
    console.log('RTMP on-unpublish:', payload);
    
    try {
      const stream = await prisma.stream.findUnique({
        where: { rtmpKey: payload.stream }
      });
      
      if (stream) {
        // Update stream status
        await prisma.stream.update({
          where: { id: stream.id },
          data: { status: 'ended' }
        });
        
        // Update Redis
        await setStreamStatus(stream.id, 'ended', {
          endedAt: new Date().toISOString()
        });
        
        // Notify clients
        io.to(`stream:${stream.id}`).emit('stream-status', {
          status: 'ended',
          endedAt: new Date().toISOString()
        });
      }
      
      res.json({ code: 0 });
    } catch (error) {
      console.error('Error in on-unpublish webhook:', error);
      res.json({ code: 0 }); // Still return success to avoid SRS retries
    }
  });
  
  /**
   * Called when a client connects (for playback)
   */
  app.post('/api/webhooks/rtmp/on-connect', async (req, res) => {
    res.json({ code: 0 });
  });
  
  /**
   * Called when a client disconnects
   */
  app.post('/api/webhooks/rtmp/on-close', async (req, res) => {
    res.json({ code: 0 });
  });
  
  console.log('RTMP webhook handlers registered');
}
