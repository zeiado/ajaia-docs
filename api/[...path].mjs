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
  const url = new URL(request.url, `https://${request.headers.host ?? 'localhost'}`);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    url.pathname = `/functions/v1/app${url.pathname.slice('/api'.length)}`;
  }
  return url;
}

export default async function handler(request, response) {
  try {
    const init = {
      method: request.method,
      headers: webHeaders(request.headers),
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = request;
      init.duplex = 'half';
    }
    const webRequest = new Request(routeUrl(request), init);
    const webResponse = await handle({ request: webRequest });
    response.statusCode = webResponse.status;
    for (const [key, value] of webResponse.headers) response.setHeader(key, value);
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch {
    response.statusCode = 500;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: 'server_error' }));
  }
}
