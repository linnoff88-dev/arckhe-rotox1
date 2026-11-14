import type { FastifyRequest, FastifyReply } from 'fastify';
import { addressesService } from './addresses.service.js';
import { clientsService } from '../clients.service.js';
import type { CreateAddressInput, UpdateAddressInput } from '../clients.schema.js';

export class AddressesController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const addresses = await addressesService.list(clientId);
    return reply.send({ addresses });
  }

  async getById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const address = await addressesService.getById(clientId, request.params.id);
    return reply.send({ address });
  }

  async create(
    request: FastifyRequest<{ Body: CreateAddressInput }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const address = await addressesService.create(clientId, request.body);
    return reply.status(201).send({ address });
  }

  async update(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateAddressInput }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const address = await addressesService.update(clientId, request.params.id, request.body);
    return reply.send({ address });
  }

  async delete(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    await addressesService.delete(clientId, request.params.id);
    return reply.status(204).send();
  }

  async setDefault(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const address = await addressesService.setDefault(clientId, request.params.id);
    return reply.send({ address });
  }
}

export const addressesController = new AddressesController();
