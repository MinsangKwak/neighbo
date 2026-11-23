# 기술 스파이크 실행 안내

[문서 목차](../../README.md) · [기술 노트](../../tech-notes.md)

**서비스에서 사용하는 동작을 작은 코드로 분리해 확인하는 실험 모음입니다.** 서비스 구현이나 성능 보장과 구분하며, 관찰 결과와 적용 이유는 기술 노트에 남깁니다. 모든 명령은 저장소 루트에서 시작하며 Node.js 22 이상이 필요합니다.

## WebSocket

핸드셰이크부터 Socket.IO의 재연결·버퍼 한계까지 여섯 실험을 실행합니다.

```bash
cd docs/tools/spikes/websocket
npm install
npm run 01
```

| 명령 | 확인하는 동작 |
| --- | --- |
| `npm run 01` | 네이티브 핸드셰이크와 프레임 파싱. Node 내장 WebSocket 클라이언트 사용 |
| `npm run 02` | heartbeat와 half-open 연결 |
| `npm run 03` | 재연결과 `after` 커서 기반 누락 메시지 복구 |
| `npm run 04` | Socket.IO 인증·두 탭, 서버의 의도된 종료와 프로세스 중단, 내장 복구 |
| `npm run 05` | 연결이 끊긴 동안의 emit 버퍼와 내장 복구의 한계 |
| `npm run 06` | 타임아웃 없는 emit의 유령 전송 |

[관찰 결과와 서비스 적용](../../tech-notes.md#websocket과-socketio)

## 인증

`node:crypto`로 JWT를 직접 서명·검증하고, bcrypt의 비용·길이·응답 시간 차이를 네 실험으로 확인합니다.

```bash
cd docs/tools/spikes/auth
npm install
npm run 01
```

| 명령 | 확인하는 동작 |
| --- | --- |
| `npm run 01` | JWT HS256 서명·변조·`alg: none`·만료·용도 검증 |
| `npm run 02` | bcrypt salt·cost, 네이티브 구현과 순수 JS 구현의 이벤트 루프 영향 |
| `npm run 03` | bcrypt 72바이트 제한과 한글·이모지 비밀번호 |
| `npm run 04` | 없는 이메일의 응답 시간 차이와 더미 해시 적용 |

시간 측정은 실행 환경의 영향을 받습니다. 배포 환경의 비용과 응답 시간은 별도로 측정해야 합니다. [관찰 결과와 서비스 적용](../../tech-notes.md#jwt와-비밀번호-해시)

## PostgreSQL

PostgreSQL 16의 제약·잠금·트랜잭션 동작을 다섯 동시 실행 실험으로 확인합니다. **매 실행마다 실험 테이블 세 개를 삭제·재생성하므로 개발·운영 DB와 분리한 실험 전용 DB를 사용합니다.**

```bash
cd docs/tools/spikes/postgres
npm install
DATABASE_URL=postgresql://spike:spike@127.0.0.1:5432/neighbo_spike npm run 01
```

기본 연결도 위 URL입니다. 다른 실험 DB는 `DATABASE_URL`로 지정합니다.

| 명령 | 확인하는 동작 |
| --- | --- |
| `npm run 01` | 채팅방 조회 후 생성 경합, `23505`, `ON CONFLICT`, `25P02` |
| `npm run 02` | 트랜잭션 시작 시각인 `now()`가 만드는 메시지 누락(T-01) |
| `npm run 03` | 방 행 잠금과 `seq`로 커밋 순서 보장(결정 0016) |
| `npm run 04` | 상태 조회 후 쓰기와 조건부 UPDATE 비교 |
| `npm run 05` | 메시지 저장의 `FOR SHARE`와 상품 삭제 경합 |

[관찰 결과와 서비스 적용](../../tech-notes.md#postgresql-제약과-트랜잭션)
