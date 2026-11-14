import { z } from 'zod';

// ==================== Dashboard Schemas ====================

export const dashboardPeriodSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).default('week'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ==================== User Management Schemas ====================

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['CLIENT', 'DRIVER', 'CARRIER', 'ADMIN']).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'BLOCKED']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'name', 'email']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'BLOCKED']),
  reason: z.string().max(500).optional(),
});

export const pendingDriversQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const approveDriverSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().max(500).optional(),
});

// ==================== Order Management Schemas ====================

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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
  search: z.string().optional(), // Order ID, client name, driver name
  sortBy: z.enum(['createdAt', 'status', 'price']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(5).max(500),
  refund: z.boolean().default(true),
});

export const reassignOrderSchema = z.object({
  driverId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

// ==================== Financial Schemas ====================

export const financialReportQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).default('month'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

export const payoutQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  driverId: z.string().uuid().optional(),
});

export const processPayoutSchema = z.object({
  driverIds: z.array(z.string().uuid()).min(1),
  periodEnd: z.coerce.date(),
});

// ==================== Types ====================

export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type PendingDriversQuery = z.infer<typeof pendingDriversQuerySchema>;
export type ApproveDriverInput = z.infer<typeof approveDriverSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type ReassignOrderInput = z.infer<typeof reassignOrderSchema>;
export type FinancialReportQuery = z.infer<typeof financialReportQuerySchema>;
export type PayoutQuery = z.infer<typeof payoutQuerySchema>;
export type ProcessPayoutInput = z.infer<typeof processPayoutSchema>;
