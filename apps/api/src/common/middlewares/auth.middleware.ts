import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { prisma, UserRole, UserStatus } from '@rotax1/database';
import { config } from '../config/index.js';
import { InvalidTokenError } from '../../modules/auth/auth.errors.js';

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
  _reply: FastifyReply
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

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new InvalidTokenError();
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  } catch {
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
