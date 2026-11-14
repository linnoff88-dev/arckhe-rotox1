import { z } from 'zod';

// Query schemas
export const searchPharmaciesSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  city: z.string().optional(),
  radius: z.coerce.number().min(1).max(50).default(10), // km
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.enum(['VETERINARY', 'FROZEN', 'GENERAL']).optional(),
  expressOnly: z.coerce.boolean().optional(),
});

export const pharmacyIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Response schemas
export const pharmacyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  tradeName: z.string().nullable(),
  phone: z.string(),
  logoUrl: z.string().nullable(),
  address: z.object({
    street: z.string(),
    number: z.string(),
    complement: z.string().nullable(),
    neighborhood: z.string().nullable(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }),
  lat: z.number(),
  lng: z.number(),
  distance: z.number().optional(), // km, when searched by location
  isOpen: z.boolean(),
  acceptsExpress: z.boolean(),
  rating: z.number(),
  ratingCount: z.number(),
  openingHours: z.any().nullable(),
});

export type SearchPharmaciesQuery = z.infer<typeof searchPharmaciesSchema>;
export type PharmacyResponse = z.infer<typeof pharmacyResponseSchema>;
