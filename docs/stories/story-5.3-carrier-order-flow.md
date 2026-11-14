# Story 5.3: Carrier Order Flow

## Story Info

**Epic:** 5 - Carrier Module
**Priority:** P2
**Estimate:** Large
**Dependencies:** Story 5.2 (Fleet Management)

## User Story

**As a** carrier,
**I want** to receive and manage bulk delivery requests,
**so that** I can fulfill larger orders.

## Acceptance Criteria

### AC1: Order Routing to Carriers
- [ ] System automatically routes orders to carriers when weight > 20kg OR volume = LARGE
- [ ] Multiple carriers in the order region receive the request
- [ ] Carriers see pending orders in their dashboard
- [ ] Orders not accepted within timeout return to order pool

### AC2: Order Accept/Reject with Pricing
- [ ] Carrier can view order details (origin, destination, weight, dimensions)
- [ ] Carrier can accept with platform price or propose custom price
- [ ] Carrier can reject with optional reason
- [ ] Client receives notification of price proposal (if custom)
- [ ] Client can accept/reject custom price
- [ ] Accepted orders move to "assigned" status

### AC3: Internal Assignment to Driver/Vehicle
- [ ] Carrier assigns order to specific carrier driver
- [ ] Carrier assigns appropriate vehicle based on capacity
- [ ] Driver receives notification of new assignment
- [ ] Driver can view order details in their app
- [ ] Assignment history is tracked

### AC4: Unified Tracking
- [ ] Client sees same tracking interface as regular orders
- [ ] Real-time location updates from carrier driver
- [ ] Status updates (picked up, in transit, delivered)
- [ ] Photo proof of delivery
- [ ] Integration with existing tracking WebSocket

### AC5: Carrier Payouts
- [ ] Completed orders tracked for carrier billing
- [ ] Platform commission deducted (configurable %)
- [ ] Payout to carrier bank account
- [ ] Financial reports for carrier
- [ ] Invoice generation

---

## Technical Implementation

### Database Schema (Prisma)

```prisma
// Enums
enum CarrierOrderStatus {
  PENDING          // Aguardando aceite de carrier
  BIDDING          // Carrier propôs preço diferente
  ACCEPTED         // Carrier aceitou
  CLIENT_REJECTED  // Cliente rejeitou proposta
  ASSIGNED         // Atribuído a motorista/veículo
  PICKED_UP        // Coletado
  IN_TRANSIT       // Em trânsito
  DELIVERED        // Entregue
  CANCELLED        // Cancelado
}

enum BidStatus {
  PENDING
  ACCEPTED
  REJECTED
  EXPIRED
}

// Add to Order model
model Order {
  // ... existing fields

  // Carrier fields (optional - only for carrier orders)
  isCarrierOrder    Boolean           @default(false) @map("is_carrier_order")
  carrierOrderId    String?           @unique @map("carrier_order_id")
  carrierOrder      CarrierOrder?     @relation(fields: [carrierOrderId], references: [id])
}

// New models
model CarrierOrder {
  id                String              @id @default(uuid())
  orderId           String              @unique @map("order_id")
  order             Order               @relation(fields: [orderId], references: [id])

  // Carrier assignment
  carrierId         String?             @map("carrier_id")
  carrier           Carrier?            @relation(fields: [carrierId], references: [id])

  // Internal assignment
  carrierDriverId   String?             @map("carrier_driver_id")
  carrierDriver     CarrierDriver?      @relation(fields: [carrierDriverId], references: [id])
  carrierVehicleId  String?             @map("carrier_vehicle_id")
  carrierVehicle    CarrierVehicle?     @relation(fields: [carrierVehicleId], references: [id])

  // Routing info
  routedToRegions   String[]            @map("routed_to_regions") // Region IDs
  routingReason     String              @map("routing_reason") // "WEIGHT" | "VOLUME" | "SPECIAL"

  // Status
  status            CarrierOrderStatus  @default(PENDING)

  // Pricing
  platformPrice     Decimal             @map("platform_price") @db.Decimal(10, 2)
  finalPrice        Decimal?            @map("final_price") @db.Decimal(10, 2)
  platformCommission Decimal?           @map("platform_commission") @db.Decimal(10, 2)
  carrierPayout     Decimal?            @map("carrier_payout") @db.Decimal(10, 2)

  // Timeouts
  acceptTimeout     DateTime            @map("accept_timeout")

  // Timestamps
  acceptedAt        DateTime?           @map("accepted_at")
  assignedAt        DateTime?           @map("assigned_at")
  pickedUpAt        DateTime?           @map("picked_up_at")
  deliveredAt       DateTime?           @map("delivered_at")
  createdAt         DateTime            @default(now()) @map("created_at")
  updatedAt         DateTime            @updatedAt @map("updated_at")

  // Relations
  bids              CarrierBid[]
  assignments       CarrierAssignment[]

  @@map("carrier_orders")
  @@index([status])
  @@index([carrierId])
  @@index([acceptTimeout])
}

model CarrierBid {
  id              String        @id @default(uuid())
  carrierOrderId  String        @map("carrier_order_id")
  carrierOrder    CarrierOrder  @relation(fields: [carrierOrderId], references: [id])
  carrierId       String        @map("carrier_id")
  carrier         Carrier       @relation(fields: [carrierId], references: [id])

  // Bid details
  proposedPrice   Decimal       @map("proposed_price") @db.Decimal(10, 2)
  estimatedTime   Int?          @map("estimated_time") // Minutes
  notes           String?

  // Status
  status          BidStatus     @default(PENDING)

  // Timestamps
  respondedAt     DateTime?     @map("responded_at")
  expiresAt       DateTime      @map("expires_at")
  createdAt       DateTime      @default(now()) @map("created_at")

  @@unique([carrierOrderId, carrierId])
  @@map("carrier_bids")
  @@index([carrierId, status])
}

model CarrierAssignment {
  id              String          @id @default(uuid())
  carrierOrderId  String          @map("carrier_order_id")
  carrierOrder    CarrierOrder    @relation(fields: [carrierOrderId], references: [id])
  carrierDriverId String          @map("carrier_driver_id")
  carrierDriver   CarrierDriver   @relation(fields: [carrierDriverId], references: [id])
  carrierVehicleId String         @map("carrier_vehicle_id")
  carrierVehicle  CarrierVehicle  @relation(fields: [carrierVehicleId], references: [id])

  // Assignment info
  assignedBy      String          @map("assigned_by") // Carrier user ID
  notes           String?

  // Status
  isActive        Boolean         @default(true) @map("is_active")

  // Timestamps
  createdAt       DateTime        @default(now()) @map("created_at")
  unassignedAt    DateTime?       @map("unassigned_at")

  @@map("carrier_assignments")
  @@index([carrierOrderId, isActive])
}

model CarrierPayout {
  id              String        @id @default(uuid())
  carrierId       String        @map("carrier_id")
  carrier         Carrier       @relation(fields: [carrierId], references: [id])

  // Period
  periodStart     DateTime      @map("period_start")
  periodEnd       DateTime      @map("period_end")

  // Amounts
  grossAmount     Decimal       @map("gross_amount") @db.Decimal(10, 2)
  commission      Decimal       @db.Decimal(10, 2)
  netAmount       Decimal       @map("net_amount") @db.Decimal(10, 2)
  orderCount      Int           @map("order_count")

  // Payment
  status          PayoutStatus  @default(PENDING)
  paymentMethod   String?       @map("payment_method")
  paymentRef      String?       @map("payment_ref")

  // Timestamps
  processedAt     DateTime?     @map("processed_at")
  createdAt       DateTime      @default(now()) @map("created_at")

  // Relations
  items           CarrierPayoutItem[]

  @@map("carrier_payouts")
  @@index([carrierId, status])
}

model CarrierPayoutItem {
  id              String        @id @default(uuid())
  payoutId        String        @map("payout_id")
  payout          CarrierPayout @relation(fields: [payoutId], references: [id])
  carrierOrderId  String        @map("carrier_order_id")

  // Amounts
  orderAmount     Decimal       @map("order_amount") @db.Decimal(10, 2)
  commission      Decimal       @db.Decimal(10, 2)
  netAmount       Decimal       @map("net_amount") @db.Decimal(10, 2)

  @@map("carrier_payout_items")
}

// Add relations to existing models
model Carrier {
  // ... existing fields
  carrierOrders   CarrierOrder[]
  bids            CarrierBid[]
  payouts         CarrierPayout[]
}

model CarrierDriver {
  // ... existing fields
  carrierOrders   CarrierOrder[]
  assignments     CarrierAssignment[]
}

model CarrierVehicle {
  // ... existing fields
  carrierOrders   CarrierOrder[]
  assignments     CarrierAssignment[]
}
```

