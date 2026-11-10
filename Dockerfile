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

# 마이그레이션이 성공해야 서버가 뜬다. 실패하면 컨테이너가 종료되어 배포가 중단된다
CMD ["sh", "-c", "npm run db:deploy --workspace backend-node && npm run start --workspace backend-node"]
