import type { ReactNode } from 'react';
import '@galley/ui/styles.css';
import './globals.css';
import { SIDEBAR_COLLAPSED_ATTR, SIDEBAR_COLLAPSED_STORAGE_KEY } from '../lib/sidebar-collapse';

export const metadata = {
  title: 'Galley',
  description: '기술 블로그 초안 파이프라인 검수 대시보드',
};

// 페인트 전에 localStorage를 읽어 접힘 폭을 미리 적용(하이드레이션 플래시 방지).
const noFlashScript = `try{if(localStorage.getItem(${JSON.stringify(
  SIDEBAR_COLLAPSED_STORAGE_KEY,
)})==='true'){document.documentElement.setAttribute(${JSON.stringify(
  SIDEBAR_COLLAPSED_ATTR,
)},'true')}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        {children}
      </body>
    </html>
  );
}
