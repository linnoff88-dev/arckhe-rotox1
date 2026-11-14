# Story 4.3: Order Management

**Epic:** 4 - Admin Module
**Status:** Ready for Development
**Priority:** P1 - Important
**Estimate:** Medium (4-6 hours)

---

## User Story

**As an** admin,
**I want** to view and manage all orders,
**so that** I can resolve issues and ensure quality.

---

## Acceptance Criteria

- [ ] 1. Lista de pedidos com filtros (status, data, região)
- [ ] 2. Visualização em mapa de pedidos ativos
- [ ] 3. Detalhes do pedido com timeline completa
- [ ] 4. Ação: cancelar pedido com reembolso
- [ ] 5. Ação: reatribuir pedido para outro driver
- [ ] 6. Chat interno com cliente/driver
- [ ] 7. Histórico de eventos do pedido
- [ ] 8. Export de relatório de pedidos

---

## Technical Implementation

### 1. Module Structure

```
apps/api/src/modules/admin/orders/
├── orders.controller.ts
├── orders.service.ts
├── orders.routes.ts
├── orders.schema.ts
└── messages/
    ├── messages.controller.ts
    ├── messages.service.ts
    └── messages.routes.ts
```

### 2. Zod Schemas

**apps/api/src/modules/admin/orders/orders.schema.ts:**
```typescript
import { z } from 'zod';

export const listOrdersSchema = z.object({
  status: z.enum([
    'PENDING_PAYMENT',
    'SEARCHING_DRIVER',
    'COLLECTING',
    'DELIVERING',
    'DELIVERED',
    'CANCELLED',
  ]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  region: z.string().optional(), // city or state
  clientId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(1).max(500),
  refund: z.boolean().default(true),
});

export const reassignOrderSchema = z.object({
  driverId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const sendMessageSchema = z.object({
  recipientType: z.enum(['CLIENT', 'DRIVER']),
  message: z.string().min(1).max(1000),
});

export type ListOrdersQuery = z.infer<typeof listOrdersSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type ReassignOrderInput = z.infer<typeof reassignOrderSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
```

### 3. Admin Orders Service

