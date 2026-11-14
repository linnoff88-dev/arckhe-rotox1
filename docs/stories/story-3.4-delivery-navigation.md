# Story 3.4: Delivery Navigation & Confirmation

**Epic:** 3 - Driver Module
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Medium (4-6 hours)

---

## User Story

**As a** driver,
**I want** navigation to pickup and delivery locations with confirmation steps,
**so that** I can complete deliveries efficiently.

---

## Acceptance Criteria

- [ ] 1. Deep link para Google Maps com navegação turn-by-turn
- [ ] 2. Endpoint POST /orders/:id/start-pickup para iniciar navegação à coleta
- [ ] 3. Endpoint POST /orders/:id/confirm-pickup com foto obrigatória
- [ ] 4. Endpoint POST /orders/:id/start-delivery para iniciar navegação à entrega
- [ ] 5. Endpoint POST /orders/:id/confirm-delivery com foto + assinatura opcional
- [ ] 6. Upload de fotos de comprovação para R2/S3
- [ ] 7. Atualização automática de status em cada etapa
- [ ] 8. WebSocket emit para cliente a cada mudança de status

---

## Technical Implementation

### 1. Module Structure

```
apps/api/src/modules/drivers/
├── ... (existing files)
└── delivery/
    ├── delivery.controller.ts
    ├── delivery.service.ts
    ├── delivery.routes.ts
    └── delivery.schema.ts
```

### 2. Zod Schemas

**apps/api/src/modules/drivers/delivery/delivery.schema.ts:**
```typescript
import { z } from 'zod';

export const confirmPickupSchema = z.object({
  photoKey: z.string().min(1, 'Foto de coleta é obrigatória'),
  notes: z.string().max(500).optional(),
});

export const confirmDeliverySchema = z.object({
  photoKey: z.string().min(1, 'Foto de entrega é obrigatória'),
  signatureKey: z.string().optional(),
  receiverName: z.string().min(2).optional(),
  notes: z.string().max(500).optional(),
});

export const uploadProofSchema = z.object({
  type: z.enum(['PICKUP_PHOTO', 'DELIVERY_PHOTO', 'SIGNATURE']),
});

export type ConfirmPickupInput = z.infer<typeof confirmPickupSchema>;
export type ConfirmDeliveryInput = z.infer<typeof confirmDeliverySchema>;
export type UploadProofType = z.infer<typeof uploadProofSchema>['type'];
```

### 3. Delivery Service

