import { createDatabaseClient, createSiteContext, errorResponse } from './_qoder/backend.mjs';
import { application } from './routes.mjs';

// forwardApplicationCredentials keeps this app's own session cookie; identity
// is fully application-owned (seeded demo accounts), never platform identity.
const handle = application({ db: createDatabaseClient() });

Deno.serve(async request => {
  let context;
  try {
    context = createSiteContext(request, { forwardApplicationCredentials: true });
    return await handle(context);
  } catch (error) {
    return errorResponse(error, context?.requestId);
  }
});