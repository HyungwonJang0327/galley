'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  SIDEBAR_COLLAPSED_ATTR,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from '../../../lib/sidebar-collapse';

interface SidebarCollapseValue {
  /** 접힘 여부. */
  collapsed: boolean;
  /** 접힘/펼침 토글 + localStorage 저장. */
  toggle: () => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  // 서버·최초 클라 렌더는 항상 펼침(false)으로 일치시켜 하이드레이션 경고를 피한다.
  // 접힘 폭 자체는 <head>/<body> 인라인 스크립트가 html 속성으로 미리 적용해
  // 레이아웃 플래시를 막고, 라벨 상태는 마운트 직후 localStorage에서 복원한다.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true') {
        setCollapsed(true);
      }
    } catch {
      // localStorage 접근 불가 환경은 무시(기본 펼침).
    }
  }, []);

  // 상태를 html 속성에 반영(인라인 스크립트와 같은 속성) → 폭 CSS가 따라온다.
  useEffect(() => {
    document.documentElement.setAttribute(SIDEBAR_COLLAPSED_ATTR, collapsed ? 'true' : 'false');
  }, [collapsed]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? 'true' : 'false');
      } catch {
        // 저장 실패는 무시(다음 로드에 복원만 안 될 뿐).
      }
      return next;
    });
  }, []);

  return (
    <SidebarCollapseContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapse(): SidebarCollapseValue {
  const ctx = useContext(SidebarCollapseContext);
  if (!ctx) {
    throw new Error('useSidebarCollapse는 SidebarProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}
