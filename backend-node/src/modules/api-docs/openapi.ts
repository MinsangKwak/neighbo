import { z } from 'zod';
import * as contracts from '@neighbo/shared-schema';

// 실행 라우트가 사용하는 공유 Zod 입력과 응답 계약을 문서에도 사용한다.
const inputs = {
  Signup: contracts.signupSchema,
  Login: contracts.loginSchema,
  EmailAvailableQuery: contracts.emailAvailableQuerySchema,
  NicknameAvailableQuery: contracts.nicknameAvailableQuerySchema,
  CreateProduct: contracts.createProductSchema,
  UpdateProduct: contracts.updateProductSchema,
  ChangeStatus: contracts.changeStatusSchema,
  ProductsQuery: contracts.listProductsQuerySchema,
  UpdateMe: contracts.updateMeSchema,
  ChangePassword: contracts.changePasswordSchema,
  MyProductsQuery: contracts.myProductsQuerySchema,
  FavoritesQuery: contracts.favoritesQuerySchema,
  PurchasesQuery: contracts.purchasesQuerySchema,
  OpenChatRoom: contracts.openChatRoomSchema,
  ChatRoomsQuery: contracts.listChatRoomsQuerySchema,
  MessagesQuery: contracts.listMessagesQuerySchema,
  ReadMessages: contracts.readSchema,
};

const outputs = {
  AuthResponse: contracts.authResponseSchema,
  AvailabilityResponse: contracts.availabilityResponseSchema,
  SocketTokenResponse: contracts.socketTokenResponseSchema,
  ProductResponse: contracts.productResponseSchema,
  ProductDetailResponse: contracts.productDetailResponseSchema,
  ProductPage: contracts.productPageSchema,
  FavoriteResponse: contracts.favoriteResponseSchema,
  ChatPartnersResponse: contracts.chatPartnersResponseSchema,
  MeResponse: contracts.meResponseSchema,
  MyProductPage: contracts.myProductPageSchema,
  PurchasePage: contracts.purchasePageSchema,
  UnreadResponse: contracts.unreadResponseSchema,
  ChatRoomResponse: contracts.chatRoomResponseSchema,
  ChatRoomPage: contracts.chatRoomPageSchema,
  MessagePage: contracts.messagePageSchema,
  ReadResponse: contracts.readResponseSchema,
  UserProfileResponse: contracts.userProfileResponseSchema,
  UploadResponse: contracts.uploadResponseSchema,
  ApiError: contracts.errorResponseSchema,
};

type InputName = keyof typeof inputs;
type OutputName = keyof typeof outputs;
type JsonSchema = Record<string, unknown>;

function schemaOf(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { io }) as JsonSchema;
  delete json.$schema;
  return json;
}

const schemas: Record<string, JsonSchema> = {
  ...Object.fromEntries(Object.entries(inputs).map(([name, schema]) => [name, schemaOf(schema, 'input')])),
  ...Object.fromEntries(Object.entries(outputs).map(([name, schema]) => [name, schemaOf(schema, 'output')])),
  Health: schemaOf(z.object({ status: z.literal('ok') }), 'output'),
  Ready: schemaOf(z.object({ status: z.literal('ready') }), 'output'),
};

// 실제 비밀번호나 인증 토큰 예시를 만들거나 문서에 주입하지 않는다.
for (const name of ['Signup', 'Login', 'ChangePassword']) {
  const properties = schemas[name]?.properties as Record<string, JsonSchema> | undefined;
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (/password/i.test(key)) Object.assign(value, { format: 'password', writeOnly: true });
  }
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const content = (name: string) => ({ 'application/json': { schema: ref(name) } });

function query(name: InputName) {
  const schema = schemas[name];
  const required = (schema?.required ?? []) as string[];
  return Object.entries((schema?.properties ?? {}) as Record<string, JsonSchema>).map(([key, value]) => ({
    name: key,
    in: 'query',
    required: required.includes(key),
    schema: value,
  }));
}

interface Operation {
  id: string;
  tag: string;
  summary: string;
  response?: OutputName | 'Health' | 'Ready';
  statuses?: number[];
  auth?: boolean;
  body?: InputName;
  query?: InputName;
  idParam?: boolean;
  errors?: number[];
  description?: string;
}

