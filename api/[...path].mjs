import { createNeonDatabase } from '../functions/neon.mjs';
import { application } from '../functions/routes.mjs';

const handle = application({ db: createNeonDatabase() });

function webHeaders(headers) {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) result.set(key, value.join(', '));
    else if (value !== undefined) result.set(key, String(value));
  }
  return result;
}

function routeUrl(request) {
  const host = typeof request.headers?.get === 'function' ? request.headers.get('host') : request.headers?.host;
  const url = new URL(request.url, `https://${host ?? 'localhost'}`);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    url.pathname = `/functions/v1/app${url.pathname.slice('/api'.length)}`;
  }
  return url;
}

function isNodeResponse(response) {
  return response && typeof response.setHeader === 'function' && typeof response.end === 'function';
}

async function webRequest(request) {
  if (request instanceof Request) return new Request(routeUrl(request), request);
  const init = { method: request.method, headers: webHeaders(request.headers) };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request;
    init.duplex = 'half';
  }
  return new Request(routeUrl(request), init);
}

async function sendNodeResponse(response, webResponse) {
  response.statusCode = webResponse.status;
  for (const [key, value] of webResponse.headers) response.setHeader(key, value);
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

export default async function handler(request, response) {
  try {
    const webResponse = await handle({ request: await webRequest(request) });
    if (isNodeResponse(response)) await sendNodeResponse(response, webResponse);
    else return webResponse;
  } catch {
    const webResponse = Response.json({ error: 'server_error' }, { status: 500 });
    if (isNodeResponse(response)) await sendNodeResponse(response, webResponse);
    else return webResponse;
  }
}