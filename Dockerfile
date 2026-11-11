# 백엔드(backend-node) 실행 이미지 — Railway가 이 파일로 빌드한다
# 저장소 루트에서 빌드해야 workspaces의 shared-schema가 함께 들어간다
FROM node:22-slim

# Prisma 스키마 엔진(마이그레이션)이 OpenSSL을 쓴다
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 층을 먼저 만들어 소스만 바뀐 빌드에서 재사용한다
# frontend-next/package.json은 lockfile 검증에만 쓰이고, 프론트엔드 의존성은 설치하지 않는다
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared-schema/package.json shared-schema/
COPY backend-node/package.json backend-node/
COPY frontend-next/package.json frontend-next/
RUN npm ci --workspace backend-node --workspace shared-schema

COPY shared-schema shared-schema
COPY backend-node backend-node
RUN npm run db:generate --workspace backend-node \
  && chown -R node:node /app/backend-node

ENV NODE_ENV=production
USER node

WORKDIR /app/backend-node

# 마이그레이션이 성공해야 서버가 뜬다. 실패하면 컨테이너가 종료되어 배포가 중단된다
# 서버는 exec로 띄워 SIGTERM을 직접 받게 한다 — npm · sh를 거치면 종료 신호가 닿지 않아
# 진행 중인 요청을 끝내는 종료 처리(server.ts)가 돌지 않는다
# 시드는 DEMO_PASSWORD가 있을 때만 데모 계정 · 데모 상품을 맞춰 놓는다 (몇 번을 돌려도 같은 결과)
# SEED_SAMPLE=1이면 샘플 데이터도 넣는다
CMD ["sh", "-c", "npx prisma migrate deploy && node --import tsx src/seed/run.ts && exec node --import tsx src/server.ts"]