function operation(input: Operation) {
  const responses: Record<string, unknown> = {};
  for (const status of input.statuses ?? [200]) {
    responses[status] = {
      description: status === 204 ? '본문 없는 성공 응답' : '성공 응답',
      ...(input.response === undefined ? {} : { content: content(input.response) }),
    };
  }
  for (const status of new Set([...(input.errors ?? []), ...(input.auth ? [401] : []), 500])) {
    responses[status] = { description: '공통 오류 응답', content: content('ApiError') };
  }
  const parameters: unknown[] = input.query === undefined ? [] : query(input.query);
  if (input.idParam) parameters.unshift({ name: 'id', in: 'path', required: true, schema: { type: 'string' } });
  return {
    operationId: input.id,
    tags: [input.tag],
    summary: input.summary,
    ...(input.description === undefined ? {} : { description: input.description }),
    security: input.auth ? [{ SessionCookie: [] }] : [],
    ...(parameters.length === 0 ? {} : { parameters }),
    ...(input.body === undefined ? {} : { requestBody: { required: true, content: content(input.body) } }),
    responses,
  };
}

// 정적 계약은 입력 형태를 설명하며 정규화·교차 필드 검증·권한 판단은 서버가 수행한다.
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'neighbo · Node.js API',
    version: '0.0.0',
    description: 'Express·TypeScript HTTP API의 현재 계약입니다. 화면은 읽기 전용이며 요청 실행·인증 저장을 제공하지 않습니다. 정규화·문자 단위 제약·교차 필드 검증은 공유 Zod와 서버 코드가 최종 기준입니다. Socket.IO 이벤트와 정적 파일은 HTTP API 목록에 포함하지 않습니다.',
  },
  servers: [{ url: '/', description: 'Node.js API 직접 주소' }],
  tags: ['상태', '계정', '상품', '내 정보', '채팅', '사용자', '사진'].map((name) => ({ name })),
  components: {
    securitySchemes: { SessionCookie: { type: 'apiKey', in: 'cookie', name: contracts.SESSION_COOKIE, description: 'HTTP-only 세션 쿠키. 문서 화면에서는 로그인하거나 쿠키를 설정하지 않습니다.' } },
    schemas,
  },
  paths: {
    '/healthz': { get: operation({ id: 'health', tag: '상태', summary: '프로세스 상태', response: 'Health' }) },
    '/readyz': { get: operation({ id: 'ready', tag: '상태', summary: 'DB 연결 상태', response: 'Ready' }) },
    '/auth/signup': { post: operation({ id: 'signup', tag: '계정', summary: '회원가입', body: 'Signup', response: 'AuthResponse', statuses: [201], errors: [400, 403, 409, 429] }) },
    '/auth/login': { post: operation({ id: 'login', tag: '계정', summary: '로그인', body: 'Login', response: 'AuthResponse', errors: [400, 401, 403, 429] }) },
    '/auth/logout': { post: operation({ id: 'logout', tag: '계정', summary: '현재 브라우저 로그아웃', statuses: [204], errors: [403] }) },
    '/auth/email-available': { get: operation({ id: 'emailAvailable', tag: '계정', summary: '이메일 사용 가능 여부', query: 'EmailAvailableQuery', response: 'AvailabilityResponse', errors: [400, 429] }) },
    '/auth/nickname-available': { get: operation({ id: 'nicknameAvailable', tag: '계정', summary: '닉네임 사용 가능 여부', query: 'NicknameAvailableQuery', response: 'AvailabilityResponse', errors: [400, 429] }) },
    '/auth/socket-token': { get: operation({ id: 'socketToken', tag: '계정', summary: '60초 소켓 연결 전용 토큰', auth: true, response: 'SocketTokenResponse' }) },
    '/products': {
      get: operation({ id: 'products', tag: '상품', summary: '상품 목록·검색·동네 필터', query: 'ProductsQuery', response: 'ProductPage', errors: [400] }),
      post: operation({ id: 'createProduct', tag: '상품', summary: '상품 등록', auth: true, body: 'CreateProduct', response: 'ProductResponse', statuses: [201, 200], errors: [400, 403, 409, 429], description: '새 상품은 201, 같은 멱등키의 기존 상품은 200입니다.' }),
    },
    '/products/{id}': {
      get: operation({ id: 'product', tag: '상품', summary: '상품 상세·조회자 권한', idParam: true, response: 'ProductDetailResponse', errors: [404], description: '로그인은 선택입니다. 조회자별 viewer가 달라 응답을 캐시하지 않습니다.' }),
      patch: operation({ id: 'updateProduct', tag: '상품', summary: '내 상품 수정', auth: true, idParam: true, body: 'UpdateProduct', response: 'ProductResponse', errors: [400, 403, 404, 409, 429] }),
      delete: operation({ id: 'deleteProduct', tag: '상품', summary: '내 상품 삭제', auth: true, idParam: true, statuses: [204], errors: [403, 404, 429] }),
    },
    '/products/{id}/status': { patch: operation({ id: 'changeStatus', tag: '상품', summary: '거래 상태·구매자 변경', auth: true, idParam: true, body: 'ChangeStatus', response: 'ProductResponse', errors: [400, 403, 404, 409, 429] }) },
    '/products/{id}/favorite': {
      put: operation({ id: 'favorite', tag: '상품', summary: '관심 등록', auth: true, idParam: true, response: 'FavoriteResponse', errors: [403, 404, 429] }),
      delete: operation({ id: 'unfavorite', tag: '상품', summary: '관심 해제', auth: true, idParam: true, response: 'FavoriteResponse', errors: [403, 404, 429] }),
    },
    '/products/{id}/chat-partners': { get: operation({ id: 'chatPartners', tag: '상품', summary: '판매자의 구매자 지정 후보', auth: true, idParam: true, response: 'ChatPartnersResponse', errors: [403, 404] }) },
    '/me': {
      get: operation({ id: 'me', tag: '내 정보', summary: '내 정보·거래 개수', auth: true, response: 'MeResponse' }),
      patch: operation({ id: 'updateMe', tag: '내 정보', summary: '닉네임·사진·동네 변경', auth: true, body: 'UpdateMe', response: 'AuthResponse', errors: [400, 403, 409, 429] }),
    },
    '/me/password': { patch: operation({ id: 'changePassword', tag: '내 정보', summary: '비밀번호 변경·다른 세션 무효화', auth: true, body: 'ChangePassword', statuses: [204], errors: [400, 403, 429] }) },
    '/me/products': { get: operation({ id: 'myProducts', tag: '내 정보', summary: '내 판매 목록', auth: true, query: 'MyProductsQuery', response: 'MyProductPage', errors: [400] }) },
    '/me/favorites': { get: operation({ id: 'myFavorites', tag: '내 정보', summary: '내 관심 목록', auth: true, query: 'FavoritesQuery', response: 'ProductPage', errors: [400] }) },
    '/me/purchases': { get: operation({ id: 'myPurchases', tag: '내 정보', summary: '내 구매 내역', auth: true, query: 'PurchasesQuery', response: 'PurchasePage', errors: [400] }) },
    '/me/unread': { get: operation({ id: 'unread', tag: '내 정보', summary: '읽지 않은 채팅방 수', auth: true, response: 'UnreadResponse', errors: [429] }) },
    '/chat-rooms': {
      get: operation({ id: 'chatRooms', tag: '채팅', summary: '내 채팅방 목록', auth: true, query: 'ChatRoomsQuery', response: 'ChatRoomPage', errors: [400] }),
      post: operation({ id: 'openChatRoom', tag: '채팅', summary: '상품의 채팅방 열기', auth: true, body: 'OpenChatRoom', response: 'ChatRoomResponse', statuses: [201, 200], errors: [400, 403, 404, 409, 429] }),
    },
    '/chat-rooms/{id}': { get: operation({ id: 'chatRoom', tag: '채팅', summary: '참여 중인 채팅방 상세', auth: true, idParam: true, response: 'ChatRoomResponse', errors: [404] }) },
    '/chat-rooms/{id}/messages': { get: operation({ id: 'messages', tag: '채팅', summary: '방의 과거 메시지', auth: true, idParam: true, query: 'MessagesQuery', response: 'MessagePage', errors: [400, 404] }) },
    '/chat-rooms/{id}/read': { post: operation({ id: 'readMessages', tag: '채팅', summary: '마지막으로 읽은 방별 번호', auth: true, idParam: true, body: 'ReadMessages', response: 'ReadResponse', errors: [400, 403, 404, 429] }) },
    '/users/{id}': { get: operation({ id: 'userProfile', tag: '사용자', summary: '판매자 공개 프로필', idParam: true, response: 'UserProfileResponse', errors: [404] }) },
    '/uploads': {
      post: {
        ...operation({ id: 'upload', tag: '사진', summary: '사진 한 장 업로드', auth: true, response: 'UploadResponse', statuses: [201], errors: [400, 403, 413, 429] }),
        parameters: [{ name: 'kind', in: 'query', required: true, schema: { type: 'string', enum: ['PRODUCT', 'AVATAR'] } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary', description: '4MB 이하 jpg·png·webp 한 장. 서버가 형식·픽셀 수를 확인하고 WebP로 다시 인코딩합니다.' } }, required: ['file'] } } } },
      },
    },
  },
};
