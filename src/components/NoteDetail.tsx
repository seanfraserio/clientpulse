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
            <h1 className="text-xl font-bold text-gray-900">
              {note.title || `${typeLabels[note.meeting_type || note.note_type] || 'Note'} with ${client?.name || 'Client'}`}
            </h1>
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

          {note.ai_risk_signals.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-medium text-yellow-800 mb-2">Risk Signals</h3>
              <ul className="list-disc list-inside text-yellow-700 text-sm space-y-1">
                {note.ai_risk_signals.map((signal, i) => (
                  <li key={i}>{signal}</li>
                ))}
              </ul>
            </div>
          )}

          {note.ai_personal_details.length > 0 && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <h3 className="font-medium text-purple-800 mb-2">Personal Details Captured</h3>
              <ul className="list-disc list-inside text-purple-700 text-sm space-y-1">
                {note.ai_personal_details.map((detail, i) => (
                  <li key={i}>{detail}</li>
                ))}
              </ul>
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
      <div className="flex justify-end gap-3">
        <a href={`/clients/${note.client_id}`} className="btn-secondary">
          Back to Client
        </a>
      </div>
    </div>
  );
}
