import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service.js';
import type { RegisterInput, LoginInput, RefreshInput } from './auth.schema.js';

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
