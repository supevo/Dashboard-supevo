import { z } from 'zod';

const password = z
  .string()
  .min(10, 'Das Passwort muss mindestens 10 Zeichen lang sein.')
  .max(200, 'Das Passwort ist zu lang.');

export const loginSchema = z.object({
  email: z.string().email('Bitte gib eine gültige E-Mail-Adresse ein.'),
  password: z.string().min(1, 'Bitte gib dein Passwort ein.'),
  redirectTo: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Bitte gib eine gültige E-Mail-Adresse ein.'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Die Passwörter stimmen nicht überein.',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string().min(20, 'Ungültiger Einladungslink.'),
    fullName: z.string().min(2, 'Bitte gib deinen Namen ein.').max(120),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Die Passwörter stimmen nicht überein.',
    path: ['confirmPassword'],
  });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
