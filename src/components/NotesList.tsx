import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../lib/api';

interface Note {
  id: string;
  client_id: string;
  client_name: string;
  meeting_date: string;
  meeting_type: string;
  mood: string;
  title: string | null;
  summary: string | null;
  ai_summary: string | null;
  ai_status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
}

type ViewMode = 'grid' | 'list';
type SortField = 'date' | 'client' | 'type' | 'mood' | 'ai_status';
type SortDirection = 'asc' | 'desc';

const MOOD_EMOJI: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  negative: '😞',
  concerned: '😟',
  frustrated: '😤'
};

const TYPE_ICON: Record<string, string> = {
  meeting: '📅',
  call: '📞',
  email: '📧',
  chat: '💬',
  video_call: '🎥',
  phone: '📱',
  in_person: '🤝',
  quick: '⚡',
  other: '📝'
};

const AI_STATUS_BADGE: Record<string, { class: string; label: string }> = {
  pending: { class: 'badge-gray', label: 'Pending' },
  processing: { class: 'badge-blue', label: 'Processing...' },
  completed: { class: 'badge-green', label: 'AI Ready' },
  failed: { class: 'badge-red', label: 'AI Failed' }
};

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'client', label: 'Client' },
  { value: 'type', label: 'Type' },
  { value: 'mood', label: 'Mood' },
  { value: 'ai_status', label: 'AI Status' }
];

export default function NotesList() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('notesViewMode') as ViewMode) || 'list';
    }
    return 'list';
  });
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    fetchNotes();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('notesViewMode', viewMode);
    }
  }, [viewMode]);

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

  const filteredAndSortedNotes = useMemo(() => {
    // Filter
    let result = notes.filter(note =>
      note.client_name.toLowerCase().includes(search.toLowerCase()) ||
      note.title?.toLowerCase().includes(search.toLowerCase()) ||
      note.summary?.toLowerCase().includes(search.toLowerCase()) ||
      note.ai_summary?.toLowerCase().includes(search.toLowerCase()) ||
      note.meeting_type.toLowerCase().includes(search.toLowerCase())
    );

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'date':
          comparison = new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime();
          break;
        case 'client':
          comparison = a.client_name.localeCompare(b.client_name);
          break;
        case 'type':
          comparison = a.meeting_type.localeCompare(b.meeting_type);
          break;
        case 'mood':
          comparison = (a.mood || '').localeCompare(b.mood || '');
          break;
        case 'ai_status':
          comparison = a.ai_status.localeCompare(b.ai_status);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [notes, search, sortField, sortDirection]);

  function toggleSortDirection() {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatShortDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meeting Notes</h1>
          <p className="text-gray-500 mt-1">
            {filteredAndSortedNotes.length} of {notes.length} notes
          </p>
        </div>
        <a href="/notes/new" className="btn-primary">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Note
        </a>
      </div>

      {/* Toolbar: Search, Sort, View Toggle */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search notes by client, content, or type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 whitespace-nowrap">Sort by:</label>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="input py-2 pr-8"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={toggleSortDirection}
              className="btn-ghost p-2"
              title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortDirection === 'asc' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                </svg>
              )}
            </button>
          </div>

          {/* View Toggle */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-primary-50 text-primary-600' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              title="List view"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-primary-50 text-primary-600' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              title="Grid view"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Notes Display */}
      {filteredAndSortedNotes.length === 0 ? (
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
      ) : viewMode === 'list' ? (
        /* List View */
        <div className="card overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">
            <div className="col-span-1">Type</div>
            <div className="col-span-3">Client</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-4">Summary</div>
            <div className="col-span-1">Mood</div>
            <div className="col-span-1">AI</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-gray-100">
            {filteredAndSortedNotes.map(note => (
              <a
                key={note.id}
                href={`/notes/${note.id}`}
                className="block hover:bg-gray-50 transition-colors"
              >
                {/* Desktop Row */}
                <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-3 items-center">
                  <div className="col-span-1">
                    <span className="text-lg" title={note.meeting_type}>
                      {TYPE_ICON[note.meeting_type] || '📝'}
                    </span>
                  </div>
                  <div className="col-span-3">
                    <span className="font-medium text-gray-900">{note.client_name}</span>
                    {note.title && (
                      <span className="block text-sm text-gray-500 truncate">{note.title}</span>
                    )}
                  </div>
                  <div className="col-span-2 text-sm text-gray-600">
                    {formatDate(note.meeting_date)}
                  </div>
                  <div className="col-span-4 text-sm text-gray-600 truncate">
                    {note.ai_summary || note.summary || 'No summary'}
                  </div>
                  <div className="col-span-1">
                    <span className="text-lg" title={note.mood}>
                      {MOOD_EMOJI[note.mood] || '😐'}
                    </span>
                  </div>
                  <div className="col-span-1">
                    <span className={`${AI_STATUS_BADGE[note.ai_status].class} text-xs`}>
                      {note.ai_status === 'completed' ? '✓' : AI_STATUS_BADGE[note.ai_status].label}
                    </span>
                  </div>
                </div>

                {/* Mobile Row */}
                <div className="md:hidden p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{TYPE_ICON[note.meeting_type] || '📝'}</span>
                      <span className="font-medium text-gray-900">{note.client_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{MOOD_EMOJI[note.mood] || '😐'}</span>
                      <span className={AI_STATUS_BADGE[note.ai_status].class}>
                        {AI_STATUS_BADGE[note.ai_status].label}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mb-1">{formatShortDate(note.meeting_date)}</p>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {note.ai_summary || note.summary || 'No summary'}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedNotes.map(note => (
            <a
              key={note.id}
              href={`/notes/${note.id}`}
              className="card-hover p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{TYPE_ICON[note.meeting_type] || '📝'}</span>
                  <span className="text-lg">{MOOD_EMOJI[note.mood] || '😐'}</span>
                </div>
                <span className={AI_STATUS_BADGE[note.ai_status].class}>
                  {AI_STATUS_BADGE[note.ai_status].label}
                </span>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">{note.client_name}</h3>
              {note.title && (
                <p className="text-sm text-gray-700 mb-1 truncate">{note.title}</p>
              )}

              <p className="text-sm text-gray-500 mb-3">
                {formatShortDate(note.meeting_date)}
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
