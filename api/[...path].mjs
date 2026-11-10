import { createNeonDatabase } from '../functions/neon.mjs';
import { application } from '../functions/routes.mjs';

const handle = application({ db: createNeonDatabase() });

function routeUrl(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    url.pathname = `/functions/v1/app${url.pathname.slice('/api'.length)}`;
  }
  return url;
}

export default {
  async fetch(request) {
    try {
      const webRequest = new Request(routeUrl(request), request);
      return await handle({ request: webRequest });
    } catch {
      return Response.json({ error: 'server_error' }, { status: 500 });
    }
  },
};