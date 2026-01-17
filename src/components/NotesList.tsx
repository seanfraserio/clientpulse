import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface Note {
  id: string;
  client_id: string;
  client_name: string;
  meeting_date: string;
  meeting_type: string;
  mood: string;
  summary: string | null;
  ai_summary: string | null;
  ai_status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
}

export default function NotesList() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchNotes();
  }, []);

  async function fetchNotes() {
    try {
      const res = await apiFetch('/api/notes');
      if (!res.ok) throw new Error('Failed to load notes');
      const json = await res.json();
      setNotes(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const filteredNotes = notes.filter(note =>
    note.client_name.toLowerCase().includes(search.toLowerCase()) ||
    note.summary?.toLowerCase().includes(search.toLowerCase()) ||
    note.ai_summary?.toLowerCase().includes(search.toLowerCase())
  );

  const moodEmoji: Record<string, string> = {
    positive: '😊',
    neutral: '😐',
    concerned: '😟',
    frustrated: '😤'
  };

  const typeIcon: Record<string, string> = {
    meeting: '📅',
    call: '📞',
    email: '📧',
    chat: '💬',
    other: '📝'
  };

  const aiStatusBadge: Record<string, { class: string; label: string }> = {
    pending: { class: 'badge-gray', label: 'Pending' },
    processing: { class: 'badge-blue', label: 'Processing...' },
    completed: { class: 'badge-green', label: 'AI Ready' },
    failed: { class: 'badge-red', label: 'AI Failed' }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner-lg mx-auto mb-4" />
          <p className="text-gray-500">Loading notes...</p>
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load notes</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={fetchNotes} className="btn-primary">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meeting Notes</h1>
          <p className="text-gray-500 mt-1">{notes.length} notes</p>
        </div>
        <a href="/notes/new" className="btn-primary">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Note
        </a>
      </div>

      {/* Search */}
      <div className="card p-4 mb-6">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="card p-12 text-center">
          {notes.length === 0 ? (
            <>
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No notes yet</h2>
              <p className="text-gray-600 mb-6">Start documenting your client interactions</p>
              <a href="/notes/new" className="btn-primary">Add First Note</a>
            </>
          ) : (
            <>
              <p className="text-gray-500">No notes match your search</p>
              <button onClick={() => setSearch('')} className="btn-ghost mt-4">
                Clear search
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map(note => (
            <a
              key={note.id}
              href={`/clients/${note.client_id}`}
              className="card-hover p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{typeIcon[note.meeting_type] || '📝'}</span>
                  <span className="text-lg">{moodEmoji[note.mood] || '😐'}</span>
                </div>
                <span className={aiStatusBadge[note.ai_status].class}>
                  {aiStatusBadge[note.ai_status].label}
                </span>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">{note.client_name}</h3>

              <p className="text-sm text-gray-500 mb-3">
                {new Date(note.meeting_date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })}
              </p>

              <p className="text-gray-600 text-sm line-clamp-3">
                {note.ai_summary || note.summary || 'No summary available'}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
