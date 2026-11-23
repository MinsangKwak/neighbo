// 이 탭이 세션을 바꾸는 중인가 (비밀번호 변경)
// 서버는 비밀번호를 바꾸면 그 사용자의 실시간 연결을 모두 끊는다. 바꾼 탭의 연결도 끊기는데,
// 그 신호가 HTTP 응답보다 먼저 닿으면 "세션 만료"로 보고 로그인 화면으로 가 버려 새 쿠키를 받지 못한다
// 바꾸는 동안에는 그 이동을 미루고, 응답을 받은 쪽이 다음 화면을 정한다
let changing = false;

export const sessionChange = {
  begin() {
    changing = true;
  },
  end() {
    changing = false;
  },
  active: () => changing,
};
