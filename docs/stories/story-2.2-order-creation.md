# Story 2.2: Order Creation Flow

**Epic:** 2 - Client Module
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Large (6-8 hours)

---

## User Story

**As a** client,
**I want** to create delivery orders with pickup and delivery addresses,
**so that** I can have my items delivered.

---

## Acceptance Criteria

- [ ] 1. Endpoint POST /orders para criar pedido
- [ ] 2. Cálculo automático de distância (Google Maps Distance Matrix)
- [ ] 3. Cálculo de preço baseado em distância e urgência
- [ ] 4. Seleção de categoria (VETERINARY, FROZEN, GENERAL)
- [ ] 5. Seleção de urgência (STANDARD, EXPRESS)
- [ ] 6. Validação de endereços (geocoding)
- [ ] 7. Endpoint GET /orders/:id para detalhes
- [ ] 8. Endpoint GET /orders para listar pedidos do cliente
- [ ] 9. Endpoint POST /orders/:id/cancel para cancelar
- [ ] 10. Status inicial: PENDING_PAYMENT

---

## Technical Implementation

### 1. Orders Module Structure

```
apps/api/src/modules/orders/
├── orders.controller.ts
├── orders.service.ts
├── orders.routes.ts
├── orders.schema.ts
├── orders.errors.ts
└── pricing.service.ts
```

### 2. Zod Schemas

**apps/api/src/modules/orders/orders.schema.ts:**
```typescript
import { z } from 'zod';

const addressSchema = z.object({
  street: z.string().min(3),
  number: z.string().min(1),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().min(2),
  state: z.string().length(2),
  zipCode: z.string().min(8),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const createOrderSchema = z.object({
  pickupAddress: addressSchema,
  deliveryAddress: addressSchema,
  category: z.enum(['VETERINARY', 'FROZEN', 'GENERAL']),
  urgency: z.enum(['STANDARD', 'EXPRESS']).default('STANDARD'),
  description: z.string().max(500).optional(),
});

export const listOrdersSchema = z.object({
  status: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(10),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(10, 'Motivo deve ter no mínimo 10 caracteres'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
```

### 3. Pricing Service

**apps/api/src/modules/orders/pricing.service.ts:**
```typescript
import { OrderCategory, OrderUrgency } from '@rotax1/database';

interface PricingResult {
  price: number;
  platformFee: number;
  driverEarning: number;
  distanceKm: number;
}

interface PricingConfig {
  baseFare: number;
  perKm: number;
  minimumFare: number;
  platformCommission: number;
  expressMultiplier: number;
  categoryMultipliers: Record<OrderCategory, number>;
}

const PRICING_CONFIG: PricingConfig = {
  baseFare: 5.0,
  perKm: 2.0,
  minimumFare: 8.0,
  platformCommission: 0.2, // 20%
  expressMultiplier: 1.5,
  categoryMultipliers: {
    VETERINARY: 1.0,
    FROZEN: 1.2, // 20% extra for cold chain
    GENERAL: 1.0,
  },
};

export function calculatePrice(
  distanceKm: number,
  category: OrderCategory,
  urgency: OrderUrgency
): PricingResult {
  let price = PRICING_CONFIG.baseFare + (distanceKm * PRICING_CONFIG.perKm);

  // Apply category multiplier
  price *= PRICING_CONFIG.categoryMultipliers[category];

  // Apply express multiplier
  if (urgency === 'EXPRESS') {
    price *= PRICING_CONFIG.expressMultiplier;
  }

  // Ensure minimum fare
  price = Math.max(price, PRICING_CONFIG.minimumFare);

  // Round to 2 decimal places
  price = Math.round(price * 100) / 100;

  // Calculate platform fee and driver earning
  const platformFee = Math.round(price * PRICING_CONFIG.platformCommission * 100) / 100;
  const driverEarning = Math.round((price - platformFee) * 100) / 100;

  return {
    price,
    platformFee,
    driverEarning,
    distanceKm: Math.round(distanceKm * 100) / 100,
  };
}

export function getEstimatedPrice(
  distanceKm: number,
  category: OrderCategory,
  urgency: OrderUrgency
): { standard: number; express: number } {
  const standardPrice = calculatePrice(distanceKm, category, 'STANDARD');
  const expressPrice = calculatePrice(distanceKm, category, 'EXPRESS');

  return {
    standard: standardPrice.price,
    express: expressPrice.price,
  };
}
```

### 4. Distance Service