### API Endpoints

#### Order Routing (Internal Service)

```
POST /internal/orders/:orderId/route-to-carriers
```

Called automatically when order meets carrier criteria.

#### Carrier Dashboard Endpoints

```
GET    /carrier/orders/available           # Pedidos disponíveis na região
GET    /carrier/orders                     # Meus pedidos (aceitos/em andamento)
GET    /carrier/orders/:id                 # Detalhes do pedido
POST   /carrier/orders/:id/accept          # Aceitar com preço plataforma
POST   /carrier/orders/:id/bid             # Propor preço diferente
POST   /carrier/orders/:id/reject          # Rejeitar pedido
POST   /carrier/orders/:id/assign          # Atribuir motorista/veículo
POST   /carrier/orders/:id/unassign        # Remover atribuição
```

#### Carrier Driver Endpoints

```
GET    /carrier-driver/orders              # Minhas atribuições
GET    /carrier-driver/orders/:id          # Detalhes do pedido
POST   /carrier-driver/orders/:id/pickup   # Confirmar coleta
POST   /carrier-driver/orders/:id/status   # Atualizar status
POST   /carrier-driver/orders/:id/deliver  # Confirmar entrega
POST   /carrier-driver/orders/:id/location # Atualizar localização
```

#### Client Endpoints (Bid Response)

```
GET    /orders/:id/bid                     # Ver proposta de preço
POST   /orders/:id/bid/accept              # Aceitar proposta
POST   /orders/:id/bid/reject              # Rejeitar proposta
```

#### Financial Endpoints

```
GET    /carrier/financial/summary          # Resumo financeiro
GET    /carrier/financial/orders           # Histórico de pedidos pagos
GET    /carrier/payouts                    # Lista de pagamentos
GET    /carrier/payouts/:id                # Detalhes do pagamento
GET    /carrier/payouts/:id/invoice        # Download nota fiscal
```

---

### Zod Schemas

```typescript
// src/schemas/carrier-order.schema.ts
import { z } from 'zod';

// Order routing criteria
export const carrierRoutingCriteriaSchema = z.object({
  minWeightKg: z.number().default(20),
  volumeThreshold: z.enum(['LARGE', 'EXTRA_LARGE']).default('LARGE'),
  specialCategories: z.array(z.string()).optional(),
});

// Available orders query
export const availableOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sortBy: z.enum(['distance', 'price', 'deadline']).default('deadline'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Accept order
export const acceptOrderSchema = z.object({
  vehicleId: z.string().uuid().optional(), // Pre-assign vehicle
  driverId: z.string().uuid().optional(), // Pre-assign driver
  notes: z.string().max(500).optional(),
});

// Bid on order
export const createBidSchema = z.object({
  proposedPrice: z.number().positive().max(10000),
  estimatedMinutes: z.number().int().positive().max(1440).optional(), // Max 24h
  notes: z.string().max(500).optional(),
});

// Assign to driver/vehicle
export const assignOrderSchema = z.object({
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

// Carrier order response
export const carrierOrderResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  status: z.enum([
    'PENDING', 'BIDDING', 'ACCEPTED', 'CLIENT_REJECTED',
    'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'
  ]),

  // Order details
  order: z.object({
    pickupAddress: z.string(),
    pickupLat: z.number(),
    pickupLng: z.number(),
    deliveryAddress: z.string(),
    deliveryLat: z.number(),
    deliveryLng: z.number(),
    weightKg: z.number().nullable(),
    volume: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE']).nullable(),
    scheduledFor: z.string().datetime().nullable(),
    notes: z.string().nullable(),
  }),

  // Pricing
  platformPrice: z.number(),
  finalPrice: z.number().nullable(),
  platformCommission: z.number().nullable(),
  carrierPayout: z.number().nullable(),

  // Assignment
  carrier: z.object({
    id: z.string().uuid(),
    companyName: z.string(),
  }).nullable(),
  carrierDriver: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string(),
  }).nullable(),
  carrierVehicle: z.object({
    id: z.string().uuid(),
    plate: z.string(),
    type: z.string(),
  }).nullable(),

  // Routing
  routingReason: z.string(),
  acceptTimeout: z.string().datetime(),

  // Timestamps
  acceptedAt: z.string().datetime().nullable(),
  assignedAt: z.string().datetime().nullable(),
  pickedUpAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

// Bid response
export const bidResponseSchema = z.object({
  id: z.string().uuid(),
  carrierId: z.string().uuid(),
  carrierName: z.string(),
  proposedPrice: z.number(),
  platformPrice: z.number(),
  priceDifference: z.number(),
  estimatedMinutes: z.number().nullable(),
  notes: z.string().nullable(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
  expiresAt: z.string().datetime(),
});

// Client bid response
export const clientBidResponseSchema = z.object({
  accept: z.boolean(),
  reason: z.string().max(500).optional(), // If rejecting
});

// Pickup confirmation
export const pickupConfirmationSchema = z.object({
  notes: z.string().max(500).optional(),
  photos: z.array(z.string().url()).max(5).optional(),
});

// Delivery confirmation
export const deliveryConfirmationSchema = z.object({
  receiverName: z.string().min(2).max(100).optional(),
  receiverDocument: z.string().optional(),
  signature: z.string().optional(), // Base64 signature
  photos: z.array(z.string().url()).min(1).max(5),
  notes: z.string().max(500).optional(),
});

// Location update
export const locationUpdateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive().optional(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(), // km/h
});

// Financial summary
export const financialSummarySchema = z.object({
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  totalOrders: z.number().int(),
  completedOrders: z.number().int(),
  grossRevenue: z.number(),
  totalCommission: z.number(),
  netRevenue: z.number(),
  pendingPayout: z.number(),
  lastPayoutDate: z.string().datetime().nullable(),
});

// Payout response
export const payoutResponseSchema = z.object({
  id: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  grossAmount: z.number(),
  commission: z.number(),
  netAmount: z.number(),
  orderCount: z.number().int(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  paymentMethod: z.string().nullable(),
  paymentRef: z.string().nullable(),
  processedAt: z.string().datetime().nullable(),
  items: z.array(z.object({
    orderId: z.string().uuid(),
    orderAmount: z.number(),
    commission: z.number(),
    netAmount: z.number(),
  })),
});

export type AvailableOrdersQuery = z.infer<typeof availableOrdersQuerySchema>;
export type AcceptOrder = z.infer<typeof acceptOrderSchema>;
export type CreateBid = z.infer<typeof createBidSchema>;
export type AssignOrder = z.infer<typeof assignOrderSchema>;
export type CarrierOrderResponse = z.infer<typeof carrierOrderResponseSchema>;
export type BidResponse = z.infer<typeof bidResponseSchema>;
export type ClientBidResponse = z.infer<typeof clientBidResponseSchema>;
export type PickupConfirmation = z.infer<typeof pickupConfirmationSchema>;
export type DeliveryConfirmation = z.infer<typeof deliveryConfirmationSchema>;
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;
export type FinancialSummary = z.infer<typeof financialSummarySchema>;
export type PayoutResponse = z.infer<typeof payoutResponseSchema>;
```

