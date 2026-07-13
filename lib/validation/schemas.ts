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

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Ingresa tu email.").email("Ingresa un email válido."),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

// Client-side checks mirror the backend's minimum policy (length + not all
// numeric). The backend (Django validators) is the source of truth and returns
// the specific message for anything it rejects beyond these basics.
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .regex(/\D/, "No puede ser solo números."),
    confirmPassword: z.string().min(1, "Confirma tu contraseña."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

// Mirrors resetPasswordSchema — same Django policy (min 8 chars, not all numeric).
// The backend is the source of truth and returns specific messages for anything
// it rejects beyond these basics (surfaced via setError("root", ...)).
export const activateSchema = z
  .object({
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .regex(/\D/, "No puede ser solo números."),
    confirm: z.string().min(1, "Confirma tu contraseña."),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Las contraseñas no coinciden.",
    path: ["confirm"],
  });
export type ActivateValues = z.infer<typeof activateSchema>;
