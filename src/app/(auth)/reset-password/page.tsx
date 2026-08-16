import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResetPasswordForm } from '../../../modules/identity/ui/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Redefinir Senha — CarteiraExpert',
  description: 'Crie uma nova senha para sua conta CarteiraExpert.',
};

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;

  // Token ausente na URL: página não encontrada
  if (!token) notFound();

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Criar nova senha</h1>
        <p className="text-slate-400 text-sm mt-1">
          Escolha uma senha forte para proteger sua conta.
        </p>
      </div>

      <ResetPasswordForm token={token} />

      <div className="mt-6 text-center">
        <Link
          href="/login"
          className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
        >
          ← Voltar ao login
        </Link>
      </div>
    </div>
  );
}