**apps/api/src/modules/drivers/delivery/delivery.service.ts:**
```typescript
import { prisma, OrderStatus } from '@rotax1/database';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../common/errors/app-error.js';
import { storageService } from '../../../common/services/storage.service.js';
import { trackingService } from '../../tracking/tracking.service.js';
import { pushNotificationService } from '../../../common/services/push-notification.service.js';
import { getIO } from '../../../common/websocket/socket.js';
import type { ConfirmPickupInput, ConfirmDeliveryInput, UploadProofType } from './delivery.schema.js';

export class DeliveryService {
  async getNavigationUrl(orderId: string, driverId: string, destination: 'pickup' | 'delivery') {
    const order = await this.getDriverOrder(orderId, driverId);

    const lat = destination === 'pickup'
      ? Number(order.pickupLat)
      : Number(order.deliveryLat);
    const lng = destination === 'pickup'
      ? Number(order.pickupLng)
      : Number(order.deliveryLng);

    // Google Maps navigation deep link
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

    // Alternative for mobile apps
    const navigationIntent = `google.navigation:q=${lat},${lng}`;

    return {
      webUrl: googleMapsUrl,
      intentUrl: navigationIntent,
      destination: {
        lat,
        lng,
        address: destination === 'pickup' ? order.pickupAddress : order.deliveryAddress,
      },
    };
  }

  async startPickup(orderId: string, driverId: string) {
    const order = await this.getDriverOrder(orderId, driverId);

    if (order.status !== OrderStatus.COLLECTING) {
      throw new ValidationError('Pedido não está no status correto para iniciar coleta');
    }

    // Log start time
    await prisma.orderEvent.create({
      data: {
        orderId,
        event: 'PICKUP_STARTED',
        data: { timestamp: new Date().toISOString() },
      },
    });

    // Notify client
    await this.notifyClient(order, 'Entregador a caminho da coleta');

    return this.getNavigationUrl(orderId, driverId, 'pickup');
  }

  async confirmPickup(orderId: string, driverId: string, data: ConfirmPickupInput) {
    const order = await this.getDriverOrder(orderId, driverId);

    if (order.status !== OrderStatus.COLLECTING) {
      throw new ValidationError('Pedido não está no status correto para confirmar coleta');
    }

    // Verify photo exists
    const photoExists = await storageService.fileExists(data.photoKey);
    if (!photoExists) {
      throw new ValidationError('Foto de coleta não encontrada. Faça o upload novamente');
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERING,
        pickedUpAt: new Date(),
        pickupPhotoUrl: data.photoKey,
        pickupNotes: data.notes,
      },
      include: {
        client: { include: { user: true } },
        driver: true,
      },
    });

    // Log event
    await prisma.orderEvent.create({
      data: {
        orderId,
        event: 'PICKUP_CONFIRMED',
        data: {
          photoKey: data.photoKey,
          notes: data.notes,
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Emit status update via WebSocket
    await trackingService.emitStatusUpdate(orderId, OrderStatus.DELIVERING);

    // Send push notification
    await pushNotificationService.notifyOrderStatus(
      updatedOrder.client.userId,
      orderId,
      OrderStatus.DELIVERING,
      `${updatedOrder.driver!.name} coletou seu pedido e está a caminho!`
    );

    return {
      status: updatedOrder.status,
      pickedUpAt: updatedOrder.pickedUpAt,
      navigation: await this.getNavigationUrl(orderId, driverId, 'delivery'),
    };
  }

  async startDelivery(orderId: string, driverId: string) {
    const order = await this.getDriverOrder(orderId, driverId);

    if (order.status !== OrderStatus.DELIVERING) {
      throw new ValidationError('Pedido não está no status correto para iniciar entrega');
    }

    // Log start time
    await prisma.orderEvent.create({
      data: {
        orderId,
        event: 'DELIVERY_STARTED',
        data: { timestamp: new Date().toISOString() },
      },
    });

    // Notify client
    await this.notifyClient(order, 'Entregador a caminho do destino');

    return this.getNavigationUrl(orderId, driverId, 'delivery');
  }

  async confirmDelivery(orderId: string, driverId: string, data: ConfirmDeliveryInput) {
    const order = await this.getDriverOrder(orderId, driverId);

    if (order.status !== OrderStatus.DELIVERING) {
      throw new ValidationError('Pedido não está no status correto para confirmar entrega');
    }

    // Verify photo exists
    const photoExists = await storageService.fileExists(data.photoKey);
    if (!photoExists) {
      throw new ValidationError('Foto de entrega não encontrada. Faça o upload novamente');
    }

    // Verify signature if provided
    if (data.signatureKey) {
      const signatureExists = await storageService.fileExists(data.signatureKey);
      if (!signatureExists) {
        throw new ValidationError('Assinatura não encontrada');
      }
    }

    // Update order status
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.DELIVERED,
          deliveredAt: new Date(),
          deliveryPhotoUrl: data.photoKey,
          signatureUrl: data.signatureKey,
          receiverName: data.receiverName,
          deliveryNotes: data.notes,
        },
        include: {
          client: { include: { user: true } },
          driver: true,
        },
      });

      // Increment driver's total deliveries
      await tx.driver.update({
        where: { id: driverId },
        data: {
          totalDeliveries: { increment: 1 },
        },
      });

      return updated;
    });

    // Log event
    await prisma.orderEvent.create({
      data: {
        orderId,
        event: 'DELIVERY_CONFIRMED',
        data: {
          photoKey: data.photoKey,
          signatureKey: data.signatureKey,
          receiverName: data.receiverName,
          notes: data.notes,
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Emit status update via WebSocket
    await trackingService.emitStatusUpdate(orderId, OrderStatus.DELIVERED);

    // Send push notification
    await pushNotificationService.notifyOrderStatus(
      updatedOrder.client.userId,
      orderId,
      OrderStatus.DELIVERED,
      'Seu pedido foi entregue! Avalie a entrega.'
    );

    return {
      status: updatedOrder.status,
      deliveredAt: updatedOrder.deliveredAt,
      earnings: Number(updatedOrder.driverEarning),
    };
  }

  async getUploadUrl(orderId: string, driverId: string, type: UploadProofType) {
    // Verify driver owns this order
    await this.getDriverOrder(orderId, driverId);

    const extension = type === 'SIGNATURE' ? 'png' : 'jpg';
    const key = `orders/${orderId}/proofs/${type.toLowerCase()}_${Date.now()}.${extension}`;
    const mimeType = type === 'SIGNATURE' ? 'image/png' : 'image/jpeg';

    const uploadUrl = await storageService.getPresignedUploadUrl(key, mimeType, 5 * 1024 * 1024);

    return {
      uploadUrl,
      key,
      expiresIn: 3600,
    };
  }

  async getOrderDetails(orderId: string, driverId: string) {
    const order = await this.getDriverOrder(orderId, driverId);

    const pickupAddr = order.pickupAddress as Record<string, string>;
    const deliveryAddr = order.deliveryAddress as Record<string, string>;

    return {
      id: order.id,
      status: order.status,
      category: order.category,
      urgency: order.urgency,
      pickup: {
        address: `${pickupAddr.street}, ${pickupAddr.number}`,
        complement: pickupAddr.complement,
        neighborhood: pickupAddr.neighborhood,
        city: pickupAddr.city,
        state: pickupAddr.state,
        zipCode: pickupAddr.zipCode,
        lat: Number(order.pickupLat),
        lng: Number(order.pickupLng),
        instructions: order.pickupInstructions,
      },
      delivery: {
        address: `${deliveryAddr.street}, ${deliveryAddr.number}`,
        complement: deliveryAddr.complement,
        neighborhood: deliveryAddr.neighborhood,
        city: deliveryAddr.city,
        state: deliveryAddr.state,
        zipCode: deliveryAddr.zipCode,
        lat: Number(order.deliveryLat),
        lng: Number(order.deliveryLng),
        instructions: order.deliveryInstructions,
      },
      distanceKm: Number(order.distanceKm),
      price: Number(order.price),
      driverEarning: Number(order.driverEarning),
      client: {
        name: order.client.name,
        phone: order.client.user.phone,
      },
      packageDescription: order.packageDescription,
      estimatedWeight: order.estimatedWeight,
      timestamps: {
        created: order.createdAt,
        accepted: order.acceptedAt,
        pickedUp: order.pickedUpAt,
        delivered: order.deliveredAt,
      },
    };
  }

  private async getDriverOrder(orderId: string, driverId: string) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        driverId,
      },
      include: {
        client: {
          include: { user: true },
        },
        driver: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido não encontrado ou não pertence a você');
    }

    return order;
  }

  private async notifyClient(order: any, message: string) {
    const io = getIO();
    io.to(`user:${order.client.userId}`).emit('order:update', {
      orderId: order.id,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

export const deliveryService = new DeliveryService();
```

