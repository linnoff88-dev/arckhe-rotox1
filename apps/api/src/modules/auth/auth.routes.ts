import type { FastifyInstance } from 'fastify';
import { authController } from './auth.controller.js';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Public routes
  fastify.post('/register', {
    schema: {
      body: zodToJsonSchema(registerSchema),
      tags: ['Auth'],
      summary: 'Register new user',
      response: {
        201: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn: { type: 'number' },
          },
        },
      },
    },
    handler: authController.register.bind(authController),
  });

  fastify.post('/login', {
    schema: {
      body: zodToJsonSchema(loginSchema),
      tags: ['Auth'],
      summary: 'Login user',
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn: { type: 'number' },
          },
        },
      },
    },
    handler: authController.login.bind(authController),
  });

  fastify.post('/refresh', {
    schema: {
      body: zodToJsonSchema(refreshSchema),
      tags: ['Auth'],
      summary: 'Refresh access token',
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn: { type: 'number' },
          },
        },
      },
    },
    handler: authController.refresh.bind(authController),
  });

  // Protected routes
  fastify.get('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Get current user',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: authController.me.bind(authController),
  });
}
