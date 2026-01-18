// ═══════════════════════════════════════════════════════════
// CORE ENTITY TYPES
// ═══════════════════════════════════════════════════════════

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  timezone: string;
  plan: 'free' | 'pro' | 'team';
  plan_period: 'monthly' | 'yearly';
  plan_expires_at: string | null;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  clients_count: number;
  notes_count: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface Client {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  tags: string[];
  status: 'active' | 'paused' | 'archived';

  // AI-enriched fields
  ai_summary: string | null;
  ai_communication_prefs: string | null;
  ai_personal_details: string[];
  ai_working_style: string | null;

  // Health tracking
  health_score: number;
  health_status: HealthStatus;
  health_signals: Signal[];
  health_trend: 'improving' | 'stable' | 'declining';
  health_updated_at: string | null;

  // Activity tracking
  last_contact_at: string | null;
  next_followup_at: string | null;
  total_meetings: number;
  client_since: string | null;

  // Digest settings
  digest_enabled: boolean;

  // Metadata
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Note {
  id: string;
  user_id: string;
  client_id: string;
  note_type: 'meeting' | 'quick' | 'email' | 'call';
  title: string | null;
  meeting_date: string | null;
  meeting_type: 'video_call' | 'phone' | 'in_person' | 'async' | null;
  duration_minutes: number | null;
  attendees: string[];

  // User-entered content
  summary: string | null;
  discussed: string | null;
  decisions: string | null;
  action_items_raw: string | null;
  concerns: string | null;
  personal_notes: string | null;
  next_steps: string | null;
  mood: 'positive' | 'neutral' | 'negative';

  // AI-processed content
  ai_status: 'pending' | 'processing' | 'completed' | 'failed';
  ai_error: string | null;
  ai_summary: string | null;
  ai_risk_signals: string[];
  ai_personal_details: string[]; // Deprecated - kept for backward compatibility
  ai_sentiment_score: number | null;
  ai_topics: string[];
  ai_key_insights: string[];
  ai_relationship_signals: string[];
  ai_follow_up_recommendations: string[];
  ai_communication_style: string | null;
  embedding_id: string | null;

  // Metadata
  created_at: string;
  updated_at: string;
}

export interface ActionItem {
  id: string;
  user_id: string;
  client_id: string;
  note_id: string | null;
  description: string;
  owner: 'me' | 'client';
  status: 'open' | 'completed' | 'cancelled';
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Briefing {
  id: string;
  user_id: string;
  client_id: string;
  meeting_date: string | null;
  content: string;
  relationship_summary: string | null;
  open_actions_mine: ActionItem[];
  open_actions_theirs: ActionItem[];
  topics_to_discuss: string[];
  personal_touches: string[];
  suggested_opener: string | null;
  generated_at: string;
  viewed_at: string | null;
  sent_via_email: boolean;
}

// ═══════════════════════════════════════════════════════════
// HEALTH SCORING TYPES
// ═══════════════════════════════════════════════════════════

export type HealthStatus = 'healthy' | 'watch' | 'attention';

export type SignalType =
  | 'contact_gap'
  | 'overdue_commitment'
  | 'client_overdue'
  | 'negative_sentiment'
  | 'budget_mention'
  | 'scope_concerns'
  | 'competitor_mention'
  | 'delayed_response'
  | 'positive_signal';

export interface Signal {
  type: SignalType;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  evidence?: string;
}

export interface HealthScore {
  score: number;
  status: HealthStatus;
  signals: Signal[];
  suggested_action: string;
  trend: 'improving' | 'stable' | 'declining';
}

// ═══════════════════════════════════════════════════════════
// API REQUEST/RESPONSE TYPES
// ═══════════════════════════════════════════════════════════

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  details?: { path: string; message: string }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    cursor?: string;
    hasMore: boolean;
  };
}

// Radar Dashboard
export interface OverdueAction {
  id: string;
  description: string;
  client_id: string;
  client_name: string;
  due_date: string;
  days_overdue: number;
}

