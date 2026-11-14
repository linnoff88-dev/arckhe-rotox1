import type { FastifyInstance } from 'fastify';
import { driversController } from './drivers.controller.js';
import {
  updateDriverProfileSchema,
  updateAvailabilitySchema,
  updateLocationSchema,
  availableOrdersQuerySchema,
  acceptOrderSchema,
  updateOrderStatusSchema,
  confirmPickupSchema,
  confirmDeliverySchema,
  earningsQuerySchema,
} from './drivers.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { requireRole } from '../../common/middlewares/auth.middleware.js';
import { UserRole } from '@rotax1/database';

export async function driversRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require driver authentication
  fastify.addHook('preHandler', requireRole(UserRole.DRIVER));

  // ==================== Profile Routes ====================

  fastify.get('/me', {
    schema: {
      tags: ['Drivers'],
      summary: 'Get driver profile',
      security: [{ bearerAuth: [] }],
    },
    handler: driversController.getProfile.bind(driversController),
  });

  fastify.patch('/me', {
    schema: {
      body: zodToJsonSchema(updateDriverProfileSchema),
      tags: ['Drivers'],
      summary: 'Update driver profile',
      security: [{ bearerAuth: [] }],
    },
    handler: driversController.updateProfile.bind(driversController),
  });

  fastify.post('/me/documents', {
    schema: {
      tags: ['Drivers'],
      summary: 'Upload driver document (CNH, vehicle doc, profile photo)',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
    },
    handler: driversController.uploadDocument.bind(driversController),
  });

  // ==================== Availability Routes ====================

  fastify.post('/availability', {
    schema: {
      body: zodToJsonSchema(updateAvailabilitySchema),
      tags: ['Drivers'],
      summary: 'Set online/offline status',
      security: [{ bearerAuth: [] }],
    },
    handler: driversController.setOnlineStatus.bind(driversController),
  });

  fastify.post('/location', {
    schema: {
      body: zodToJsonSchema(updateLocationSchema),
      tags: ['Drivers'],
      summary: 'Update driver location',
      security: [{ bearerAuth: [] }],
    },
    handler: driversController.updateLocation.bind(driversController),
  });

  // ==================== Order Routes ====================

  fastify.get('/orders/available', {
    schema: {
      querystring: zodToJsonSchema(availableOrdersQuerySchema),
      tags: ['Drivers'],
      summary: 'Get available orders nearby',
      security: [{ bearerAuth: [] }],
    },
    handler: driversController.getAvailableOrders.bind(driversController),
  });

  fastify.post('/orders/accept', {
    schema: {
      body: zodToJsonSchema(acceptOrderSchema),
      tags: ['Drivers'],
      summary: 'Accept an order',
      security: [{ bearerAuth: [] }],
    },
    handler: driversController.acceptOrder.bind(driversController),
  });

  fastify.get('/orders/current', {
    schema: {
      tags: ['Drivers'],
      summary: 'Get current active order',
      security: [{ bearerAuth: [] }],
    },
    handler: driversController.getCurrentOrder.bind(driversController),
  });

  fastify.patch('/orders/:id/status', {
    schema: {
      body: zodToJsonSchema(updateOrderStatusSchema),
      tags: ['Drivers'],
      summary: 'Update order status',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: driversController.updateOrderStatus.bind(driversController),
  });

  fastify.post('/orders/:id/pickup', {
    schema: {
      body: zodToJsonSchema(confirmPickupSchema),
      tags: ['Drivers'],
      summary: 'Confirm order pickup',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: driversController.confirmPickup.bind(driversController),
  });

  fastify.post('/orders/:id/deliver', {
    schema: {
      body: zodToJsonSchema(confirmDeliverySchema),
      tags: ['Drivers'],
      summary: 'Confirm order delivery',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: driversController.confirmDelivery.bind(driversController),
  });

  fastify.get('/orders/history', {
    schema: {
      tags: ['Drivers'],
      summary: 'Get order history',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          limit: { type: 'string' },
        },
      },
    },
    handler: driversController.getOrderHistory.bind(driversController),
  });

  // ==================== Earnings Routes ====================

  fastify.get('/earnings', {
    schema: {
      querystring: zodToJsonSchema(earningsQuerySchema),
      tags: ['Drivers'],
      summary: 'Get earnings summary',
      security: [{ bearerAuth: [] }],
    },
    handler: driversController.getEarnings.bind(driversController),
  });
}