---

### Service Implementation

```typescript
// src/services/carrier-order.service.ts
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { CarrierOrderStatus, BidStatus } from '@prisma/client';
import { notificationService } from './notification.service';
import { socketService } from './socket.service';

// Configuration
const CARRIER_ROUTING_CONFIG = {
  minWeightKg: 20,
  largeVolumes: ['LARGE', 'EXTRA_LARGE'],
  acceptTimeoutMinutes: 30,
  bidExpirationMinutes: 60,
  platformCommissionPercent: 15,
};

export const carrierOrderService = {
  // Check if order should be routed to carriers
  async shouldRouteToCarrier(order: {
    weightKg?: number | null;
    volume?: string | null;
    category?: string | null;
  }): Promise<{ shouldRoute: boolean; reason?: string }> {
    if (order.weightKg && order.weightKg >= CARRIER_ROUTING_CONFIG.minWeightKg) {
      return { shouldRoute: true, reason: 'WEIGHT' };
    }

    if (order.volume && CARRIER_ROUTING_CONFIG.largeVolumes.includes(order.volume)) {
      return { shouldRoute: true, reason: 'VOLUME' };
    }

    return { shouldRoute: false };
  },

  // Route order to carriers
  async routeToCarriers(orderId: string): Promise<void> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { pharmacy: true },
    });

    if (!order) throw new Error('Order not found');

    const routingCheck = await this.shouldRouteToCarrier(order);
    if (!routingCheck.shouldRoute) {
      throw new Error('Order does not meet carrier routing criteria');
    }

    // Find carriers that serve this region
    const carriers = await prisma.carrier.findMany({
      where: {
        status: 'APPROVED',
        isActive: true,
        regions: {
          some: {
            OR: [
              // City match
              { type: 'CITY', city: order.pickupCity },
              // State match
              { type: 'STATE', state: order.pickupState },
              // CEP range match
              {
                type: 'CEP_RANGE',
                cepStart: { lte: order.pickupCep },
                cepEnd: { gte: order.pickupCep },
              },
            ],
          },
        },
      },
      select: { id: true, userId: true, companyName: true },
    });

    if (carriers.length === 0) {
      // No carriers available - mark for manual handling
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PENDING',
          notes: 'No carriers available in region - requires manual assignment',
        },
      });
      return;
    }

    // Calculate platform price
    const platformPrice = await this.calculatePlatformPrice(order);

    // Create carrier order
    const carrierOrder = await prisma.carrierOrder.create({
      data: {
        orderId,
        routedToRegions: carriers.map(c => c.id),
        routingReason: routingCheck.reason!,
        platformPrice,
        status: 'PENDING',
        acceptTimeout: new Date(Date.now() + CARRIER_ROUTING_CONFIG.acceptTimeoutMinutes * 60 * 1000),
      },
    });

    // Update order
    await prisma.order.update({
      where: { id: orderId },
      data: {
        isCarrierOrder: true,
        carrierOrderId: carrierOrder.id,
        status: 'PENDING_CARRIER',
      },
    });

    // Notify all eligible carriers
    for (const carrier of carriers) {
      await notificationService.send({
        userId: carrier.userId,
        type: 'CARRIER_NEW_ORDER',
        title: 'Novo pedido disponível',
        body: `Entrega de ${order.weightKg}kg disponível na sua região`,
        data: { carrierOrderId: carrierOrder.id },
      });

      // WebSocket notification
      socketService.emitToUser(carrier.userId, 'carrier:new-order', {
        carrierOrderId: carrierOrder.id,
        platformPrice,
        deadline: carrierOrder.acceptTimeout,
      });
    }

    // Schedule timeout check
    await this.scheduleTimeoutCheck(carrierOrder.id);
  },

  // Calculate platform price
  async calculatePlatformPrice(order: any): Promise<number> {
    // Base price calculation (simplified)
    const basePrice = 15.00;
    const perKgPrice = 0.50;
    const weightCharge = (order.weightKg || 0) * perKgPrice;

    // Distance calculation would use actual routing API
    const estimatedDistance = 10; // km
    const perKmPrice = 1.50;
    const distanceCharge = estimatedDistance * perKmPrice;

    return basePrice + weightCharge + distanceCharge;
  },

  // Get available orders for carrier
  async getAvailableOrders(carrierId: string, query: any) {
    const carrier = await prisma.carrier.findUnique({
      where: { id: carrierId },
      include: { regions: true },
    });

    if (!carrier) throw new Error('Carrier not found');

    const orders = await prisma.carrierOrder.findMany({
      where: {
        status: 'PENDING',
        acceptTimeout: { gt: new Date() },
        routedToRegions: { has: carrierId },
        // Not already bid on by this carrier
        bids: {
          none: { carrierId },
        },
      },
      include: {
        order: {
          select: {
            pickupAddress: true,
            pickupLat: true,
            pickupLng: true,
            deliveryAddress: true,
            deliveryLat: true,
            deliveryLng: true,
            weightKg: true,
            volume: true,
            scheduledFor: true,
            notes: true,
          },
        },
      },
      orderBy: this.getOrderBy(query.sortBy, query.sortOrder),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return orders;
  },

  // Accept order at platform price
  async acceptOrder(carrierOrderId: string, carrierId: string, data: any) {
    const carrierOrder = await prisma.carrierOrder.findFirst({
      where: {
        id: carrierOrderId,
        status: 'PENDING',
        acceptTimeout: { gt: new Date() },
        routedToRegions: { has: carrierId },
      },
    });

    if (!carrierOrder) {
      throw new Error('Order not available');
    }

    // Check if another carrier already accepted
    const existingAccept = await prisma.carrierOrder.findFirst({
      where: {
        id: carrierOrderId,
        carrierId: { not: null },
      },
    });

    if (existingAccept) {
      throw new Error('Order already accepted by another carrier');
    }

    // Calculate commission and payout
    const commission = carrierOrder.platformPrice.toNumber() *
      (CARRIER_ROUTING_CONFIG.platformCommissionPercent / 100);
    const payout = carrierOrder.platformPrice.toNumber() - commission;

    // Accept order
    const updated = await prisma.carrierOrder.update({
      where: { id: carrierOrderId },
      data: {
        carrierId,
        status: 'ACCEPTED',
        finalPrice: carrierOrder.platformPrice,
        platformCommission: commission,
        carrierPayout: payout,
        acceptedAt: new Date(),
        carrierDriverId: data.driverId,
        carrierVehicleId: data.vehicleId,
        ...(data.driverId && { assignedAt: new Date(), status: 'ASSIGNED' }),
      },
      include: {
        order: true,
        carrier: { select: { companyName: true } },
      },
    });

    // Update main order status
    await prisma.order.update({
      where: { id: carrierOrder.orderId },
      data: { status: 'CARRIER_ACCEPTED' },
    });

    // Notify client
    await notificationService.send({
      userId: updated.order.userId,
      type: 'ORDER_CARRIER_ASSIGNED',
      title: 'Transportadora confirmada',
      body: `Sua entrega será realizada por ${updated.carrier?.companyName}`,
      data: { orderId: updated.orderId },
    });

    return updated;
  },

  // Create bid with custom price
  async createBid(carrierOrderId: string, carrierId: string, data: any) {
    const carrierOrder = await prisma.carrierOrder.findFirst({
      where: {
        id: carrierOrderId,
        status: { in: ['PENDING', 'BIDDING'] },
        acceptTimeout: { gt: new Date() },
        routedToRegions: { has: carrierId },
      },
    });

    if (!carrierOrder) {
      throw new Error('Order not available for bidding');
    }

    // Check for existing bid
    const existingBid = await prisma.carrierBid.findFirst({
      where: { carrierOrderId, carrierId },
    });

    if (existingBid) {
      throw new Error('You already placed a bid on this order');
    }

    // Create bid
    const bid = await prisma.carrierBid.create({
      data: {
        carrierOrderId,
        carrierId,
        proposedPrice: data.proposedPrice,
        estimatedTime: data.estimatedMinutes,
        notes: data.notes,
        expiresAt: new Date(Date.now() + CARRIER_ROUTING_CONFIG.bidExpirationMinutes * 60 * 1000),
      },
      include: {
        carrier: { select: { companyName: true } },
      },
    });

    // Update carrier order status
    await prisma.carrierOrder.update({
      where: { id: carrierOrderId },
      data: { status: 'BIDDING' },
    });

    // Notify client of price proposal
    const order = await prisma.order.findUnique({
      where: { id: carrierOrder.orderId },
    });

    await notificationService.send({
      userId: order!.userId,
      type: 'ORDER_PRICE_PROPOSAL',
      title: 'Proposta de preço',
      body: `${bid.carrier.companyName} propôs R$ ${data.proposedPrice.toFixed(2)} para sua entrega`,
      data: { orderId: carrierOrder.orderId, bidId: bid.id },
    });

    return bid;
  },

  // Client responds to bid
  async respondToBid(bidId: string, userId: string, accept: boolean, reason?: string) {
    const bid = await prisma.carrierBid.findFirst({
      where: {
        id: bidId,
        status: 'PENDING',
        carrierOrder: {
          order: { userId },
        },
      },
      include: {
        carrierOrder: true,
        carrier: true,
      },
    });

    if (!bid) {
      throw new Error('Bid not found or already responded');
    }

    if (accept) {
      // Accept bid - same as carrier accept but with custom price
      const commission = bid.proposedPrice.toNumber() *
        (CARRIER_ROUTING_CONFIG.platformCommissionPercent / 100);
      const payout = bid.proposedPrice.toNumber() - commission;

      await prisma.$transaction([
        // Update bid
        prisma.carrierBid.update({
          where: { id: bidId },
          data: { status: 'ACCEPTED', respondedAt: new Date() },
        }),
        // Reject other bids
        prisma.carrierBid.updateMany({
          where: {
            carrierOrderId: bid.carrierOrderId,
            id: { not: bidId },
          },
          data: { status: 'REJECTED', respondedAt: new Date() },
        }),
        // Update carrier order
        prisma.carrierOrder.update({
          where: { id: bid.carrierOrderId },
          data: {
            carrierId: bid.carrierId,
            status: 'ACCEPTED',
            finalPrice: bid.proposedPrice,
            platformCommission: commission,
            carrierPayout: payout,
            acceptedAt: new Date(),
          },
        }),
        // Update main order
        prisma.order.update({
          where: { id: bid.carrierOrder.orderId },
          data: { status: 'CARRIER_ACCEPTED' },
        }),
      ]);

      // Notify carrier
      await notificationService.send({
        userId: bid.carrier.userId,
        type: 'BID_ACCEPTED',
        title: 'Proposta aceita!',
        body: `Sua proposta de R$ ${bid.proposedPrice} foi aceita`,
        data: { carrierOrderId: bid.carrierOrderId },
      });
    } else {
      // Reject bid
      await prisma.carrierBid.update({
        where: { id: bidId },
        data: { status: 'REJECTED', respondedAt: new Date() },
      });

      // Notify carrier
      await notificationService.send({
        userId: bid.carrier.userId,
        type: 'BID_REJECTED',
        title: 'Proposta recusada',
        body: reason || 'O cliente recusou sua proposta',
        data: { carrierOrderId: bid.carrierOrderId },
      });
    }
  },

  // Assign order to driver/vehicle
  async assignOrder(carrierOrderId: string, carrierId: string, data: any) {
    const carrierOrder = await prisma.carrierOrder.findFirst({
      where: {
        id: carrierOrderId,
        carrierId,
        status: { in: ['ACCEPTED', 'ASSIGNED'] },
      },
    });

    if (!carrierOrder) {
      throw new Error('Order not found or not accepted');
    }

    // Verify driver and vehicle belong to carrier
    const [driver, vehicle] = await Promise.all([
      prisma.carrierDriver.findFirst({
        where: { id: data.driverId, carrierId, isActive: true },
      }),
      prisma.carrierVehicle.findFirst({
        where: { id: data.vehicleId, carrierId, isActive: true },
      }),
    ]);

    if (!driver) throw new Error('Driver not found');
    if (!vehicle) throw new Error('Vehicle not found');

    // Deactivate previous assignment if exists
    await prisma.carrierAssignment.updateMany({
      where: { carrierOrderId, isActive: true },
      data: { isActive: false, unassignedAt: new Date() },
    });

    // Create new assignment
    const assignment = await prisma.carrierAssignment.create({
      data: {
        carrierOrderId,
        carrierDriverId: data.driverId,
        carrierVehicleId: data.vehicleId,
        assignedBy: carrierId, // Carrier user ID
        notes: data.notes,
      },
    });

    // Update carrier order
    await prisma.carrierOrder.update({
      where: { id: carrierOrderId },
      data: {
        carrierDriverId: data.driverId,
        carrierVehicleId: data.vehicleId,
        status: 'ASSIGNED',
        assignedAt: new Date(),
      },
    });

    // Notify driver
    await notificationService.send({
      userId: driver.userId,
      type: 'CARRIER_DRIVER_ASSIGNMENT',
      title: 'Nova entrega atribuída',
      body: `Você recebeu uma nova entrega para realizar`,
      data: { carrierOrderId, assignmentId: assignment.id },
    });

    return assignment;
  },

  // Driver confirms pickup
  async confirmPickup(carrierOrderId: string, driverId: string, data: any) {
    const carrierOrder = await prisma.carrierOrder.findFirst({
      where: {
        id: carrierOrderId,
        carrierDriverId: driverId,
        status: 'ASSIGNED',
      },
      include: { order: true },
    });

    if (!carrierOrder) {
      throw new Error('Order not found or not assigned to you');
    }

    await prisma.$transaction([
      prisma.carrierOrder.update({
        where: { id: carrierOrderId },
        data: { status: 'PICKED_UP', pickedUpAt: new Date() },
      }),
      prisma.order.update({
        where: { id: carrierOrder.orderId },
        data: { status: 'PICKED_UP', pickedUpAt: new Date() },
      }),
    ]);

    // Notify client
    await notificationService.send({
      userId: carrierOrder.order.userId,
      type: 'ORDER_PICKED_UP',
      title: 'Pedido coletado',
      body: 'Sua entrega foi coletada e está a caminho',
      data: { orderId: carrierOrder.orderId },
    });

    // WebSocket update
    socketService.emitToUser(carrierOrder.order.userId, 'order:picked-up', {
      orderId: carrierOrder.orderId,
    });
  },

  // Driver confirms delivery
  async confirmDelivery(carrierOrderId: string, driverId: string, data: any) {
    const carrierOrder = await prisma.carrierOrder.findFirst({
      where: {
        id: carrierOrderId,
        carrierDriverId: driverId,
        status: { in: ['PICKED_UP', 'IN_TRANSIT'] },
      },
      include: { order: true },
    });

    if (!carrierOrder) {
      throw new Error('Order not found or invalid status');
    }

    await prisma.$transaction([
      prisma.carrierOrder.update({
        where: { id: carrierOrderId },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      }),
      prisma.order.update({
        where: { id: carrierOrder.orderId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          deliveryProof: data.photos,
          receiverName: data.receiverName,
        },
      }),
    ]);

    // Notify client
    await notificationService.send({
      userId: carrierOrder.order.userId,
      type: 'ORDER_DELIVERED',
      title: 'Pedido entregue!',
      body: 'Sua entrega foi concluída com sucesso',
      data: { orderId: carrierOrder.orderId },
    });
  },

  // Update driver location
  async updateLocation(carrierOrderId: string, driverId: string, location: any) {
    const carrierOrder = await prisma.carrierOrder.findFirst({
      where: {
        id: carrierOrderId,
        carrierDriverId: driverId,
        status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] },
      },
      include: { order: true },
    });

    if (!carrierOrder) return;

    // Update driver location
    await prisma.carrierDriver.update({
      where: { id: driverId },
      data: {
        currentLat: location.latitude,
        currentLng: location.longitude,
        lastLocationUpdate: new Date(),
      },
    });

    // Cache for real-time access
    await redis.set(
      `carrier-driver:${driverId}:location`,
      JSON.stringify({
        ...location,
        timestamp: Date.now(),
      }),
      'EX',
      60
    );

    // Emit to client
    socketService.emitToUser(carrierOrder.order.userId, 'driver:location', {
      orderId: carrierOrder.orderId,
      location,
    });
  },

  // Get financial summary
  async getFinancialSummary(carrierId: string, startDate: Date, endDate: Date) {
    const orders = await prisma.carrierOrder.findMany({
      where: {
        carrierId,
        status: 'DELIVERED',
        deliveredAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const grossRevenue = orders.reduce(
      (sum, o) => sum + (o.finalPrice?.toNumber() || 0),
      0
    );
    const totalCommission = orders.reduce(
      (sum, o) => sum + (o.platformCommission?.toNumber() || 0),
      0
    );
    const netRevenue = orders.reduce(
      (sum, o) => sum + (o.carrierPayout?.toNumber() || 0),
      0
    );

    const pendingPayout = await prisma.carrierOrder.aggregate({
      where: {
        carrierId,
        status: 'DELIVERED',
        // Not yet in a payout
        id: {
          notIn: (await prisma.carrierPayoutItem.findMany({
            select: { carrierOrderId: true },
          })).map(i => i.carrierOrderId),
        },
      },
      _sum: { carrierPayout: true },
    });

    const lastPayout = await prisma.carrierPayout.findFirst({
      where: { carrierId, status: 'COMPLETED' },
      orderBy: { processedAt: 'desc' },
    });

    return {
      period: { start: startDate, end: endDate },
      totalOrders: orders.length,
      completedOrders: orders.filter(o => o.status === 'DELIVERED').length,
      grossRevenue,
      totalCommission,
      netRevenue,
      pendingPayout: pendingPayout._sum.carrierPayout?.toNumber() || 0,
      lastPayoutDate: lastPayout?.processedAt || null,
    };
  },

  // Schedule timeout check (using BullMQ)
  async scheduleTimeoutCheck(carrierOrderId: string) {
    // This would use BullMQ in production
    // await carrierOrderQueue.add('check-timeout', { carrierOrderId }, {
    //   delay: CARRIER_ROUTING_CONFIG.acceptTimeoutMinutes * 60 * 1000,
    // });
  },

  // Helper for sorting
  getOrderBy(sortBy: string, sortOrder: 'asc' | 'desc') {
    switch (sortBy) {
      case 'price':
        return { platformPrice: sortOrder };
      case 'deadline':
        return { acceptTimeout: sortOrder };
      default:
        return { createdAt: sortOrder };
    }
  },
};
```

