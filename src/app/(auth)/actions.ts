'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema/identity';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '@/modules/identity/domain/user.schema';
import * as authService from '@/modules/identity/server/auth.service';
import { getSessionId } from '@/modules/identity/server/current-user';
import { requireAuth } from '@/modules/identity/server/current-user';
import { termsAcceptanceSchema } from '@/modules/identity/domain/consent.schema';
import { recordConsent } from '@/modules/identity/server/consent-service';
import { CURRENT_CONSENT_VERSIONS } from '@/modules/identity/domain/consent-constants';
import { hashToken, getSessionCookieOptions, getClearCookieOptions, SESSION_COOKIE_NAME, extractRequestContext } from '@/modules/identity/server/session';
import { TestFakeEmailSender } from '@/modules/identity/domain/email-sender';
import type { EmailSenderService } from '@/modules/identity/domain/email-sender';
import { headers } from 'next/headers';

// ─── Resolução do EmailSender ─────────────────────────────────────────────────
// Em produção: substituir por implementação SMTP real.
// Em testes: injetado via contexto específico.
function getEmailSender(): EmailSenderService {
  if (process.env.NODE_ENV === 'production') {
    // TODO: Substituir por SmtpEmailSender em produção
    throw new Error('EmailSender de produção não configurado.');
  }
  return new TestFakeEmailSender();
}

function getClientIp(hdrs: Headers): string | null {
  return hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

function isNextRedirect(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as { digest?: string }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

// ─── Tipagem de ActionResult ──────────────────────────────────────────────────
export interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

// ─── CADASTRO ─────────────────────────────────────────────────────────────────
export async function registerAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const raw = {
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  };
  const consentRaw = {
    termsOfService: formData.get('termsOfService') === 'on',
    privacyPolicy: formData.get('privacyPolicy') === 'on',
    marketingCommunications: formData.get('marketingCommunications') === 'on',
  };

  const parsed = registerSchema.safeParse(raw);
  const consentParsed = termsAcceptanceSchema.safeParse(consentRaw);

  if (!parsed.success || !consentParsed.success) {
    const fieldErrors = {
      ...(parsed.success ? {} : parsed.error.flatten().fieldErrors),
      ...(consentParsed.success ? {} : consentParsed.error.flatten().fieldErrors),
    };
    return { success: false, fieldErrors };
  }

  try {
    const hdrs = await headers();
    const reqContext = extractRequestContext(hdrs);
    const ip = getClientIp(hdrs) ?? undefined;
    const ua = hdrs.get('user-agent') ?? undefined;

    const result = await authService.register(
      parsed.data.name,
      parsed.data.email,
      parsed.data.password,
      { marketingCommunications: consentParsed.data.marketingCommunications },
      ip,
      ua
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const cookieStore = await cookies();
    const opts = getSessionCookieOptions(result.expiresAt, reqContext);
    cookieStore.set(SESSION_COOKIE_NAME, result.token, opts);

    redirect('/dashboard');
  } catch (err: unknown) {
    if (isNextRedirect(err)) {
      throw err;
    }
    console.error('[registerAction] Falha inesperada no cadastro');
    return {
      success: false,
      error: 'Ocorreu um erro inesperado ao processar o cadastro. Tente novamente mais tarde.',
    };
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export async function loginAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const hdrs = await headers();
    const reqContext = extractRequestContext(hdrs);
    const ip = getClientIp(hdrs) ?? undefined;
    const ua = hdrs.get('user-agent') ?? undefined;

    const result = await authService.login(
      parsed.data.email,
      parsed.data.password,
      ip,
      ua
    );

    if (!result.success) {
      return {
        success: false,
        error: result.rateLimited
          ? 'Muitas tentativas. Tente novamente em alguns minutos.'
          : result.error,
      };
    }

    const cookieStore = await cookies();
    const opts = getSessionCookieOptions(result.expiresAt, reqContext);
    cookieStore.set(SESSION_COOKIE_NAME, result.token, opts);

    redirect('/dashboard');
  } catch (err: unknown) {
    if (isNextRedirect(err)) {
      throw err;
    }
    console.error('[loginAction] Falha inesperada no login');
    return {
      success: false,
      error: 'Ocorreu um erro inesperado ao realizar login. Tente novamente mais tarde.',
    };
  }
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export async function logoutAction(): Promise<ActionResult> {
  const cookieStore = await cookies();
  const hdrs = await headers();
  const reqContext = extractRequestContext(hdrs);
  try {
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      const tokenHash = hashToken(token);
      const now = new Date();
      const [session] = await db
        .select({ id: sessions.id, userId: sessions.userId })
        .from(sessions)
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now)
          )
        )
        .limit(1);

      if (session) {
        await authService.logout(session.id, session.userId);
      }
    }

    const clearOpts = getClearCookieOptions(reqContext);
    cookieStore.set(SESSION_COOKIE_NAME, '', clearOpts);
    return { success: true };
  } catch {
    console.error('[logoutAction] Falha inesperada ao encerrar sessão');
    try {
      const clearOpts = getClearCookieOptions(reqContext);
      cookieStore.set(SESSION_COOKIE_NAME, '', clearOpts);
    } catch {
      // Falha ao deletar cookie no catch é ignorada
    }
    return { success: false, error: 'Erro ao encerrar sessão.' };
  }
}


