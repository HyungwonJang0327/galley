import { redirect } from 'next/navigation';

// 루트는 큐로 보낸다(스펙 §7). 여기에 화면을 그리지 않는다.
export default function Page() {
  redirect('/queue');
}
