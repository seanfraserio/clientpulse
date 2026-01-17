interface Stats {
  totalClients: number;
  needsAttention: number;
  overdueActions: number;
}

interface Props {
  stats: Stats;
}

export default function DashboardStats({ stats }: Props) {
  const healthyCount = stats.totalClients - stats.needsAttention;
  const healthyPercent = stats.totalClients > 0
    ? Math.round((healthyCount / stats.totalClients) * 100)
    : 100;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      {/* Total Clients */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.totalClients}</p>
            <p className="text-xs text-gray-500">Total Clients</p>
          </div>
        </div>
      </div>

      {/* Health Rate */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{healthyPercent}%</p>
            <p className="text-xs text-gray-500">Healthy</p>
          </div>
        </div>
      </div>

      {/* Needs Attention */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.needsAttention}</p>
            <p className="text-xs text-gray-500">Need Attention</p>
          </div>
        </div>
      </div>

      {/* Overdue Actions */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.overdueActions}</p>
            <p className="text-xs text-gray-500">Overdue Items</p>
          </div>
        </div>
      </div>
    </div>
  );
}
