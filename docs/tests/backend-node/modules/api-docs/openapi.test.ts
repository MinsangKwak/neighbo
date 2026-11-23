import { readFileSync } from 'node:fs';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3_1 } from 'openapi-types';
import { describe, expect, it } from 'vitest';
import { openapi } from '../../../../../backend-node/src/modules/api-docs/openapi.js';

describe('현재 HTTP API 계약', () => {
  it('외부 파일·네트워크 참조 없이 OpenAPI 3.1을 검증한다', async () => {
    const document = structuredClone(openapi) as unknown as OpenAPIV3_1.Document;
    const validated = await SwaggerParser.validate(document, { resolve: { file: false, http: false } });
    expect(validated).toHaveProperty('openapi', '3.1.0');
  });

  it('각 기능의 실제 Express 경로·메서드와 문서가 일치한다', () => {
    const mounts = [
      ['auth', '/auth'], ['products', '/products'], ['me', '/me'],
      ['chat', '/chat-rooms'], ['users', '/users'], ['uploads', '/uploads'],
    ];
    const routes = ['get /healthz', 'get /readyz'];
    for (const [module, mount] of mounts) {
      const source = readFileSync(new URL(`../../../../../backend-node/src/modules/${module}/route.ts`, import.meta.url), 'utf8');
      for (const match of source.matchAll(/router\.(get|post|patch|put|delete)\('([^']+)'/g)) {
        const path = `${mount}${match[2] === '/' ? '' : match[2]}`.replace(/:([A-Za-z]+)/g, '{$1}');
        routes.push(`${match[1]} ${path}`);
      }
    }
    const documented = Object.entries(openapi.paths).flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method} ${path}`));
    expect(documented.sort()).toEqual(routes.sort());
    expect(new Set(Object.values(openapi.paths).flatMap((methods) => Object.values(methods).map((value) => value.operationId))).size).toBe(routes.length);
  });

  it('공유 입력·응답 구조와 성공 상태를 엔드포인트별로 설명한다', () => {
    const schemas = openapi.components.schemas;
    expect(schemas.CreateProduct?.properties).toHaveProperty('imageIds');
    expect(schemas.ProductDetailResponse?.properties).toHaveProperty('viewer');
    expect(schemas.UserProfileResponse?.properties).not.toHaveProperty('email');
    expect(schemas.Signup?.properties).toMatchObject({ password: { format: 'password', writeOnly: true } });
    expect(openapi.paths['/products'].post.responses).toHaveProperty('201');
    expect(openapi.paths['/products'].post.responses).toHaveProperty('200');
    expect(openapi.paths['/auth/logout'].post.responses['204']).not.toHaveProperty('content');
    expect(openapi.paths['/uploads'].post.requestBody.content).toHaveProperty('multipart/form-data');
    expect(openapi.components.securitySchemes.SessionCookie.name).toBe('nb_session');
    expect(openapi.servers).toEqual([{ url: '/', description: 'Node.js API 직접 주소' }]);
  });
});
