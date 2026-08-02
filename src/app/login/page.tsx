import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const resolvedParams = await searchParams;
  const redirectTo = resolvedParams.redirectTo || '/dashboard';

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <LoginForm redirectTo={redirectTo} />
    </div>
  );
}
