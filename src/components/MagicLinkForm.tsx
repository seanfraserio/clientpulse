import { useState } from 'react';
import { apiFetch } from '../lib/api';

type FormState = 'idle' | 'loading' | 'success' | 'error';

export default function MagicLinkForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setState('loading');
    setError('');

    try {
      const res = await apiFetch('/api/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setState('success');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Failed to send magic link');
    }
  }

  if (state === 'success') {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-600 mb-4">
          We've sent a magic link to<br />
          <span className="font-medium text-gray-900">{email}</span>
        </p>
        <p className="text-sm text-gray-500">
          The link will expire in 15 minutes.
        </p>
        <button
          onClick={() => { setState('idle'); setEmail(''); }}
          className="mt-6 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          ← Try a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Email address</label>
        <input
          type="email"
          id="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          className={error ? 'input-error' : 'input'}
          disabled={state === 'loading'}
        />
        {error && <p className="error-text">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={state === 'loading'}
        className="btn-primary w-full"
      >
        {state === 'loading' ? (
          <>
            <span className="spinner-sm" />
            Sending...
          </>
        ) : (
          'Send Magic Link'
        )}
      </button>
    </form>
  );
}
