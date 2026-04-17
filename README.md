# MultiStream - Professional Multistreaming SaaS Platform

A full-stack multistreaming platform similar to OneStream Live that allows users to broadcast live video to multiple platforms simultaneously (YouTube, Facebook, Twitch, LinkedIn, etc.).

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Next.js   │────▶│  Express    │────▶│  PostgreSQL │
│   Frontend  │◀────│    API      │◀────│   Prisma    │
│  (Port 3000)│     │ (Port 3001) │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────▼──────┐
                    │    Redis    │
                    │  (Cache/    │
                    │   Queue)    │
                    └─────────────┘
                           │
┌─────────────┐     ┌──────▼──────┐     ┌─────────────┐
│   SRS RTMP  │────▶│   FFmpeg    │────▶│ Destinations│
│   Server    │     │   Workers   │     │ YouTube,etc │
│ (Port 1935) │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Tech Stack

### Frontend
- **Next.js 14** (App Router) - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Socket.io Client** - Real-time updates
- **Recharts** - Analytics charts
- **Zustand** - State management

### Backend
- **Node.js + Express** - REST API
- **TypeScript** - Type safety
- **Prisma** - Database ORM
- **PostgreSQL** - Primary database
- **Redis** - Caching & real-time state
- **Socket.io** - WebSocket server
- **BullMQ** - Job queue for scheduled streams
- **FFmpeg** - Stream processing

### Media Infrastructure
- **SRS (Simple Realtime Server)** - RTMP ingestion
- **FFmpeg** - Multistream relay
- **LiveKit** - WebRTC browser studio
- **AWS S3** - Video storage

### Integrations
- **YouTube Live API** - Streaming & chat
- **Facebook Graph API** - Streaming & chat
- **Twitch Helix API** - Streaming & chat
- **Stripe** - Subscription billing
- **NextAuth.js** - Authentication

## Project Structure

```
multistream-saas/
├── apps/
│   ├── web/           # Next.js frontend
│   │   ├── app/       # App Router pages
│   │   ├── components/# Reusable components
│   │   └── lib/       # Utilities
│   └── api/           # Express backend
│       ├── src/
│       │   ├── routes/    # API endpoints
│       │   ├── services/  # Business logic
│       │   ├── workers/   # FFmpeg workers
│       │   └── middleware/# Auth, validation
│       └── Dockerfile
├── packages/
│   └── db/            # Shared Prisma schema
│       ├── prisma/
│       └── src/
├── docker/
│   └── srs.conf       # SRS configuration
├── docker-compose.yml
└── .env.example
```

## Getting Started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- FFmpeg (for local development)

### Local Development

1. **Clone and install dependencies**
```bash
cd multistream-saas
npm install
```

2. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Start infrastructure with Docker**
```bash
docker-compose up -d postgres redis srs
```

4. **Initialize database**
```bash
npm run db:push
npm run db:generate
```

5. **Start development servers**
```bash
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- SRS RTMP: rtmp://localhost:1935/live

### Production Deployment

```bash
docker-compose up -d --build
```

## Key Features

### 1. Multistreaming Engine
- Single RTMP input fans out to multiple destinations
- FFmpeg workers handle each destination independently
- Auto-reconnect on connection failures
- Real-time status monitoring via WebSocket

### 2. Platform Connections
- OAuth integration with major platforms
- Automatic token refresh
- Custom RTMP destinations supported

### 3. Browser Studio (WebRTC)
- Camera/microphone capture
- Screen sharing
- Multi-guest support (up to 8)
- Overlays and graphics
- Virtual backgrounds

### 4. Unified Chat
- Aggregated chat from all platforms
- Platform-specific icons
- Reply to messages
- Moderation tools

### 5. Scheduled Streams
- Pre-recorded video upload to S3
- BullMQ job scheduling
- Playlist support
- 24/7 loop mode

### 6. Hosted Pages
- Branded live pages
- Custom domain support
- HLS playback
- Embedded chat

### 7. Team Management
- Role-based access (Admin, Manager, Viewer)
- Audit logging
- Collaborative stream management

### 8. Analytics
- Viewer count tracking
- Stream duration
- Platform performance
- Engagement metrics

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login |
| GET | /api/streams | List streams |
| POST | /api/streams | Create stream |
| POST | /api/streams/:id/start | Start stream |
| POST | /api/streams/:id/stop | Stop stream |
| GET | /api/platforms | List platforms |
| POST | /api/platforms/oauth/:type | Connect platform |
| POST | /api/uploads/presigned-url | Get S3 upload URL |
| GET | /api/recordings | List recordings |
| POST | /api/billing/checkout | Create checkout |

## Environment Variables

See `.env.example` for all required variables.

## License

MIT License - See LICENSE file for details.
