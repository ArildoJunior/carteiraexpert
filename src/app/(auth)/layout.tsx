import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../modules/identity/server/current-user';
import { ThemeToggle } from '@/lib/theme/ThemeToggle';

export const metadata: Metadata = {
  title: 'CarteiraExpert — Acesso',
  description: 'Acesse ou crie sua conta no CarteiraExpert.',
};

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Proteção server-side: se o usuário já tem sessão válida, redireciona.
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-text-primary p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-action-primary flex items-center justify-center">
              <span className="text-action-primary-text font-bold text-sm">CE</span>
            </div>
            <span className="text-text-primary font-semibold text-xl tracking-tight">
              CarteiraExpert
            </span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
