# Story 3.3: Order Matching & Acceptance

**Epic:** 3 - Driver Module
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Medium (4-6 hours)

---

## User Story

**As a** driver,
**I want** to see available orders nearby and accept them,
**so that** I can earn money making deliveries.

---

## Acceptance Criteria

- [ ] 1. Endpoint GET /drivers/available-orders lista pedidos em raio de 5km
- [ ] 2. Ordenação por proximidade e valor
- [ ] 3. Detalhes do pedido: endereços, distância, valor, categoria
- [ ] 4. Endpoint POST /orders/:id/accept para aceitar pedido
- [ ] 5. Endpoint POST /orders/:id/reject para recusar pedido
- [ ] 6. Race condition prevention com Redis lock
- [ ] 7. Timeout de 60 segundos para aceite
- [ ] 8. Notificação push para novos pedidos na área

---

## Technical Implementation

### 1. Module Structure

```
apps/api/src/modules/drivers/
├── ... (existing files)
└── orders/
    ├── driver-orders.controller.ts
    ├── driver-orders.service.ts
    └── driver-orders.routes.ts
```

### 2. Matching Service

**apps/api/src/modules/drivers/orders/driver-orders.service.ts:**
```typescript
import { prisma, OrderStatus, DriverStatus } from '@rotax1/database';
import { redisService } from '../../../common/services/redis.service.js';
import { availabilityService } from '../availability/availability.service.js';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../../../common/errors/app-error.js';
import { pushNotificationService } from '../../../common/services/push-notification.service.js';
import { getIO } from '../../../common/websocket/socket.js';

const ORDER_LOCK_PREFIX = 'order:lock:';
const LOCK_TTL = 10; // 10 seconds lock
const ACCEPT_TIMEOUT = 60; // 60 seconds to accept

interface AvailableOrder {
  id: string;
  category: string;
  urgency: string;
  pickup: {
    address: string;
    lat: number;
    lng: number;
  };
  delivery: {
    address: string;
    lat: number;
    lng: number;
  };
  distanceKm: number;
  price: number;
  driverEarning: number;
  estimatedTime: number;
  distance: number; // distance from driver
  createdAt: Date;
}

export class DriverOrdersService {
  async getAvailableOrders(driverId: string): Promise<AvailableOrder[]> {
    // Verify driver is online and approved
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundError('Entregador');
    }

    if (driver.status !== DriverStatus.APPROVED) {
      throw new ForbiddenError('Você precisa ser aprovado para ver pedidos');
    }

    if (!driver.isOnline) {
      throw new ForbiddenError('Você precisa estar online para ver pedidos');
    }

    // Get driver location
    const location = await availabilityService.getDriverLocation(driverId);
    if (!location) {
      throw new ValidationError('Localização não disponível. Atualize sua posição');
    }

    // Query orders within 5km radius using PostGIS
    const orders = await prisma.$queryRaw<any[]>`
      SELECT
        o.id,
        o.category,
        o.urgency,
        o.pickup_address as "pickupAddress",
        o.pickup_lat as "pickupLat",
        o.pickup_lng as "pickupLng",
        o.delivery_address as "deliveryAddress",
        o.delivery_lat as "deliveryLat",
        o.delivery_lng as "deliveryLng",
        o.distance_km as "distanceKm",
        o.price,
        o.driver_earning as "driverEarning",
        o.estimated_duration as "estimatedDuration",
        o.created_at as "createdAt",
        ST_Distance(
          ST_MakePoint(o.pickup_lng::float, o.pickup_lat::float)::geography,
          ST_MakePoint(${location.lng}, ${location.lat})::geography
        ) / 1000 as "distanceFromDriver"
      FROM orders o
      WHERE o.status = ${OrderStatus.SEARCHING_DRIVER}
        AND ST_DWithin(
          ST_MakePoint(o.pickup_lng::float, o.pickup_lat::float)::geography,
          ST_MakePoint(${location.lng}, ${location.lat})::geography,
          5000
        )
      ORDER BY "distanceFromDriver" ASC, o.driver_earning DESC
      LIMIT 20
    `;

    return orders.map((order) => {
      const pickupAddr = order.pickupAddress as Record<string, string>;
      const deliveryAddr = order.deliveryAddress as Record<string, string>;

      return {
        id: order.id,
        category: order.category,
        urgency: order.urgency,
        pickup: {
          address: `${pickupAddr.street}, ${pickupAddr.number} - ${pickupAddr.neighborhood || pickupAddr.city}`,
          lat: Number(order.pickupLat),
          lng: Number(order.pickupLng),
        },
        delivery: {
          address: `${deliveryAddr.street}, ${deliveryAddr.number} - ${deliveryAddr.neighborhood || deliveryAddr.city}`,
          lat: Number(order.deliveryLat),
          lng: Number(order.deliveryLng),
        },
        distanceKm: Number(order.distanceKm),
        price: Number(order.price),
        driverEarning: Number(order.driverEarning),
        estimatedTime: order.estimatedDuration || Math.ceil(Number(order.distanceKm) * 3),
        distance: Number(order.distanceFromDriver.toFixed(2)),
        createdAt: order.createdAt,
      };
    });
  }

  async acceptOrder(driverId: string, orderId: string) {
    // Acquire lock to prevent race condition
    const lockKey = `${ORDER_LOCK_PREFIX}${orderId}`;
    const lockAcquired = await this.acquireLock(lockKey);

    if (!lockAcquired) {
      throw new ConflictError('Este pedido está sendo processado. Tente novamente');
    }

    try {
      // Verify driver is approved and online
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        include: { user: true },
      });

      if (!driver) {
        throw new NotFoundError('Entregador');
      }

      if (driver.status !== DriverStatus.APPROVED) {
        throw new ForbiddenError('Você precisa ser aprovado para aceitar pedidos');
      }

      if (!driver.isOnline) {
        throw new ForbiddenError('Você precisa estar online para aceitar pedidos');
      }

      // Check if driver has active orders
      const activeOrder = await prisma.order.findFirst({
        where: {
          driverId,
          status: { in: [OrderStatus.COLLECTING, OrderStatus.DELIVERING] },
        },
      });

      if (activeOrder) {
        throw new ValidationError('Você já possui uma entrega em andamento');
      }

      // Get order and verify it's available
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          client: {
            include: { user: true },
          },
        },
      });

      if (!order) {
        throw new NotFoundError('Pedido');
      }

      if (order.status !== OrderStatus.SEARCHING_DRIVER) {
        throw new ConflictError('Este pedido não está mais disponível');
      }

      // Update order with driver
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          driverId,
          status: OrderStatus.COLLECTING,
          acceptedAt: new Date(),
        },
        include: {
          client: {
            select: {
              name: true,
              user: { select: { phone: true } },
            },
          },
        },
      });

      // Notify client via WebSocket
      const io = getIO();
      io.to(`user:${order.client.userId}`).emit('order:status', {
        orderId,
        status: OrderStatus.COLLECTING,
        driver: {
          id: driver.id,
          name: driver.name,
          photo: driver.profilePhotoUrl,
          phone: driver.user.phone,
          vehicleType: driver.vehicleType,
          vehiclePlate: driver.vehiclePlate,
          rating: Number(driver.ratingAvg),
        },
      });

      // Send push notification to client
      await pushNotificationService.notifyOrderStatus(
        order.client.userId,
        orderId,
        OrderStatus.COLLECTING,
        `${driver.name} está a caminho para coletar seu pedido!`
      );

      return {
        order: {
          id: updatedOrder.id,
          status: updatedOrder.status,
          pickup: updatedOrder.pickupAddress,
          delivery: updatedOrder.deliveryAddress,
          price: Number(updatedOrder.price),
          driverEarning: Number(updatedOrder.driverEarning),
        },
        client: {
          name: updatedOrder.client.name,
          phone: updatedOrder.client.user.phone,
        },
      };
    } finally {
      // Release lock
      await this.releaseLock(lockKey);
    }
  }

  async rejectOrder(driverId: string, orderId: string, reason?: string) {
    // Log rejection for analytics
    await prisma.orderRejection.create({
      data: {
        orderId,
        driverId,
        reason,
      },
    });

    return { message: 'Pedido recusado' };
  }

  async getActiveOrder(driverId: string) {
    const order = await prisma.order.findFirst({
      where: {
        driverId,
        status: { in: [OrderStatus.COLLECTING, OrderStatus.DELIVERING] },
      },
      include: {
        client: {
          select: {
            name: true,
            user: { select: { phone: true } },
          },
        },
        payment: {
          select: { status: true, method: true },
        },
      },
    });

    if (!order) {
      return null;
    }

    return {
      id: order.id,
      status: order.status,
      category: order.category,
      urgency: order.urgency,
      pickup: {
        address: order.pickupAddress,
        lat: Number(order.pickupLat),
        lng: Number(order.pickupLng),
      },
      delivery: {
        address: order.deliveryAddress,
        lat: Number(order.deliveryLat),
        lng: Number(order.deliveryLng),
      },
      distanceKm: Number(order.distanceKm),
      price: Number(order.price),
      driverEarning: Number(order.driverEarning),
      client: {
        name: order.client.name,
        phone: order.client.user.phone,
      },
      payment: order.payment,
      acceptedAt: order.acceptedAt,
      pickedUpAt: order.pickedUpAt,
    };
  }

  private async acquireLock(key: string): Promise<boolean> {
    const result = await redisService.getClient().set(key, '1', 'EX', LOCK_TTL, 'NX');
    return result === 'OK';
  }

  private async releaseLock(key: string): Promise<void> {
    await redisService.del(key);
  }
}

export const driverOrdersService = new DriverOrdersService();
```

