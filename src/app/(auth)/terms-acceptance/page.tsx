import { requireAuth } from '@/modules/identity/server/current-user';
import { hasAcceptedCurrentTerms } from '@/modules/identity/server/consent-service';
import { TermsAcceptanceForm } from '@/modules/identity/ui/TermsAcceptanceForm';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Atualização dos Termos | CarteiraExpert',
};

export default async function TermsAcceptancePage() {
  const user = await requireAuth();
  
  // Se já aceitou, redireciona para o dashboard
  const hasConsent = await hasAcceptedCurrentTerms(user.id);
  if (hasConsent) {
    redirect('/dashboard');
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Atualização dos Termos</h1>
        <p className="text-slate-400 text-sm">
          Olá, {user.name}! Para continuar usando o CarteiraExpert, você precisa aceitar as versões mais recentes dos nossos Termos de Uso e Política de Privacidade.
        </p>
      </div>

      <TermsAcceptanceForm />
    </div>
  );
}
