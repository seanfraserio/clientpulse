import type { PricingTier } from './types';

export const PRICING_TIERS: Record<string, PricingTier> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    limits: {
      maxClients: 5,
      maxNotesPerMonth: 20,
      aiProcessingEnabled: true,
      semanticSearchEnabled: false,
      dailyDigestEnabled: false,
      briefingsEnabled: false,
      exportEnabled: false
    },
    features: [
      'Up to 5 clients',
      '20 notes per month',
      'Basic health scoring',
      'Action item tracking',
      'Relationship Radar dashboard'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 12,
    priceYearly: 99,  // ~2 months free
    stripePriceIdMonthly: 'price_1SqdCGIFGLyh2AD2A0mB1wbQ',
    stripePriceIdYearly: 'price_1SqdLuIFGLyh2AD2zXyJqdM3',
    limits: {
      maxClients: 50,
      maxNotesPerMonth: 500,
      aiProcessingEnabled: true,
      semanticSearchEnabled: true,
      dailyDigestEnabled: true,
      briefingsEnabled: true,
      exportEnabled: true
    },
    features: [
      'Up to 50 clients',
      'Unlimited notes',
      'AI-powered insights',
      'Semantic search',
      'Daily email digest',
      'Pre-meeting briefings',
      'Data export'
    ]
  },
  team: {
    id: 'team',
    name: 'Team',
    priceMonthly: 29,
    priceYearly: 249,
    stripePriceIdMonthly: 'price_1SqdD4IFGLyh2AD2XiVncKkf',
    stripePriceIdYearly: 'price_1SqdMnIFGLyh2AD2C8Bf6wJt',
    limits: {
      maxClients: 200,
      maxNotesPerMonth: 2000,
      aiProcessingEnabled: true,
      semanticSearchEnabled: true,
      dailyDigestEnabled: true,
      briefingsEnabled: true,
      exportEnabled: true
    },
    features: [
      'Up to 200 clients',
      'Everything in Pro',
      'Priority support',
      'API access (coming soon)',
      'Custom integrations (coming soon)'
    ]
  }
};

export function getTierByPlan(plan: string): PricingTier {
  return PRICING_TIERS[plan] || PRICING_TIERS.free;
}

export function canAddClient(currentCount: number, plan: string): boolean {
  const tier = getTierByPlan(plan);
  return currentCount < tier.limits.maxClients;
}

export function canAddNote(currentMonthCount: number, plan: string): boolean {
  const tier = getTierByPlan(plan);
  return currentMonthCount < tier.limits.maxNotesPerMonth;
}

export function hasFeature(plan: string, feature: keyof PricingTier['limits']): boolean {
  const tier = getTierByPlan(plan);
  return tier.limits[feature] as boolean;
}