// ─── ESQUECI MINHA SENHA ──────────────────────────────────────────────────────
export async function forgotPasswordAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const raw = { email: formData.get('email') };

  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);

  try {
    await authService.requestPasswordReset(
      parsed.data.email,
      getEmailSender(),
      ip
    );
  } catch {
    // Swallow: resposta padronizada independentemente do erro
  }

  // Resposta SEMPRE bem-sucedida para prevenir enumeração de e-mails
  return { success: true };
}

// ─── REDEFINIÇÃO DE SENHA ─────────────────────────────────────────────────────
export async function resetPasswordAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const raw = {
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  };

  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const result = await authService.resetPassword(
      parsed.data.token,
      parsed.data.password
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Token inválido ou expirado.' };
    }

    return { success: true };
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'TOKEN_INVALID') {
        return { success: false, error: 'Token inválido ou expirado. Solicite um novo link.' };
      }
      if (err.message === 'PASSWORD_SAME') {
        return { success: false, error: 'A nova senha não pode ser igual à senha atual.' };
      }
    }
    throw err;
  }
}

// ─── ACEITE DE TERMOS ─────────────────────────────────────────────────────────
export async function acceptTermsAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return { success: false, error: 'Usuário não autenticado.' };
  }

  const consentRaw = {
    termsOfService: formData.get('termsOfService') === 'on',
    privacyPolicy: formData.get('privacyPolicy') === 'on',
    marketingCommunications: formData.get('marketingCommunications') === 'on',
  };

  const consentParsed = termsAcceptanceSchema.safeParse(consentRaw);
  if (!consentParsed.success) {
    return { success: false, fieldErrors: consentParsed.error.flatten().fieldErrors };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs) ?? undefined;
  const ua = hdrs.get('user-agent') ?? undefined;

  try {
    await db.transaction(async (tx) => {
      await recordConsent({
        userId: user.id,
        consentType: 'terms_of_service',
        version: CURRENT_CONSENT_VERSIONS.terms_of_service.version,
        action: 'granted',
        ip,
        userAgent: ua,
      }, tx);

      await recordConsent({
        userId: user.id,
        consentType: 'privacy_policy',
        version: CURRENT_CONSENT_VERSIONS.privacy_policy.version,
        action: 'granted',
        ip,
        userAgent: ua,
      }, tx);

      if (consentParsed.data.marketingCommunications) {
        await recordConsent({
          userId: user.id,
          consentType: 'marketing_communications',
          version: CURRENT_CONSENT_VERSIONS.marketing_communications.version,
          action: 'granted',
          ip,
          userAgent: ua,
        }, tx);
      }
    });

    redirect('/dashboard');
  } catch (err: unknown) {
    if (isNextRedirect(err)) {
      throw err;
    }
    console.error('[acceptTermsAction] Falha inesperada ao registrar consentimento');
    return { success: false, error: 'Erro ao registrar consentimento. Tente novamente mais tarde.' };
  }
}


export async function updateOptionalConsentAction(
  consentType: string,
  granted: boolean
): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    if (consentType !== 'marketing_communications') {
      return { success: false, error: 'Tipo de consentimento inválido.' };
    }

    const hdrs = await headers();
    const ip = getClientIp(hdrs) ?? undefined;
    const ua = hdrs.get('user-agent') ?? undefined;

    await recordConsent({
      userId: user.id,
      consentType,
      version: CURRENT_CONSENT_VERSIONS[consentType].version,
      action: granted ? 'granted' : 'revoked',
      ip,
      userAgent: ua,
    });

    return { success: true };
  } catch {
    return { success: false, error: 'Não foi possível atualizar a preferência.' };
  }
}
