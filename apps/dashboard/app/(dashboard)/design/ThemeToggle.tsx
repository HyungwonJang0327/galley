'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from 'galley-ui';

const THEME_ATTR = 'data-theme';

// 갤러리 전용 개발 보조 토글(P3b). <html data-theme="dark">를 켜고 끈다.
// 저장하지 않으며 갤러리를 떠나면 원래대로 — 앱 테마 기능이 아니다(todo P3b 범위 밖).
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.setAttribute(THEME_ATTR, 'dark');
    else root.removeAttribute(THEME_ATTR);
    return () => root.removeAttribute(THEME_ATTR);
  }, [dark]);

  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={dark}
      onClick={() => setDark((value) => !value)}
    >
      {dark ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
      {dark ? '라이트 테마' : '다크 테마'}
    </Button>
  );
}
