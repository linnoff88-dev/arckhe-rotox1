import type { FastifyRequest, FastifyReply } from 'fastify';
import { clientsService } from './clients.service.js';
import type { UpdateProfileInput } from './clients.schema.js';

export class ClientsController {
  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const profile = await clientsService.getProfile(userId);
    return reply.send({ client: profile });
  }

  async updateProfile(
    request: FastifyRequest<{ Body: UpdateProfileInput }>,
    reply: FastifyReply
  ) {
    const userId = request.user!.id;
    const updated = await clientsService.updateProfile(userId, request.body);
    return reply.send({ client: updated });
  }

  async uploadPhoto(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;

    // In production, this would handle multipart form data with @fastify/multipart
    // For now, we'll accept a JSON body with the photo URL
    const body = request.body as { photoUrl?: string } | undefined;

    if (!body?.photoUrl) {
      return reply.status(400).send({ error: 'photoUrl é obrigatório' });
    }

    // For now, we'll use the provided URL or generate a placeholder
    // In production, this would upload to R2/S3 and return the actual URL
    const photoUrl = body.photoUrl || `https://storage.rotax1.com.br/profiles/${userId}/${Date.now()}.jpg`;

    const updated = await clientsService.updateProfilePhoto(userId, photoUrl);
    return reply.send({ client: updated, photoUrl });
  }
}

export const clientsController = new ClientsController();
