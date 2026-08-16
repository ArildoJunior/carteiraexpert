import { z } from 'zod';

// ─── Regras de Senha ──────────────────────────────────────────────────────────
// Mínimo: 8 code points Unicode (Array.from preserva caracteres multibyte)
// Máximo: 72 bytes UTF-8 (limite operacional do Argon2id)
// Complexidade: 1 maiúscula, 1 minúscula, 1 número, 1 especial (Unicode-aware)
// Sem normalização silenciosa: a senha não é trimada nem normalizada Unicode.
const passwordSchema = z
  .string()
  .refine((p) => Array.from(p).length >= 8, {
    message: 'A senha deve ter no mínimo 8 caracteres.',
  })
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, {
    message: 'A senha não pode exceder 72 bytes em UTF-8.',
  })
  .refine((p) => /\p{Lu}/u.test(p), {
    message: 'A senha deve conter ao menos uma letra maiúscula.',
  })
  .refine((p) => /\p{Ll}/u.test(p), {
    message: 'A senha deve conter ao menos uma letra minúscula.',
  })
  .refine((p) => /\p{Nd}/u.test(p), {
    message: 'A senha deve conter ao menos um número.',
  })
  .refine((p) => /[^\p{L}\p{N}]/u.test(p), {
    message: 'A senha deve conter ao menos um caractere especial.',
  });

// ─── Cadastro ─────────────────────────────────────────────────────────────────
export const registerSchema = z
  .object({
    name: z.string().min(2, 'O nome deve ter ao menos 2 caracteres.').max(100),
    email: z
      .string()
      .email('E-mail inválido.')
      .transform((e) => e.toLowerCase().trim()),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z
    .string()
    .email('E-mail inválido.')
    .transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1, 'Informe a senha.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Esqueci minha senha ──────────────────────────────────────────────────────
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email('E-mail inválido.')
    .transform((e) => e.toLowerCase().trim()),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// ─── Redefinição de senha ─────────────────────────────────────────────────────
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
