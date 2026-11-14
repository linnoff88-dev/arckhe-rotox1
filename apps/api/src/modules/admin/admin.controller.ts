import type { FastifyRequest, FastifyReply } from 'fastify';
import { adminService } from './admin.service.js';
import type {
  DashboardPeriod,
  ListUsersQuery,
  UpdateUserStatusInput,
  PendingDriversQuery,
  ApproveDriverInput,
  ListOrdersQuery,
  CancelOrderInput,
  ReassignOrderInput,
  FinancialReportQuery,
  PayoutQuery,
  ProcessPayoutInput,
} from './admin.schema.js';

export class AdminController {
  // ==================== Dashboard ====================

  async getDashboard(
    request: FastifyRequest<{ Querystring: DashboardPeriod }>,
    reply: FastifyReply
  ) {
    const metrics = await adminService.getDashboardMetrics(request.query);
    return reply.send({ dashboard: metrics });
  }

  // ==================== User Management ====================

  async listUsers(
    request: FastifyRequest<{ Querystring: ListUsersQuery }>,
    reply: FastifyReply
  ) {
    const result = await adminService.listUsers(request.query);
    return reply.send(result);
  }

  async getUserDetails(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const user = await adminService.getUserDetails(request.params.id);
    return reply.send({ user });
  }

  async updateUserStatus(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateUserStatusInput }>,
    reply: FastifyReply
  ) {
    const updated = await adminService.updateUserStatus(
      request.user!.id,
      request.params.id,
      request.body
    );
    return reply.send({ user: updated });
  }

  async getPendingDrivers(
    request: FastifyRequest<{ Querystring: PendingDriversQuery }>,
    reply: FastifyReply
  ) {
    const result = await adminService.getPendingDrivers(request.query);
    return reply.send(result);
  }

  async approveDriver(
    request: FastifyRequest<{ Params: { id: string }; Body: ApproveDriverInput }>,
    reply: FastifyReply
  ) {
    const result = await adminService.approveDriver(
      request.user!.id,
      request.params.id,
      request.body
    );
    return reply.send(result);
  }

  // ==================== Order Management ====================

  async listOrders(
    request: FastifyRequest<{ Querystring: ListOrdersQuery }>,
    reply: FastifyReply
  ) {
    const result = await adminService.listOrders(request.query);
    return reply.send(result);
  }

  async getOrderDetails(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const order = await adminService.getOrderDetails(request.params.id);
    return reply.send({ order });
  }

  async cancelOrder(
    request: FastifyRequest<{ Params: { id: string }; Body: CancelOrderInput }>,
    reply: FastifyReply
  ) {
    const result = await adminService.cancelOrder(
      request.user!.id,
      request.params.id,
      request.body
    );
    return reply.send(result);
  }

  async reassignOrder(
    request: FastifyRequest<{ Params: { id: string }; Body: ReassignOrderInput }>,
    reply: FastifyReply
  ) {
    const result = await adminService.reassignOrder(
      request.user!.id,
      request.params.id,
      request.body
    );
    return reply.send(result);
  }

  // ==================== Financial ====================

  async getFinancialReport(
    request: FastifyRequest<{ Querystring: FinancialReportQuery }>,
    reply: FastifyReply
  ) {
    const report = await adminService.getFinancialReport(request.query);
    return reply.send({ report });
  }

  async getPayoutsList(
    request: FastifyRequest<{ Querystring: PayoutQuery }>,
    reply: FastifyReply
  ) {
    const result = await adminService.getPayoutsList(request.query);
    return reply.send(result);
  }

  async processPayouts(
    request: FastifyRequest<{ Body: ProcessPayoutInput }>,
    reply: FastifyReply
  ) {
    const result = await adminService.processPayouts(request.user!.id, request.body);
    return reply.send(result);
  }
}

export const adminController = new AdminController();
