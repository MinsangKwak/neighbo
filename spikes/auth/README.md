# 스파이크 · 인증

**JWT를 `node:crypto`만으로 서명·검증하고, bcrypt의 비용·한계·응답 시간을 측정한 네 개의 실험 코드입니다.** 관찰 결과와 설계 반영은 [기술 노트](../../docs/tech-notes.md#jwt와-비밀번호-해시)에 있습니다.

```bash
npm install
npm run 01   # JWT(HS256) 직접 서명 · 변조 · alg none · 만료 · 용도(purpose)
npm run 02   # bcrypt salt · cost별 시간 · 네이티브와 순수 JS의 이벤트 루프 영향
npm run 03   # bcrypt 72바이트 한계 — 한글 · 이모지 비밀번호
npm run 04   # 없는 이메일 로그인의 응답 시간 — 더미 해시로 평탄화
```

Node 22 이상. 시간 측정값은 실행 환경에 따라 달라집니다 — 배포 환경에서 다시 잽니다.
