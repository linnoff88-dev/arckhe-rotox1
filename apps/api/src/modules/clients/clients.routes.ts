import type { FastifyInstance } from 'fastify';
import { clientsController } from './clients.controller.js';
import { addressesController } from './addresses/addresses.controller.js';
import { updateProfileSchema, createAddressSchema, updateAddressSchema } from './clients.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';

export async function clientsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // ==================== Profile Routes ====================

  fastify.get('/me', {
    schema: {
      tags: ['Clients'],
      summary: 'Get current client profile',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            client: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                document: { type: 'string', nullable: true },
                documentType: { type: 'string', nullable: true },
                profilePhotoUrl: { type: 'string', nullable: true },
                user: {
                  type: 'object',
                  properties: {
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    status: { type: 'string' },
                  },
                },
                addresses: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      label: { type: 'string', nullable: true },
                      street: { type: 'string' },
                      number: { type: 'string' },
                      complement: { type: 'string', nullable: true },
                      city: { type: 'string' },
                      state: { type: 'string' },
                      zipCode: { type: 'string' },
                      lat: { type: 'number' },
                      lng: { type: 'number' },
                      isDefault: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: clientsController.getProfile.bind(clientsController),
  });

  fastify.patch('/me', {
    schema: {
      body: zodToJsonSchema(updateProfileSchema),
      tags: ['Clients'],
      summary: 'Update client profile',
      security: [{ bearerAuth: [] }],
    },
    handler: clientsController.updateProfile.bind(clientsController),
  });

  fastify.post('/me/photo', {
    schema: {
      tags: ['Clients'],
      summary: 'Upload profile photo',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
    },
    handler: clientsController.uploadPhoto.bind(clientsController),
  });

  // ==================== Address Routes ====================

  fastify.get('/addresses', {
    schema: {
      tags: ['Addresses'],
      summary: 'List client addresses',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            addresses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string', nullable: true },
                  street: { type: 'string' },
                  number: { type: 'string' },
                  complement: { type: 'string', nullable: true },
                  neighborhood: { type: 'string', nullable: true },
                  city: { type: 'string' },
                  state: { type: 'string' },
                  zipCode: { type: 'string' },
                  lat: { type: 'number' },
                  lng: { type: 'number' },
                  isDefault: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    handler: addressesController.list.bind(addressesController),
  });

  fastify.get('/addresses/:id', {
    schema: {
      tags: ['Addresses'],
      summary: 'Get address by ID',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    handler: addressesController.getById.bind(addressesController),
  });

  fastify.post('/addresses', {
    schema: {
      body: zodToJsonSchema(createAddressSchema),
      tags: ['Addresses'],
      summary: 'Create new address',
      security: [{ bearerAuth: [] }],
    },
    handler: addressesController.create.bind(addressesController),
  });

  fastify.patch('/addresses/:id', {
    schema: {
      body: zodToJsonSchema(updateAddressSchema),
      tags: ['Addresses'],
      summary: 'Update address',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    handler: addressesController.update.bind(addressesController),
  });

  fastify.delete('/addresses/:id', {
    schema: {
      tags: ['Addresses'],
      summary: 'Delete address',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    handler: addressesController.delete.bind(addressesController),
  });

  fastify.post('/addresses/:id/default', {
    schema: {
      tags: ['Addresses'],
      summary: 'Set address as default',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    handler: addressesController.setDefault.bind(addressesController),
  });
}
