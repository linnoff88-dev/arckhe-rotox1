import type { FastifyRequest, FastifyReply } from 'fastify';
import { pharmaciesService } from './pharmacies.service.js';
import type { SearchPharmaciesQuery } from './pharmacies.schema.js';

export class PharmaciesController {
  async search(
    request: FastifyRequest<{ Querystring: SearchPharmaciesQuery }>,
    reply: FastifyReply
  ) {
    const result = await pharmaciesService.search(request.query);
    return reply.send(result);
  }

  async getById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const pharmacy = await pharmaciesService.getById(request.params.id);
    return reply.send({ pharmacy });
  }

  async getNearby(
    request: FastifyRequest<{ Querystring: { lat: string; lng: string; limit?: string } }>,
    reply: FastifyReply
  ) {
    const lat = parseFloat(request.query.lat);
    const lng = parseFloat(request.query.lng);
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 5;

    if (isNaN(lat) || isNaN(lng)) {
      return reply.status(400).send({ error: 'Latitude e longitude são obrigatórios' });
    }

    const pharmacies = await pharmaciesService.getNearby(lat, lng, limit);
    return reply.send({ pharmacies });
  }
}

export const pharmaciesController = new PharmaciesController();
