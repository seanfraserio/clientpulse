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
 * Get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Store CSRF token from response header
 */
function updateCsrfToken(response: Response): void {
  const csrfToken = response.headers.get('X-CSRF-Token');
  if (csrfToken && typeof document !== 'undefined') {
    // Update the cookie if the server sent a new token
    const isSecure = window.location.protocol === 'https:';
    document.cookie = `csrf_token=${csrfToken}; path=/; SameSite=Strict${isSecure ? '; Secure' : ''}; max-age=86400`;
  }
}

/**
 * Fetch wrapper that automatically handles:
 * - Full API URL
 * - Authorization header with session token
 * - CSRF token for state-changing requests
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

  // Add CSRF token for state-changing requests
  const method = (options.method || 'GET').toUpperCase();
  const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (stateChangingMethods.includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  // Add JSON content type for requests with body
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const defaultOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Include cookies for CSRF
  };

  const response = await fetch(url, defaultOptions);

  // Update CSRF token from response if present
  updateCsrfToken(response);

  return response;
}
