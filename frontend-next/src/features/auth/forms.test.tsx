import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

type Reply = { status: number; body: unknown };
let replies: Record<string, Reply>;
let calls: { url: string; body: unknown }[];

beforeEach(() => {
  router.replace.mockClear();
  router.refresh.mockClear();
  replies = {};
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const path = url.split('?')[0] ?? url;
      calls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      const reply = replies[path] ?? { status: 200, body: { available: true, message: null } };
      return Promise.resolve(Response.json(reply.body, { status: reply.status }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const leave = (label: string) => fireEvent.blur(screen.getByLabelText(label));
const user = { id: 'u1', email: 'kim@example.com', nickname: '김당근', avatarUrl: null, createdAt: '2026-11-10T00:00:00.000Z' };

describe('가입 폼', () => {
  const renderForm = () =>
    render(
      <ToastProvider>
        <SignupForm next="/products/new" />
      </ToastProvider>,
    );

  it('[AC-SU-19] 약관 체크박스는 없고 버튼 아래 안내 한 줄만 있다', () => {
    renderForm();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('가입하면 서비스 이용 안내에 동의한 것으로 봅니다.')).toBeTruthy();
  });

  it('[AC-SU-06a, 11, 12] 칸마다 알맞은 입력 속성이 있고 규칙 안내가 처음부터 연결돼 있다', () => {
    renderForm();
    const email = screen.getByLabelText('이메일');
    expect(email).toHaveProperty('type', 'email');
    expect(email.getAttribute('inputmode')).toBe('email');
    expect(email.getAttribute('autocapitalize')).toBe('off');
    expect(email.getAttribute('maxlength')).toBe('254');
    const password = screen.getByLabelText('비밀번호');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
    const hintId = password.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(hintId)?.textContent).toContain('8자 이상');
    expect(password.getAttribute('aria-invalid')).toBeNull();
  });

  it('[AC-SU-11] 비밀번호 보기 토글은 aria-pressed를 갖는다', () => {
    renderForm();
    const toggle = screen.getAllByRole('button', { name: '비밀번호 보기' })[0] as HTMLElement;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('비밀번호')).toHaveProperty('type', 'text');
  });

  it('[AC-SU-03, AC-CM-62] 칸을 떠날 때 정규화한 값을 칸에 넣고 검증하며, 오류가 있던 칸은 입력마다 다시 검증한다', () => {
    renderForm();
    type('이메일', '  KIM@Example.com ');
    // 입력 중에는 판단하지 않는다
    expect(screen.queryByText('이메일 형식이 아니에요')).toBeNull();
    leave('이메일');
    expect(screen.getByLabelText('이메일')).toHaveProperty('value', 'kim@example.com');

    type('비밀번호', 'short');
    expect(screen.queryByText('8자 이상 입력해 주세요')).toBeNull();
    leave('비밀번호');
    const password = screen.getByLabelText('비밀번호');
    expect(screen.getByText('8자 이상 입력해 주세요')).toBeDefined();
    expect(password.getAttribute('aria-invalid')).toBe('true');
    expect(password.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);

    type('비밀번호', 'long enough');
    expect(screen.queryByText('8자 이상 입력해 주세요')).toBeNull();
  });

  it('[AC-SU-10] 원본 비밀번호를 고치면 확인 칸도 다시 검증된다', () => {
    renderForm();
    type('비밀번호', 'correct horse');
    type('비밀번호 확인', 'correct hors');
    leave('비밀번호 확인');
    expect(screen.getByText('비밀번호가 일치하지 않아요')).toBeDefined();
    type('비밀번호', 'correct hors');
    expect(screen.queryByText('비밀번호가 일치하지 않아요')).toBeNull();
  });

  it('[AC-SU-04, 17] 제출하면 틀린 칸 전부와 상단 요약을 보여주고 첫 오류로 포커스하며 서버를 부르지 않는다', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
    expect(screen.getByText('입력 내용 3곳을 확인해 주세요').closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByText('이메일을 입력해 주세요')).toBeDefined();
    expect(screen.getByText('닉네임을 입력해 주세요')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText('이메일'));
    expect(calls).toHaveLength(0);
  });

  it('[AC-SU-08] 칸을 떠나면 중복을 미리 알리고 [로그인하기]를 보여준다', async () => {
    replies['/api/auth/email-available'] = { status: 200, body: { available: false, message: '이미 가입된 이메일이에요' } };
    renderForm();
    type('이메일', 'kim@example.com');
    leave('이메일');
    expect(await screen.findByText(/이미 가입된 이메일이에요/)).toBeDefined();
    expect(screen.getByRole('link', { name: '로그인하기' }).getAttribute('href')).toBe('/login?next=%2Fproducts%2Fnew');
    expect(calls[0]?.url).toBe('/api/auth/email-available?email=kim%40example.com');
  });

  it('[AC-SU-08] 중복 확인이 실패하면 조용히 넘어간다', async () => {
    replies['/api/auth/nickname-available'] = { status: 500, body: { error: { code: 'INTERNAL', message: 'x', fields: null } } };
    renderForm();
    type('닉네임', '김당근');
    leave('닉네임');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByText(/닉네임이에요/)).toBeNull();
    expect(screen.getByLabelText('닉네임').getAttribute('aria-invalid')).toBeNull();
  });

  function fillValid() {
    type('이메일', 'kim@example.com');
    type('비밀번호', 'correct horse');
    type('비밀번호 확인', 'correct horse');
    type('닉네임', '김당근');
  }

  it('[AC-SU-01, 22] 성공하면 환영 토스트를 띄우고 next로 replace한다', async () => {
    replies['/api/auth/signup'] = { status: 201, body: { user } };
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/products/new'));
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('환영해요, 김당근님');
    expect(calls.at(-1)?.body).toEqual({
      email: 'kim@example.com',
      password: 'correct horse',
      passwordConfirm: 'correct horse',
      nickname: '김당근',
    });
  });

  it('[AC-SU-21] 끊겨서 실패한 뒤 다시 보냈는데 이미 가입돼 있으면 로그인하라고 안내를 바꾼다', async () => {
    renderForm();
    fillValid();
    // 첫 요청은 서버에 닿았지만 응답을 받지 못했다
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
    expect(await screen.findByText('인터넷 연결을 확인하고 다시 시도해 주세요')).toBeDefined();

    const taken = { error: { code: 'EMAIL_TAKEN', message: '이미 가입된 이메일이에요', fields: { email: '이미 가입된 이메일이에요' } } };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json(taken, { status: 409 }))));
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
    expect(await screen.findByText(/이미 가입됐어요\. 로그인해 주세요/)).toBeDefined();
    expect(screen.queryByText('이미 가입된 이메일이에요')).toBeNull();
  });

  it('[AC-SU-18] 서버가 돌려준 fields를 그대로 칸에 보여주고 그 칸으로 포커스한다', async () => {
    replies['/api/auth/signup'] = {
      status: 409,
      body: { error: { code: 'NICKNAME_TAKEN', message: '이미 사용 중인 닉네임이에요', fields: { nickname: '이미 사용 중인 닉네임이에요' } } },
    };
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
    expect(await screen.findByText('이미 사용 중인 닉네임이에요')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText('닉네임'));
    // 입력값은 그대로 남는다 [AC-CM-22]
    expect(screen.getByLabelText('이메일')).toHaveProperty('value', 'kim@example.com');
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('로그인 폼', () => {
  const renderForm = (demoPassword: string | null = null) => render(<LoginForm next="/" demoPassword={demoPassword} />);

  it('[AC-LI-05, 05c] 형식 오류는 서버를 부르기 전에 막고, 비밀번호 칸은 current-password다', () => {
    renderForm();
    expect(screen.getByLabelText('비밀번호').getAttribute('autocomplete')).toBe('current-password');
    type('이메일', 'not-an-email');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getByText('이메일 형식이 아니에요')).toBeDefined();
    expect(calls).toHaveLength(0);
  });

  it('[AC-LI-06, 07] 실패하면 문구를 role="alert"로 알리고 비밀번호만 비운 뒤 그 칸으로 포커스한다', async () => {
    replies['/api/auth/login'] = {
      status: 401,
      body: { error: { code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 맞지 않아요', fields: null } },
    };
    renderForm();
    type('이메일', 'kim@example.com');
    type('비밀번호', 'wrong password');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    const alert = await screen.findByText('이메일 또는 비밀번호가 맞지 않아요');
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByLabelText('비밀번호')).toHaveProperty('value', '');
    expect(screen.getByLabelText('이메일')).toHaveProperty('value', 'kim@example.com');
    expect(document.activeElement).toBe(screen.getByLabelText('비밀번호'));
  });

  it('[AC-LI-01, 09] 성공하면 토스트 없이 next로 replace한다', async () => {
    replies['/api/auth/login'] = { status: 200, body: { user } };
    renderForm();
    type('이메일', ' KIM@example.com');
    type('비밀번호', 'correct horse');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(calls.at(-1)?.body).toEqual({ email: 'kim@example.com', password: 'correct horse' });
  });

  it('[AC-LI-19] 데모 계정 두 개의 안내가 있고, [구매자로 둘러보기]를 한 번 누르면 그 계정으로 바로 로그인한다', async () => {
    replies['/api/auth/login'] = { status: 200, body: { user } };
    renderForm('demo password 1');
    expect(screen.getByRole('heading', { name: '가입 없이 둘러보기' })).toBeDefined();
    expect(screen.getByText(/여러 사람이 함께 쓰는 계정이에요. 개인정보를 적지 마세요. 매일 새벽에 초기화돼요/)).toBeDefined();
    expect(screen.getByRole('button', { name: '판매자로 둘러보기' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '구매자로 둘러보기' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(calls.at(-1)).toMatchObject({ url: '/api/auth/login', body: { email: 'demo2@neighbo.app', password: 'demo password 1' } });
    // 무엇을 보냈는지 칸에도 남는다
    expect(screen.getByLabelText('이메일')).toHaveProperty('value', 'demo2@neighbo.app');
  });

  it('[AC-LI-19] 데모 로그인이 실패하면 폼 위에 이유를 보인다', async () => {
    replies['/api/auth/login'] = { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 맞지 않아요', fields: null } } };
    renderForm('demo password 1');
    fireEvent.click(screen.getByRole('button', { name: '판매자로 둘러보기' }));
    expect(await screen.findByText('이메일 또는 비밀번호가 맞지 않아요')).toBeDefined();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('[AC-LI-19] 데모 비밀번호가 설정되지 않은 환경에서는 안내를 숨긴다', () => {
    renderForm(null);
    expect(screen.queryByRole('heading', { name: '가입 없이 둘러보기' })).toBeNull();
  });

  it('[AC-LI-16] 끊겨서 실패하면 비밀번호를 유지한다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    renderForm();
    type('이메일', 'kim@example.com');
    type('비밀번호', 'correct horse');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByText('인터넷 연결을 확인하고 다시 시도해 주세요')).toBeDefined();
    expect(screen.getByLabelText('비밀번호')).toHaveProperty('value', 'correct horse');
  });
});
