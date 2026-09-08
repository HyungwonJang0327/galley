// 사이드바 접힘 상태 저장 키·속성. 서버 인라인 스크립트(app/layout.tsx)와
// 클라 Provider(SidebarProvider)가 공유한다. 값 드리프트를 막으려 한 곳에 둔다.
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'galley:sidebar-collapsed';
export const SIDEBAR_COLLAPSED_ATTR = 'data-sidebar-collapsed';