**apps/api/src/common/services/distance.service.ts:**
```typescript
import { config } from '../config/index.js';

interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
}

interface Coordinates {
  lat: number;
  lng: number;
}

export async function calculateDistance(
  origin: Coordinates,
  destination: Coordinates
): Promise<DistanceResult | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${destination.lat},${destination.lng}&key=${config.googleMapsApiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
      const element = data.rows[0].elements[0];
      return {
        distanceKm: element.distance.value / 1000,
        durationMinutes: Math.ceil(element.duration.value / 60),
      };
    }

    return null;
  } catch (error) {
    console.error('Distance calculation error:', error);
    return null;
  }
}

// Fallback: Haversine formula for straight-line distance
export function calculateHaversineDistance(
  origin: Coordinates,
  destination: Coordinates
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(destination.lat - origin.lat);
  const dLng = toRad(destination.lng - origin.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.lat)) *
      Math.cos(toRad(destination.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
```

### 5. Orders Service

**apps/api/src/modules/orders/orders.service.ts:**
```typescript
import { prisma, OrderStatus, OrderCategory, OrderUrgency } from '@rotax1/database';
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors/app-error.js';
import { geocodeAddress } from '../../common/services/geocoding.service.js';
import { calculateDistance, calculateHaversineDistance } from '../../common/services/distance.service.js';
import { calculatePrice } from './pricing.service.js';
import type { CreateOrderInput, ListOrdersQuery } from './orders.schema.js';

export class OrdersService {
  async create(clientId: string, data: CreateOrderInput) {
    // Geocode addresses if coordinates not provided
    let pickupCoords = { lat: data.pickupAddress.lat, lng: data.pickupAddress.lng };
    let deliveryCoords = { lat: data.deliveryAddress.lat, lng: data.deliveryAddress.lng };

    if (!pickupCoords.lat || !pickupCoords.lng) {
      const pickupFull = `${data.pickupAddress.street}, ${data.pickupAddress.number}, ${data.pickupAddress.city}, ${data.pickupAddress.state}`;
      const coords = await geocodeAddress(pickupFull);
      if (!coords) {
        throw new ValidationError('Não foi possível localizar o endereço de coleta');
      }
      pickupCoords = coords;
    }

    if (!deliveryCoords.lat || !deliveryCoords.lng) {
      const deliveryFull = `${data.deliveryAddress.street}, ${data.deliveryAddress.number}, ${data.deliveryAddress.city}, ${data.deliveryAddress.state}`;
      const coords = await geocodeAddress(deliveryFull);
      if (!coords) {
        throw new ValidationError('Não foi possível localizar o endereço de entrega');
      }
      deliveryCoords = coords;
    }

    // Calculate distance
    let distanceResult = await calculateDistance(
      { lat: pickupCoords.lat!, lng: pickupCoords.lng! },
      { lat: deliveryCoords.lat!, lng: deliveryCoords.lng! }
    );

    // Fallback to Haversine if Google API fails
    if (!distanceResult) {
      const haversineKm = calculateHaversineDistance(
        { lat: pickupCoords.lat!, lng: pickupCoords.lng! },
        { lat: deliveryCoords.lat!, lng: deliveryCoords.lng! }
      );
      distanceResult = {
        distanceKm: haversineKm * 1.3, // Add 30% for road routing
        durationMinutes: Math.ceil(haversineKm * 2), // Rough estimate
      };
    }

    // Calculate pricing
    const pricing = calculatePrice(
      distanceResult.distanceKm,
      data.category as OrderCategory,
      data.urgency as OrderUrgency
    );

    // Create order
    const order = await prisma.order.create({
      data: {
        clientId,
        status: OrderStatus.PENDING_PAYMENT,
        category: data.category as OrderCategory,
        urgency: data.urgency as OrderUrgency,
        description: data.description,
        pickupAddress: data.pickupAddress,
        pickupLat: pickupCoords.lat!,
        pickupLng: pickupCoords.lng!,
        deliveryAddress: data.deliveryAddress,
        deliveryLat: deliveryCoords.lat!,
        deliveryLng: deliveryCoords.lng!,
        distanceKm: pricing.distanceKm,
        price: pricing.price,
        platformFee: pricing.platformFee,
        driverEarning: pricing.driverEarning,
      },
    });

    return {
      order,
      estimatedDuration: distanceResult.durationMinutes,
    };
  }

  async getById(orderId: string, clientId?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            profilePhotoUrl: true,
            vehicleType: true,
            vehiclePlate: true,
            ratingAvg: true,
            currentLat: true,
            currentLng: true,
          },
        },
        payment: true,
        rating: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    // If clientId provided, verify ownership
    if (clientId && order.clientId !== clientId) {
      throw new ForbiddenError('Você não tem permissão para ver este pedido');
    }

    return order;
  }

  async list(clientId: string, query: ListOrdersQuery) {
    const { status, page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      clientId,
      ...(status && { status: status as OrderStatus }),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          driver: {
            select: {
              name: true,
              vehicleType: true,
            },
          },
          payment: {
            select: {
              status: true,
              paidAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async cancel(orderId: string, clientId: string, reason: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    if (order.clientId !== clientId) {
      throw new ForbiddenError('Você não tem permissão para cancelar este pedido');
    }

    // Only allow cancellation in certain states
    const cancellableStatuses = [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.SEARCHING_DRIVER,
    ];

    if (!cancellableStatuses.includes(order.status)) {
      throw new ValidationError('Este pedido não pode mais ser cancelado');
    }

    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        description: order.description
          ? `${order.description}\n\nMotivo do cancelamento: ${reason}`
          : `Motivo do cancelamento: ${reason}`,
      },
    });
  }

  async getEstimate(data: CreateOrderInput) {
    // Geocode addresses
    const pickupFull = `${data.pickupAddress.street}, ${data.pickupAddress.number}, ${data.pickupAddress.city}, ${data.pickupAddress.state}`;
    const deliveryFull = `${data.deliveryAddress.street}, ${data.deliveryAddress.number}, ${data.deliveryAddress.city}, ${data.deliveryAddress.state}`;

    const [pickupCoords, deliveryCoords] = await Promise.all([
      geocodeAddress(pickupFull),
      geocodeAddress(deliveryFull),
    ]);

    if (!pickupCoords || !deliveryCoords) {
      throw new ValidationError('Não foi possível localizar os endereços');
    }

    const distanceResult = await calculateDistance(pickupCoords, deliveryCoords);
    
    if (!distanceResult) {
      throw new ValidationError('Não foi possível calcular a distância');
    }

    const standardPricing = calculatePrice(distanceResult.distanceKm, data.category as OrderCategory, 'STANDARD');
    const expressPricing = calculatePrice(distanceResult.distanceKm, data.category as OrderCategory, 'EXPRESS');

    return {
      distanceKm: distanceResult.distanceKm,
      estimatedDuration: distanceResult.durationMinutes,
      pricing: {
        standard: standardPricing.price,
        express: expressPricing.price,
      },
    };
  }
}

export const ordersService = new OrdersService();
```

