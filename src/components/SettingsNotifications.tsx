import { useState } from 'react';

interface NotificationSettings {
  digestEnabled: boolean;
  overdueAlerts: boolean;
  healthAlerts: boolean;
  weeklyReport: boolean;
}

export default function SettingsNotifications() {
  const [settings, setSettings] = useState<NotificationSettings>({
    digestEnabled: true,
    overdueAlerts: true,
    healthAlerts: true,
    weeklyReport: false
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(key: keyof NotificationSettings) {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    // Simulated save - would normally call API
    await new Promise(resolve => setTimeout(resolve, 500));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const notifications = [
    {
      key: 'digestEnabled' as const,
      title: 'Daily Digest',
      description: 'Morning summary of client health and upcoming commitments'
    },
    {
      key: 'overdueAlerts' as const,
      title: 'Overdue Alerts',
      description: 'Get notified when action items become overdue'
    },
    {
      key: 'healthAlerts' as const,
      title: 'Health Alerts',
      description: 'Notifications when a client moves to "needs attention"'
    },
    {
      key: 'weeklyReport' as const,
      title: 'Weekly Report',
      description: 'Summary of your client relationships each week'
    }
  ];

  return (
    <div className="space-y-6">
      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 flex items-center gap-2 animate-fade-in">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Settings saved successfully
        </div>
      )}

      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4 mb-6">
          Email Notifications
        </h2>

        <div className="space-y-6">
          {notifications.map(({ key, title, description }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{title}</p>
                <p className="text-sm text-gray-500">{description}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(key)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings[key] ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
                disabled={saving}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings[key] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4 mb-6">
          Push Notifications
        </h2>

        <div className="flex items-center justify-between py-4 text-gray-500">
          <div>
            <p className="font-medium">Browser Notifications</p>
            <p className="text-sm">Real-time alerts in your browser</p>
          </div>
          <span className="badge-gray">Coming Soon</span>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? (
            <>
              <span className="spinner-sm" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </div>
  );
}
