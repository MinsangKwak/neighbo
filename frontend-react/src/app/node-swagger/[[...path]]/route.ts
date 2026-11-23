import { ConfigError, getServerConfig } from '@/lib/config';
import { proxySwaggerDocument } from '@/lib/api/docsProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  try {
    return await proxySwaggerDocument(request, path, getServerConfig());
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(JSON.stringify({ lvl: 'error', msg: 'boot', problems: err.problems }));
    }
    throw err;
  }
}

export { handler as GET, handler as HEAD };
