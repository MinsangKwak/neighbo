import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createDocsRouter, DOCS_CSP, swaggerInit } from '../../../../../backend-node/src/modules/api-docs/router.js';

const app = express().disable('x-powered-by').use(createDocsRouter());

describe('공개 읽기 전용 Node Swagger', () => {
  it.each(['/node-swagger', '/node-swagger/'])('인증 없이 %s를 열되 쿠키·요청 비밀을 반사하지 않는다', async (path) => {
    const response = await request(app).get(path).set('Cookie', 'nb_session=private-value').set('X-Proxy-Secret', 'proxy-private').expect(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('Node.js API');
    expect(response.text).not.toMatch(/private-value|proxy-private/);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toBe(DOCS_CSP);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toContain("script-src 'self';");
  });

  it('JSON은 실제 계약이며 HEAD는 본문을 반환하지 않는다', async () => {
    const response = await request(app).get('/node-openapi.json').expect(200);
    expect(response.type).toBe('application/json');
    expect(response.body.info.title).toBe('neighbo · Node.js API');
    expect(response.body.paths['/products/{id}'].patch.operationId).toBe('updateProduct');
    const head = await request(app).head('/node-openapi.json').expect(200);
    expect(head.text).toBeUndefined();
  });

  it.each([
    ['swagger-ui.css', 'text/css'],
    ['swagger-ui-bundle.js', 'text/javascript'],
    ['init.js', 'text/javascript'],
  ])('고정된 자체 호스팅 자원 %s만 제공한다', async (file, type) => {
    const response = await request(app).get(`/node-swagger/assets/${file}`).expect(200);
    expect(response.type).toBe(type);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('패키지 파일·임의 경로와 쓰기 요청을 노출하지 않는다', async () => {
    await request(app).get('/node-swagger/assets/package.json').expect(404);
    await request(app).get('/node-swagger/other.js').expect(404);
    await request(app).post('/node-openapi.json').expect(404);
    await request(app).post('/node-swagger').expect(404);
  });

  it('요청 실행·외부 검증·쿼리 설정·인증 저장을 끄고 스키마만 가져온다', () => {
    expect(swaggerInit).toContain('supportedSubmitMethods: []');
    expect(swaggerInit).toContain('tryItOutEnabled: false');
    expect(swaggerInit).toContain('validatorUrl: null');
    expect(swaggerInit).toContain('queryConfigEnabled: false');
    expect(swaggerInit).toContain('persistAuthorization: false');
    expect(swaggerInit).toContain('withCredentials: false');
    expect(swaggerInit).toContain("target.pathname !== '/node-openapi.json'");
    expect(swaggerInit).toContain("request.credentials = 'omit'");
  });
});
