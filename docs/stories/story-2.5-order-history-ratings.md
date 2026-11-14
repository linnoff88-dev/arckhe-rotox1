# Story 2.5: Order History & Ratings

**Epic:** 2 - Client Module
**Status:** Ready for Development
**Priority:** P1 - High
**Estimate:** Medium (4-6 hours)

---

## User Story

**As a** client,
**I want** to view my order history and rate drivers,
**so that** I can track my deliveries and give feedback.

---

## Acceptance Criteria

- [ ] 1. Endpoint GET /orders/history com filtros e paginação
- [ ] 2. Filtros por status, data, categoria
- [ ] 3. Endpoint POST /orders/:id/rate para avaliar entrega
- [ ] 4. Rating de 1-5 estrelas + comentário opcional
- [ ] 5. Apenas pedidos DELIVERED podem ser avaliados
- [ ] 6. Atualização automática do rating médio do entregador
- [ ] 7. Endpoint GET /orders/:id/receipt para recibo
- [ ] 8. Download de recibo em PDF

---

## Technical Implementation

### 1. Ratings Module Structure

```
apps/api/src/modules/ratings/
├── ratings.controller.ts
├── ratings.service.ts
├── ratings.routes.ts
├── ratings.schema.ts
└── ratings.errors.ts
```

### 2. Zod Schemas

**apps/api/src/modules/ratings/ratings.schema.ts:**
```typescript
import { z } from 'zod';

export const createRatingSchema = z.object({
  stars: z.number().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export const listRatingsSchema = z.object({
  driverId: z.string().uuid().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(10),
});

export type CreateRatingInput = z.infer<typeof createRatingSchema>;
export type ListRatingsQuery = z.infer<typeof listRatingsSchema>;
```

### 3. Ratings Service

**apps/api/src/modules/ratings/ratings.service.ts:**
```typescript
import { prisma, OrderStatus } from '@rotax1/database';
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors/app-error.js';
import type { CreateRatingInput } from './ratings.schema.js';

export class RatingsService {
  async createRating(orderId: string, clientId: string, data: CreateRatingInput) {
    // Get order with existing rating
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        rating: true,
        driver: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    if (order.clientId !== clientId) {
      throw new ForbiddenError('Você não pode avaliar este pedido');
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new ValidationError('Apenas pedidos entregues podem ser avaliados');
    }

    if (order.rating) {
      throw new ValidationError('Este pedido já foi avaliado');
    }

    if (!order.driverId || !order.driver) {
      throw new ValidationError('Pedido não possui entregador para avaliar');
    }

    // Create rating and update driver average in transaction
    const rating = await prisma.$transaction(async (tx) => {
      // Create rating
      const newRating = await tx.rating.create({
        data: {
          orderId,
          driverId: order.driverId!,
          clientId,
          stars: data.stars,
          comment: data.comment,
        },
      });

      // Calculate new driver average
      const driverRatings = await tx.rating.aggregate({
        where: { driverId: order.driverId! },
        _avg: { stars: true },
        _count: true,
      });

      // Update driver rating
      await tx.driver.update({
        where: { id: order.driverId! },
        data: {
          ratingAvg: driverRatings._avg.stars || 0,
          ratingCount: driverRatings._count,
        },
      });

      return newRating;
    });

    return rating;
  }

  async getOrderRating(orderId: string) {
    const rating = await prisma.rating.findUnique({
      where: { orderId },
      include: {
        driver: {
          select: {
            name: true,
            profilePhotoUrl: true,
          },
        },
      },
    });

    return rating;
  }

  async getDriverRatings(driverId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [ratings, total] = await Promise.all([
      prisma.rating.findMany({
        where: { driverId },
        include: {
          client: {
            select: {
              name: true,
              profilePhotoUrl: true,
            },
          },
          order: {
            select: {
              category: true,
              deliveredAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.rating.count({ where: { driverId } }),
    ]);

    return {
      ratings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const ratingsService = new RatingsService();
```

### 4. Order History Service

