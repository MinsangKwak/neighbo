import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'next-env.d.ts', 'test-results/**', 'playwright-report/**'] },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 환경 변수는 lib/config.ts가 검증한 값만 쓴다 (backend.md 11절)
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'process.env 대신 검증된 config를 쓴다.' },
      ],
      // 디자인 토큰 밖의 임의 값(w-[137px])을 막는다 (frontend.md 09절 2)
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/\\[[^\\]]+\\]/]",
          message: 'Tailwind 임의 값 대신 디자인 토큰을 쓴다.',
        },
        // 사용자 입력은 React가 이스케이프하게 둔다 [AC-CM-30]
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML을 쓰지 않는다.',
        },
        // 이동은 <a>, 동작은 <button> — 누를 수 없는 요소에 클릭을 달면 키보드로 닿지 않는다 [AC-CM-47]
        {
          selector: "JSXOpeningElement[name.name=/^(div|span|li|p|section|img)$/] > JSXAttribute[name.name='onClick']",
          message: '클릭은 <button>이나 <a>에 단다.',
        },
        // 타임아웃 없는 emit은 끊긴 동안 버퍼에 남았다가 재연결 뒤 몰래 전송된다 [AC-CH-37]
        {
          selector: "CallExpression[callee.property.name='emit']",
          message: '소켓 전송은 lib/socket/chatSocket.ts를 거친다.',
        },
      ],
    },
  },
  {
    // 소켓에 직접 쓰는 곳은 이 파일 하나다 (테스트의 가짜 소켓 포함)
    files: ['src/lib/socket/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/\\[[^\\]]+\\]/]",
          message: 'Tailwind 임의 값 대신 디자인 토큰을 쓴다.',
        },
        // 사용자 입력은 React가 이스케이프하게 둔다 [AC-CM-30]
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML을 쓰지 않는다.',
        },
        // 이동은 <a>, 동작은 <button> — 누를 수 없는 요소에 클릭을 달면 키보드로 닿지 않는다 [AC-CM-47]
        {
          selector: "JSXOpeningElement[name.name=/^(div|span|li|p|section|img)$/] > JSXAttribute[name.name='onClick']",
          message: '클릭은 <button>이나 <a>에 단다.',
        },
      ],
    },
  },
  {
    // 테스트 실행기 설정은 앱이 뜨기 전에 돈다 — 검증된 config가 아직 없다
    files: ['playwright.config.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
];

export default config;
