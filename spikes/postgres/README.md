# 스파이크 · PostgreSQL

**동시에 도는 두 트랜잭션으로 유니크 경합, 트랜잭션 시각, 방별 번호, 조건부 UPDATE, 행 잠금을 재현한 다섯 개의 실험 코드입니다.** 관찰 결과와 설계 반영은 [기술 노트](../../docs/tech-notes.md#postgresql-제약과-트랜잭션)에 있습니다.

```bash
npm install
# PostgreSQL 16이 필요합니다. 기본 연결: postgresql://spike:spike@127.0.0.1:5432/neighbo_spike
# 다른 DB를 쓰려면 DATABASE_URL을 지정합니다. 실행할 때마다 실험용 테이블 세 개를 지우고 다시 만듭니다.
npm run 01   # 채팅방 유니크 경합 — 조회 후 생성 · 23505 · ON CONFLICT · 25P02
npm run 02   # now()는 트랜잭션 시작 시각 — 복구 조회에서 메시지가 빠지는 것 재현 (T-01)
npm run 03   # 방 행 잠금 + 방별 번호 — 번호 순서 = 커밋 순서 (결정 0016)
npm run 04   # 상태 변경 — 읽고 쓰기 대 조건부 UPDATE
npm run 05   # 메시지 저장과 상품 삭제가 겹칠 때 — FOR SHARE
```
