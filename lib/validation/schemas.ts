import { z } from "zod";

/**
 * Shared Zod schemas: the single source of truth for form validation.
 * Forms consume them via `zodResolver` (React Hook Form); each form's type
 * is inferred with `z.infer`.
 */

export const loginSchema = z.object({
  email: z.string().min(1, "Ingresa tu email.").email("Ingresa un email válido."),
  password: z.string().min(1, "Ingresa tu contraseña."),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const serviceSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  duration_minutes: z.coerce
    .number({ invalid_type_error: "Duración inválida." })
    .int("Debe ser un número entero.")
    .positive("Debe ser mayor a 0."),
  price: z.coerce
    .number({ invalid_type_error: "Precio inválido." })
    .nonnegative("No puede ser negativo."),
});
export type ServiceValues = z.infer<typeof serviceSchema>;

export const productSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  price: z.coerce
    .number({ invalid_type_error: "Precio inválido." })
    .nonnegative("No puede ser negativo."),
  stock: z.coerce
    .number({ invalid_type_error: "Stock inválido." })
    .int("Debe ser un número entero.")
    .nonnegative("No puede ser negativo."),
  sellable_via_whatsapp: z.boolean(),
});
export type ProductValues = z.infer<typeof productSchema>;

export const customerSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{7,15}$/, "Teléfono inválido (7 a 15 dígitos)."),
});
export type CustomerValues = z.infer<typeof customerSchema>;
