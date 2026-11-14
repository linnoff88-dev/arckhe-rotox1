# Story 1.4: API Base Structure & Health Check

**Epic:** 1 - Foundation & Core Infrastructure
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Small (2-4 hours)

---

## User Story

**As a** developer,
**I want** a well-structured API with documentation,
**so that** I can develop and test endpoints efficiently.

---

## Acceptance Criteria

- [ ] 1. Fastify configurado com error handling global
- [ ] 2. Swagger/OpenAPI documentation auto-gerada
- [ ] 3. Health check endpoint: GET /health
- [ ] 4. Rate limiting configurado (100 req/min por IP)
- [ ] 5. CORS configurado para origens permitidas
- [ ] 6. Logger estruturado (pino)
- [ ] 7. Deploy funcional em ambiente de staging

---

## Technical Implementation

### 1. Main App Setup

**apps/api/src/app.ts:**
```typescript
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './common/config';
import { errorHandler } from './common/plugins/error-handler';
import { authRoutes } from './modules/auth/auth.routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'debug' : 'info',
      transport: config.nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // Plugins
  await app.register(cors, {
    origin: config.nodeEnv === 'development'
      ? true
      : ['https://rotax1.com.br', 'https://admin.rotax1.com.br'],
    credentials: true,
  });

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

  return app;
}
```

### 2. Server Entry Point

**apps/api/src/server.ts:**
```typescript
import { buildApp } from './app';
import { config } from './common/config';

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`🚀 Server running at http://localhost:${config.port}`);
    app.log.info(`📚 Docs available at http://localhost:${config.port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
```

### 3. Error Handler Plugin

**apps/api/src/common/plugins/error-handler.ts:**
```typescript
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';

interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  request.log.error(error);

  let response: ErrorResponse;

  if (error instanceof AppError) {
    response = {
      error: error.name,
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
    };
  } else if (error instanceof ZodError) {
    response = {
      error: 'Validation Error',
      message: 'Dados inválidos',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  } else if (error.statusCode) {
    response = {
      error: error.name || 'Error',
      message: error.message,
      statusCode: error.statusCode,
    };
  } else {
    response = {
      error: 'Internal Server Error',
      message: 'Ocorreu um erro interno. Tente novamente.',
      statusCode: 500,
    };
  }

  reply.status(response.statusCode).send(response);
}
```

### 4. Base AppError Class

**apps/api/src/common/errors/app-error.ts:**
```typescript
export class AppError extends Error {
  public readonly statusCode: number;
  public code: string;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} não encontrado`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso não autorizado') {
    super(message, 403, 'FORBIDDEN');
  }
}
```

### 5. Request ID Plugin

**apps/api/src/common/plugins/request-id.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';

export async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request) => {
    request.id = request.headers['x-request-id'] as string || randomUUID();
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
}
```

### 6. Railway Deployment Config

**apps/api/railway.json:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "pnpm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### 7. Dockerfile (Alternative)

**apps/api/Dockerfile:**
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.12.0 --activate

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm --filter @rotax1/api build

# Production image
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.12.0 --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages ./packages

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
```

---

## API Response Format

### Success Response
```json
{
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-01-23T12:00:00Z"
  }
}
```

### Error Response
```json
{
  "error": "ValidationError",
  "message": "Dados inválidos",
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "email", "message": "Email inválido" }
  ]
}
```

---

## Definition of Done

- [ ] GET /health returns 200 with status info
- [ ] Swagger UI accessible at /docs
- [ ] Rate limiting working (test with 100+ requests)
- [ ] CORS headers present in responses
- [ ] Request ID in all responses
- [ ] Error handler catching all error types
- [ ] Deploy to Railway/staging successful
- [ ] Logs in JSON format in production

---

## Test Commands

```bash
# Health check
curl http://localhost:3000/health

# Rate limit test
for i in {1..110}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health; done

# Check CORS
curl -I -X OPTIONS http://localhost:3000/health -H "Origin: http://localhost:3001"
```

---

## Dependencies

- Story 1.1 (Project Setup)
- Story 1.2 (Database Setup)
- Story 1.3 (Authentication)
