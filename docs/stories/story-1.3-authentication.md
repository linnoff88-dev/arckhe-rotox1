# Story 1.3: Authentication System

**Epic:** 1 - Foundation & Core Infrastructure
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Medium (4-6 hours)

---

## User Story

**As a** user (client or driver),
**I want** to register and login securely,
**so that** I can access the platform features.

---

## Acceptance Criteria

- [ ] 1. Endpoint POST /auth/register funcional
- [ ] 2. Endpoint POST /auth/login funcional
- [ ] 3. Endpoint POST /auth/refresh funcional
- [ ] 4. JWT access token (15min) + refresh token (7 days)
- [ ] 5. Senhas hasheadas com bcrypt (cost 12)
- [ ] 6. Validação de email único
- [ ] 7. Roles: CLIENT, DRIVER, ADMIN
- [ ] 8. Middleware de autenticação funcional
- [ ] 9. Testes unitários para auth service (>70% coverage)

---

## Technical Implementation

### 1. Auth Module Structure

```
apps/api/src/modules/auth/
├── auth.controller.ts
├── auth.service.ts
├── auth.routes.ts
├── auth.schema.ts
├── auth.errors.ts
└── auth.spec.ts
```

### 2. Zod Schemas

**apps/api/src/modules/auth/auth.schema.ts:**
```typescript
import { z } from 'zod';
import { UserRole } from '@rotax1/database';

export const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  role: z.enum([UserRole.CLIENT, UserRole.DRIVER]),
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
```

### 3. Custom Errors

**apps/api/src/modules/auth/auth.errors.ts:**
```typescript
import { AppError } from '../../common/errors/app-error';

export class AuthError extends AppError {
  constructor(message: string, statusCode = 401) {
    super(message, statusCode, 'AUTH_ERROR');
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Email ou senha inválidos', 401);
    this.code = 'INVALID_CREDENTIALS';
  }
}

export class EmailAlreadyExistsError extends AuthError {
  constructor() {
    super('Este email já está cadastrado', 409);
    this.code = 'EMAIL_EXISTS';
  }
}

export class InvalidTokenError extends AuthError {
  constructor() {
    super('Token inválido ou expirado', 401);
    this.code = 'INVALID_TOKEN';
  }
}

export class UserNotActiveError extends AuthError {
  constructor() {
    super('Usuário não está ativo. Aguarde aprovação.', 403);
    this.code = 'USER_NOT_ACTIVE';
  }
}
```

### 4. Auth Service

**apps/api/src/modules/auth/auth.service.ts:**
```typescript
import { hash, compare } from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma, UserRole, UserStatus } from '@rotax1/database';
import { config } from '../../common/config';
import {
  InvalidCredentialsError,
  EmailAlreadyExistsError,
  InvalidTokenError,
  UserNotActiveError,
} from './auth.errors';
import type { RegisterInput, LoginInput } from './auth.schema';

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  private readonly BCRYPT_ROUNDS = 12;
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';

  async register(input: RegisterInput): Promise<AuthTokens> {
    // Check if email exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new EmailAlreadyExistsError();
    }

    // Hash password
    const passwordHash = await hash(input.password, this.BCRYPT_ROUNDS);

    // Determine initial status
    const status = input.role === UserRole.DRIVER ? UserStatus.PENDING : UserStatus.ACTIVE;

    // Create user with profile
    const user = await prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: input.role,
        status,
        ...(input.role === UserRole.CLIENT && {
          client: {
            create: { name: input.name },
          },
        }),
        ...(input.role === UserRole.DRIVER && {
          driver: {
            create: {
              name: input.name,
              document: '', // Will be filled in document upload
              vehicleType: 'MOTO', // Default, will be updated
            },
          },
        }),
      },
    });

    return this.generateTokens(user);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordValid = await compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new InvalidCredentialsError();
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UserNotActiveError();
    }

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as TokenPayload;

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new InvalidTokenError();
      }

      return this.generateTokens(user);
    } catch (error) {
      throw new InvalidTokenError();
    }
  }

  private generateTokens(user: { id: string; email: string; role: UserRole }): AuthTokens {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }
}

export const authService = new AuthService();
```

