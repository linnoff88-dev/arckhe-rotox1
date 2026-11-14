# Story 2.4: Real-time Order Tracking

**Epic:** 2 - Client Module
**Status:** Ready for Development
**Priority:** P1 - High
**Estimate:** Large (6-8 hours)

---

## User Story

**As a** client,
**I want** to track my order in real-time on a map,
**so that** I know exactly where my delivery is.

---

## Acceptance Criteria

- [ ] 1. WebSocket connection para atualizações em tempo real
- [ ] 2. Endpoint WS /orders/:id/track para rastreamento
- [ ] 3. Atualização de localização do entregador a cada 5 segundos
- [ ] 4. Cálculo de ETA dinâmico
- [ ] 5. Notificações push de status (Firebase)
- [ ] 6. Timeline de eventos do pedido
- [ ] 7. Mapa com rota e posição atual
- [ ] 8. Fallback polling caso WebSocket falhe

---

## Technical Implementation

### 1. WebSocket Setup with Socket.IO

**apps/api/src/common/websocket/socket.ts:**
```typescript
import { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { prisma } from '@rotax1/database';

interface AuthenticatedSocket {
  userId: string;
  role: string;
}

export function setupWebSocket(app: FastifyInstance): SocketIOServer {
  const io = new SocketIOServer(app.server, {
    cors: {
      origin: config.nodeEnv === 'development' ? '*' : ['https://rotax1.com.br'],
      credentials: true,
    },
    path: '/socket.io',
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token, config.jwt.secret) as {
        userId: string;
        role: string;
      };
      
      (socket as any).user = {
        userId: payload.userId,
        role: payload.role,
      };
      
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const user = (socket as any).user as AuthenticatedSocket;
    console.log(`User connected: ${user.userId}`);

    // Join user's room
    socket.join(`user:${user.userId}`);

    // Subscribe to order tracking
    socket.on('track:subscribe', async (orderId: string) => {
      // Verify user has access to this order
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          OR: [
            { clientId: user.userId },
            { driver: { userId: user.userId } },
          ],
        },
      });

      if (order) {
        socket.join(`order:${orderId}`);
        socket.emit('track:subscribed', { orderId });
      } else {
        socket.emit('error', { message: 'Order not found or access denied' });
      }
    });

    // Unsubscribe from order tracking
    socket.on('track:unsubscribe', (orderId: string) => {
      socket.leave(`order:${orderId}`);
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${user.userId}`);
    });
  });

  return io;
}

// Singleton for use in other modules
let ioInstance: SocketIOServer | null = null;

export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized');
  }
  return ioInstance;
}

export function setIO(io: SocketIOServer): void {
  ioInstance = io;
}
```

### 2. Tracking Service

**apps/api/src/modules/tracking/tracking.service.ts:**
```typescript
import { prisma, OrderStatus } from '@rotax1/database';
import { getIO } from '../../common/websocket/socket.js';
import { calculateDistance } from '../../common/services/distance.service.js';
import { NotFoundError } from '../../common/errors/app-error.js';

interface LocationUpdate {
  orderId: string;
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}

interface TrackingInfo {
  order: {
    id: string;
    status: string;
    pickupAddress: unknown;
    deliveryAddress: unknown;
  };
  driver: {
    name: string;
    photo: string | null;
    vehicle: string;
    plate: string | null;
    rating: number;
    location: {
      lat: number;
      lng: number;
    } | null;
  } | null;
  timeline: {
    event: string;
    timestamp: Date;
  }[];
  eta: {
    minutes: number;
    distance: number;
  } | null;
}

export class TrackingService {
  async getTrackingInfo(orderId: string, userId: string): Promise<TrackingInfo> {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [
          { client: { userId } },
          { driver: { userId } },
        ],
      },
      include: {
        driver: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    // Build timeline
    const timeline = this.buildTimeline(order);

    // Calculate ETA if driver is assigned and order is in transit
    let eta = null;
    if (order.driver?.currentLat && order.driver?.currentLng) {
      const destination = order.status === OrderStatus.COLLECTING
        ? { lat: Number(order.pickupLat), lng: Number(order.pickupLng) }
        : { lat: Number(order.deliveryLat), lng: Number(order.deliveryLng) };

      const distance = await calculateDistance(
        { lat: Number(order.driver.currentLat), lng: Number(order.driver.currentLng) },
        destination
      );

      if (distance) {
        eta = {
          minutes: distance.durationMinutes,
          distance: distance.distanceKm,
        };
      }
    }

    return {
      order: {
        id: order.id,
        status: order.status,
        pickupAddress: order.pickupAddress,
        deliveryAddress: order.deliveryAddress,
      },
      driver: order.driver ? {
        name: order.driver.name,
        photo: order.driver.profilePhotoUrl,
        vehicle: order.driver.vehicleType,
        plate: order.driver.vehiclePlate,
        rating: Number(order.driver.ratingAvg),
        location: order.driver.currentLat && order.driver.currentLng ? {
          lat: Number(order.driver.currentLat),
          lng: Number(order.driver.currentLng),
        } : null,
      } : null,
      timeline,
      eta,
    };
  }

