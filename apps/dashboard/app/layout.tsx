import type { ReactNode } from 'react';

export const metadata = {
  title: 'Galley',
  description: '기술 블로그 초안 파이프라인 검수 대시보드',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
