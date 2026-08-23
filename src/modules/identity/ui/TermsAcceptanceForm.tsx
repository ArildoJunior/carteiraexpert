'use client';

import { useActionState } from 'react';
import { acceptTermsAction, logoutAction, type ActionResult } from '@/app/(auth)/actions';

const initialState: ActionResult = { success: false };

export function TermsAcceptanceForm() {
  const [state, formAction, pending] = useActionState(acceptTermsAction, initialState);

  const handleLogout = async () => {
    await logoutAction();
    window.location.href = '/login';
  };

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {/* Erro global */}
      {state.error && !state.success && (
        <div
          id="terms-error-alert"
          role="alert"
          className="bg-negative-text/10 border border-negative-text/30 text-negative-text text-sm rounded-lg px-4 py-3"
        >
          {state.error}
        </div>
      )}

      {/* Consentimentos */}
      <div className="space-y-4">
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              id="accept-terms"
              name="termsOfService"
              type="checkbox"
              required
              className="w-4 h-4 rounded border-border-theme bg-background text-action-primary focus:ring-action-primary focus:ring-offset-background"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="accept-terms" className="font-medium text-text-secondary">
              Li e concordo com os <a href="/terms" target="_blank" className="text-action-primary hover:underline font-semibold">Termos de Uso</a> (Obrigatório)
            </label>
            {state.fieldErrors?.termsOfService && (
              <p id="accept-terms-error" className="text-negative-text text-xs mt-1">{state.fieldErrors.termsOfService[0]}</p>
            )}
          </div>
        </div>

        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              id="accept-privacy"
              name="privacyPolicy"
              type="checkbox"
              required
              className="w-4 h-4 rounded border-border-theme bg-background text-action-primary focus:ring-action-primary focus:ring-offset-background"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="accept-privacy" className="font-medium text-text-secondary">
              Li e concordo com a <a href="/privacy" target="_blank" className="text-action-primary hover:underline font-semibold">Política de Privacidade</a> (Obrigatório)
            </label>
            {state.fieldErrors?.privacyPolicy && (
              <p id="accept-privacy-error" className="text-negative-text text-xs mt-1">{state.fieldErrors.privacyPolicy[0]}</p>
            )}
          </div>
        </div>

        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              id="accept-marketing"
              name="marketingCommunications"
              type="checkbox"
              className="w-4 h-4 rounded border-border-theme bg-background text-action-primary focus:ring-action-primary focus:ring-offset-background"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="accept-marketing" className="font-medium text-text-secondary">
              Aceito receber comunicações de marketing e ofertas
            </label>
            {state.fieldErrors?.marketingCommunications && (
              <p id="accept-marketing-error" className="text-negative-text text-xs mt-1">{state.fieldErrors.marketingCommunications[0]}</p>
            )}
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center space-x-3 pt-4">
        <button
          id="terms-logout-button"
          type="button"
          onClick={handleLogout}
          className="flex items-center justify-center flex-1 py-2.5 px-4 text-sm font-semibold text-text-secondary bg-surface-elevated hover:bg-border-theme/50 rounded-lg transition-colors border border-border-theme focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
        >
          Sair
        </button>
        <button
          id="terms-submit"
          type="submit"
          disabled={pending}
          className="flex-[2] bg-action-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-action-primary-text font-semibold py-2.5 rounded-lg text-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-action-primary"
        >
          {pending ? 'Processando...' : 'Aceitar e Continuar'}
        </button>
      </div>
    </form>
  );
}
