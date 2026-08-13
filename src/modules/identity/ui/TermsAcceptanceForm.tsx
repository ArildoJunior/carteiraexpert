'use client';

import { useActionState } from 'react';
import { acceptTermsAction, type ActionResult } from '@/app/(auth)/actions';

const initialState: ActionResult = { success: false };

export function TermsAcceptanceForm() {
  const [state, formAction, pending] = useActionState(acceptTermsAction, initialState);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {/* Erro global */}
      {state.error && !state.success && (
        <div
          id="terms-error-alert"
          role="alert"
          className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3"
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
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-950"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="accept-terms" className="font-medium text-slate-300">
              Li e concordo com os <a href="/terms" target="_blank" className="text-emerald-400 hover:underline">Termos de Uso</a> (Obrigatório)
            </label>
            {state.fieldErrors?.termsOfService && (
              <p id="accept-terms-error" className="text-red-400 text-xs mt-1">{state.fieldErrors.termsOfService[0]}</p>
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
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-950"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="accept-privacy" className="font-medium text-slate-300">
              Li e concordo com a <a href="/privacy" target="_blank" className="text-emerald-400 hover:underline">Política de Privacidade</a> (Obrigatório)
            </label>
            {state.fieldErrors?.privacyPolicy && (
              <p id="accept-privacy-error" className="text-red-400 text-xs mt-1">{state.fieldErrors.privacyPolicy[0]}</p>
            )}
          </div>
        </div>

        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              id="accept-marketing"
              name="marketingCommunications"
              type="checkbox"
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-950"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="accept-marketing" className="font-medium text-slate-300">
              Aceito receber comunicações de marketing e ofertas
            </label>
            {state.fieldErrors?.marketingCommunications && (
              <p id="accept-marketing-error" className="text-red-400 text-xs mt-1">{state.fieldErrors.marketingCommunications[0]}</p>
            )}
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center space-x-3 pt-4">
        <a 
          href="/api/auth/logout"
          className="flex items-center justify-center flex-1 py-2.5 px-4 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
        >
          Sair
        </a>
        <button
          id="terms-submit"
          type="submit"
          disabled={pending}
          className="flex-[2] bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all duration-200"
        >
          {pending ? 'Processando...' : 'Aceitar e Continuar'}
        </button>
      </div>
    </form>
  );
}
