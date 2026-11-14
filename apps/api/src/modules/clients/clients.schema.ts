import { z } from 'zod';

// CPF/CNPJ Validation helpers
const cpfRegex = /^\d{11}$/;
const cnpjRegex = /^\d{14}$/;

function isValidCPF(cpf: string): boolean {
  if (!cpfRegex.test(cpf)) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit > 9) digit = 0;
  if (digit !== parseInt(cpf.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit > 9) digit = 0;
  return digit === parseInt(cpf.charAt(10));
}

function isValidCNPJ(cnpj: string): boolean {
  if (!cnpjRegex.test(cnpj)) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cnpj.charAt(i)) * weights1[i];
  }
  let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(cnpj.charAt(12))) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cnpj.charAt(i)) * weights2[i];
  }
  digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return digit === parseInt(cnpj.charAt(13));
}

// Profile Schemas
export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').optional(),
  document: z
    .string()
    .transform((val) => val.replace(/\D/g, ''))
    .refine((val) => val.length === 11 || val.length === 14, {
      message: 'CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos',
    })
    .refine((val) => (val.length === 11 ? isValidCPF(val) : isValidCNPJ(val)), {
      message: 'CPF/CNPJ inválido',
    })
    .optional(),
  documentType: z.enum(['CPF', 'CNPJ']).optional(),
  phone: z
    .string()
    .transform((val) => val.replace(/\D/g, ''))
    .refine((val) => val.length >= 10 && val.length <= 11, {
      message: 'Telefone deve ter 10 ou 11 dígitos',
    })
    .optional(),
});

// Address Schemas
export const createAddressSchema = z.object({
  label: z.string().max(50).optional(),
  street: z.string().min(3, 'Rua é obrigatória'),
  number: z.string().min(1, 'Número é obrigatório'),
  complement: z.string().max(100).optional(),
  neighborhood: z.string().optional(),
  city: z.string().min(2, 'Cidade é obrigatória'),
  state: z.string().length(2, 'Estado deve ter 2 caracteres').toUpperCase(),
  zipCode: z
    .string()
    .transform((val) => val.replace(/\D/g, ''))
    .refine((val) => val.length === 8, { message: 'CEP deve ter 8 dígitos' }),
  isDefault: z.boolean().default(false),
});

export const updateAddressSchema = createAddressSchema.partial();

// Response Schemas
export const clientProfileResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  document: z.string().nullable(),
  documentType: z.string().nullable(),
  profilePhotoUrl: z.string().nullable(),
  user: z.object({
    email: z.string().email(),
    phone: z.string(),
    status: z.string(),
    createdAt: z.string().datetime(),
  }),
  addresses: z.array(
    z.object({
      id: z.string().uuid(),
      label: z.string().nullable(),
      street: z.string(),
      number: z.string(),
      complement: z.string().nullable(),
      neighborhood: z.string().nullable(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      lat: z.number(),
      lng: z.number(),
      isDefault: z.boolean(),
    })
  ),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
