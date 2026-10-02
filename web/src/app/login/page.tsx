import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <LoginForm next={next ?? '/'} initialError={error === 'not-a-member' ? 'This account doesn’t have access to Tech Nerv Accounts.' : undefined} />;
}
