import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '../../../modules/identity/ui/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Recuperar Senha — CarteiraExpert',
  description: 'Solicite um link para redefinir sua senha do CarteiraExpert.',
};

export default function ForgotPasswordPage() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Recuperar senha</h1>
        <p className="text-slate-400 text-sm mt-1">
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </p>
      </div>

      <ForgotPasswordForm />

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