**apps/api/src/modules/orders/history.service.ts:**
```typescript
import { prisma, OrderStatus, OrderCategory } from '@rotax1/database';

interface HistoryFilters {
  status?: OrderStatus;
  category?: OrderCategory;
  startDate?: Date;
  endDate?: Date;
  page: number;
  limit: number;
}

interface OrderStats {
  totalOrders: number;
  totalSpent: number;
  averageRating: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
}

export class HistoryService {
  async getHistory(clientId: string, filters: HistoryFilters) {
    const { status, category, startDate, endDate, page, limit } = filters;
    const skip = (page - 1) * limit;

    const where = {
      clientId,
      ...(status && { status }),
      ...(category && { category }),
      ...(startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      },
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          driver: {
            select: {
              name: true,
              vehicleType: true,
              profilePhotoUrl: true,
              ratingAvg: true,
            },
          },
          payment: {
            select: {
              status: true,
              method: true,
              paidAt: true,
            },
          },
          rating: {
            select: {
              stars: true,
              comment: true,
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
      orders: orders.map(order => ({
        id: order.id,
        status: order.status,
        category: order.category,
        urgency: order.urgency,
        pickupAddress: order.pickupAddress,
        deliveryAddress: order.deliveryAddress,
        distanceKm: order.distanceKm,
        price: order.price,
        driver: order.driver,
        payment: order.payment,
        rating: order.rating,
        createdAt: order.createdAt,
        deliveredAt: order.deliveredAt,
        canRate: order.status === OrderStatus.DELIVERED && !order.rating,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStats(clientId: string): Promise<OrderStats> {
    const [orders, ratings] = await Promise.all([
      prisma.order.findMany({
        where: { clientId },
        select: {
          status: true,
          category: true,
          price: true,
        },
      }),
      prisma.rating.aggregate({
        where: {
          order: { clientId },
        },
        _avg: { stars: true },
      }),
    ]);

    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalSpent = 0;

    for (const order of orders) {
      byCategory[order.category] = (byCategory[order.category] || 0) + 1;
      byStatus[order.status] = (byStatus[order.status] || 0) + 1;
      if (order.status === OrderStatus.DELIVERED) {
        totalSpent += Number(order.price);
      }
    }

    return {
      totalOrders: orders.length,
      totalSpent: Math.round(totalSpent * 100) / 100,
      averageRating: ratings._avg.stars || 0,
      byCategory,
      byStatus,
    };
  }
}

export const historyService = new HistoryService();
```

### 5. Receipt Service

**apps/api/src/modules/orders/receipt.service.ts:**
```typescript
import { prisma, OrderStatus } from '@rotax1/database';
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors/app-error.js';
import PDFDocument from 'pdfkit';

interface ReceiptData {
  order: {
    id: string;
    createdAt: Date;
    deliveredAt: Date | null;
    category: string;
    urgency: string;
    price: number;
    platformFee: number;
    distanceKm: number;
  };
  client: {
    name: string;
    email: string;
  };
  driver: {
    name: string;
    vehicleType: string;
  } | null;
  addresses: {
    pickup: string;
    delivery: string;
  };
  payment: {
    method: string;
    paidAt: Date | null;
  } | null;
}

export class ReceiptService {
  async getReceipt(orderId: string, clientId: string): Promise<ReceiptData> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: {
          include: {
            user: { select: { email: true } },
          },
        },
        driver: true,
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    if (order.clientId !== clientId) {
      throw new ForbiddenError('Você não tem acesso a este recibo');
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new ValidationError('Recibo disponível apenas para pedidos entregues');
    }

    const pickupAddr = order.pickupAddress as Record<string, string>;
    const deliveryAddr = order.deliveryAddress as Record<string, string>;

    return {
      order: {
        id: order.id,
        createdAt: order.createdAt,
        deliveredAt: order.deliveredAt,
        category: order.category,
        urgency: order.urgency,
        price: Number(order.price),
        platformFee: Number(order.platformFee),
        distanceKm: Number(order.distanceKm),
      },
      client: {
        name: order.client.name,
        email: order.client.user.email,
      },
      driver: order.driver ? {
        name: order.driver.name,
        vehicleType: order.driver.vehicleType,
      } : null,
      addresses: {
        pickup: `${pickupAddr.street}, ${pickupAddr.number} - ${pickupAddr.city}/${pickupAddr.state}`,
        delivery: `${deliveryAddr.street}, ${deliveryAddr.number} - ${deliveryAddr.city}/${deliveryAddr.state}`,
      },
      payment: order.payment ? {
        method: order.payment.method,
        paidAt: order.payment.paidAt,
      } : null,
    };
  }

  async generatePDF(orderId: string, clientId: string): Promise<Buffer> {
    const receipt = await this.getReceipt(orderId, clientId);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).text('Rotax1', { align: 'center' });
      doc.fontSize(16).text('Recibo de Entrega', { align: 'center' });
      doc.moveDown();

      // Order info
      doc.fontSize(12);
      doc.text(`Pedido: #${receipt.order.id.substring(0, 8)}`);
      doc.text(`Data: ${receipt.order.createdAt.toLocaleDateString('pt-BR')}`);
      doc.text(`Categoria: ${receipt.order.category}`);
      doc.text(`Urgência: ${receipt.order.urgency}`);
      doc.moveDown();

      // Addresses
      doc.fontSize(14).text('Endereços', { underline: true });
      doc.fontSize(12);
      doc.text(`Coleta: ${receipt.addresses.pickup}`);
      doc.text(`Entrega: ${receipt.addresses.delivery}`);
      doc.text(`Distância: ${receipt.order.distanceKm.toFixed(2)} km`);
      doc.moveDown();

      // Driver
      if (receipt.driver) {
        doc.fontSize(14).text('Entregador', { underline: true });
        doc.fontSize(12);
        doc.text(`Nome: ${receipt.driver.name}`);
        doc.text(`Veículo: ${receipt.driver.vehicleType}`);
        doc.moveDown();
      }

      // Payment
      doc.fontSize(14).text('Pagamento', { underline: true });
      doc.fontSize(12);
      doc.text(`Valor Total: R$ ${receipt.order.price.toFixed(2)}`);
      if (receipt.payment) {
        doc.text(`Método: ${receipt.payment.method}`);
        doc.text(`Pago em: ${receipt.payment.paidAt?.toLocaleString('pt-BR') || '-'}`);
      }
      doc.moveDown(2);

      // Footer
      doc.fontSize(10).text('Rotax1 - Entregas Última Milha', { align: 'center' });
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });

      doc.end();
    });
  }
}

