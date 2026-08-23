import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from '../../../modules/identity/ui/RegisterForm';

export const metadata: Metadata = {
  title: 'Criar Conta — CarteiraExpert',
  description: 'Crie sua conta gratuita no CarteiraExpert e organize seus investimentos.',
};

export default function RegisterPage() {
  return (
    <div className="bg-surface border border-border-theme rounded-2xl p-8 shadow-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Criar conta</h1>
        <p className="text-text-secondary text-sm mt-1">
          Comece a organizar sua carteira de investimentos.
        </p>
      </div>

      <RegisterForm />

      <div className="mt-6 text-center">
        <p className="text-text-secondary text-sm">
          Já tem conta?{' '}
          <Link
            href="/login"
            className="text-action-primary font-medium hover:underline transition-all"
          >
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  );
}
