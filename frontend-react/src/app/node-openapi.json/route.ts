import { ConfigError, getServerConfig } from '@/lib/config';
import { proxyOpenApiDocument } from '@/lib/api/docsProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(request: Request) {
  try {
    return await proxyOpenApiDocument(request, getServerConfig());
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(JSON.stringify({ lvl: 'error', msg: 'boot', problems: err.problems }));
    }
    throw err;
  }
}

export { handler as GET, handler as HEAD };
