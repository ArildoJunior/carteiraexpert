import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '../../../modules/identity/ui/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Recuperar Senha — CarteiraExpert',
  description: 'Solicite um link para redefinir sua senha do CarteiraExpert.',
};

export default function ForgotPasswordPage() {
  return (
    <div className="bg-surface border border-border-theme rounded-2xl p-8 shadow-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Recuperar senha</h1>
        <p className="text-text-secondary text-sm mt-1">
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </p>
      </div>

      <ForgotPasswordForm />

      <div className="mt-6 text-center">
        <Link
          href="/login"
          className="text-sm font-medium text-action-primary hover:underline transition-all"
        >
          ← Voltar ao login
        </Link>
      </div>
    </div>
  );
}
