import type { FastifyInstance } from 'fastify';
import { ordersController } from './orders.controller.js';
import {
  createOrderSchema,
  calculatePriceSchema,
  orderHistoryQuerySchema,
  cancelOrderSchema,
  rateOrderSchema,
} from './orders.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';

export async function ordersRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // Calculate price (before creating order)
  fastify.post('/calculate-price', {
    schema: {
      body: zodToJsonSchema(calculatePriceSchema),
      tags: ['Orders'],
      summary: 'Calculate order price',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            pricing: {
              type: 'object',
              properties: {
                basePrice: { type: 'number' },
                distancePrice: { type: 'number' },
                categoryMultiplier: { type: 'number' },
                urgencyMultiplier: { type: 'number' },
                subtotal: { type: 'number' },
                platformFee: { type: 'number' },
                total: { type: 'number' },
                driverEarning: { type: 'number' },
                distanceKm: { type: 'number' },
                estimatedMinutes: { type: 'number' },
              },
            },
          },
        },
      },
    },
    handler: ordersController.calculatePrice.bind(ordersController),
  });

  // Create order
  fastify.post('/', {
    schema: {
      body: zodToJsonSchema(createOrderSchema),
      tags: ['Orders'],
      summary: 'Create new order',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.create.bind(ordersController),
  });

  // Get order history
  fastify.get('/', {
    schema: {
      querystring: zodToJsonSchema(orderHistoryQuerySchema),
      tags: ['Orders'],
      summary: 'Get order history',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            orders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string' },
                  category: { type: 'string' },
                  urgency: { type: 'string' },
                  pharmacy: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  driver: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  price: { type: 'number' },
                  distanceKm: { type: 'number' },
                  createdAt: { type: 'string' },
                  deliveredAt: { type: 'string', nullable: true },
                  rating: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      stars: { type: 'number' },
                      comment: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                totalPages: { type: 'number' },
              },
            },
          },
        },
      },
    },
    handler: ordersController.getHistory.bind(ordersController),
  });

  // Get order by ID
  fastify.get('/:id', {
    schema: {
      tags: ['Orders'],
      summary: 'Get order details',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    handler: ordersController.getById.bind(ordersController),
  });

  // Track order (real-time status)
  fastify.get('/:id/track', {
    schema: {
      tags: ['Orders'],
      summary: 'Track order in real-time',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tracking: {
              type: 'object',
              properties: {
                orderId: { type: 'string' },
                status: { type: 'string' },
                driver: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    photoUrl: { type: 'string', nullable: true },
                    vehicleType: { type: 'string' },
                    currentLocation: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        lat: { type: 'number' },
                        lng: { type: 'number' },
                      },
                    },
                  },
                },
                pickup: {
                  type: 'object',
                  properties: {
                    lat: { type: 'number' },
                    lng: { type: 'number' },
                  },
                },
                delivery: {
                  type: 'object',
                  properties: {
                    lat: { type: 'number' },
                    lng: { type: 'number' },
                  },
                },
                estimatedMinutes: { type: 'number', nullable: true },
                statusHistory: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      notes: { type: 'string', nullable: true },
                      timestamp: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: ordersController.track.bind(ordersController),
  });

  // Cancel order
  fastify.post('/:id/cancel', {
    schema: {
      body: zodToJsonSchema(cancelOrderSchema),
      tags: ['Orders'],
      summary: 'Cancel order',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    handler: ordersController.cancel.bind(ordersController),
  });

  // Rate order
  fastify.post('/:id/rate', {
    schema: {
      body: zodToJsonSchema(rateOrderSchema),
      tags: ['Orders'],
      summary: 'Rate delivered order',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    handler: ordersController.rate.bind(ordersController),
  });
}