**apps/api/src/modules/admin/orders/orders.service.ts:**
```typescript
import { prisma, OrderStatus, PaymentStatus } from '@rotax1/database';
import { NotFoundError, ValidationError } from '../../../common/errors/app-error.js';
import { mercadoPagoService } from '../../payments/mercadopago.service.js';
import { getIO } from '../../../common/websocket/socket.js';
import { pushNotificationService } from '../../../common/services/push-notification.service.js';
import type { ListOrdersQuery, CancelOrderInput, ReassignOrderInput } from './orders.schema.js';

export class AdminOrdersService {
  async listOrders(query: ListOrdersQuery) {
    const {
      status,
      dateFrom,
      dateTo,
      region,
      clientId,
      driverId,
      search,
      page,
      limit,
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    if (region) {
      where.OR = [
        { pickupAddress: { path: ['city'], equals: region } },
        { pickupAddress: { path: ['state'], equals: region } },
        { deliveryAddress: { path: ['city'], equals: region } },
        { deliveryAddress: { path: ['state'], equals: region } },
      ];
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (driverId) {
      where.driverId = driverId;
    }

    if (search) {
      where.OR = [
        { id: { contains: search } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { driver: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          client: { select: { name: true, user: { select: { phone: true } } } },
          driver: { select: { name: true, user: { select: { phone: true } } } },
          payment: { select: { status: true, method: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map((order) => this.formatOrderSummary(order)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getActiveOrdersForMap() {
    const activeOrders = await prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.SEARCHING_DRIVER, OrderStatus.COLLECTING, OrderStatus.DELIVERING] },
      },
      include: {
        client: { select: { name: true } },
        driver: { select: { name: true, currentLat: true, currentLng: true } },
      },
    });

    return activeOrders.map((order) => ({
      id: order.id,
      status: order.status,
      category: order.category,
      pickup: {
        lat: Number(order.pickupLat),
        lng: Number(order.pickupLng),
        address: (order.pickupAddress as any).street,
      },
      delivery: {
        lat: Number(order.deliveryLat),
        lng: Number(order.deliveryLng),
        address: (order.deliveryAddress as any).street,
      },
      driver: order.driver
        ? {
            name: order.driver.name,
            lat: order.driver.currentLat ? Number(order.driver.currentLat) : null,
            lng: order.driver.currentLng ? Number(order.driver.currentLng) : null,
          }
        : null,
      client: { name: order.client.name },
      createdAt: order.createdAt,
    }));
  }

  async getOrderDetails(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: {
          include: {
            user: { select: { email: true, phone: true } },
          },
        },
        driver: {
          include: {
            user: { select: { email: true, phone: true } },
          },
        },
        payment: true,
        rating: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: { select: { email: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    // Get order events
    const events = await prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    // Build timeline
    const timeline = this.buildTimeline(order, events);

    return {
      order: {
        id: order.id,
        status: order.status,
        category: order.category,
        urgency: order.urgency,
        pickup: {
          address: order.pickupAddress,
          lat: Number(order.pickupLat),
          lng: Number(order.pickupLng),
          instructions: order.pickupInstructions,
        },
        delivery: {
          address: order.deliveryAddress,
          lat: Number(order.deliveryLat),
          lng: Number(order.deliveryLng),
          instructions: order.deliveryInstructions,
        },
        distanceKm: Number(order.distanceKm),
        price: Number(order.price),
        platformFee: Number(order.platformFee),
        driverEarning: Number(order.driverEarning),
        packageDescription: order.packageDescription,
        estimatedWeight: order.estimatedWeight,
        proofPhotos: {
          pickup: order.pickupPhotoUrl,
          delivery: order.deliveryPhotoUrl,
          signature: order.signatureUrl,
        },
      },
      client: order.client
        ? {
            id: order.client.id,
            name: order.client.name,
            email: order.client.user.email,
            phone: order.client.user.phone,
          }
        : null,
      driver: order.driver
        ? {
            id: order.driver.id,
            name: order.driver.name,
            email: order.driver.user.email,
            phone: order.driver.user.phone,
            vehicleType: order.driver.vehicleType,
            vehiclePlate: order.driver.vehiclePlate,
            ratingAvg: Number(order.driver.ratingAvg),
          }
        : null,
      payment: order.payment,
      rating: order.rating,
      timeline,
      messages: order.messages,
    };
  }

  async cancelOrder(orderId: string, data: CancelOrderInput, adminId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        client: { include: { user: true } },
        driver: { include: { user: true } },
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
      throw new ValidationError('Pedido não pode ser cancelado');
    }

    // Process refund if requested and payment exists
    if (data.refund && order.payment && order.payment.status === PaymentStatus.PAID) {
      try {
        await mercadoPagoService.refundPayment(Number(order.payment.externalId));
        await prisma.payment.update({
          where: { id: order.payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      } catch (error) {
        console.error('Refund failed:', error);
        throw new ValidationError('Falha ao processar reembolso');
      }
    }

    // Cancel order
    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: data.reason,
        },
      }),
      prisma.adminAction.create({
        data: {
          adminId,
          action: 'ORDER_CANCELLED',
          targetId: orderId,
          targetType: 'ORDER',
          details: {
            reason: data.reason,
            refunded: data.refund,
            previousStatus: order.status,
          },
        },
      }),
    ]);

    // Notify client and driver
    const io = getIO();

    if (order.client) {
      io.to(`user:${order.client.userId}`).emit('order:cancelled', {
        orderId,
        reason: data.reason,
        refunded: data.refund,
      });

      await pushNotificationService.notifyOrderStatus(
        order.client.userId,
        orderId,
        OrderStatus.CANCELLED,
        `Seu pedido foi cancelado. Motivo: ${data.reason}`
      );
    }

    if (order.driver) {
      io.to(`user:${order.driver.userId}`).emit('order:cancelled', {
        orderId,
        reason: data.reason,
      });

      await pushNotificationService.sendToUser(order.driver.userId, {
        title: 'Pedido cancelado',
        body: `O pedido foi cancelado pelo suporte. Motivo: ${data.reason}`,
        data: { type: 'ORDER_CANCELLED', orderId },
      });
    }

    return { message: 'Pedido cancelado com sucesso', refunded: data.refund };
  }

  async reassignOrder(orderId: string, data: ReassignOrderInput, adminId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        driver: { include: { user: true } },
        client: { include: { user: true } },
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    if (order.status !== OrderStatus.COLLECTING && order.status !== OrderStatus.SEARCHING_DRIVER) {
      throw new ValidationError('Pedido não pode ser reatribuído neste status');
    }

    // Verify new driver exists and is available
    const newDriver = await prisma.driver.findUnique({
      where: { id: data.driverId },
      include: { user: true },
    });

    if (!newDriver) {
      throw new NotFoundError('Novo entregador');
    }

    if (!newDriver.isOnline) {
      throw new ValidationError('Entregador não está online');
    }

    // Check if driver has active order
    const activeOrder = await prisma.order.findFirst({
      where: {
        driverId: data.driverId,
        status: { in: [OrderStatus.COLLECTING, OrderStatus.DELIVERING] },
      },
    });

    if (activeOrder) {
      throw new ValidationError('Entregador já possui uma entrega ativa');
    }

    const previousDriverId = order.driverId;

    // Reassign order
    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          driverId: data.driverId,
          status: OrderStatus.COLLECTING,
          acceptedAt: new Date(),
        },
      }),
      prisma.adminAction.create({
        data: {
          adminId,
          action: 'ORDER_REASSIGNED',
          targetId: orderId,
          targetType: 'ORDER',
          details: {
            previousDriverId,
            newDriverId: data.driverId,
            reason: data.reason,
          },
        },
      }),
    ]);

    const io = getIO();

    // Notify previous driver
    if (order.driver) {
      io.to(`user:${order.driver.userId}`).emit('order:removed', {
        orderId,
        reason: data.reason || 'Pedido reatribuído pelo suporte',
      });
    }

    // Notify new driver
    io.to(`user:${newDriver.userId}`).emit('order:assigned', {
      orderId,
      message: 'Novo pedido atribuído pelo suporte',
    });

    await pushNotificationService.sendToUser(newDriver.userId, {
      title: 'Pedido atribuído',
      body: 'Um pedido foi atribuído a você pelo suporte',
      data: { type: 'ORDER_ASSIGNED', orderId },
    });

    // Notify client
    if (order.client) {
      io.to(`user:${order.client.userId}`).emit('order:driver_changed', {
        orderId,
        driver: {
          name: newDriver.name,
          phone: newDriver.user.phone,
          vehicleType: newDriver.vehicleType,
        },
      });
    }

    return { message: 'Pedido reatribuído com sucesso' };
  }

  async getAvailableDrivers(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    // Find online drivers without active orders
    const availableDrivers = await prisma.driver.findMany({
      where: {
        isOnline: true,
        status: 'APPROVED',
        orders: {
          none: {
            status: { in: [OrderStatus.COLLECTING, OrderStatus.DELIVERING] },
          },
        },
      },
      select: {
        id: true,
        name: true,
        vehicleType: true,
        ratingAvg: true,
        currentLat: true,
        currentLng: true,
      },
    });

    // Calculate distance from pickup
    return availableDrivers.map((driver) => {
      const distance = driver.currentLat && driver.currentLng
        ? this.calculateDistance(
            Number(driver.currentLat),
            Number(driver.currentLng),
            Number(order.pickupLat),
            Number(order.pickupLng)
          )
        : null;

      return {
        id: driver.id,
        name: driver.name,
        vehicleType: driver.vehicleType,
        rating: Number(driver.ratingAvg),
        distanceKm: distance,
      };
    }).sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
  }

  async exportOrders(query: ListOrdersQuery, format: 'csv' | 'json') {
    const { orders } = await this.listOrders({ ...query, limit: 10000 });

    if (format === 'json') {
      return JSON.stringify(orders, null, 2);
    }

    const headers = [
      'ID',
      'Status',
      'Category',
      'Client',
      'Driver',
      'Price',
      'Platform Fee',
      'Distance',
      'Created At',
      'Delivered At',
    ];

    const rows = orders.map((o: any) => [
      o.id,
      o.status,
      o.category,
      o.client?.name || '',
      o.driver?.name || '',
      o.price,
      o.platformFee,
      o.distanceKm,
      o.createdAt,
      o.deliveredAt || '',
    ]);

    return [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
  }

  private formatOrderSummary(order: any) {
    const pickupAddr = order.pickupAddress as any;
    const deliveryAddr = order.deliveryAddress as any;

    return {
      id: order.id,
      status: order.status,
      category: order.category,
      urgency: order.urgency,
      pickupCity: pickupAddr?.city,
      deliveryCity: deliveryAddr?.city,
      price: Number(order.price),
      platformFee: Number(order.platformFee),
      distanceKm: Number(order.distanceKm),
      client: order.client ? { name: order.client.name } : null,
      driver: order.driver ? { name: order.driver.name } : null,
      payment: order.payment?.status,
      createdAt: order.createdAt,
      deliveredAt: order.deliveredAt,
    };
  }

  private buildTimeline(order: any, events: any[]) {
    const timeline = [];

    timeline.push({
      event: 'Pedido criado',
      timestamp: order.createdAt,
      details: null,
    });

    if (order.payment?.paidAt) {
      timeline.push({
        event: 'Pagamento confirmado',
        timestamp: order.payment.paidAt,
        details: { method: order.payment.method },
      });
    }

    if (order.acceptedAt) {
      timeline.push({
        event: 'Entregador aceitou',
        timestamp: order.acceptedAt,
        details: { driver: order.driver?.name },
      });
    }

    if (order.pickedUpAt) {
      timeline.push({
        event: 'Pedido coletado',
        timestamp: order.pickedUpAt,
        details: null,
      });
    }

    if (order.deliveredAt) {
      timeline.push({
        event: 'Entrega realizada',
        timestamp: order.deliveredAt,
        details: { receiver: order.receiverName },
      });
    }

    if (order.cancelledAt) {
      timeline.push({
        event: 'Pedido cancelado',
        timestamp: order.cancelledAt,
        details: { reason: order.cancellationReason },
      });
    }

    // Add custom events
    for (const event of events) {
      timeline.push({
        event: event.event,
        timestamp: event.createdAt,
        details: event.data,
      });
    }

    return timeline.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

export const adminOrdersService = new AdminOrdersService();
```

