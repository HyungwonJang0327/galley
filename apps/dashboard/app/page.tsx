import { redirect } from 'next/navigation';
import { getPendingApprovalCount } from '../lib/nav-counts';

// 승인 대기 실행이 있으면 검수하러 /runs, 없으면 /queue. 홈 화면은 만들지 않는다.
// decisions/navigation.md.
export default async function Page() {
  const pendingApproval = await getPendingApprovalCount();
  redirect(pendingApproval > 0 ? '/runs' : '/queue');
}
