// app/page.tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/chat'); // 첫 페이지 진입 시 바로 /chat 로 이동
}