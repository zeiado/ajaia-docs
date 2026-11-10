import { createNeonDatabase } from '../functions/neon.mjs';
import { application } from '../functions/routes.mjs';

const handle = application({ db: createNeonDatabase() });

function routeUrl(request) {
  const url = new URL(request.url);
  const forwardedPath = url.searchParams.get('path');
  if (forwardedPath) {
    const forwarded = new URL(forwardedPath, url.origin);
    url.pathname = forwarded.pathname;
    url.search = forwarded.search;
  } else if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    url.pathname = `/functions/v1/app${url.pathname.slice('/api'.length)}`;
  }
  return url;
}

export default {
  async fetch(request) {
    try {
      return await handle({ request: new Request(routeUrl(request), request) });
    } catch {
      return Response.json({ error: 'server_error' }, { status: 500 });
    }
  },
};