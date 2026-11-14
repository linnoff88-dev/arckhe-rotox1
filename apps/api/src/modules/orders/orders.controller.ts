import type { FastifyRequest, FastifyReply } from 'fastify';
import { ordersService } from './orders.service.js';
import { clientsService } from '../clients/clients.service.js';
import type {
  CreateOrderInput,
  CalculatePriceInput,
  OrderHistoryQuery,
  CancelOrderInput,
  RateOrderInput,
} from './orders.schema.js';

export class OrdersController {
  // Calculate price before creating order
  async calculatePrice(
    request: FastifyRequest<{ Body: CalculatePriceInput }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const pricing = await ordersService.calculatePrice(clientId, request.body);
    return reply.send({ pricing });
  }

  // Create new order
  async create(
    request: FastifyRequest<{ Body: CreateOrderInput }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const order = await ordersService.create(clientId, request.body);
    return reply.status(201).send({ order });
  }

  // Get order by ID
  async getById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const order = await ordersService.getById(clientId, request.params.id);
    return reply.send({ order });
  }

  // Track order (real-time status and driver location)
  async track(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const tracking = await ordersService.track(clientId, request.params.id);
    return reply.send({ tracking });
  }

  // Get order history
  async getHistory(
    request: FastifyRequest<{ Querystring: OrderHistoryQuery }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const result = await ordersService.getHistory(clientId, request.query);
    return reply.send(result);
  }

  // Cancel order
  async cancel(
    request: FastifyRequest<{ Params: { id: string }; Body: CancelOrderInput }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const result = await ordersService.cancel(clientId, request.params.id, request.body);
    return reply.send(result);
  }

  // Rate order
  async rate(
    request: FastifyRequest<{ Params: { id: string }; Body: RateOrderInput }>,
    reply: FastifyReply
  ) {
    const clientId = await clientsService.getClientIdByUserId(request.user!.id);
    const result = await ordersService.rate(clientId, request.params.id, request.body);
    return reply.send(result);
  }
}

export const ordersController = new OrdersController();
