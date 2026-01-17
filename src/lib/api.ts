// Centralized API configuration
// API calls go directly to the Cloudflare Worker API with session token in Authorization header

const API_URL = 'https://clientpulse-api.sfraser.workers.dev';

/**
 * Get session token from localStorage
 */
export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('session_token');
}

/**
 * Set session token in localStorage
 */
export function setSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('session_token', token);
}

/**
 * Remove session token from localStorage
 */
export function removeSessionToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('session_token');
}

/**
 * Fetch wrapper that automatically handles:
 * - Full API URL
 * - Authorization header with session token
 * - JSON content type for POST/PUT/PATCH
 */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  // Use full API URL for direct requests
  const url = endpoint.startsWith('/api')
    ? `${API_URL}${endpoint}`
    : endpoint;

  const sessionToken = getSessionToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // Add Authorization header if we have a session token
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  // Add JSON content type for requests with body
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const defaultOptions: RequestInit = {
    ...options,
    headers,
  };

  return fetch(url, defaultOptions);
}