### 4. Order Messages Service

**apps/api/src/modules/admin/orders/messages/messages.service.ts:**
```typescript
import { prisma } from '@rotax1/database';
import { NotFoundError } from '../../../../common/errors/app-error.js';
import { getIO } from '../../../../common/websocket/socket.js';
import { pushNotificationService } from '../../../../common/services/push-notification.service.js';
import type { SendMessageInput } from '../orders.schema.js';

export class OrderMessagesService {
  async sendMessage(
    orderId: string,
    adminId: string,
    data: SendMessageInput
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: { include: { user: true } },
        driver: { include: { user: true } },
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      include: { user: true },
    });

    // Create message
    const message = await prisma.orderMessage.create({
      data: {
        orderId,
        senderId: admin!.userId,
        senderType: 'ADMIN',
        recipientType: data.recipientType,
        content: data.message,
      },
    });

    // Determine recipient
    const recipient = data.recipientType === 'CLIENT' ? order.client : order.driver;

    if (recipient) {
      const io = getIO();

      // Send via WebSocket
      io.to(`user:${recipient.userId}`).emit('message:new', {
        orderId,
        message: {
          id: message.id,
          content: message.content,
          senderType: 'ADMIN',
          createdAt: message.createdAt,
        },
      });

      // Send push notification
      await pushNotificationService.sendToUser(recipient.userId, {
        title: 'Nova mensagem do suporte',
        body: data.message.substring(0, 100),
        data: {
          type: 'ORDER_MESSAGE',
          orderId,
          messageId: message.id,
        },
      });
    }

    return {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
    };
  }

  async getMessages(orderId: string) {
    const messages = await prisma.orderMessage.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { email: true } },
      },
    });

    return messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderType: m.senderType,
      senderEmail: m.sender.email,
      recipientType: m.recipientType,
      createdAt: m.createdAt,
      readAt: m.readAt,
    }));
  }
}

export const orderMessagesService = new OrderMessagesService();
```