---

### Controller Implementation

```typescript
// src/controllers/carrier-order.controller.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { carrierOrderService } from '@/services/carrier-order.service';
import { requireAuth, requireRole } from '@/middleware/auth';
import {
  availableOrdersQuerySchema,
  acceptOrderSchema,
  createBidSchema,
  assignOrderSchema,
  pickupConfirmationSchema,
  deliveryConfirmationSchema,
  locationUpdateSchema,
  clientBidResponseSchema,
} from '@/schemas/carrier-order.schema';

export const carrierOrderRouter = new Hono();

// Carrier routes
carrierOrderRouter.use('/carrier/*', requireAuth, requireRole('CARRIER'));

// Get available orders
carrierOrderRouter.get(
  '/carrier/orders/available',
  zValidator('query', availableOrdersQuerySchema),
  async (c) => {
    const carrierId = c.get('user').carrierId;
    const query = c.req.valid('query');

    const orders = await carrierOrderService.getAvailableOrders(carrierId, query);
    return c.json({ orders });
  }
);

// Get my orders
carrierOrderRouter.get('/carrier/orders', async (c) => {
  const carrierId = c.get('user').carrierId;
  const status = c.req.query('status');

  const orders = await carrierOrderService.getCarrierOrders(carrierId, status);
  return c.json({ orders });
});

// Get order details
carrierOrderRouter.get('/carrier/orders/:id', async (c) => {
  const carrierId = c.get('user').carrierId;
  const carrierOrderId = c.req.param('id');

  const order = await carrierOrderService.getOrderDetails(carrierOrderId, carrierId);
  return c.json({ order });
});

// Accept order at platform price
carrierOrderRouter.post(
  '/carrier/orders/:id/accept',
  zValidator('json', acceptOrderSchema),
  async (c) => {
    const carrierId = c.get('user').carrierId;
    const carrierOrderId = c.req.param('id');
    const data = c.req.valid('json');

    const result = await carrierOrderService.acceptOrder(carrierOrderId, carrierId, data);
    return c.json({ success: true, order: result });
  }
);

// Create bid with custom price
carrierOrderRouter.post(
  '/carrier/orders/:id/bid',
  zValidator('json', createBidSchema),
  async (c) => {
    const carrierId = c.get('user').carrierId;
    const carrierOrderId = c.req.param('id');
    const data = c.req.valid('json');

    const bid = await carrierOrderService.createBid(carrierOrderId, carrierId, data);
    return c.json({ success: true, bid });
  }
);

// Reject order
carrierOrderRouter.post('/carrier/orders/:id/reject', async (c) => {
  const carrierId = c.get('user').carrierId;
  const carrierOrderId = c.req.param('id');
  const { reason } = await c.req.json();

  await carrierOrderService.rejectOrder(carrierOrderId, carrierId, reason);
  return c.json({ success: true });
});

// Assign to driver/vehicle
carrierOrderRouter.post(
  '/carrier/orders/:id/assign',
  zValidator('json', assignOrderSchema),
  async (c) => {
    const carrierId = c.get('user').carrierId;
    const carrierOrderId = c.req.param('id');
    const data = c.req.valid('json');

    const assignment = await carrierOrderService.assignOrder(carrierOrderId, carrierId, data);
    return c.json({ success: true, assignment });
  }
);

// Carrier driver routes
carrierOrderRouter.use('/carrier-driver/*', requireAuth, requireRole('CARRIER_DRIVER'));

// Get my assignments
carrierOrderRouter.get('/carrier-driver/orders', async (c) => {
  const driverId = c.get('user').carrierDriverId;
  const orders = await carrierOrderService.getDriverOrders(driverId);
  return c.json({ orders });
});

// Confirm pickup
carrierOrderRouter.post(
  '/carrier-driver/orders/:id/pickup',
  zValidator('json', pickupConfirmationSchema),
  async (c) => {
    const driverId = c.get('user').carrierDriverId;
    const carrierOrderId = c.req.param('id');
    const data = c.req.valid('json');

    await carrierOrderService.confirmPickup(carrierOrderId, driverId, data);
    return c.json({ success: true });
  }
);

// Confirm delivery
carrierOrderRouter.post(
  '/carrier-driver/orders/:id/deliver',
  zValidator('json', deliveryConfirmationSchema),
  async (c) => {
    const driverId = c.get('user').carrierDriverId;
    const carrierOrderId = c.req.param('id');
    const data = c.req.valid('json');

    await carrierOrderService.confirmDelivery(carrierOrderId, driverId, data);
    return c.json({ success: true });
  }
);

// Update location
carrierOrderRouter.post(
  '/carrier-driver/orders/:id/location',
  zValidator('json', locationUpdateSchema),
  async (c) => {
    const driverId = c.get('user').carrierDriverId;
    const carrierOrderId = c.req.param('id');
    const location = c.req.valid('json');

    await carrierOrderService.updateLocation(carrierOrderId, driverId, location);
    return c.json({ success: true });
  }
);

// Client bid response routes
carrierOrderRouter.get('/orders/:id/bid', requireAuth, async (c) => {
  const userId = c.get('user').id;
  const orderId = c.req.param('id');

  const bids = await carrierOrderService.getOrderBids(orderId, userId);
  return c.json({ bids });
});

carrierOrderRouter.post(
  '/orders/:id/bid/:bidId/respond',
  requireAuth,
  zValidator('json', clientBidResponseSchema),
  async (c) => {
    const userId = c.get('user').id;
    const bidId = c.req.param('bidId');
    const { accept, reason } = c.req.valid('json');

    await carrierOrderService.respondToBid(bidId, userId, accept, reason);
    return c.json({ success: true });
  }
);

// Financial routes
carrierOrderRouter.get('/carrier/financial/summary', async (c) => {
  const carrierId = c.get('user').carrierId;
  const startDate = new Date(c.req.query('startDate') || new Date().setDate(1));
  const endDate = new Date(c.req.query('endDate') || Date.now());

  const summary = await carrierOrderService.getFinancialSummary(carrierId, startDate, endDate);
  return c.json(summary);
});

carrierOrderRouter.get('/carrier/payouts', async (c) => {
  const carrierId = c.get('user').carrierId;
  const payouts = await carrierOrderService.getPayouts(carrierId);
  return c.json({ payouts });
});

carrierOrderRouter.get('/carrier/payouts/:id/invoice', async (c) => {
  const carrierId = c.get('user').carrierId;
  const payoutId = c.req.param('id');

  const invoice = await carrierOrderService.generateInvoice(payoutId, carrierId);
  return c.json(invoice);
});
```

