# ClientPulse

AI-powered client relationship health monitor for freelancers and consultants.

## Overview

ClientPulse helps you maintain healthy client relationships by:
- 📝 Capturing meeting notes and extracting actionable insights with AI
- 📊 Tracking relationship health scores based on communication patterns
- ✅ Managing action items and commitments for you and your clients
- 🔔 Sending daily digests highlighting clients needing attention
- 📈 Providing analytics on your client portfolio health

## Tech Stack

- **Frontend**: Astro 5 + React 18 + Tailwind CSS
- **Backend**: Cloudflare Workers + Hono
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV (rate limiting)
- **Queue**: Cloudflare Queues (async AI processing)
- **AI**: Cloudflare Workers AI + Gemini fallback
- **Payments**: Stripe

## Quick Start

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- Cloudflare account
- Stripe account (for billing)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/clientpulse.git
cd clientpulse

# Install dependencies
npm install
cd worker && npm install && cd ..

# Login to Cloudflare
wrangler login

# Run setup (creates D1, KV, Queue)
chmod +x scripts/*.sh
npm run setup

# Set secrets
cd worker
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put GEMINI_API_KEY
wrangler secret put SESSION_SECRET
cd ..

# Deploy
npm run deploy
```

### Local Development

```bash
# Start both frontend and worker
npm run dev:all

# Frontend: http://localhost:4321
# Worker: http://localhost:8787
```

Or run separately:

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Worker
npm run worker:dev
```

## Project Structure

```
clientpulse/
├── src/                    # Frontend (Astro)
│   ├── components/         # React components
│   ├── layouts/            # Page layouts
│   ├── pages/              # Routes
│   └── styles/             # Global styles
├── worker/                 # Backend (Cloudflare Worker)
│   ├── src/
│   │   ├── api/            # API routes
│   │   ├── db/             # Database schema & queries
│   │   ├── lib/            # Utilities
│   │   └── index.ts        # Entry point
│   └── wrangler.toml       # Worker config
├── shared/                 # Shared types and utilities
├── scripts/                # Deployment scripts
└── docs/                   # Documentation
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend dev server |
| `npm run dev:all` | Start frontend + worker |
| `npm run build` | Build frontend |
| `npm run setup` | Create Cloudflare resources |
| `npm run deploy` | Deploy everything |
| `npm run deploy:worker` | Deploy worker only |
| `npm run deploy:frontend` | Deploy frontend only |
| `npm run migrate` | Run local DB migrations |
| `npm run migrate:prod` | Run production DB migrations |
| `npm run worker:logs` | View worker logs |

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Stripe (required for billing)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AI fallback (when Cloudflare AI fails)
GEMINI_API_KEY=your-key

# Session encryption
SESSION_SECRET=generate-with-openssl-rand-hex-32
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed setup instructions.

## Features

### Health Score Algorithm

ClientPulse calculates relationship health based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Contact Frequency | 30% | Time since last interaction |
| Commitments | 25% | Overdue action items |
| Sentiment | 25% | Mood trends from meetings |
| Risk Signals | 20% | Concerns mentioned in notes |

### AI Processing

Meeting notes are analyzed by AI to extract:
- Action items (with owner assignment)
- Key decisions
- Client concerns
- Follow-up recommendations
- Relationship health indicators

### Plans & Pricing

| Plan | Clients | Notes/Month | AI Insights |
|------|---------|-------------|-------------|
| Free | 3 | 10 | Basic |
| Pro ($12/mo) | 25 | 100 | Advanced |
| Team ($29/mo) | Unlimited | Unlimited | Advanced + API |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

### Clients
- `GET /api/clients` - List clients
- `POST /api/clients` - Create client
- `GET /api/clients/:id` - Get client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client
- `GET /api/clients/:id/timeline` - Client activity

### Notes
- `GET /api/notes` - List notes
- `POST /api/notes` - Create note (triggers AI)
- `GET /api/notes/:id` - Get note
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note

### Actions
- `GET /api/actions` - List action items
- `PUT /api/actions/:id` - Update action
- `DELETE /api/actions/:id` - Delete action

### Billing
- `POST /api/billing/checkout` - Create Stripe checkout
- `POST /api/billing/portal` - Access billing portal
- `POST /api/webhooks/stripe` - Stripe webhooks

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Pages      │    │   Workers    │    │   D1         │  │
│  │   (Frontend) │───▶│   (API)      │───▶│   (SQLite)   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                             │                    ▲          │
│                             ▼                    │          │
│  ┌──────────────┐    ┌──────────────┐           │          │
│  │   KV         │    │   Queues     │───────────┘          │
│  │   (Cache)    │    │   (Async AI) │                      │
│  └──────────────┘    └──────────────┘                      │
│                             │                               │
│                             ▼                               │
│  ┌──────────────┐    ┌──────────────┐                      │
│  │ Workers AI   │◀──▶│   Gemini     │                      │
│  │ (Primary)    │    │   (Fallback) │                      │
│  └──────────────┘    └──────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.