### 5. Orders Routes

**apps/api/src/modules/admin/orders/orders.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { ordersController } from './orders.controller.js';
import { messagesController } from './messages/messages.controller.js';
import { authenticate, requireRole } from '../../../common/middlewares/auth.middleware.js';

export async function adminOrdersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole('ADMIN'));

  fastify.get('/', {
    schema: {
      tags: ['Admin Orders'],
      summary: 'List orders with filters',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.listOrders.bind(ordersController),
  });

  fastify.get('/map', {
    schema: {
      tags: ['Admin Orders'],
      summary: 'Get active orders for map',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.getActiveOrdersForMap.bind(ordersController),
  });

  fastify.get('/export', {
    schema: {
      tags: ['Admin Orders'],
      summary: 'Export orders',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.exportOrders.bind(ordersController),
  });

  fastify.get('/:id', {
    schema: {
      tags: ['Admin Orders'],
      summary: 'Get order details',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.getOrderDetails.bind(ordersController),
  });

  fastify.post('/:id/cancel', {
    schema: {
      tags: ['Admin Orders'],
      summary: 'Cancel order',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.cancelOrder.bind(ordersController),
  });

  fastify.post('/:id/reassign', {
    schema: {
      tags: ['Admin Orders'],
      summary: 'Reassign order to another driver',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.reassignOrder.bind(ordersController),
  });

  fastify.get('/:id/available-drivers', {
    schema: {
      tags: ['Admin Orders'],
      summary: 'Get available drivers for reassignment',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.getAvailableDrivers.bind(ordersController),
  });

  // Messages
  fastify.get('/:id/messages', {
    schema: {
      tags: ['Admin Orders'],
      summary: 'Get order messages',
      security: [{ bearerAuth: [] }],
    },
    handler: messagesController.getMessages.bind(messagesController),
  });

  fastify.post('/:id/messages', {
    schema: {
      tags: ['Admin Orders'],
      summary: 'Send message to client/driver',
      security: [{ bearerAuth: [] }],
    },
    handler: messagesController.sendMessage.bind(messagesController),
  });
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/orders` | List orders with filters |
| GET | `/admin/orders/map` | Get orders for map view |
| GET | `/admin/orders/export` | Export orders |
| GET | `/admin/orders/:id` | Get order details |
| POST | `/admin/orders/:id/cancel` | Cancel order |
| POST | `/admin/orders/:id/reassign` | Reassign to driver |
| GET | `/admin/orders/:id/available-drivers` | List available drivers |
| GET | `/admin/orders/:id/messages` | Get messages |
| POST | `/admin/orders/:id/messages` | Send message |

---

## Query Parameters (List Orders)

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status |
| `dateFrom` | datetime | Created after |
| `dateTo` | datetime | Created before |
| `region` | string | City or state |
| `clientId` | uuid | Filter by client |
| `driverId` | uuid | Filter by driver |
| `search` | string | Search ID/names |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

## Map View

The map endpoint returns active orders with coordinates for visualization:

```json
{
  "orders": [
    {
      "id": "uuid",
      "status": "COLLECTING",
      "pickup": { "lat": -23.5, "lng": -46.6, "address": "Rua X" },
      "delivery": { "lat": -23.6, "lng": -46.7, "address": "Rua Y" },
      "driver": { "name": "João", "lat": -23.55, "lng": -46.65 }
    }
  ]
}
```

---

## Definition of Done

- [ ] Order list with filters
- [ ] Map view with active orders
- [ ] Order details with timeline
- [ ] Cancel with refund
- [ ] Reassign to driver
- [ ] Internal messaging
- [ ] Export functionality
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 4.2 (User Management)
- Story 2.3 (Payments - for refund)
- Google Maps for visualization
