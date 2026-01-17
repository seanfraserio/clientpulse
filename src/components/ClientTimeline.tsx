import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface TimelineEntry {
  id: string;
  type: 'note' | 'action_created' | 'action_completed' | 'health_change';
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface Props {
  clientId: string;
}

export default function ClientTimeline({ clientId }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTimeline();
  }, [clientId]);

  async function fetchTimeline() {
    try {
      const res = await apiFetch(`/api/clients/${clientId}/timeline`);
      if (!res.ok) throw new Error('Failed to load timeline');
      const json = await res.json();

      // Transform notes into timeline entries
      const notes = json.data.timeline || [];
      const timelineEntries: TimelineEntry[] = notes.map((note: Record<string, unknown>) => ({
        id: note.id as string,
        type: 'note' as const,
        title: (note.title as string) || `${note.note_type} note`,
        description: note.summary as string | null,
        metadata: {
          ai_summary: note.ai_summary,
          note_type: note.note_type,
          mood: note.mood
        },
        created_at: note.created_at as string
      }));

      setEntries(timelineEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

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
        <button onClick={fetchTimeline} className="btn-ghost mt-4">Try Again</button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="font-semibold text-gray-900 mb-2">No activity yet</h3>
        <p className="text-gray-500 mb-4">Start by adding a meeting note or action item</p>
        <a href={`/notes/new?clientId=${clientId}`} className="btn-primary">
          Add First Note
        </a>
      </div>
    );
  }

  const typeConfig = {
    note: {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      bg: 'bg-indigo-100',
      color: 'text-indigo-600'
    },
    action_created: {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      bg: 'bg-yellow-100',
      color: 'text-yellow-600'
    },
    action_completed: {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bg: 'bg-green-100',
      color: 'text-green-600'
    },
    health_change: {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      bg: 'bg-purple-100',
      color: 'text-purple-600'
    }
  };

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  return (
    <div className="space-y-4">
      {entries.map((entry, index) => {
        const config = typeConfig[entry.type];

        return (
          <div key={entry.id} className="relative flex gap-4">
            {/* Timeline line */}
            {index < entries.length - 1 && (
              <div className="absolute left-5 top-12 bottom-0 w-px bg-gray-200" />
            )}

            {/* Icon */}
            <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-full ${config.bg} ${config.color} flex items-center justify-center`}>
              {config.icon}
            </div>

            {/* Content */}
            <div className="flex-1 card p-4 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="font-medium text-gray-900">{entry.title}</h4>
                  {entry.description && (
                    <p className="text-gray-600 text-sm mt-1 line-clamp-2">{entry.description}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {formatDate(entry.created_at)}
                </span>
              </div>

              {/* Note-specific: show AI summary if available */}
              {entry.type === 'note' && entry.metadata.ai_summary && (
                <div className="mt-3 p-3 bg-indigo-50 rounded-lg">
                  <p className="text-sm text-indigo-700">
                    <span className="font-medium">AI Summary: </span>
                    {entry.metadata.ai_summary as string}
                  </p>
                </div>
              )}

              {/* Link to full item */}
              {entry.type === 'note' && (
                <a
                  href={`/notes/${entry.id}`}
                  className="inline-block mt-2 text-sm text-indigo-600 hover:text-indigo-700"
                >
                  View full note →
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