export const receiptService = new ReceiptService();
```

### 6. History Routes

**apps/api/src/modules/orders/history.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { historyController } from './history.controller.js';
import { ratingsController } from '../ratings/ratings.controller.js';
import { createRatingSchema } from '../ratings/ratings.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';

export async function historyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/history', {
    schema: {
      tags: ['Orders'],
      summary: 'Get order history',
      security: [{ bearerAuth: [] }],
    },
    handler: historyController.getHistory.bind(historyController),
  });

  fastify.get('/stats', {
    schema: {
      tags: ['Orders'],
      summary: 'Get order statistics',
      security: [{ bearerAuth: [] }],
    },
    handler: historyController.getStats.bind(historyController),
  });

  fastify.post('/:id/rate', {
    schema: {
      body: zodToJsonSchema(createRatingSchema),
      tags: ['Ratings'],
      summary: 'Rate a completed order',
      security: [{ bearerAuth: [] }],
    },
    handler: ratingsController.create.bind(ratingsController),
  });

  fastify.get('/:id/rating', {
    schema: {
      tags: ['Ratings'],
      summary: 'Get order rating',
      security: [{ bearerAuth: [] }],
    },
    handler: ratingsController.getOrderRating.bind(ratingsController),
  });

  fastify.get('/:id/receipt', {
    schema: {
      tags: ['Orders'],
      summary: 'Get order receipt',
      security: [{ bearerAuth: [] }],
    },
    handler: historyController.getReceipt.bind(historyController),
  });

  fastify.get('/:id/receipt/pdf', {
    schema: {
      tags: ['Orders'],
      summary: 'Download receipt as PDF',
      security: [{ bearerAuth: [] }],
    },
    handler: historyController.downloadReceiptPDF.bind(historyController),
  });
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/orders/history` | Get order history |
| GET | `/orders/stats` | Get order statistics |
| POST | `/orders/:id/rate` | Rate a delivery |
| GET | `/orders/:id/rating` | Get order rating |
| GET | `/orders/:id/receipt` | Get receipt data |
| GET | `/orders/:id/receipt/pdf` | Download PDF receipt |

---

## Query Parameters (History)

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status |
| `category` | string | Filter by category |
| `startDate` | date | Filter from date |
| `endDate` | date | Filter to date |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

## Definition of Done

- [ ] Order history with filters working
- [ ] Rating creation with validation
- [ ] Driver average rating updated
- [ ] Order statistics calculated
- [ ] Receipt data retrieval
- [ ] PDF generation working
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 2.2 (Order Creation)
- pdfkit package for PDF generation
