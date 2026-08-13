import { z } from 'zod';

export const termsAcceptanceSchema = z.object({
  termsOfService: z.boolean().refine((val) => val === true, {
    message: 'Você deve aceitar os Termos de Uso.',
  }),
  privacyPolicy: z.boolean().refine((val) => val === true, {
    message: 'Você deve aceitar a Política de Privacidade.',
  }),
  marketingCommunications: z.boolean().optional().default(false),
});

export type TermsAcceptanceInput = z.infer<typeof termsAcceptanceSchema>;
