// Cloudflare Pages Function to proxy API requests to the worker
// This allows same-origin requests from the frontend, solving cross-origin cookie issues

const API_URL = 'https://clientpulse-api.sfraser.workers.dev';

export const onRequest: PagesFunction = async (context) => {
  const { request, params } = context;

  // Build the target URL
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path || '';
  const url = new URL(request.url);
  const targetUrl = `${API_URL}/api/${path}${url.search}`;

  // Create a new request with the same method, headers, and body
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'manual', // Don't follow redirects automatically
  });

  // Forward the request to the API
  const response = await fetch(proxyRequest);

  // Create a new response with the same body and status
  const proxyResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

  return proxyResponse;
};