---

## Flow Diagrams

### Order Routing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CARRIER ORDER ROUTING                               │
└─────────────────────────────────────────────────────────────────────────────┘

     Client                    Platform                    Carriers
        │                          │                          │
        │  Create Order            │                          │
        │ (weight > 20kg)         │                          │
        │─────────────────────────>│                          │
        │                          │                          │
        │                          │ Check routing criteria   │
        │                          │ Weight > 20kg? ✓         │
        │                          │                          │
        │                          │ Find carriers in region  │
        │                          │─────────────────────────>│
        │                          │                          │
        │                          │ Create CarrierOrder      │
        │                          │                          │
        │                          │ Notify eligible carriers │
        │                          │─────────────────────────>│ Push + WebSocket
        │                          │                          │
        │                          │                          │ View available
        │                          │<─────────────────────────│ orders
        │                          │                          │
        │                          │     ┌────────────────────┤
        │                          │     │ Accept at platform │
        │                          │     │ price              │
        │                          │<────┴────────────────────│
        │                          │                          │
        │  Order Confirmed         │                          │
        │<─────────────────────────│                          │
        │                          │                          │
        │                          │ OR                       │
        │                          │                          │
        │                          │     ┌────────────────────┤
        │                          │     │ Propose different  │
        │                          │     │ price (bid)        │
        │                          │<────┴────────────────────│
        │                          │                          │
        │  Review bid              │                          │
        │<─────────────────────────│                          │
        │                          │                          │
        │ Accept/Reject bid        │                          │
        │─────────────────────────>│                          │
        │                          │                          │
        │                          │ Notify carrier           │
        │                          │─────────────────────────>│
        │                          │                          │