### 3. Order Matching Job

**apps/api/src/common/jobs/order-matching.job.ts:**
```typescript
import { prisma, OrderStatus, DriverStatus } from '@rotax1/database';
import { availabilityService } from '../../modules/drivers/availability/availability.service.js';
import { pushNotificationService } from '../services/push-notification.service.js';

export async function notifyNearbyDrivers(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order || order.status !== OrderStatus.SEARCHING_DRIVER) {
    return;
  }

  // Find drivers within 5km of pickup location
  const nearbyDrivers = await availabilityService.getDriversNearLocation(
    Number(order.pickupLat),
    Number(order.pickupLng),
    5
  );

  // Filter drivers that don't have active orders
  const availableDrivers = await Promise.all(
    nearbyDrivers.map(async (driver) => {
      const activeOrder = await prisma.order.findFirst({
        where: {
          driverId: driver.id,
          status: { in: [OrderStatus.COLLECTING, OrderStatus.DELIVERING] },
        },
      });
      return activeOrder ? null : driver;
    })
  );

  const driversToNotify = availableDrivers.filter(Boolean);

  // Send push notifications
  for (const driver of driversToNotify) {
    if (!driver) continue;

    const driverUser = await prisma.driver.findUnique({
      where: { id: driver.id },
      include: { user: true },
    });

    if (driverUser) {
      await pushNotificationService.sendToUser(driverUser.userId, {
        title: 'Novo pedido disponível!',
        body: `Pedido a ${driver.distance.toFixed(1)}km - R$ ${Number(order.driverEarning).toFixed(2)}`,
        data: {
          type: 'NEW_ORDER',
          orderId: order.id,
          distance: String(driver.distance),
          earning: String(order.driverEarning),
        },
      });
    }
  }

  console.log(`Notified ${driversToNotify.length} drivers about order ${orderId}`);
}
```

