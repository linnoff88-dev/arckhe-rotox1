import { z } from 'zod';

// ==================== Profile Schemas ====================

export const updateDriverProfileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(10).max(11).optional(),
  document: z.string().min(11).max(11).optional(), // CPF
  cnhNumber: z.string().optional(),
  vehicleType: z.enum(['BIKE', 'MOTO', 'CAR', 'VAN']).optional(),
  vehiclePlate: z.string().toUpperCase().optional(),
});

export const uploadDocumentSchema = z.object({
  type: z.enum(['CNH', 'VEHICLE_DOC', 'PROFILE_PHOTO']),
});

// ==================== Availability Schemas ====================

export const updateAvailabilitySchema = z.object({
  isOnline: z.boolean(),
});

export const updateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().positive().optional(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(), // km/h
});

// ==================== Order Schemas ====================

export const availableOrdersQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(1).max(20).default(5), // km
});

export const acceptOrderSchema = z.object({
  orderId: z.string().uuid(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['COLLECTING', 'PICKED_UP', 'DELIVERING', 'DELIVERED']),
  notes: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const confirmPickupSchema = z.object({
  photoUrl: z.string().url().optional(),
  notes: z.string().max(500).optional(),
});

export const confirmDeliverySchema = z.object({
  photoUrl: z.string().url(),
  receiverName: z.string().min(2).max(100).optional(),
  signature: z.string().optional(), // Base64 encoded
  notes: z.string().max(500).optional(),
});

// ==================== Earnings Schemas ====================

export const earningsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('week'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ==================== Types ====================

export type UpdateDriverProfileInput = z.infer<typeof updateDriverProfileSchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type AvailableOrdersQuery = z.infer<typeof availableOrdersQuerySchema>;
export type AcceptOrderInput = z.infer<typeof acceptOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type ConfirmPickupInput = z.infer<typeof confirmPickupSchema>;
export type ConfirmDeliveryInput = z.infer<typeof confirmDeliverySchema>;
export type EarningsQuery = z.infer<typeof earningsQuerySchema>;