  async updateDriverLocation(data: LocationUpdate): Promise<void> {
    // Update driver location in database
    await prisma.driver.update({
      where: { id: data.driverId },
      data: {
        currentLat: data.lat,
        currentLng: data.lng,
      },
    });

    // Get order for ETA calculation
    const order = await prisma.order.findUnique({
      where: { id: data.orderId },
    });

    if (!order) return;

    // Calculate new ETA
    const destination = order.status === OrderStatus.COLLECTING
      ? { lat: Number(order.pickupLat), lng: Number(order.pickupLng) }
      : { lat: Number(order.deliveryLat), lng: Number(order.deliveryLng) };

    const distance = await calculateDistance(
      { lat: data.lat, lng: data.lng },
      destination
    );

    // Emit to all clients tracking this order
    const io = getIO();
    io.to(`order:${data.orderId}`).emit('location:update', {
      orderId: data.orderId,
      location: {
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        speed: data.speed,
      },
      eta: distance ? {
        minutes: distance.durationMinutes,
        distance: distance.distanceKm,
      } : null,
      timestamp: new Date().toISOString(),
    });
  }

  async emitStatusUpdate(orderId: string, status: OrderStatus): Promise<void> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: { include: { user: true } },
        driver: true,
      },
    });

    if (!order) return;

    const io = getIO();

    // Emit to order room
    io.to(`order:${orderId}`).emit('status:update', {
      orderId,
      status,
      timestamp: new Date().toISOString(),
    });

    // Emit to client's personal room
    io.to(`user:${order.client.userId}`).emit('order:status', {
      orderId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  private buildTimeline(order: {
    createdAt: Date;
    acceptedAt: Date | null;
    pickedUpAt: Date | null;
    deliveredAt: Date | null;
    cancelledAt: Date | null;
    status: OrderStatus;
  }) {
    const events: { event: string; timestamp: Date }[] = [];

    events.push({ event: 'Pedido criado', timestamp: order.createdAt });

    if (order.acceptedAt) {
      events.push({ event: 'Entregador a caminho', timestamp: order.acceptedAt });
    }

    if (order.pickedUpAt) {
      events.push({ event: 'Pedido coletado', timestamp: order.pickedUpAt });
    }

    if (order.deliveredAt) {
      events.push({ event: 'Entrega realizada', timestamp: order.deliveredAt });
    }

    if (order.cancelledAt) {
      events.push({ event: 'Pedido cancelado', timestamp: order.cancelledAt });
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

export const trackingService = new TrackingService();
```

### 3. Push Notifications Service

**apps/api/src/common/services/push-notification.service.ts:**
```typescript
import admin from 'firebase-admin';
import { config } from '../config/index.js';
import { prisma } from '@rotax1/database';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export class PushNotificationService {
  async sendToUser(userId: string, notification: PushNotification): Promise<void> {
    // Get user's FCM tokens (stored in a separate table or user record)
    // For now, assuming tokens are stored in a user_devices table
    const devices = await prisma.$queryRaw<{ fcm_token: string }[]>`
      SELECT fcm_token FROM user_devices WHERE user_id = ${userId}
    `;

    if (devices.length === 0) return;

    const tokens = devices.map(d => d.fcm_token);

    try {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data,
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });
    } catch (error) {
      console.error('Push notification error:', error);
    }
  }

  async notifyOrderStatus(
    userId: string,
    orderId: string,
    status: string,
    message: string
  ): Promise<void> {
    await this.sendToUser(userId, {
      title: 'Atualização do Pedido',
      body: message,
      data: {
        type: 'ORDER_STATUS',
        orderId,
        status,
      },
    });
  }
}

export const pushNotificationService = new PushNotificationService();
```

### 4. Tracking Routes

**apps/api/src/modules/tracking/tracking.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { trackingController } from './tracking.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';

export async function trackingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/orders/:id/tracking', {
    schema: {
      tags: ['Tracking'],
      summary: 'Get order tracking info',
      security: [{ bearerAuth: [] }],
    },
    handler: trackingController.getTrackingInfo.bind(trackingController),
  });
}
```

---

## WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `track:subscribe` | `orderId` | Subscribe to order updates |
| `track:unsubscribe` | `orderId` | Unsubscribe from order |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `track:subscribed` | `{ orderId }` | Subscription confirmed |
| `location:update` | `{ orderId, location, eta }` | Driver location update |
| `status:update` | `{ orderId, status }` | Order status changed |
| `order:status` | `{ orderId, status }` | Personal notification |

---

## REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tracking/orders/:id/tracking` | Get current tracking info |

---

## Definition of Done

- [ ] Socket.IO setup and working
- [ ] Real-time location updates
- [ ] ETA calculation dynamic
- [ ] Push notifications via Firebase
- [ ] Timeline of order events
- [ ] Polling fallback implemented
- [ ] Connection error handling

---

## Dependencies

- Story 2.2 (Order Creation)
- Redis for Socket.IO adapter (scaling)
- Firebase project configured
