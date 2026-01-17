import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import ClientTimeline from './ClientTimeline';
import ClientActions from './ClientActions';
import HealthScoreRing from './HealthScoreRing';

interface HealthSignal {
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
}

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  notes: string | null;
  tags: string[];
  health_score: number;
  health_status: 'attention' | 'watch' | 'healthy';
  health_signals: HealthSignal[];
  last_contact_at: string | null;
  ai_personal_details: string[];
  created_at: string;
}

interface Props {
  clientId: string;
}

export default function ClientDetail({ clientId }: Props) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'actions' | 'details'>('timeline');

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  async function fetchClient() {
    try {
      const res = await apiFetch(`/api/clients/${clientId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Client not found');
        throw new Error('Failed to load client');
      }
      const json = await res.json();
      setClient(json.data);
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
          <p className="text-gray-500">Loading client...</p>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{error || 'Client not found'}</h2>
          <a href="/clients" className="btn-primary mt-4">Back to Clients</a>
        </div>
      </div>
    );
  }

  const statusColors = {
    attention: 'bg-attention/10 text-attention border-attention/20',
    watch: 'bg-watch/10 text-watch border-watch/20',
    healthy: 'bg-healthy/10 text-healthy border-healthy/20'
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <a href="/clients" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Clients
        </a>
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-6 mb-8">
        {/* Client Info */}
        <div className="flex-1">
          <div className="flex items-start gap-4">
            <div className="avatar-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xl">
              {client.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
                <span className={`badge border ${statusColors[client.health_status]}`}>
                  {client.health_status.charAt(0).toUpperCase() + client.health_status.slice(1)}
                </span>
              </div>
              {client.company && (
                <p className="text-gray-600 mt-1">{client.role ? `${client.role} at ` : ''}{client.company}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
                {client.email && (
                  <a href={`mailto:${client.email}`} className="flex items-center gap-1 hover:text-indigo-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {client.email}
                  </a>
                )}
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="flex items-center gap-1 hover:text-indigo-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {client.phone}
                  </a>
                )}
              </div>
              {client.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {client.tags.map(tag => (
                    <span key={tag} className="badge-gray">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Health Score Card */}
        <div className="card p-6 lg:w-80">
          <div className="flex items-center gap-4">
            <HealthScoreRing score={client.health_score} status={client.health_status} />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Health Score</h3>
              <p className="text-sm text-gray-500">
                Last contact: {client.last_contact_at
                  ? new Date(client.last_contact_at).toLocaleDateString()
                  : 'Never'}
              </p>
            </div>
          </div>
          {client.health_signals.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              {client.health_signals.map((signal, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    signal.severity === 'high' ? 'bg-red-500' :
                    signal.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <div>
                    <p className="font-medium text-gray-900">{signal.title}</p>
                    <p className="text-gray-500">{signal.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <a href={`/notes/new?clientId=${client.id}`} className="btn-primary">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Add Note
        </a>
        <a href={`/clients/${client.id}/edit`} className="btn-secondary">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Edit Client
        </a>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {[
            { id: 'timeline', label: 'Timeline' },
            { id: 'actions', label: 'Action Items' },
            { id: 'details', label: 'Details' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'timeline' && (
        <ClientTimeline clientId={client.id} />
      )}

      {activeTab === 'actions' && (
        <ClientActions clientId={client.id} />
      )}

      {activeTab === 'details' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contact Information */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Contact Information
            </h3>
            <dl className="space-y-4">
              {client.company && (
                <div>
                  <dt className="text-sm text-gray-500">Company</dt>
                  <dd className="text-gray-900 font-medium">{client.company}</dd>
                </div>
              )}
              {client.role && (
                <div>
                  <dt className="text-sm text-gray-500">Role / Title</dt>
                  <dd className="text-gray-900">{client.role}</dd>
                </div>
              )}
              {client.email && (
                <div>
                  <dt className="text-sm text-gray-500">Email</dt>
                  <dd>
                    <a href={`mailto:${client.email}`} className="text-indigo-600 hover:text-indigo-700">
                      {client.email}
                    </a>
                  </dd>
                </div>
              )}
              {client.phone && (
                <div>
                  <dt className="text-sm text-gray-500">Phone</dt>
                  <dd>
                    <a href={`tel:${client.phone}`} className="text-indigo-600 hover:text-indigo-700">
                      {client.phone}
                    </a>
                  </dd>
                </div>
              )}
              {!client.company && !client.role && !client.email && !client.phone && (
                <p className="text-gray-400 text-sm italic">No contact information added</p>
              )}
            </dl>
          </div>

          {/* Client Information */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Client Information
            </h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm text-gray-500">Client since</dt>
                <dd className="text-gray-900">{new Date(client.created_at).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Last contact</dt>
                <dd className="text-gray-900">
                  {client.last_contact_at
                    ? new Date(client.last_contact_at).toLocaleDateString()
                    : 'Never'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Health Status</dt>
                <dd className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-sm font-medium ${
                  client.health_status === 'healthy' ? 'bg-green-100 text-green-700' :
                  client.health_status === 'watch' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {client.health_status.charAt(0).toUpperCase() + client.health_status.slice(1)}
                  <span className="font-bold">({client.health_score})</span>
                </dd>
              </div>
            </dl>
          </div>

          {/* Tags */}
          {client.tags.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {client.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {client.notes && (
            <div className="card p-6 lg:col-span-2">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Notes
              </h3>
              <p className="text-gray-600 whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}

          {/* AI Personal Details */}
          {client.ai_personal_details.length > 0 && (
            <div className="card p-6 lg:col-span-2">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Personal Details
                <span className="text-xs text-gray-400 font-normal">(AI extracted)</span>
              </h3>
              <ul className="space-y-2">
                {client.ai_personal_details.map((detail, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-600">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
