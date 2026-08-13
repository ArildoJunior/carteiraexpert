'use client';

import { useActionState } from 'react';
import { registerAction, type ActionResult } from '@/app/(auth)/actions';

const initialState: ActionResult = { success: false };

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* Erro global */}
      {state.error && !state.success && (
        <div
          id="register-error-alert"
          role="alert"
          className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3"
        >
          {state.error}
        </div>
      )}

      {/* Nome */}
      <div>
        <label htmlFor="register-name" className="block text-sm font-medium text-slate-300 mb-1.5">
          Nome completo
        </label>
        <input
          id="register-name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Seu Nome"
          aria-describedby={state.fieldErrors?.name ? 'register-name-error' : undefined}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
        />
        {state.fieldErrors?.name && (
          <p id="register-name-error" className="text-red-400 text-xs mt-1">
            {state.fieldErrors.name[0]}
          </p>
        )}
      </div>

      {/* E-mail */}
      <div>
        <label htmlFor="register-email" className="block text-sm font-medium text-slate-300 mb-1.5">
          E-mail
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="seu@email.com"
          aria-describedby={state.fieldErrors?.email ? 'register-email-error' : undefined}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
        />
        {state.fieldErrors?.email && (
          <p id="register-email-error" className="text-red-400 text-xs mt-1">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      {/* Senha */}
      <div>
        <label htmlFor="register-password" className="block text-sm font-medium text-slate-300 mb-1.5">
          Senha
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Mín. 8 chars, 1 maiúscula, 1 número, 1 especial"
          aria-describedby={state.fieldErrors?.password ? 'register-password-error' : undefined}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
        />
        {state.fieldErrors?.password && (
          <p id="register-password-error" className="text-red-400 text-xs mt-1">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>

      {/* Confirmar Senha */}
      <div>
        <label htmlFor="register-confirm-password" className="block text-sm font-medium text-slate-300 mb-1.5">
          Confirmar senha
        </label>
        <input
          id="register-confirm-password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          aria-describedby={state.fieldErrors?.confirmPassword ? 'register-confirm-error' : undefined}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
        />
        {state.fieldErrors?.confirmPassword && (
          <p id="register-confirm-error" className="text-red-400 text-xs mt-1">
            {state.fieldErrors.confirmPassword[0]}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        id="register-submit"
        type="submit"
        disabled={pending}
        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all duration-200 mt-2"
      >
        {pending ? 'Criando conta...' : 'Criar conta'}
      </button>
    </form>
  );
}