### 5. Auth Controller

**apps/api/src/modules/auth/auth.controller.ts:**
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service';
import type { RegisterInput, LoginInput, RefreshInput } from './auth.schema';

export class AuthController {
  async register(
    request: FastifyRequest<{ Body: RegisterInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const tokens = await authService.register(request.body);
    reply.status(201).send(tokens);
  }

  async login(
    request: FastifyRequest<{ Body: LoginInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const tokens = await authService.login(request.body);
    reply.send(tokens);
  }

  async refresh(
    request: FastifyRequest<{ Body: RefreshInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const tokens = await authService.refresh(request.body.refreshToken);
    reply.send(tokens);
  }

  async me(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.send({ user: request.user });
  }
}

export const authController = new AuthController();
```

### 6. Auth Routes

**apps/api/src/modules/auth/auth.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { authController } from './auth.controller';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema';
import { zodToJsonSchema } from '../../common/utils/zod-to-json';
import { authenticate } from '../../common/middlewares/auth.middleware';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Public routes
  fastify.post('/register', {
    schema: {
      body: zodToJsonSchema(registerSchema),
      tags: ['Auth'],
      summary: 'Register new user',
    },
    handler: authController.register.bind(authController),
  });

  fastify.post('/login', {
    schema: {
      body: zodToJsonSchema(loginSchema),
      tags: ['Auth'],
      summary: 'Login user',
    },
    handler: authController.login.bind(authController),
  });

  fastify.post('/refresh', {
    schema: {
      body: zodToJsonSchema(refreshSchema),
      tags: ['Auth'],
      summary: 'Refresh access token',
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
    },
    handler: authController.me.bind(authController),
  });
}
```

### 7. Auth Middleware

**apps/api/src/common/middlewares/auth.middleware.ts:**
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { prisma, UserRole } from '@rotax1/database';
import { config } from '../config';
import { InvalidTokenError } from '../../modules/auth/auth.errors';

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      role: UserRole;
    };
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new InvalidTokenError();
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as TokenPayload;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new InvalidTokenError();
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  } catch (error) {
    throw new InvalidTokenError();
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);

    if (!request.user || !roles.includes(request.user.role)) {
      reply.status(403).send({ error: 'Acesso não autorizado' });
    }
  };
}
```

### 8. Config

**apps/api/src/common/config/index.ts:**
```typescript
import { z } from 'zod';

const configSchema = z.object({
  port: z.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  jwt: z.object({
    secret: z.string().min(32),
    refreshSecret: z.string().min(32),
  }),
  database: z.object({
    url: z.string().url(),
  }),
  redis: z.object({
    url: z.string().url(),
  }),
});

export const config = configSchema.parse({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV,
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
});
```

---

## Definition of Done

- [ ] All 4 endpoints working (register, login, refresh, me)
- [ ] JWT tokens generated correctly
- [ ] Password hashing with bcrypt cost 12
- [ ] Email uniqueness validated
- [ ] Auth middleware protecting routes
- [ ] Unit tests passing (>70% coverage)
- [ ] Swagger documentation generated

---

## Test Cases

```typescript
describe('AuthService', () => {
  it('should register a new client')
  it('should register a new driver with PENDING status')
  it('should throw EmailAlreadyExistsError for duplicate email')
  it('should login with valid credentials')
  it('should throw InvalidCredentialsError for wrong password')
  it('should throw UserNotActiveError for pending user')
  it('should refresh token with valid refresh token')
  it('should throw InvalidTokenError for expired token')
});
```

---

## Dependencies

- Story 1.1 (Project Setup)
- Story 1.2 (Database Setup)
