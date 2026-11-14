import type { FastifyRequest, FastifyReply } from 'fastify';
import { driversService } from './drivers.service.js';
import type {
  UpdateDriverProfileInput,
  UpdateAvailabilityInput,
  UpdateLocationInput,
  AvailableOrdersQuery,
  AcceptOrderInput,
  UpdateOrderStatusInput,
  ConfirmPickupInput,
  ConfirmDeliveryInput,
  EarningsQuery,
} from './drivers.schema.js';

export class DriversController {
  // ==================== Profile ====================

  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    const profile = await driversService.getProfile(request.user!.id);
    return reply.send({ driver: profile });
  }

  async updateProfile(
    request: FastifyRequest<{ Body: UpdateDriverProfileInput }>,
    reply: FastifyReply
  ) {
    const updated = await driversService.updateProfile(request.user!.id, request.body);
    return reply.send({ driver: updated });
  }

  async uploadDocument(
    request: FastifyRequest<{ Body: { type: string; documentUrl?: string } }>,
    reply: FastifyReply
  ) {
    // In production, this would handle multipart form data with @fastify/multipart
    // For now, we'll accept a JSON body with the document URL
    if (!request.body.documentUrl) {
      return reply.status(400).send({ error: 'documentUrl é obrigatório' });
    }

    const validTypes = ['CNH', 'VEHICLE_DOC', 'PROFILE_PHOTO'];
    if (!validTypes.includes(request.body.type)) {
      return reply.status(400).send({ error: 'Tipo de documento inválido' });
    }

    // In production, this would upload to R2/S3
    const url = request.body.documentUrl || `https://storage.rotax1.com.br/drivers/${request.user!.id}/${request.body.type}/${Date.now()}.jpg`;

    const updated = await driversService.updateDocument(request.user!.id, request.body.type, url);
    return reply.send({ driver: updated, documentUrl: url });
  }

  // ==================== Availability ====================

  async setOnlineStatus(
    request: FastifyRequest<{ Body: UpdateAvailabilityInput }>,
    reply: FastifyReply
  ) {
    const updated = await driversService.setOnlineStatus(request.user!.id, request.body.isOnline);
    return reply.send({ isOnline: updated.isOnline });
  }

  async updateLocation(
    request: FastifyRequest<{ Body: UpdateLocationInput }>,
    reply: FastifyReply
  ) {
    await driversService.updateLocation(request.user!.id, request.body);
    return reply.send({ success: true });
  }

  // ==================== Orders ====================

  async getAvailableOrders(
    request: FastifyRequest<{ Querystring: AvailableOrdersQuery }>,
    reply: FastifyReply
  ) {
    const driverId = await driversService.getDriverIdByUserId(request.user!.id);
    const orders = await driversService.getAvailableOrders(driverId, request.query);
    return reply.send({ orders });
  }

  async acceptOrder(
    request: FastifyRequest<{ Body: AcceptOrderInput }>,
    reply: FastifyReply
  ) {
    const driverId = await driversService.getDriverIdByUserId(request.user!.id);
    const order = await driversService.acceptOrder(driverId, request.body.orderId);
    return reply.send({ order });
  }

  async getCurrentOrder(request: FastifyRequest, reply: FastifyReply) {
    const driverId = await driversService.getDriverIdByUserId(request.user!.id);
    const order = await driversService.getCurrentOrder(driverId);
    return reply.send({ order });
  }

  async updateOrderStatus(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateOrderStatusInput }>,
    reply: FastifyReply
  ) {
    const driverId = await driversService.getDriverIdByUserId(request.user!.id);
    const order = await driversService.updateOrderStatus(
      driverId,
      request.params.id,
      request.body
    );
    return reply.send({ order });
  }

  async confirmPickup(
    request: FastifyRequest<{ Params: { id: string }; Body: ConfirmPickupInput }>,
    reply: FastifyReply
  ) {
    const driverId = await driversService.getDriverIdByUserId(request.user!.id);
    const order = await driversService.confirmPickup(
      driverId,
      request.params.id,
      request.body
    );
    return reply.send({ order });
  }

  async confirmDelivery(
    request: FastifyRequest<{ Params: { id: string }; Body: ConfirmDeliveryInput }>,
    reply: FastifyReply
  ) {
    const driverId = await driversService.getDriverIdByUserId(request.user!.id);
    const order = await driversService.confirmDelivery(
      driverId,
      request.params.id,
      request.body
    );
    return reply.send({ order });
  }

  async getOrderHistory(
    request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>,
    reply: FastifyReply
  ) {
    const driverId = await driversService.getDriverIdByUserId(request.user!.id);
    const page = parseInt(request.query.page || '1', 10);
    const limit = parseInt(request.query.limit || '20', 10);
    const result = await driversService.getOrderHistory(driverId, page, limit);
    return reply.send(result);
  }

  // ==================== Earnings ====================

  async getEarnings(
    request: FastifyRequest<{ Querystring: EarningsQuery }>,
    reply: FastifyReply
  ) {
    const driverId = await driversService.getDriverIdByUserId(request.user!.id);
    const earnings = await driversService.getEarnings(driverId, request.query);
    return reply.send({ earnings });
  }
}

export const driversController = new DriversController();
