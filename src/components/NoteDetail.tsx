import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface Note {
  id: string;
  client_id: string;
  note_type: string;
  title: string | null;
  meeting_date: string | null;
  meeting_type: string | null;
  duration_minutes: number | null;
  attendees: string[];
  summary: string | null;
  discussed: string | null;
  decisions: string | null;
  action_items_raw: string | null;
  concerns: string | null;
  personal_notes: string | null;
  next_steps: string | null;
  mood: string | null;
  ai_status: string;
  ai_summary: string | null;
  ai_risk_signals: string[];
  ai_personal_details: string[];
  ai_sentiment_score: number | null;
  ai_topics: string[];
  ai_key_insights: string[];
  ai_relationship_signals: string[];
  ai_follow_up_recommendations: string[];
  ai_communication_style: string | null;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
  company: string | null;
}

interface Props {
  noteId: string;
}

export default function NoteDetail({ noteId }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchNote();
  }, [noteId]);

  async function fetchNote() {
    try {
      const res = await apiFetch(`/api/notes/${noteId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Note not found');
        }
        throw new Error('Failed to load note');
      }
      const json = await res.json();
      setNote(json.data);

      // Fetch client info
      const clientRes = await apiFetch(`/api/clients/${json.data.client_id}`);
      if (clientRes.ok) {
        const clientJson = await clientRes.json();
        setClient(clientJson.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function retryAI() {
    if (!note) return;
    try {
      await apiFetch(`/api/notes/${noteId}/retry-ai`, { method: 'POST' });
      fetchNote();
    } catch (err) {
      console.error('Failed to retry AI:', err);
    }
  }

  function startEditingTitle() {
    if (!note) return;
    setTitleValue(note.title || '');
    setEditingTitle(true);
  }

  async function saveTitle() {
    if (!note) return;
    setSavingTitle(true);
    try {
      const res = await apiFetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: titleValue.trim() || null })
      });
      if (res.ok) {
        setNote({ ...note, title: titleValue.trim() || null });
        setEditingTitle(false);
      }
    } catch (err) {
      console.error('Failed to save title:', err);
    } finally {
      setSavingTitle(false);
    }
  }

  function cancelEditingTitle() {
    setEditingTitle(false);
    setTitleValue('');
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitle();
    } else if (e.key === 'Escape') {
      cancelEditingTitle();
    }
  }

  async function deleteNote() {
    if (!note) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
      if (res.ok) {
        // Redirect to client page after deletion
        window.location.href = `/clients/${note.client_id}`;
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to delete note');
      }
    } catch (err) {
      console.error('Failed to delete note:', err);
      alert('Failed to delete note');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner-lg" />
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">{error || 'Note not found'}</h2>
        <a href="/notes" className="btn-primary mt-4">Back to Notes</a>
      </div>
    );
  }

  const moodConfig: Record<string, { label: string; color: string }> = {
    positive: { label: 'Positive', color: 'bg-green-100 text-green-700' },
    neutral: { label: 'Neutral', color: 'bg-gray-100 text-gray-700' },
    negative: { label: 'Negative', color: 'bg-red-100 text-red-700' },
    concerned: { label: 'Concerned', color: 'bg-yellow-100 text-yellow-700' },
    frustrated: { label: 'Frustrated', color: 'bg-red-100 text-red-700' }
  };

  const typeLabels: Record<string, string> = {
    meeting: 'Meeting',
    call: 'Call',
    email: 'Email',
    chat: 'Chat',
    video_call: 'Video Call',
    phone: 'Phone',
    in_person: 'In Person',
    async: 'Async',
    other: 'Other'
  };

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  className="text-xl font-bold text-gray-900 border border-indigo-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter note title..."
                  autoFocus
                  maxLength={200}
                />
                <button
                  onClick={saveTitle}
                  disabled={savingTitle}
                  className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                  title="Save"
                >
                  {savingTitle ? (
                    <span className="spinner-sm" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={cancelEditingTitle}
                  className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"
                  title="Cancel"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-xl font-bold text-gray-900">
                  {note.title || `${typeLabels[note.meeting_type || note.note_type] || 'Note'} with ${client?.name || 'Client'}`}
                </h1>
                <button
                  onClick={startEditingTitle}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit title"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
              {note.meeting_date && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatDate(note.meeting_date)}
                </span>
              )}
              {note.meeting_type && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {typeLabels[note.meeting_type] || note.meeting_type}
                </span>
              )}
              {note.duration_minutes && (
                <span>{note.duration_minutes} min</span>
              )}
            </div>
            {client && (
              <a href={`/clients/${client.id}`} className="inline-flex items-center gap-2 mt-3 text-indigo-600 hover:text-indigo-700">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {client.name}{client.company ? ` (${client.company})` : ''}
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            {note.mood && moodConfig[note.mood] && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${moodConfig[note.mood].color}`}>
                {moodConfig[note.mood].label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      {note.ai_status === 'completed' && note.ai_summary && (
        <div className="card p-6 bg-indigo-50 border-indigo-200">
          <h2 className="font-semibold text-indigo-900 flex items-center gap-2 mb-4">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Analysis
          </h2>
          <p className="text-indigo-800 mb-4">{note.ai_summary}</p>

          {note.ai_topics.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {note.ai_topics.map((topic, i) => (
                <span key={i} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-sm">
                  {topic}
                </span>
              ))}
            </div>
          )}

          {/* Key Insights */}
          {note.ai_key_insights && note.ai_key_insights.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Key Insights
              </h3>
              <ul className="list-disc list-inside text-blue-700 text-sm space-y-1">
                {note.ai_key_insights.map((insight, i) => (
                  <li key={i}>{insight}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Risk Signals */}
          {note.ai_risk_signals.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-medium text-yellow-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Risk Signals
              </h3>
              <ul className="list-disc list-inside text-yellow-700 text-sm space-y-1">
                {note.ai_risk_signals.map((signal, i) => (
                  <li key={i}>{signal}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Relationship Signals */}
          {note.ai_relationship_signals && note.ai_relationship_signals.length > 0 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
                Relationship Signals
              </h3>
              <ul className="list-disc list-inside text-green-700 text-sm space-y-1">
                {note.ai_relationship_signals.map((signal, i) => (
                  <li key={i}>{signal}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Follow-up Recommendations */}
          {note.ai_follow_up_recommendations && note.ai_follow_up_recommendations.length > 0 && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <h3 className="font-medium text-purple-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Follow-up Recommendations
              </h3>
              <ul className="list-disc list-inside text-purple-700 text-sm space-y-1">
                {note.ai_follow_up_recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Communication Style */}
          {note.ai_communication_style && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Communication Style
              </h3>
              <p className="text-gray-700 text-sm">{note.ai_communication_style}</p>
            </div>
          )}
        </div>
      )}

      {note.ai_status === 'processing' && (
        <div className="card p-6 bg-blue-50 border-blue-200">
          <div className="flex items-center gap-3">
            <div className="spinner-sm" />
            <span className="text-blue-700">AI is analyzing this note...</span>
          </div>
        </div>
      )}

      {note.ai_status === 'failed' && (
        <div className="card p-6 bg-red-50 border-red-200">
          <div className="flex items-center justify-between">
            <span className="text-red-700">AI analysis failed</span>
            <button onClick={retryAI} className="btn-ghost text-red-700">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Note Content */}
      <div className="card p-6 space-y-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4">Note Content</h2>

        {note.summary && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Summary</h3>
            <p className="text-gray-900">{note.summary}</p>
          </div>
        )}

        {note.discussed && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">What We Discussed</h3>
            <p className="text-gray-900 whitespace-pre-wrap">{note.discussed}</p>
          </div>
        )}

        {note.decisions && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Decisions Made</h3>
            <p className="text-gray-900 whitespace-pre-wrap">{note.decisions}</p>
          </div>
        )}

        {note.action_items_raw && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Action Items</h3>
            <p className="text-gray-900 whitespace-pre-wrap">{note.action_items_raw}</p>
          </div>
        )}

        {note.concerns && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Concerns</h3>
            <p className="text-gray-900 whitespace-pre-wrap">{note.concerns}</p>
          </div>
        )}

        {note.personal_notes && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Personal Notes</h3>
            <p className="text-gray-900 whitespace-pre-wrap">{note.personal_notes}</p>
          </div>
        )}

        {note.next_steps && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Next Steps</h3>
            <p className="text-gray-900 whitespace-pre-wrap">{note.next_steps}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="btn-ghost text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete Note
        </button>
        <a href={`/clients/${note.client_id}`} className="btn-secondary">
          Back to Client
        </a>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Note</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this note? This action cannot be undone and will also remove any associated action items.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={deleteNote}
                disabled={deleting}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                {deleting ? (
                  <>
                    <span className="spinner-sm" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
