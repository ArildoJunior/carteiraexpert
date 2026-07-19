import { z } from "zod";

/**
 * Validacao de parametros de URL para rotas de broker.
 * Slug: letras minusculas, numeros e hifens (ex: "btg-pactual", "rico").
 */
export const brokerSlugSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minusculas, numeros e hifens"),
});

/**
 * Validacao de parametros de URL para /imports/connections/[id].
 * ID deve ser UUID v4.
 */
export const connectionIdSchema = z.object({
  id: z.string().uuid("ID da conexao deve ser um UUID valido"),
});

export type BrokerSlugParams = z.infer<typeof brokerSlugSchema>;
export type ConnectionIdParams = z.infer<typeof connectionIdSchema>;
