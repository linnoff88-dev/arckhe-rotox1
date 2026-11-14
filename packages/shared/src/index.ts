import { z } from 'zod';

// Common validation schemas
export const emailSchema = z.string().email('Email inválido');
export const phoneSchema = z.string().min(10, 'Telefone inválido');
export const passwordSchema = z.string().min(8, 'Senha deve ter no mínimo 8 caracteres');

// Common types
export interface ApiResponse<T> {
  data: T;
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  code?: string;
  details?: unknown;
}

// Common constants
export const ORDER_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  SEARCHING_DRIVER: 'SEARCHING_DRIVER',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  COLLECTING: 'COLLECTING',
  PICKED_UP: 'PICKED_UP',
  DELIVERING: 'DELIVERING',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;

export const USER_ROLES = {
  CLIENT: 'CLIENT',
  DRIVER: 'DRIVER',
  CARRIER: 'CARRIER',
  ADMIN: 'ADMIN',
} as const;

export const VEHICLE_TYPES = {
  BIKE: 'BIKE',
  MOTO: 'MOTO',
  CAR: 'CAR',
  VAN: 'VAN',
} as const;