```

### Internal Assignment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       INTERNAL ASSIGNMENT FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

     Carrier                   Platform               Carrier Driver
        │                          │                        │
        │ View accepted orders     │                        │
        │─────────────────────────>│                        │
        │                          │                        │
        │ Select driver + vehicle  │                        │
        │─────────────────────────>│                        │
        │                          │                        │
        │                          │ Validate driver/vehicle│
        │                          │ belong to carrier      │
        │                          │                        │
        │                          │ Create assignment      │
        │                          │                        │
        │                          │ Notify driver          │
        │                          │───────────────────────>│ Push notification
        │                          │                        │
        │ Assignment confirmed     │                        │
        │<─────────────────────────│                        │
        │                          │                        │
        │                          │         View order     │
        │                          │<───────────────────────│
        │                          │                        │
        │                          │    Navigate to pickup  │
        │                          │<───────────────────────│
        │                          │                        │
        │                          │    Confirm pickup      │
        │                          │<───────────────────────│
        │                          │                        │
        │                          │ Update location        │
        │                          │ (periodic)             │
        │                          │<───────────────────────│
        │                          │                        │
        │                          │    Confirm delivery    │
        │                          │<───────────────────────│
        │                          │                        │
        │  Order completed         │                        │
        │<─────────────────────────│                        │
        │                          │                        │
```

