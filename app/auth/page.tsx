
// app/auth/page.tsx
// Redirects /auth to the main app which handles authentication.
// The actual Auth UI is rendered in app/app/page.tsx when no session exists.

import { redirect } from 'next/navigation';

export default function AuthPage() {
  redirect('/app');
}
