'use client';

// 루트 레이아웃 자체가 실패했을 때의 최후 그물. 여기서는 <html>부터 다시 그려야 해서
// 셸도 토큰 CSS도 기대할 수 없다 — 최소한만 두고, 정상 경로는 (dashboard)/error.tsx가 받는다.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ko">
      <body>
        <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 20 }}>앱을 시작하지 못했습니다</h1>
          <p>새로고침해도 같으면 개발 서버 로그를 확인해 주세요.</p>
          <button type="button" onClick={reset}>
            다시 시도
          </button>
        </main>
      </body>
    </html>
  );
}
