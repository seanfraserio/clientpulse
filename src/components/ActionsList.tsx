import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface ActionItem {
  id: string;
  client_id: string;
  client_name: string;
  description: string;
  owner: 'me' | 'client';
  status: 'open' | 'completed' | 'cancelled';
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

export default function ActionsList() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'overdue' | 'completed'>('open');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'me' | 'client'>('all');

  useEffect(() => {
    fetchActions();
  }, []);

  async function fetchActions() {
    try {
      const res = await apiFetch('/api/actions');
      if (!res.ok) throw new Error('Failed to load actions');
      const json = await res.json();
      setActions(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function toggleComplete(action: ActionItem) {
    const newStatus = action.status === 'completed' ? 'open' : 'completed';

    setActions(prev => prev.map(a =>
      a.id === action.id ? { ...a, status: newStatus } : a
    ));

    try {
      const res = await apiFetch(`/api/actions/${action.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) throw new Error('Failed to update');
      const json = await res.json();
      setActions(prev => prev.map(a => a.id === action.id ? json.data : a));
    } catch {
      setActions(prev => prev.map(a =>
        a.id === action.id ? { ...a, status: action.status } : a
      ));
    }
  }

  function isOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  }

  const filteredActions = actions.filter(a => {
    // Status filter
    if (filter === 'open' && a.status !== 'open') return false;
    if (filter === 'completed' && a.status !== 'completed') return false;
    if (filter === 'overdue' && (a.status !== 'open' || !isOverdue(a.due_date))) return false;

    // Owner filter
    if (ownerFilter !== 'all' && a.owner !== ownerFilter) return false;

    return true;
  });

  // Group by client
  const byClient = filteredActions.reduce((acc, action) => {
    if (!acc[action.client_id]) {
      acc[action.client_id] = { name: action.client_name, actions: [] };
    }
    acc[action.client_id].actions.push(action);
    return acc;
  }, {} as Record<string, { name: string; actions: ActionItem[] }>);

  const stats = {
    total: actions.filter(a => a.status === 'open').length,
    overdue: actions.filter(a => a.status === 'open' && isOverdue(a.due_date)).length,
    mine: actions.filter(a => a.status === 'open' && a.owner === 'me').length,
    theirs: actions.filter(a => a.status === 'open' && a.owner === 'client').length
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner-lg mx-auto mb-4" />
          <p className="text-gray-500">Loading actions...</p>
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load actions</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={fetchActions} className="btn-primary">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Action Items</h1>
        <p className="text-gray-500 mt-1">Track commitments across all clients</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Open</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-red-600">{stats.overdue}</p>
          <p className="text-sm text-gray-500">Overdue</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-indigo-600">{stats.mine}</p>
          <p className="text-sm text-gray-500">My Actions</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-gray-600">{stats.theirs}</p>
          <p className="text-sm text-gray-500">Client Actions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex gap-2">
            {[
              { id: 'open', label: 'Open' },
              { id: 'overdue', label: 'Overdue' },
              { id: 'completed', label: 'Completed' },
              { id: 'all', label: 'All' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as typeof filter)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f.id
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="border-l border-gray-200 pl-4 flex gap-2">
            {[
              { id: 'all', label: 'Everyone' },
              { id: 'me', label: 'My Actions' },
              { id: 'client', label: 'Client Actions' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setOwnerFilter(f.id as typeof ownerFilter)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  ownerFilter === f.id
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions by Client */}
      {Object.keys(byClient).length === 0 ? (
        <div className="card p-12 text-center">
          {actions.length === 0 ? (
            <>
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">All caught up!</h2>
              <p className="text-gray-600">No action items to track</p>
            </>
          ) : (
            <p className="text-gray-500">No actions match your filters</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byClient).map(([clientId, { name, actions: clientActions }]) => (
            <div key={clientId} className="card overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <a
                  href={`/clients/${clientId}`}
                  className="font-semibold text-gray-900 hover:text-indigo-600"
                >
                  {name}
                </a>
                <span className="text-sm text-gray-500 ml-2">
                  ({clientActions.length} item{clientActions.length > 1 ? 's' : ''})
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {clientActions.map(action => (
                  <div
                    key={action.id}
                    className={`p-4 flex items-start gap-3 ${
                      action.status === 'completed' ? 'opacity-60' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleComplete(action)}
                      className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        action.status === 'completed'
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 hover:border-indigo-500'
                      }`}
                    >
                      {action.status === 'completed' && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-gray-900 ${action.status === 'completed' ? 'line-through' : ''}`}>
                        {action.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={`badge ${action.owner === 'me' ? 'badge-indigo' : 'badge-gray'}`}>
                          {action.owner === 'me' ? 'You' : 'Client'}
                        </span>
                        {action.due_date && action.status === 'open' && (
                          <span className={`text-xs ${
                            isOverdue(action.due_date) ? 'text-red-600 font-medium' : 'text-gray-500'
                          }`}>
                            {isOverdue(action.due_date)
                              ? `${Math.floor((Date.now() - new Date(action.due_date).getTime()) / (1000*60*60*24))}d overdue`
                              : `Due ${new Date(action.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            }
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
