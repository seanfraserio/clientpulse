import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface ActionItem {
  id: string;
  description: string;
  owner: 'me' | 'client';
  status: 'open' | 'completed' | 'cancelled';
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
}

export default function ClientActions({ clientId }: Props) {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'completed'>('open');
  const [showForm, setShowForm] = useState(false);
  const [newAction, setNewAction] = useState({ description: '', owner: 'me' as const, dueDate: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchActions();
  }, [clientId]);

  async function fetchActions() {
    try {
      const res = await apiFetch(`/api/actions?clientId=${clientId}`);
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

    // Optimistic update
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
      // Revert on error
      setActions(prev => prev.map(a =>
        a.id === action.id ? { ...a, status: action.status } : a
      ));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newAction.description.trim()) return;

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/actions', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          description: newAction.description.trim(),
          owner: newAction.owner,
          dueDate: newAction.dueDate || undefined
        })
      });

      if (!res.ok) throw new Error('Failed to create action');
      const json = await res.json();
      setActions(prev => [json.data, ...prev]);
      setNewAction({ description: '', owner: 'me', dueDate: '' });
      setShowForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create action');
    } finally {
      setSubmitting(false);
    }
  }

  const filteredActions = actions.filter(a => {
    if (filter === 'open') return a.status === 'open';
    if (filter === 'completed') return a.status === 'completed';
    return true;
  });

  const openCount = actions.filter(a => a.status === 'open').length;
  const completedCount = actions.filter(a => a.status === 'completed').length;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button onClick={fetchActions} className="btn-ghost mt-4">Try Again</button>
      </div>
    );
  }

  function isOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  }

  function formatDueDate(dueDate: string | null): string {
    if (!dueDate) return '';
    const date = new Date(dueDate);
    const today = new Date();
    const diff = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    if (diff < 7) return `Due in ${diff} days`;
    return `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {[
            { id: 'open', label: `Open (${openCount})` },
            { id: 'completed', label: `Done (${completedCount})` },
            { id: 'all', label: 'All' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as typeof filter)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === tab.id
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Action
        </button>
      </div>

      {/* Quick Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 mb-4 animate-fade-in">
          <div className="space-y-3">
            <input
              type="text"
              value={newAction.description}
              onChange={e => setNewAction(prev => ({ ...prev, description: e.target.value }))}
              placeholder="What needs to be done?"
              className="input"
              autoFocus
              disabled={submitting}
            />
            <div className="flex flex-wrap gap-3">
              <select
                value={newAction.owner}
                onChange={e => setNewAction(prev => ({ ...prev, owner: e.target.value as 'me' | 'client' }))}
                className="input w-auto"
                disabled={submitting}
              >
                <option value="me">My action</option>
                <option value="client">Client's action</option>
              </select>
              <input
                type="date"
                value={newAction.dueDate}
                onChange={e => setNewAction(prev => ({ ...prev, dueDate: e.target.value }))}
                className="input w-auto"
                disabled={submitting}
              />
              <div className="flex gap-2 ml-auto">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost btn-sm" disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary btn-sm" disabled={submitting || !newAction.description.trim()}>
                  {submitting ? <span className="spinner-sm" /> : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Actions List */}
      {filteredActions.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          {filter === 'open' ? 'No open action items' :
           filter === 'completed' ? 'No completed items' :
           'No action items yet'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredActions.map(action => (
            <div
              key={action.id}
              className={`card p-4 flex items-start gap-3 transition-opacity ${
                action.status === 'completed' ? 'opacity-60' : ''
              }`}
            >
              {/* Checkbox */}
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

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={`text-gray-900 ${action.status === 'completed' ? 'line-through' : ''}`}>
                  {action.description}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className={`badge ${action.owner === 'me' ? 'badge-indigo' : 'badge-gray'}`}>
                    {action.owner === 'me' ? 'You' : 'Client'}
                  </span>
                  {action.due_date && action.status === 'open' && (
                    <span className={`text-xs ${isOverdue(action.due_date) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {formatDueDate(action.due_date)}
                    </span>
                  )}
                  {action.completed_at && (
                    <span className="text-xs text-gray-400">
                      Completed {new Date(action.completed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
