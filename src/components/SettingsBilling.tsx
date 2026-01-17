import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface Tier {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  limits: {
    maxClients: number;
    maxNotesPerMonth: number;
    features: string[];
  };
}

interface Subscription {
  status: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
}

interface Usage {
  period: string;
  usage: {
    notes: { used: number; limit: number; percent: number };
    clients: { used: number; limit: number; percent: number };
    aiRequests: number;
    searchQueries: number;
  };
}

export default function SettingsBilling() {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState('free');
  const [planPeriod, setPlanPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [tier, setTier] = useState<Tier | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [upgrading, setUpgrading] = useState(false);
  const [managingBilling, setManagingBilling] = useState(false);

  useEffect(() => {
    Promise.all([fetchSubscription(), fetchUsage(), fetchPricing()]).finally(() => {
      setLoading(false);
    });
  }, []);

  async function fetchSubscription() {
    try {
      const res = await apiFetch('/api/billing/subscription');
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
        setPlanPeriod(data.planPeriod || 'monthly');
        setTier(data.tier);
        setSubscription(data.subscription);
      }
    } catch (err) {
      console.error('Failed to load subscription:', err);
    }
  }

  async function fetchUsage() {
    try {
      const res = await apiFetch('/api/billing/usage');
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch (err) {
      console.error('Failed to load usage:', err);
    }
  }

  async function fetchPricing() {
    try {
      const res = await apiFetch('/api/billing/pricing');
      if (res.ok) {
        const data = await res.json();
        setTiers(data.tiers);
      }
    } catch (err) {
      console.error('Failed to load pricing:', err);
    }
  }

  async function handleUpgrade(priceId: string) {
    setUpgrading(true);
    try {
      const res = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ priceId })
      });

      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to start checkout:', err);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setUpgrading(false);
    }
  }

  async function handleManageBilling() {
    setManagingBilling(true);
    try {
      const res = await apiFetch('/api/billing/portal', {
        method: 'POST'
      });

      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to open billing portal:', err);
      alert('Failed to open billing portal. Please try again.');
    } finally {
      setManagingBilling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Current Plan */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Current Plan</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-2xl font-bold text-gray-900 capitalize">{plan}</span>
              {plan !== 'free' && (
                <span className="badge-indigo capitalize">{planPeriod}</span>
              )}
            </div>
            {subscription && (
              <p className="text-sm text-gray-500 mt-1">
                {subscription.cancelAtPeriodEnd
                  ? `Cancels on ${new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString()}`
                  : `Renews on ${new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString()}`
                }
              </p>
            )}
          </div>
          {plan !== 'free' && (
            <button
              onClick={handleManageBilling}
              disabled={managingBilling}
              className="btn-secondary"
            >
              {managingBilling ? <span className="spinner-sm" /> : 'Manage Billing'}
            </button>
          )}
        </div>
      </div>

      {/* Usage */}
      {usage && (
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">This Month's Usage</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Clients */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Clients</span>
                <span className="text-gray-900">
                  {usage.usage.clients.used} / {usage.usage.clients.limit === -1 ? '∞' : usage.usage.clients.limit}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage.usage.clients.percent > 90 ? 'bg-red-500' :
                    usage.usage.clients.percent > 75 ? 'bg-yellow-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, usage.usage.clients.percent)}%` }}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Notes</span>
                <span className="text-gray-900">
                  {usage.usage.notes.used} / {usage.usage.notes.limit === -1 ? '∞' : usage.usage.notes.limit}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage.usage.notes.percent > 90 ? 'bg-red-500' :
                    usage.usage.notes.percent > 75 ? 'bg-yellow-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, usage.usage.notes.percent)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Options */}
      {plan === 'free' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-gray-900">Upgrade Your Plan</h2>
            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  billingPeriod === 'monthly' ? 'bg-white shadow-sm' : 'text-gray-600'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  billingPeriod === 'yearly' ? 'bg-white shadow-sm' : 'text-gray-600'
                }`}
              >
                Yearly
                <span className="ml-1 text-xs text-green-600">Save 31%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tiers.filter(t => t.id !== 'free').map(tier => {
              const price = billingPeriod === 'yearly' ? tier.priceYearly : tier.priceMonthly;
              const priceId = billingPeriod === 'yearly'
                ? tier.stripePriceIdYearly
                : tier.stripePriceIdMonthly;

              return (
                <div
                  key={tier.id}
                  className={`p-6 rounded-xl border-2 ${
                    tier.id === 'pro' ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
                    {tier.id === 'pro' && <span className="badge-indigo">Popular</span>}
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mb-4">
                    ${billingPeriod === 'yearly' ? Math.round(price / 12) : price}
                    <span className="text-base font-normal text-gray-500">/mo</span>
                  </p>
                  <ul className="space-y-2 mb-6">
                    <li className="flex items-center gap-2 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Up to {tier.limits.maxClients} clients
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {tier.limits.maxNotesPerMonth === -1 ? 'Unlimited' : tier.limits.maxNotesPerMonth} notes/month
                    </li>
                    {tier.limits.features.map(feature => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => priceId && handleUpgrade(priceId)}
                    disabled={upgrading || !priceId}
                    className={`w-full ${tier.id === 'pro' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {upgrading ? <span className="spinner-sm" /> : `Upgrade to ${tier.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