### 6. Orders Routes

**apps/api/src/modules/orders/orders.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { ordersController } from './orders.controller.js';
import { createOrderSchema, listOrdersSchema, cancelOrderSchema } from './orders.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';

export async function ordersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  fastify.post('/', {
    schema: {
      body: zodToJsonSchema(createOrderSchema),
      tags: ['Orders'],
      summary: 'Create new order',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.create.bind(ordersController),
  });

  fastify.post('/estimate', {
    schema: {
      body: zodToJsonSchema(createOrderSchema),
      tags: ['Orders'],
      summary: 'Get price estimate',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.getEstimate.bind(ordersController),
  });

  fastify.get('/', {
    schema: {
      tags: ['Orders'],
      summary: 'List client orders',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.list.bind(ordersController),
  });

  fastify.get('/:id', {
    schema: {
      tags: ['Orders'],
      summary: 'Get order details',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.getById.bind(ordersController),
  });

  fastify.post('/:id/cancel', {
    schema: {
      body: zodToJsonSchema(cancelOrderSchema),
      tags: ['Orders'],
      summary: 'Cancel order',
      security: [{ bearerAuth: [] }],
    },
    handler: ordersController.cancel.bind(ordersController),
  });
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orders` | Create new order |
| POST | `/orders/estimate` | Get price estimate |
| GET | `/orders` | List client orders |
| GET | `/orders/:id` | Get order details |
| POST | `/orders/:id/cancel` | Cancel order |

---

## Pricing Formula

```
Base Price = Base Fare (R$5) + (Distance × R$2/km)
Category Multiplier = 1.0 (Vet/General) or 1.2 (Frozen)
Express Multiplier = 1.5 (if express)
Final Price = max(Base Price × Category × Express, Minimum R$8)
Platform Fee = Final Price × 20%
Driver Earning = Final Price - Platform Fee
```

---

## Definition of Done

- [ ] Order creation with geocoding working
- [ ] Distance calculation via Google Maps API
- [ ] Pricing calculation correct for all scenarios
- [ ] Order listing with pagination
- [ ] Order cancellation with rules
- [ ] Price estimate endpoint working
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 2.1 (Client Profile)
- Google Maps API (Distance Matrix + Geocoding)
