import { ConfigError, getServerConfig } from '@/lib/config';
import { proxyToBackend } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  try {
    return await proxyToBackend(request, path, getServerConfig());
  } catch (err) {
    if (err instanceof ConfigError) {
      // 이름과 이유만 남긴다 — 값은 찍지 않는다
      console.error(JSON.stringify({ lvl: 'error', msg: 'boot', problems: err.problems }));
    }
    throw err;
  }
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