### 4. Driver Orders Controller

**apps/api/src/modules/drivers/orders/driver-orders.controller.ts:**
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { driverOrdersService } from './driver-orders.service.js';

export class DriverOrdersController {
  async getAvailableOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const driverId = await this.getDriverId(request);
    const orders = await driverOrdersService.getAvailableOrders(driverId);
    reply.send({ orders });
  }

  async acceptOrder(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await driverOrdersService.acceptOrder(driverId, request.params.id);
    reply.send(result);
  }

  async rejectOrder(
    request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await driverOrdersService.rejectOrder(
      driverId,
      request.params.id,
      request.body?.reason
    );
    reply.send(result);
  }

  async getActiveOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const driverId = await this.getDriverId(request);
    const order = await driverOrdersService.getActiveOrder(driverId);
    reply.send({ order });
  }

  private async getDriverId(request: FastifyRequest): Promise<string> {
    const { prisma } = await import('@rotax1/database');
    const driver = await prisma.driver.findFirst({
      where: { userId: request.user!.id },
    });
    if (!driver) {
      throw new Error('Driver not found');
    }
    return driver.id;
  }
}

export const driverOrdersController = new DriverOrdersController();
```

### 5. Driver Orders Routes

**apps/api/src/modules/drivers/orders/driver-orders.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { driverOrdersController } from './driver-orders.controller.js';
import { authenticate } from '../../../common/middlewares/auth.middleware.js';

export async function driverOrdersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/available-orders', {
    schema: {
      tags: ['Driver Orders'],
      summary: 'Get available orders nearby',
      security: [{ bearerAuth: [] }],
    },
    handler: driverOrdersController.getAvailableOrders.bind(driverOrdersController),
  });

  fastify.get('/active-order', {
    schema: {
      tags: ['Driver Orders'],
      summary: 'Get current active order',
      security: [{ bearerAuth: [] }],
    },
    handler: driverOrdersController.getActiveOrder.bind(driverOrdersController),
  });

  fastify.post('/orders/:id/accept', {
    schema: {
      tags: ['Driver Orders'],
      summary: 'Accept an order',
      security: [{ bearerAuth: [] }],
    },
    handler: driverOrdersController.acceptOrder.bind(driverOrdersController),
  });

  fastify.post('/orders/:id/reject', {
    schema: {
      tags: ['Driver Orders'],
      summary: 'Reject an order',
      security: [{ bearerAuth: [] }],
    },
    handler: driverOrdersController.rejectOrder.bind(driverOrdersController),
  });
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/drivers/available-orders` | List nearby orders |
| GET | `/drivers/active-order` | Get current active order |
| POST | `/drivers/orders/:id/accept` | Accept an order |
| POST | `/drivers/orders/:id/reject` | Reject an order |