### 4. Delivery Controller

**apps/api/src/modules/drivers/delivery/delivery.controller.ts:**
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { deliveryService } from './delivery.service.js';
import type { ConfirmPickupInput, ConfirmDeliveryInput, UploadProofType } from './delivery.schema.js';

export class DeliveryController {
  async getOrderDetails(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const details = await deliveryService.getOrderDetails(request.params.id, driverId);
    reply.send(details);
  }

  async startPickup(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await deliveryService.startPickup(request.params.id, driverId);
    reply.send(result);
  }

  async confirmPickup(
    request: FastifyRequest<{ Params: { id: string }; Body: ConfirmPickupInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await deliveryService.confirmPickup(
      request.params.id,
      driverId,
      request.body
    );
    reply.send(result);
  }

  async startDelivery(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await deliveryService.startDelivery(request.params.id, driverId);
    reply.send(result);
  }

  async confirmDelivery(
    request: FastifyRequest<{ Params: { id: string }; Body: ConfirmDeliveryInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await deliveryService.confirmDelivery(
      request.params.id,
      driverId,
      request.body
    );
    reply.send(result);
  }

  async getUploadUrl(
    request: FastifyRequest<{ Params: { id: string }; Body: { type: UploadProofType } }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await deliveryService.getUploadUrl(
      request.params.id,
      driverId,
      request.body.type
    );
    reply.send(result);
  }

  async getNavigationUrl(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { destination: 'pickup' | 'delivery' } }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await deliveryService.getNavigationUrl(
      request.params.id,
      driverId,
      request.query.destination
    );
    reply.send(result);
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

export const deliveryController = new DeliveryController();
```

### 5. Delivery Routes

**apps/api/src/modules/drivers/delivery/delivery.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { deliveryController } from './delivery.controller.js';
import { confirmPickupSchema, confirmDeliverySchema, uploadProofSchema } from './delivery.schema.js';
import { zodToJsonSchema } from '../../../common/utils/zod-to-json.js';
import { authenticate } from '../../../common/middlewares/auth.middleware.js';

export async function deliveryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  // Order details
  fastify.get('/orders/:id', {
    schema: {
      tags: ['Delivery'],
      summary: 'Get order details for delivery',
      security: [{ bearerAuth: [] }],
    },
    handler: deliveryController.getOrderDetails.bind(deliveryController),
  });

  // Navigation
  fastify.get('/orders/:id/navigate', {
    schema: {
      tags: ['Delivery'],
      summary: 'Get navigation URL',
      security: [{ bearerAuth: [] }],
    },
    handler: deliveryController.getNavigationUrl.bind(deliveryController),
  });

  // Pickup flow
  fastify.post('/orders/:id/start-pickup', {
    schema: {
      tags: ['Delivery'],
      summary: 'Start navigation to pickup',
      security: [{ bearerAuth: [] }],
    },
    handler: deliveryController.startPickup.bind(deliveryController),
  });

  fastify.post('/orders/:id/confirm-pickup', {
    schema: {
      body: zodToJsonSchema(confirmPickupSchema),
      tags: ['Delivery'],
      summary: 'Confirm pickup with photo',
      security: [{ bearerAuth: [] }],
    },
    handler: deliveryController.confirmPickup.bind(deliveryController),
  });

  // Delivery flow
  fastify.post('/orders/:id/start-delivery', {
    schema: {
      tags: ['Delivery'],
      summary: 'Start navigation to delivery',
      security: [{ bearerAuth: [] }],
    },
    handler: deliveryController.startDelivery.bind(deliveryController),
  });

  fastify.post('/orders/:id/confirm-delivery', {
    schema: {
      body: zodToJsonSchema(confirmDeliverySchema),
      tags: ['Delivery'],
      summary: 'Confirm delivery with photo and signature',
      security: [{ bearerAuth: [] }],
    },
    handler: deliveryController.confirmDelivery.bind(deliveryController),
  });

  // Photo upload
  fastify.post('/orders/:id/upload-proof', {
    schema: {
      body: zodToJsonSchema(uploadProofSchema),
      tags: ['Delivery'],
      summary: 'Get presigned URL for proof upload',
      security: [{ bearerAuth: [] }],
    },
    handler: deliveryController.getUploadUrl.bind(deliveryController),
  });
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/drivers/orders/:id` | Get order details |
| GET | `/drivers/orders/:id/navigate` | Get navigation URL |
| POST | `/drivers/orders/:id/start-pickup` | Start pickup navigation |
| POST | `/drivers/orders/:id/confirm-pickup` | Confirm pickup with photo |
| POST | `/drivers/orders/:id/start-delivery` | Start delivery navigation |
| POST | `/drivers/orders/:id/confirm-delivery` | Confirm delivery |
| POST | `/drivers/orders/:id/upload-proof` | Get upload URL for photos |

---

## Delivery Flow

```
1. Driver accepts order (Story 3.3)
   → Status: COLLECTING

2. Driver taps "Navigate to Pickup"
   POST /drivers/orders/:id/start-pickup
   → Opens Google Maps with turn-by-turn

3. Driver arrives at pickup location
   → Takes photo of package
   POST /drivers/orders/:id/upload-proof { type: "PICKUP_PHOTO" }
   → Uploads photo to R2

4. Driver confirms pickup
   POST /drivers/orders/:id/confirm-pickup { photoKey }
   → Status: DELIVERING
   → Client notified

5. Driver taps "Navigate to Delivery"
   POST /drivers/orders/:id/start-delivery
   → Opens Google Maps

6. Driver arrives at delivery location
   → Takes photo of delivery
   → Optional: Captures receiver signature
   POST /drivers/orders/:id/upload-proof { type: "DELIVERY_PHOTO" }

7. Driver confirms delivery
   POST /drivers/orders/:id/confirm-delivery { photoKey, signatureKey? }
   → Status: DELIVERED
   → Client notified to rate
   → Driver earnings credited
```

---

## Photo Upload Flow

```
1. Request upload URL
   POST /drivers/orders/:id/upload-proof
   { type: "PICKUP_PHOTO" }

2. Response with presigned URL
   {
     uploadUrl: "https://r2.../...",
     key: "orders/{id}/proofs/pickup_photo_123.jpg",
     expiresIn: 3600
   }

3. Upload photo directly to R2
   PUT {uploadUrl}
   Content-Type: image/jpeg
   [binary data]

4. Confirm with the key
   POST /drivers/orders/:id/confirm-pickup
   { photoKey: "orders/{id}/proofs/pickup_photo_123.jpg" }
```

---

## Order Status Transitions

```
COLLECTING ──────────────────> DELIVERING ──────────────────> DELIVERED
     │                              │                              │
     │ confirm-pickup               │ confirm-delivery             │
     │ (photo required)             │ (photo required)             │
     │                              │ (signature optional)         │
     │                              │                              │
     └──── Client notified ─────────┴───── Client notified ────────┘
```

---

## Definition of Done

- [ ] Navigation deep links working
- [ ] Photo upload with presigned URLs
- [ ] Pickup confirmation with photo
- [ ] Delivery confirmation with photo + signature
- [ ] Status transitions correct
- [ ] WebSocket notifications to client
- [ ] Push notifications sent
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 3.3 (Order Acceptance)
- Cloudflare R2 configured
- Google Maps API
