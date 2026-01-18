import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../lib/api';

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  health_score: number;
  health_status: 'attention' | 'watch' | 'healthy';
  last_contact_at: string | null;
  tags: string[];
  notes_count: number;
  created_at: string;
}

type ViewMode = 'grid' | 'list';
type SortField = 'name' | 'company' | 'health' | 'last_contact' | 'created';
type SortDirection = 'asc' | 'desc';

const STATUS_BADGE: Record<string, { class: string; label: string; icon: string }> = {
  attention: { class: 'badge-attention', label: 'Attention', icon: '🔴' },
  watch: { class: 'badge-watch', label: 'Watch', icon: '🟡' },
  healthy: { class: 'badge-healthy', label: 'Healthy', icon: '🟢' }
};

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'company', label: 'Company' },
  { value: 'health', label: 'Health Score' },
  { value: 'last_contact', label: 'Last Contact' },
  { value: 'created', label: 'Date Added' }
];

export default function ClientsList() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('clientsViewMode') as ViewMode) || 'list';
    }
    return 'list';
  });
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('clientsViewMode', viewMode);
    }
  }, [viewMode]);

  async function fetchClients() {
    try {
      const res = await apiFetch('/api/clients');
      if (!res.ok) throw new Error('Failed to load clients');
      const json = await res.json();
      setClients(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const filteredAndSortedClients = useMemo(() => {
    // Filter
    let result = clients.filter(client => {
      const matchesSearch = client.name.toLowerCase().includes(search.toLowerCase()) ||
        client.company?.toLowerCase().includes(search.toLowerCase()) ||
        client.email?.toLowerCase().includes(search.toLowerCase()) ||
        client.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()));

      const matchesFilter = filter === 'all' || client.health_status === filter;

      return matchesSearch && matchesFilter;
    });

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'company':
          comparison = (a.company || '').localeCompare(b.company || '');
          break;
        case 'health':
          comparison = a.health_score - b.health_score;
          break;
        case 'last_contact':
          const aDate = a.last_contact_at ? new Date(a.last_contact_at).getTime() : 0;
          const bDate = b.last_contact_at ? new Date(b.last_contact_at).getTime() : 0;
          comparison = aDate - bDate;
          break;
        case 'created':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [clients, search, filter, sortField, sortDirection]);

  function toggleSortDirection() {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatRelativeDate(dateStr: string | null) {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateStr);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner-lg mx-auto mb-4" />
          <p className="text-gray-500">Loading clients...</p>
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load clients</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={fetchClients} className="btn-primary">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 mt-1">
            {filteredAndSortedClients.length} of {clients.length} clients
          </p>
        </div>
        <a href="/clients/new/" className="btn-primary">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </a>
      </div>

      {/* Toolbar: Search, Filter, Sort, View Toggle */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col gap-4">
          {/* Row 1: Search and View Toggle */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name, company, email, or tag..."
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

          {/* Row 2: Status Filter Pills */}
          <div className="flex gap-2 flex-wrap">
            {['all', 'attention', 'watch', 'healthy'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === status
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {status === 'all' ? 'All' : (
                  <>
                    {STATUS_BADGE[status]?.icon} {status.charAt(0).toUpperCase() + status.slice(1)}
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Clients Display */}
      {filteredAndSortedClients.length === 0 ? (
        <div className="card p-12 text-center">
          {clients.length === 0 ? (
            <>
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No clients yet</h2>
              <p className="text-gray-600 mb-6">Add your first client to start tracking relationships</p>
              <a href="/clients/new/" className="btn-primary">Add Client</a>
            </>
          ) : (
            <>
              <p className="text-gray-500">No clients match your filters</p>
              <button onClick={() => { setSearch(''); setFilter('all'); }} className="btn-ghost mt-4">
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : viewMode === 'list' ? (
        /* List View */
        <div className="card overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">
            <div className="col-span-4">Client</div>
            <div className="col-span-2">Health</div>
            <div className="col-span-2">Last Contact</div>
            <div className="col-span-3">Tags</div>
            <div className="col-span-1"></div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-gray-100">
            {filteredAndSortedClients.map(client => (
              <a
                key={client.id}
                href={`/clients/${client.id}`}
                className="block hover:bg-gray-50 transition-colors"
              >
                {/* Desktop Row */}
                <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-3 items-center">
                  <div className="col-span-4">
                    <span className="font-medium text-gray-900">{client.name}</span>
                    {client.company && (
                      <span className="block text-sm text-gray-500">{client.company}</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className={STATUS_BADGE[client.health_status].class}>
                      {STATUS_BADGE[client.health_status].icon} {client.health_score}
                    </span>
                  </div>
                  <div className="col-span-2 text-sm text-gray-600">
                    {formatRelativeDate(client.last_contact_at)}
                  </div>
                  <div className="col-span-3">
                    <div className="flex gap-1 flex-wrap">
                      {client.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="badge-gray text-xs">{tag}</span>
                      ))}
                      {client.tags.length > 3 && (
                        <span className="badge-gray text-xs">+{client.tags.length - 3}</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-1 text-right">
                    <svg className="w-5 h-5 text-gray-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Mobile Row */}
                <div className="md:hidden p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <span className="font-medium text-gray-900">{client.name}</span>
                      {client.company && (
                        <span className="block text-sm text-gray-500">{client.company}</span>
                      )}
                    </div>
                    <span className={STATUS_BADGE[client.health_status].class}>
                      {STATUS_BADGE[client.health_status].icon} {client.health_score}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      Last contact: {formatRelativeDate(client.last_contact_at)}
                    </span>
                    {client.tags.length > 0 && (
                      <div className="flex gap-1">
                        {client.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="badge-gray text-xs">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedClients.map(client => (
            <a
              key={client.id}
              href={`/clients/${client.id}`}
              className="card-hover p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{client.name}</h3>
                  {client.company && (
                    <p className="text-sm text-gray-500 truncate">{client.company}</p>
                  )}
                </div>
                <span className={STATUS_BADGE[client.health_status].class}>
                  {STATUS_BADGE[client.health_status].icon} {client.health_score}
                </span>
              </div>

              {client.email && (
                <p className="text-sm text-gray-600 mb-2 truncate">
                  <span className="text-gray-400">✉️</span> {client.email}
                </p>
              )}

              <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                <span>Last contact: {formatRelativeDate(client.last_contact_at)}</span>
              </div>

              {client.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {client.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="badge-gray text-xs">{tag}</span>
                  ))}
                  {client.tags.length > 4 && (
                    <span className="badge-gray text-xs">+{client.tags.length - 4}</span>
                  )}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
