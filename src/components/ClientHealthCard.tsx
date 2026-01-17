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

interface Props {
  client: RadarClient;
}

export default function ClientHealthCard({ client }: Props) {
  const statusColors = {
    attention: 'border-l-attention bg-red-50/50',
    watch: 'border-l-watch bg-yellow-50/50',
    healthy: 'border-l-healthy bg-green-50/50'
  };

  const scoreColors = {
    attention: 'text-attention',
    watch: 'text-watch',
    healthy: 'text-healthy'
  };

  function formatLastContact(dateStr: string | null, daysSince: number): string {
    if (!dateStr) return 'Never';
    if (daysSince === 0) return 'Today';
    if (daysSince === 1) return 'Yesterday';
    if (daysSince < 7) return `${daysSince} days ago`;
    if (daysSince < 14) return 'Last week';
    if (daysSince < 30) return `${Math.floor(daysSince / 7)} weeks ago`;
    return `${Math.floor(daysSince / 30)} months ago`;
  }

  return (
    <a
      href={`/clients/${client.id}`}
      className={`card-hover block p-4 border-l-4 ${statusColors[client.health_status]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{client.name}</h3>
          {client.company && (
            <p className="text-sm text-gray-500 truncate">{client.company}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <span className={`text-lg font-bold ${scoreColors[client.health_status]}`}>
            {client.health_score}
          </span>
        </div>
      </div>

      {/* Signals */}
      {client.health_signals.length > 0 && (
        <div className="mt-3 space-y-1">
          {client.health_signals.slice(0, 2).map((signal, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <SignalIcon severity={signal.severity} />
              <span className="text-gray-600 truncate">{signal.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span>Last contact: {formatLastContact(client.last_contact_at, client.days_since_contact)}</span>
        {client.open_commitments > 0 && (
          <span className="badge-gray">{client.open_commitments} open</span>
        )}
      </div>
    </a>
  );
}

function SignalIcon({ severity }: { severity: 'low' | 'medium' | 'high' }) {
  const colors = {
    low: 'text-blue-500',
    medium: 'text-yellow-500',
    high: 'text-red-500'
  };

  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${colors[severity]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {severity === 'high' ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      ) : severity === 'medium' ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      )}
    </svg>
  );
}
