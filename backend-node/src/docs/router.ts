import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Router, type RequestHandler } from 'express';
import { openapi } from './openapi.js';

const require = createRequire(import.meta.url);
const assets = dirname(require.resolve('swagger-ui-dist/package.json'));

export const DOCS_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export const swaggerInit = `window.addEventListener('DOMContentLoaded', function () {
  SwaggerUIBundle({
    url: '/node-openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    filter: true,
    docExpansion: 'none',
    supportedSubmitMethods: [],
    tryItOutEnabled: false,
    validatorUrl: null,
    queryConfigEnabled: false,
    persistAuthorization: false,
    withCredentials: false,
    requestInterceptor: function (request) {
      var target = new URL(request.url, window.location.origin);
      if (target.origin !== window.location.origin || target.pathname !== '/node-openapi.json') {
        throw new Error('읽기 전용 API 문서입니다.');
      }
      request.credentials = 'omit';
      return request;
    }
  });
});`;

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>neighbo · Node.js API · Swagger</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/node-swagger/assets/swagger-ui.css"></head>
<body><header><h1>neighbo · Node.js API</h1><p>Express·TypeScript API 계약을 확인하는 읽기 전용 문서입니다. 요청 실행과 인증 정보 저장은 제공하지 않습니다.</p><a href="/node-openapi.json">OpenAPI JSON</a></header><main id="swagger-ui"></main><script src="/node-swagger/assets/swagger-ui-bundle.js" defer></script><script src="/node-swagger/assets/init.js" defer></script></body></html>`;

const docsHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', DOCS_CSP);
  next();
};

// 정해진 GET 자원만 공개한다. 패키지 디렉터리 전체나 임의 파일 경로를 노출하지 않는다.
export function createDocsRouter(): Router {
  const router = Router();
  router.get(['/node-swagger', '/node-swagger/'], docsHeaders, (_req, res) => res.type('html').send(html));
  router.get('/node-openapi.json', docsHeaders, (_req, res) => res.json(openapi));
  router.get('/node-swagger/assets/init.js', docsHeaders, (_req, res) => res.type('js').send(swaggerInit));
  for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) {
    router.get(`/node-swagger/assets/${file}`, docsHeaders, (_req, res) => res.sendFile(join(assets, file)));
  }
  return router;
}
