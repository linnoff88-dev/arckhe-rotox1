import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './common/config/index.js';
import { errorHandler } from './common/plugins/error-handler.js';
import { requestIdPlugin } from './common/plugins/request-id.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { clientsRoutes } from './modules/clients/clients.routes.js';
import { pharmaciesRoutes } from './modules/pharmacies/pharmacies.routes.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { driversRoutes } from './modules/drivers/drivers.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'debug' : 'info',
      transport: config.nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // Request ID plugin
  await app.register(requestIdPlugin);

  // CORS
  await app.register(cors, {
    origin: config.nodeEnv === 'development'
      ? true
      : ['https://rotax1.com.br', 'https://admin.rotax1.com.br'],
    credentials: true,
  });

  // Rate Limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({
      error: 'Too Many Requests',
      message: 'Você excedeu o limite de requisições. Tente novamente em 1 minuto.',
      statusCode: 429,
    }),
  });

  // Swagger
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Rotax1 API',
        description: 'API da plataforma de entregas Rotax1',
        version: '1.0.0',
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Development' },
        { url: 'https://api.rotax1.com.br', description: 'Production' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  // Health check
  app.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Health check endpoint',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            environment: { type: 'string' },
          },
        },
      },
    },
    handler: async () => ({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
    }),
  });

  // Routes
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(clientsRoutes, { prefix: '/clients' });
  await app.register(pharmaciesRoutes, { prefix: '/pharmacies' });
  await app.register(ordersRoutes, { prefix: '/orders' });
  await app.register(driversRoutes, { prefix: '/drivers' });
  await app.register(adminRoutes, { prefix: '/admin' });

  return app;
}
