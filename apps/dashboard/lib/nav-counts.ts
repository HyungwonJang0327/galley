// 사이드바 배지·루트 진입 분기용 카운트. decisions/navigation.md: 서버 컴포넌트에서
// pipeline 함수로 직접 조회. Run 스키마(B1e) 연결 전까지는 0(더미) → 루트는 사실상 /queue.
export async function getPendingApprovalCount(): Promise<number> {
  // TODO(B1e): pipeline에서 status='승인 대기' Run 개수를 조회한다.
  return 0;
}
