import type { FastifyInstance } from 'fastify';
import { pharmaciesController } from './pharmacies.controller.js';
import { searchPharmaciesSchema } from './pharmacies.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';

export async function pharmaciesRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // Search pharmacies
  fastify.get('/', {
    schema: {
      querystring: zodToJsonSchema(searchPharmaciesSchema),
      tags: ['Pharmacies'],
      summary: 'Search pharmacies',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            pharmacies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  tradeName: { type: 'string', nullable: true },
                  phone: { type: 'string' },
                  logoUrl: { type: 'string', nullable: true },
                  address: {
                    type: 'object',
                    properties: {
                      street: { type: 'string' },
                      number: { type: 'string' },
                      city: { type: 'string' },
                      state: { type: 'string' },
                    },
                  },
                  lat: { type: 'number' },
                  lng: { type: 'number' },
                  distance: { type: 'number' },
                  isOpen: { type: 'boolean' },
                  acceptsExpress: { type: 'boolean' },
                  rating: { type: 'number' },
                  ratingCount: { type: 'number' },
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
    handler: pharmaciesController.search.bind(pharmaciesController),
  });

  // Get nearby pharmacies (quick lookup)
  fastify.get('/nearby', {
    schema: {
      tags: ['Pharmacies'],
      summary: 'Get nearby pharmacies',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'string' },
          lng: { type: 'string' },
          limit: { type: 'string' },
        },
        required: ['lat', 'lng'],
      },
    },
    handler: pharmaciesController.getNearby.bind(pharmaciesController),
  });

  // Get pharmacy by ID
  fastify.get('/:id', {
    schema: {
      tags: ['Pharmacies'],
      summary: 'Get pharmacy details',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    handler: pharmaciesController.getById.bind(pharmaciesController),
  });
}