export interface RadarData {
  attention: ClientWithStats[];
  watch: ClientWithStats[];
  healthy: ClientWithStats[];
  overdueActions: OverdueAction[];
  stats: {
    totalClients: number;
    needsAttention: number;
    overdueActions: number;
  };
}

export interface ClientWithStats extends Client {
  open_commitments: number;
  overdue_count: number;
}

// ═══════════════════════════════════════════════════════════
// INPUT TYPES (for creating/updating)
// ═══════════════════════════════════════════════════════════

export interface CreateClientInput {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  role?: string;
  tags?: string[];
}

export interface UpdateClientInput extends Partial<CreateClientInput> {
  status?: 'active' | 'paused' | 'archived';
  next_followup_at?: string | null;
}

export interface CreateNoteInput {
  clientId: string;
  noteType?: 'meeting' | 'quick' | 'email' | 'call';
  title?: string;
  meetingDate?: string;
  meetingType?: 'video_call' | 'phone' | 'in_person' | 'async';
  durationMinutes?: number;
  attendees?: string[];
  summary?: string;
  discussed?: string;
  decisions?: string;
  actionItemsRaw?: string;
  concerns?: string;
  personalNotes?: string;
  nextSteps?: string;
  mood?: 'positive' | 'neutral' | 'negative';
}

export interface CreateActionInput {
  clientId: string;
  noteId?: string;
  description: string;
  owner?: 'me' | 'client';
  dueDate?: string;
}

// ═══════════════════════════════════════════════════════════
// AI PROCESSING TYPES
// ═══════════════════════════════════════════════════════════

export interface AIAnalysis {
  title: string;
  summary: string;
  action_items: {
    description: string;
    owner: 'me' | 'client';
    due_hint: 'today' | 'this week' | 'next week' | 'no specific date';
  }[];
  risk_signals: string[];
  personal_details: string[]; // Deprecated - kept for backward compatibility
  sentiment_score: number;
  topics: string[];
  key_insights: string[];
  relationship_signals: string[];
  follow_up_recommendations: string[];
  communication_style: string | null;
}

export interface AIProcessingMessage {
  type: 'PROCESS_NOTE';
  noteId: string;
  userId: string;
  attempt: number;
  provider: 'cloudflare' | 'gemini';
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════
// BILLING TYPES
// ═══════════════════════════════════════════════════════════

export interface PricingTier {
  id: 'free' | 'pro' | 'team';
  name: string;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  limits: TierLimits;
  features: string[];
}

export interface TierLimits {
  maxClients: number;
  maxNotesPerMonth: number;
  aiProcessingEnabled: boolean;
  semanticSearchEnabled: boolean;
  dailyDigestEnabled: boolean;
  briefingsEnabled: boolean;
  exportEnabled: boolean;
}

export interface SubscriptionStatus {
  plan: string;
  tier: PricingTier;
  subscription: {
    status: string;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
  } | null;
}

// ═══════════════════════════════════════════════════════════
// AUTH TYPES
// ═══════════════════════════════════════════════════════════

export interface AuthToken {
  id: string;
  user_id: string;
  token: string;
  type: 'magic_link' | 'session';
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface MagicLinkRequest {
  email: string;
}

export interface MagicLinkResponse {
  message: string;
}

export interface VerifyResponse {
  user: User;
  redirectTo: string;
}

// ═══════════════════════════════════════════════════════════
// OAUTH TYPES
// ═══════════════════════════════════════════════════════════

export type OAuthProvider = 'google' | 'github';

export interface OAuthAccount {
  id: string;
  user_id: string;
  provider: OAuthProvider;
  provider_user_id: string;
  provider_email: string | null;
  provider_name: string | null;
  provider_avatar_url: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OAuthState {
  id: string;
  state: string;
  provider: OAuthProvider;
  redirect_uri: string | null;
  expires_at: string;
  created_at: string;
}
