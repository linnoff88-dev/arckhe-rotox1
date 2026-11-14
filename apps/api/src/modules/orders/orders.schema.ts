import { z } from 'zod';

// ==================== Create Order ====================

export const createOrderSchema = z.object({
  pharmacyId: z.string().uuid(),
  category: z.enum(['VETERINARY', 'FROZEN', 'GENERAL']),
  urgency: z.enum(['STANDARD', 'EXPRESS']).default('STANDARD'),
  description: z.string().max(500).optional(),
  deliveryAddressId: z.string().uuid().optional(),
  deliveryAddress: z
    .object({
      street: z.string().min(3),
      number: z.string().min(1),
      complement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().min(2),
      state: z.string().length(2),
      zipCode: z.string().length(8),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  paymentMethod: z.enum(['PIX', 'CREDIT_CARD', 'DEBIT_CARD']),
});

// ==================== Calculate Price ====================

export const calculatePriceSchema = z.object({
  pharmacyId: z.string().uuid(),
  deliveryAddressId: z.string().uuid().optional(),
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),
  category: z.enum(['VETERINARY', 'FROZEN', 'GENERAL']),
  urgency: z.enum(['STANDARD', 'EXPRESS']).default('STANDARD'),
});

// ==================== Query Schemas ====================

export const orderHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum([
    'PENDING_PAYMENT',
    'SEARCHING_DRIVER',
    'DRIVER_ASSIGNED',
    'COLLECTING',
    'PICKED_UP',
    'DELIVERING',
    'DELIVERED',
    'CANCELLED',
  ]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ==================== Cancel Order ====================

export const cancelOrderSchema = z.object({
  reason: z.string().min(5).max(500),
});

// ==================== Rate Order ====================

export const rateOrderSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

// ==================== Response Schemas ====================

export const priceBreakdownSchema = z.object({
  basePrice: z.number(),
  distancePrice: z.number(),
  categoryMultiplier: z.number(),
  urgencyMultiplier: z.number(),
  subtotal: z.number(),
  platformFee: z.number(),
  total: z.number(),
  driverEarning: z.number(),
  distanceKm: z.number(),
  estimatedMinutes: z.number(),
});

export const orderResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  category: z.string(),
  urgency: z.string(),
  description: z.string().nullable(),
  pharmacy: z.object({
    id: z.string().uuid(),
    name: z.string(),
    address: z.string(),
    phone: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  deliveryAddress: z.object({
    street: z.string(),
    number: z.string(),
    city: z.string(),
    state: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  driver: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string(),
    photoUrl: z.string().nullable(),
    vehicleType: z.string(),
    vehiclePlate: z.string().nullable(),
    rating: z.number(),
    currentLat: z.number().nullable(),
    currentLng: z.number().nullable(),
  }).nullable(),
  price: z.number(),
  distanceKm: z.number(),
  estimatedMinutes: z.number().nullable(),
  createdAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  pickedUpAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  payment: z.object({
    method: z.string(),
    status: z.string(),
    pixQrCode: z.string().nullable(),
  }).nullable(),
});

// Types
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CalculatePriceInput = z.infer<typeof calculatePriceSchema>;
export type OrderHistoryQuery = z.infer<typeof orderHistoryQuerySchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type RateOrderInput = z.infer<typeof rateOrderSchema>;
export type PriceBreakdown = z.infer<typeof priceBreakdownSchema>;
