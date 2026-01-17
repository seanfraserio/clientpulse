import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface User {
  id: string;
  email: string;
  name: string | null;
  timezone: string | null;
  digest_enabled: boolean;
  digest_time: string;
}

export default function SettingsProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestTime, setDigestTime] = useState('07:00');

  useEffect(() => {
    fetchUser();
  }, []);

  async function fetchUser() {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setName(data.user.name || '');
        setTimezone(data.user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
        setDigestEnabled(data.user.digest_enabled);
        setDigestTime(data.user.digest_time || '07:00');
      }
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await apiFetch('/api/auth/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim() || null,
          timezone,
          digestEnabled,
          digestTime
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Australia/Sydney'
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner-lg" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Settings saved successfully
        </div>
      )}

      <div className="card p-6 space-y-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4">
          Profile Information
        </h2>

        {/* Email (read-only) */}
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            value={user?.email || ''}
            className="input bg-gray-50"
            disabled
          />
          <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
        </div>

        {/* Name */}
        <div>
          <label htmlFor="name" className="label">Display Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="input"
            disabled={saving}
          />
        </div>

        {/* Timezone */}
        <div>
          <label htmlFor="timezone" className="label">Timezone</label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="input"
            disabled={saving}
          >
            {timezones.map(tz => (
              <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4">
          Daily Digest
        </h2>

        {/* Digest Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Enable Daily Digest</p>
            <p className="text-sm text-gray-500">
              Receive a morning email with your relationship status
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDigestEnabled(!digestEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              digestEnabled ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
            disabled={saving}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                digestEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Digest Time */}
        {digestEnabled && (
          <div>
            <label htmlFor="digestTime" className="label">Delivery Time</label>
            <select
              id="digestTime"
              value={digestTime}
              onChange={(e) => setDigestTime(e.target.value)}
              className="input w-auto"
              disabled={saving}
            >
              <option value="06:00">6:00 AM</option>
              <option value="07:00">7:00 AM</option>
              <option value="08:00">8:00 AM</option>
              <option value="09:00">9:00 AM</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Based on your timezone</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary">
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
    </form>
  );
}
