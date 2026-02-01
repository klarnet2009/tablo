import { redirect } from 'next/navigation';

// Root page shows dashboard (dashboard layout is in (dashboard) group)
export default function Home() {
  // Don't redirect - this page will show (dashboard)/page.tsx content
  // because (dashboard) is a route group that applies to root
  redirect('/queue');
}
