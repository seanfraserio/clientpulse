// Centralized API configuration
// API calls go through Cloudflare Pages Functions proxy (/api/*) to avoid cross-origin cookie issues
// The proxy forwards requests to the Cloudflare Worker API

/**
 * Fetch wrapper that automatically handles:
 * - Relative URL (goes through proxy)
 * - Credentials for same-origin cookies
 * - JSON content type for POST/PUT/PATCH
 */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  // Use relative URL - requests go through Cloudflare Pages Functions proxy
  const url = endpoint;

  const defaultOptions: RequestInit = {
    credentials: 'include', // Include cookies for same-origin requests
    ...options,
  };

  // Add JSON content type for requests with body
  if (options.body && !options.headers) {
    defaultOptions.headers = {
      'Content-Type': 'application/json',
    };
  }

  return fetch(url, defaultOptions);
}