### Unified Tracking Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        UNIFIED TRACKING FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

  Client App                    Platform                Carrier Driver App
      │                            │                            │
      │ Open tracking screen       │                            │
      │───────────────────────────>│                            │
      │                            │                            │
      │ Connect WebSocket          │                            │
      │<═══════════════════════════│                            │
      │                            │                            │
      │ Initial order state        │                            │
      │<───────────────────────────│                            │
      │                            │                            │
      │                            │       Location update      │
      │                            │<───────────────────────────│
      │                            │                            │
      │  driver:location event     │                            │
      │<═══════════════════════════│ Cache in Redis             │
      │                            │                            │
      │  Update map with driver    │                            │
      │  position                  │                            │
      │                            │                            │
      │                            │       Confirm pickup       │
      │                            │<───────────────────────────│
      │                            │                            │
      │  order:picked-up event     │                            │
      │<═══════════════════════════│                            │
      │                            │                            │
      │  Show "Em trânsito"        │                            │
      │                            │                            │
      │                            │       Confirm delivery     │
      │                            │<───────────────────────────│
      │                            │                            │
      │  order:delivered event     │                            │
      │<═══════════════════════════│                            │
      │                            │                            │
      │  Show delivery proof       │                            │
      │  Rating screen             │                            │
      │                            │                            │
```

---

## WebSocket Events

```typescript
// Carrier events
interface CarrierEvents {
  'carrier:new-order': {
    carrierOrderId: string;
    platformPrice: number;
    deadline: string; // ISO date
    order: {
      pickupAddress: string;
      deliveryAddress: string;
      weightKg: number;
      volume: string;
    };
  };

  'carrier:order-taken': {
    carrierOrderId: string; // Another carrier accepted
  };

  'carrier:bid-response': {
    bidId: string;
    status: 'ACCEPTED' | 'REJECTED';
  };
}

// Carrier driver events
interface CarrierDriverEvents {
  'carrier-driver:new-assignment': {
    carrierOrderId: string;
    assignmentId: string;
    order: {
      pickupAddress: string;
      deliveryAddress: string;
      scheduledFor: string | null;
    };
  };

  'carrier-driver:assignment-removed': {
    carrierOrderId: string;
  };
}

// Client events (same interface as regular orders)
interface ClientOrderEvents {
  'order:status': {
    orderId: string;
    status: string;
    timestamp: string;
  };

  'order:picked-up': {
    orderId: string;
    driverName: string;
    vehiclePlate: string;
  };

  'driver:location': {
    orderId: string;
    location: {
      latitude: number;
      longitude: number;
      heading?: number;
    };
    eta?: number; // minutes
  };

  'order:delivered': {
    orderId: string;
    deliveryProof: string[];
    timestamp: string;
  };
}
```

---

## Background Jobs (BullMQ)

```typescript
// src/jobs/carrier-order.jobs.ts
import { Queue, Worker } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

const connection = { host: 'localhost', port: 6379 };

// Carrier order queue
export const carrierOrderQueue = new Queue('carrier-orders', { connection });

// Worker
const carrierOrderWorker = new Worker(
  'carrier-orders',
  async (job) => {
    switch (job.name) {
      case 'check-timeout':
        await handleTimeoutCheck(job.data.carrierOrderId);
        break;

      case 'expire-bids':
        await handleExpireBids(job.data.carrierOrderId);
        break;

      case 'process-payout':
        await handleProcessPayout(job.data.carrierId, job.data.periodEnd);
        break;
    }
  },
  { connection }
);

// Timeout check - order not accepted
async function handleTimeoutCheck(carrierOrderId: string) {
  const carrierOrder = await prisma.carrierOrder.findUnique({
    where: { id: carrierOrderId },
    include: { order: true },
  });

  if (!carrierOrder || carrierOrder.status !== 'PENDING') {
    return; // Already handled
  }

  // Check if any bids are pending
  const pendingBids = await prisma.carrierBid.count({
    where: { carrierOrderId, status: 'PENDING' },
  });

  if (pendingBids > 0) {
    // Extend timeout for bid response
    await prisma.carrierOrder.update({
      where: { id: carrierOrderId },
      data: {
        acceptTimeout: new Date(Date.now() + 60 * 60 * 1000), // +1 hour
      },
    });
    return;
  }

  // No carrier accepted - mark for manual handling
  await prisma.$transaction([
    prisma.carrierOrder.update({
      where: { id: carrierOrderId },
      data: { status: 'CANCELLED' },
    }),
    prisma.order.update({
      where: { id: carrierOrder.orderId },
      data: {
        status: 'PENDING',
        notes: 'No carrier available - requires admin attention',
      },
    }),
  ]);

  // Notify admin
  // ...
}

