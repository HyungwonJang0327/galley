// 컴포넌트 안에서 쓰는 크기 상수(RF-23). 토큰(CSS 변수)으로 못 넘기는 JS 값 — lucide 아이콘 size, Base UI 팝업 간격.
// 배럴에 노출하지 않는다. 바꾸면 실측(verify-layout)이 잡는다.

/** 아이콘 한 변(px). xs 12 = 체크박스 체크·브레드크럼 구분 / sm 14 = 닫기·선택 표시·정렬 화살표 / md 16 = 본문 옆 아이콘. */
export const ICON_SIZE = { xs: 12, sm: 14, md: 16 } as const;

/** 팝업과 트리거 사이 간격(px). popup = Menu·Select(붙어서 뜨는 것) / popover = Popover·Tooltip(조금 더 띄움). */
export const SIDE_OFFSET = { popup: 4, popover: 6 } as const;
