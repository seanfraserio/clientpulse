# ADR-001: Asynchronous AI Processing with Gemini Fallback

## Status
**Accepted** - January 17, 2026

## Context
AI processing of meeting notes is critical for the Relationship Radar feature but introduces reliability concerns:
1. Cloudflare Workers AI can timeout or return malformed responses
2. Synchronous processing blocks user experience (1-3s delays)
3. AI failures should not prevent note saving

Additionally, we need a fallback when the primary AI provider fails.

## Decision

### Primary Architecture
Process AI asynchronously using Cloudflare Queues:

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI PROCESSING PIPELINE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Creates Note                                              │
│        │                                                        │
│        ▼                                                        │
│  ┌─────────────┐                                                │
│  │ Save Note   │◄─── Immediate response to user                 │
│  │ ai_status:  │     (< 100ms)                                  │
│  │ 'pending'   │                                                │
│  └──────┬──────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │   Queue     │◄─── Non-blocking, background                   │
│  │   Message   │                                                │
│  └──────┬──────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              AI Processing Worker                        │   │
│  │  ┌─────────────────────────────────────────────────────┐│   │
│  │  │ Attempt 1: Cloudflare Workers AI                    ││   │
│  │  │            @cf/meta/llama-3.1-8b-instruct           ││   │
│  │  └────────────────────┬────────────────────────────────┘│   │
│  │                       │                                  │   │
│  │            ┌──────────┴──────────┐                       │   │
│  │            │                     │                       │   │
│  │         Success              Failure                     │   │
│  │            │                     │                       │   │
│  │            ▼                     ▼                       │   │
│  │     Update Note           Retry (up to 3x)               │   │
│  │     ai_status:            with backoff                   │   │
│  │     'completed'                  │                       │   │
│  │                                  │                       │   │
│  │                       ┌──────────┴──────────┐            │   │
│  │                       │                     │            │   │
│  │                    Success            All Failed         │   │
│  │                       │                     │            │   │
│  │                       ▼                     ▼            │   │
│  │                Update Note         ┌───────────────┐     │   │
│  │                                    │ FALLBACK:     │     │   │
│  │                                    │ Google Gemini │     │   │
│  │                                    │ API           │     │   │
│  │                                    └───────┬───────┘     │   │
│  │                                            │             │   │
│  │                                 ┌──────────┴──────────┐  │   │
│  │                                 │                     │  │   │
│  │                              Success              Failure│   │
│  │                                 │                     │  │   │
│  │                                 ▼                     ▼  │   │
│  │                          Update Note         Mark Failed │   │
│  │                          ai_status:          ai_status:  │   │
│  │                          'completed'         'failed'    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### AI Provider Configuration

```typescript
// worker/src/services/ai-config.ts

export interface AIProvider {
  name: string;
  priority: number;
  maxRetries: number;
  backoffMs: number[];
  process: (note: Note) => Promise<AIAnalysis>;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    name: 'cloudflare-workers-ai',
    priority: 1,
    maxRetries: 3,
    backoffMs: [1000, 5000, 15000], // 1s, 5s, 15s
    process: processWithWorkersAI
  },
  {
    name: 'google-gemini',
    priority: 2,
    maxRetries: 2,
    backoffMs: [2000, 10000],
    process: processWithGemini
  }
];
```

### Gemini Integration

```typescript
// worker/src/services/gemini.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

interface GeminiConfig {
  apiKey: string;
  model: string;
}

export class GeminiService {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(config: GeminiConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.model = config.model;
  }

  async analyzeNote(note: Note): Promise<AIAnalysis> {
    const genAI = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const prompt = buildNoteAnalysisPrompt(note);

    const result = await genAI.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse and validate with Zod
    const parsed = JSON.parse(text);
    return AIAnalysisSchema.parse(parsed);
  }
}

// Environment configuration
// wrangler.toml:
// [vars]
// GEMINI_MODEL = "gemini-1.5-flash"
//
// Secrets (via wrangler secret put):
// GEMINI_API_KEY
```

### Queue Message Schema

```typescript
interface AIProcessingMessage {
  type: 'PROCESS_NOTE';
  noteId: string;
  userId: string;
  attempt: number;
  provider: string;
  timestamp: number;
}
```

## Consequences

### Positive
- Users get instant feedback when saving notes
- System remains functional even if AI is degraded
- Gemini fallback provides redundancy
- Failed notes can be manually retried

### Negative
- Notes temporarily show "AI processing..." state
- Additional complexity with queue management
- Two AI provider costs (Gemini is pay-per-use)
- Need to handle eventual consistency in UI

### Cost Impact
- Cloudflare Workers AI: Free tier (10K neurons/day)
- Google Gemini Flash: ~$0.075 per 1M input tokens (fallback only)
- Estimated fallback usage: <5% of requests = negligible cost

## Implementation Notes

1. Add `GEMINI_API_KEY` to wrangler secrets
2. Install `@google/generative-ai` package
3. Create queue binding in wrangler.toml
4. Add `ai_status` column to notes table
5. Implement queue consumer in worker