// Expire old bids
async function handleExpireBids(carrierOrderId: string) {
  await prisma.carrierBid.updateMany({
    where: {
      carrierOrderId,
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
}

// Process carrier payout
async function handleProcessPayout(carrierId: string, periodEnd: Date) {
  // Get unpaid completed orders
  const unpaidOrders = await prisma.carrierOrder.findMany({
    where: {
      carrierId,
      status: 'DELIVERED',
      deliveredAt: { lte: periodEnd },
      id: {
        notIn: (await prisma.carrierPayoutItem.findMany({
          select: { carrierOrderId: true },
        })).map(i => i.carrierOrderId),
      },
    },
  });

  if (unpaidOrders.length === 0) return;

  const grossAmount = unpaidOrders.reduce(
    (sum, o) => sum + (o.finalPrice?.toNumber() || 0),
    0
  );
  const commission = unpaidOrders.reduce(
    (sum, o) => sum + (o.platformCommission?.toNumber() || 0),
    0
  );
  const netAmount = unpaidOrders.reduce(
    (sum, o) => sum + (o.carrierPayout?.toNumber() || 0),
    0
  );

  // Create payout
  const payout = await prisma.carrierPayout.create({
    data: {
      carrierId,
      periodStart: unpaidOrders[0].deliveredAt!,
      periodEnd,
      grossAmount,
      commission,
      netAmount,
      orderCount: unpaidOrders.length,
      items: {
        create: unpaidOrders.map(o => ({
          carrierOrderId: o.id,
          orderAmount: o.finalPrice!,
          commission: o.platformCommission!,
          netAmount: o.carrierPayout!,
        })),
      },
    },
  });

  // Process payment via banking API
  // ...
}
```

---

## Carrier Dashboard Components

```typescript
// Frontend components structure

// pages/carrier/orders/available.tsx
// - List of available orders with filters
// - Accept/Bid buttons
// - Map view option

// pages/carrier/orders/[id].tsx
// - Order details
// - Accept/Bid form
// - Assignment form (if accepted)

// pages/carrier/orders/index.tsx
// - My orders list (accepted, in progress, completed)
// - Filter by status

// pages/carrier/financial/index.tsx
// - Financial summary cards
// - Orders history table
// - Payouts list

// components/carrier/OrderCard.tsx
// - Order summary card
// - Accept/Bid/Reject actions

// components/carrier/AssignmentForm.tsx
// - Driver select
// - Vehicle select
// - Notes input

// components/carrier/BidForm.tsx
// - Proposed price input
// - Estimated time input
// - Notes input
```

---

## Definition of Done

### Code Requirements
- [ ] Database migrations created and tested
- [ ] All API endpoints implemented with validation
- [ ] Service layer with business logic
- [ ] Background jobs for timeouts and payouts
- [ ] WebSocket events for real-time updates
- [ ] Unit tests for routing logic
- [ ] Integration tests for order flow
- [ ] E2E tests for complete carrier flow

### Functionality
- [ ] Orders above 20kg auto-route to carriers
- [ ] Large volume orders route to carriers
- [ ] Carriers see available orders in their regions
- [ ] Accept at platform price works
- [ ] Custom price bidding works
- [ ] Client can accept/reject bids
- [ ] Internal assignment to driver/vehicle works
- [ ] Carrier driver can confirm pickup/delivery
- [ ] Real-time tracking works for clients
- [ ] Photo proof of delivery captured
- [ ] Financial reports accurate
- [ ] Payouts calculated correctly

### Integration
- [ ] Same tracking interface as regular orders
- [ ] Notifications work for all parties
- [ ] WebSocket events unified with existing
- [ ] Admin can view carrier orders
- [ ] Metrics include carrier statistics

### Documentation
- [ ] API documentation updated
- [ ] Carrier onboarding guide
- [ ] Carrier driver app documentation
- [ ] Financial flow documentation

---

## Test Cases

### Unit Tests

```typescript
describe('CarrierOrderService', () => {
  describe('shouldRouteToCarrier', () => {
    it('should route orders with weight >= 20kg', async () => {
      const result = await carrierOrderService.shouldRouteToCarrier({
        weightKg: 25,
        volume: 'MEDIUM',
      });
      expect(result.shouldRoute).toBe(true);
      expect(result.reason).toBe('WEIGHT');
    });

    it('should route orders with LARGE volume', async () => {
      const result = await carrierOrderService.shouldRouteToCarrier({
        weightKg: 5,
        volume: 'LARGE',
      });
      expect(result.shouldRoute).toBe(true);
      expect(result.reason).toBe('VOLUME');
    });

    it('should not route small orders', async () => {
      const result = await carrierOrderService.shouldRouteToCarrier({
        weightKg: 5,
        volume: 'SMALL',
      });
      expect(result.shouldRoute).toBe(false);
    });
  });

  describe('acceptOrder', () => {
    it('should prevent double acceptance', async () => {
      // Create order and have one carrier accept
      const carrierOrderId = 'test-order';
      await carrierOrderService.acceptOrder(carrierOrderId, 'carrier-1', {});

      // Second carrier tries to accept
      await expect(
        carrierOrderService.acceptOrder(carrierOrderId, 'carrier-2', {})
      ).rejects.toThrow('Order already accepted');
    });

    it('should calculate commission correctly', async () => {
      const result = await carrierOrderService.acceptOrder(
        'test-order',
        'carrier-1',
        {}
      );

      expect(result.platformCommission).toBe(
        result.finalPrice * 0.15
      );
      expect(result.carrierPayout).toBe(
        result.finalPrice - result.platformCommission
      );
    });
  });

  describe('createBid', () => {
    it('should prevent duplicate bids from same carrier', async () => {
      await carrierOrderService.createBid('order-1', 'carrier-1', {
        proposedPrice: 100,
      });

      await expect(
        carrierOrderService.createBid('order-1', 'carrier-1', {
          proposedPrice: 120,
        })
      ).rejects.toThrow('already placed a bid');
    });
  });
});
```

### Integration Tests

```typescript
describe('Carrier Order Flow', () => {
  it('should complete full order flow', async () => {
    // 1. Create heavy order
    const order = await createOrder({ weightKg: 25 });

    // 2. Verify routed to carriers
    expect(order.isCarrierOrder).toBe(true);

    // 3. Carrier accepts
    const accepted = await carrierApi.acceptOrder(order.carrierOrderId);
    expect(accepted.status).toBe('ACCEPTED');

    // 4. Assign to driver
    const assignment = await carrierApi.assignOrder(order.carrierOrderId, {
      driverId: 'driver-1',
      vehicleId: 'vehicle-1',
    });
    expect(assignment.status).toBe('ASSIGNED');

    // 5. Driver confirms pickup
    await driverApi.confirmPickup(order.carrierOrderId);

    // 6. Driver confirms delivery
    await driverApi.confirmDelivery(order.carrierOrderId, {
      photos: ['https://example.com/proof.jpg'],
    });

    // 7. Verify order completed
    const finalOrder = await getOrder(order.id);
    expect(finalOrder.status).toBe('DELIVERED');
  });

  it('should handle bid flow', async () => {
    // 1. Create order
    const order = await createOrder({ weightKg: 30 });

    // 2. Carrier creates bid
    const bid = await carrierApi.createBid(order.carrierOrderId, {
      proposedPrice: 150,
      estimatedMinutes: 60,
    });

    // 3. Client accepts bid
    await clientApi.respondToBid(bid.id, { accept: true });

    // 4. Verify order accepted with custom price
    const updated = await getCarrierOrder(order.carrierOrderId);
    expect(updated.finalPrice).toBe(150);
    expect(updated.status).toBe('ACCEPTED');
  });
});
```

---

## Notes

- This story completes the Carrier Module, integrating carrier orders with the existing platform
- The unified tracking interface ensures clients have the same experience regardless of delivery type
- Commission rates (15%) are configurable per carrier or category
- Timeout handling prevents orders from being stuck
- Financial reports and payouts mirror the driver payout system for consistency
