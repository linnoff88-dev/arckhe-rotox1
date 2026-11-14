import type { FastifyInstance } from 'fastify';
import { adminController } from './admin.controller.js';
import {
  dashboardPeriodSchema,
  listUsersQuerySchema,
  updateUserStatusSchema,
  pendingDriversQuerySchema,
  approveDriverSchema,
  listOrdersQuerySchema,
  cancelOrderSchema,
  reassignOrderSchema,
  financialReportQuerySchema,
  payoutQuerySchema,
  processPayoutSchema,
} from './admin.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { requireRole } from '../../common/middlewares/auth.middleware.js';
import { UserRole } from '@rotax1/database';

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require admin authentication
  fastify.addHook('preHandler', requireRole(UserRole.ADMIN));

  // ==================== Dashboard ====================

  fastify.get('/dashboard', {
    schema: {
      querystring: zodToJsonSchema(dashboardPeriodSchema),
      tags: ['Admin'],
      summary: 'Get dashboard metrics',
      security: [{ bearerAuth: [] }],
    },
    handler: adminController.getDashboard.bind(adminController),
  });

  // ==================== User Management ====================

  fastify.get('/users', {
    schema: {
      querystring: zodToJsonSchema(listUsersQuerySchema),
      tags: ['Admin'],
      summary: 'List users',
      security: [{ bearerAuth: [] }],
    },
    handler: adminController.listUsers.bind(adminController),
  });

  fastify.get('/users/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Get user details',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: adminController.getUserDetails.bind(adminController),
  });

  fastify.patch('/users/:id/status', {
    schema: {
      body: zodToJsonSchema(updateUserStatusSchema),
      tags: ['Admin'],
      summary: 'Update user status',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: adminController.updateUserStatus.bind(adminController),
  });

  fastify.get('/drivers/pending', {
    schema: {
      querystring: zodToJsonSchema(pendingDriversQuerySchema),
      tags: ['Admin'],
      summary: 'List pending driver approvals',
      security: [{ bearerAuth: [] }],
    },
    handler: adminController.getPendingDrivers.bind(adminController),
  });

  fastify.post('/drivers/:id/approve', {
    schema: {
      body: zodToJsonSchema(approveDriverSchema),
      tags: ['Admin'],
      summary: 'Approve or reject driver',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: adminController.approveDriver.bind(adminController),
  });

  // ==================== Order Management ====================

  fastify.get('/orders', {
    schema: {
      querystring: zodToJsonSchema(listOrdersQuerySchema),
      tags: ['Admin'],
      summary: 'List orders',
      security: [{ bearerAuth: [] }],
    },
    handler: adminController.listOrders.bind(adminController),
  });

  fastify.get('/orders/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Get order details',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: adminController.getOrderDetails.bind(adminController),
  });

  fastify.post('/orders/:id/cancel', {
    schema: {
      body: zodToJsonSchema(cancelOrderSchema),
      tags: ['Admin'],
      summary: 'Cancel order',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: adminController.cancelOrder.bind(adminController),
  });

  fastify.post('/orders/:id/reassign', {
    schema: {
      body: zodToJsonSchema(reassignOrderSchema),
      tags: ['Admin'],
      summary: 'Reassign order to another driver',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: adminController.reassignOrder.bind(adminController),
  });

  // ==================== Financial ====================

  fastify.get('/financial/report', {
    schema: {
      querystring: zodToJsonSchema(financialReportQuerySchema),
      tags: ['Admin'],
      summary: 'Get financial report',
      security: [{ bearerAuth: [] }],
    },
    handler: adminController.getFinancialReport.bind(adminController),
  });

  fastify.get('/financial/payouts', {
    schema: {
      querystring: zodToJsonSchema(payoutQuerySchema),
      tags: ['Admin'],
      summary: 'List pending payouts',
      security: [{ bearerAuth: [] }],
    },
    handler: adminController.getPayoutsList.bind(adminController),
  });

  fastify.post('/financial/payouts/process', {
    schema: {
      body: zodToJsonSchema(processPayoutSchema),
      tags: ['Admin'],
      summary: 'Process driver payouts',
      security: [{ bearerAuth: [] }],
    },
    handler: adminController.processPayouts.bind(adminController),
  });
}
