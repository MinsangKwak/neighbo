import { describe, expect, it } from 'vitest';
import {
  listChatRoomsQuerySchema,
  listMessagesQuerySchema,
  messageSendSchema,
  readSchema,
  roomJoinSchema,
} from './chat';
import { utf8ByteLength } from './normalize';

const send = (content: unknown) => messageSendSchema.safeParse({ roomId: 'room1', tempId: 't1', content });

describe('메시지 전송 스키마', () => {
  it('[AC-CH-13] 빈 · 공백 · 줄바꿈만인 메시지는 보낼 수 없다', () => {
    for (const content of ['', '   ', '\n\n', ' \n \t ', '\u200B', '\u200D', ' \u200C\n\uFEFF']) {
      expect(send(content).success).toBe(false);
    }
  });

  it('[CH-IN-03, 04] 앞뒤 공백과 끝 줄바꿈을 지우고 빈 줄은 한 줄까지 남긴다', () => {
    const parsed = send('  안녕하세요\r\n\n\n\n아직 있나요?  \n\n');
    expect(parsed.success && parsed.data.content).toBe('안녕하세요\n\n아직 있나요?');
  });

  it('[AC-CH-13] 1,000자까지 — 글자는 사용자가 느끼는 단위로 센다', () => {
    expect(send('가'.repeat(1000)).success).toBe(true);
    expect(send('가'.repeat(1001)).success).toBe(false);
    // 가족 이모지 하나는 코드포인트 7개지만 한 글자다
    expect(send('👨‍👩‍👧‍👦'.repeat(1000)).success).toBe(true);
    expect(send('👨‍👩‍👧‍👦'.repeat(1001)).success).toBe(false);
  });

  it('이모지를 잇는 제로폭 결합자는 지우지 않는다 (I-10)', () => {
    const parsed = send('우리 가족 👨‍👩‍👧‍👦');
    expect(parsed.success && parsed.data.content).toBe('우리 가족 👨‍👩‍👧‍👦');
  });

  it('결합 문자를 쌓아 DB 한도(16,000 코드포인트)를 넘기면 거부한다', () => {
    expect(send(`x${'\u0301'.repeat(15_999)}`).success).toBe(true);
    expect(send(`x${'\u0301'.repeat(16_000)}`).success).toBe(false);
  });

  it('[AC-CH-32] 가장 무거운 정상 메시지도 소켓 한도 80KB 안이다', () => {
    // 4바이트 글자 하나 뒤에 4바이트 결합 문자(U+E0100)를 한도까지 붙인다
    const content = `😀${'\u{E0100}'.repeat(15_999)}`;
    expect(send(content).success).toBe(true);
    const heaviest = JSON.stringify({ roomId: 'r'.repeat(64), tempId: 't'.repeat(64), content });
    expect(utf8ByteLength(heaviest)).toBeLessThan(80 * 1024);
  });

  it('[AC-CH-16] 태그와 링크는 바꾸지 않고 그대로 둔다', () => {
    const parsed = send('<b>굵게</b> https://example.com');
    expect(parsed.success && parsed.data.content).toBe('<b>굵게</b> https://example.com');
  });

  it('tempId와 roomId는 비어 있거나 64자를 넘을 수 없다', () => {
    expect(messageSendSchema.safeParse({ roomId: 'r', tempId: '', content: '안녕' }).success).toBe(false);
    expect(messageSendSchema.safeParse({ roomId: 'r', tempId: 'x'.repeat(65), content: '안녕' }).success).toBe(false);
    expect(messageSendSchema.safeParse({ roomId: '', tempId: 't', content: '안녕' }).success).toBe(false);
  });
});

describe('방 번호를 받는 스키마', () => {
  it('[AC-CH-05] after는 생략하면 null이고 음수 · 소수는 거부한다', () => {
    expect(roomJoinSchema.parse({ roomId: 'r' }).after).toBeNull();
    expect(roomJoinSchema.parse({ roomId: 'r', after: 0 }).after).toBe(0);
    expect(roomJoinSchema.safeParse({ roomId: 'r', after: -1 }).success).toBe(false);
    expect(roomJoinSchema.safeParse({ roomId: 'r', after: 1.5 }).success).toBe(false);
    expect(roomJoinSchema.safeParse({ roomId: 'r', after: '3' }).success).toBe(false);
  });

  it('[AC-CH-01] 읽음 번호는 0 이상의 정수이고 DB 정수 범위 안이다', () => {
    expect(readSchema.safeParse({ seq: 0 }).success).toBe(true);
    expect(readSchema.safeParse({ seq: 2_147_483_648 }).success).toBe(false);
    expect(readSchema.safeParse({}).success).toBe(false);
  });
});

describe('목록 쿼리', () => {
  it('[AC-CL-01] 채팅 목록은 기본 30개, 넘치면 50으로 맞춘다', () => {
    expect(listChatRoomsQuerySchema.parse({}).limit).toBe(30);
    expect(listChatRoomsQuerySchema.parse({ limit: '500' }).limit).toBe(50);
    expect(listChatRoomsQuerySchema.parse({ limit: 'abc' }).limit).toBe(30);
  });

  it('[AC-CH-10] 메시지는 기본 50개, 넘치면 100으로 맞춘다', () => {
    expect(listMessagesQuerySchema.parse({}).limit).toBe(50);
    expect(listMessagesQuerySchema.parse({ limit: '1000' }).limit).toBe(100);
  });
});
