import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import ClientHealthCard from './ClientHealthCard';
import DashboardStats from './DashboardStats';

interface HealthSignal {
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
}

interface RadarClient {
  id: string;
  name: string;
  company: string | null;
  health_score: number;
  health_status: 'attention' | 'watch' | 'healthy';
  health_signals: HealthSignal[];
  last_contact_at: string | null;
  open_commitments: number;
  days_since_contact: number;
}

interface OverdueAction {
  id: string;
  description: string;
  client_id: string;
  client_name: string;
  due_date: string;
  days_overdue: number;
}

interface RadarStats {
  totalClients: number;
  needsAttention: number;
  overdueActions: number;
}

interface RadarData {
  attention: RadarClient[];
  watch: RadarClient[];
  healthy: RadarClient[];
  overdueActions: OverdueAction[];
  stats: RadarStats;
}

export default function Dashboard() {
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRadarData();
  }, []);

  async function fetchRadarData() {
    try {
      const res = await apiFetch('/api/radar');
      if (!res.ok) {
        throw new Error('Failed to load dashboard data');
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner-lg mx-auto mb-4" />
          <p className="text-gray-500">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load dashboard</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={fetchRadarData} className="btn-primary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasClients = data.stats.totalClients > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relationship Radar</h1>
          <p className="text-gray-500 mt-1">Your client relationships at a glance</p>
        </div>
        <a href="/clients/new" className="btn-primary">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </a>
      </div>

      {!hasClients ? (
        // Empty state
        <div className="card p-12 text-center">
          <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No clients yet</h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Start by adding your first client. You'll be able to track notes,
            commitments, and relationship health all in one place.
          </p>
          <a href="/clients/new" className="btn-primary btn-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Your First Client
          </a>
        </div>
      ) : (
        <>
          {/* Stats */}
          <DashboardStats stats={data.stats} />

          {/* Overdue Actions Alert */}
          {data.overdueActions.length > 0 && (
            <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-red-800">
                    {data.overdueActions.length} overdue commitment{data.overdueActions.length > 1 ? 's' : ''}
                  </h3>
                  <div className="mt-2 space-y-1">
                    {data.overdueActions.slice(0, 3).map(action => (
                      <p key={action.id} className="text-sm text-red-700">
                        <a href={`/clients/${action.client_id}`} className="font-medium hover:underline">
                          {action.client_name}
                        </a>
                        : {action.description}
                        <span className="text-red-500 ml-1">({action.days_overdue}d overdue)</span>
                      </p>
                    ))}
                    {data.overdueActions.length > 3 && (
                      <a href="/actions?filter=overdue" className="text-sm font-medium text-red-700 hover:text-red-800">
                        View all {data.overdueActions.length} overdue items →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Radar Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Needs Attention */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-attention rounded-full animate-pulse" />
                <h2 className="font-semibold text-gray-900">Needs Attention</h2>
                <span className="badge-attention ml-auto">{data.attention.length}</span>
              </div>
              {data.attention.length === 0 ? (
                <div className="card p-6 text-center text-gray-500">
                  <p>🎉 No clients need attention!</p>
                </div>
              ) : (
                data.attention.map(client => (
                  <ClientHealthCard key={client.id} client={client} />
                ))
              )}
            </div>

            {/* Watch List */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-watch rounded-full" />
                <h2 className="font-semibold text-gray-900">Watch List</h2>
                <span className="badge-watch ml-auto">{data.watch.length}</span>
              </div>
              {data.watch.length === 0 ? (
                <div className="card p-6 text-center text-gray-500">
                  <p>No clients on watch list</p>
                </div>
              ) : (
                data.watch.map(client => (
                  <ClientHealthCard key={client.id} client={client} />
                ))
              )}
            </div>

            {/* Healthy */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-healthy rounded-full" />
                <h2 className="font-semibold text-gray-900">Healthy</h2>
                <span className="badge-healthy ml-auto">{data.healthy.length}</span>
              </div>
              {data.healthy.length === 0 ? (
                <div className="card p-6 text-center text-gray-500">
                  <p>No healthy clients yet</p>
                </div>
              ) : (
                data.healthy.map(client => (
                  <ClientHealthCard key={client.id} client={client} />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