---

## Order Matching Flow

```
1. Payment confirmed (Story 2.3)
   → Order status: SEARCHING_DRIVER
   → BullMQ job: notifyNearbyDrivers(orderId)

2. Job queries nearby online drivers
   → Redis GEORADIUS within 5km
   → Filter drivers with no active orders

3. Push notification sent to eligible drivers
   → FCM notification with order details
   → Includes: distance, earning, category

4. Driver opens app and sees available orders
   → GET /drivers/available-orders
   → Returns ordered list by proximity

5. Driver accepts order
   → POST /drivers/orders/:id/accept
   → Redis lock prevents race condition
   → Order assigned, status: COLLECTING

6. Client notified
   → WebSocket emit to client
   → Push notification with driver info
```

---

## Race Condition Prevention

```
Driver A                    Driver B
    |                          |
    |--POST /accept----------->|
    |     |                    |
    |  [Lock acquired]         |
    |     |                    |--POST /accept
    |     |                    |     |
    |  [Order updated]         |  [Lock failed]
    |     |                    |     |
    |  [Lock released]         |  [Return 409]
    |<----Success--------------|
```

---

## Definition of Done

- [ ] Available orders list working
- [ ] PostGIS radius query functional
- [ ] Order acceptance with locking
- [ ] Push notifications to drivers
- [ ] WebSocket notification to client
- [ ] Race condition handled
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 3.2 (Geolocation)
- Story 2.3 (Payment - triggers matching)
- Redis for locking
- Firebase for push notifications
