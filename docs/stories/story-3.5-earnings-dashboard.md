# Story 3.5: Driver Earnings Dashboard

**Epic:** 3 - Driver Module
**Status:** Ready for Development
**Priority:** P1 - High
**Estimate:** Small (2-4 hours)

---

## User Story

**As a** driver,
**I want** to see my earnings and delivery history,
**so that** I can track my income.

---

## Acceptance Criteria

- [ ] 1. Endpoint GET /drivers/earnings com filtro de período
- [ ] 2. Dashboard com ganhos: hoje, semana, mês
- [ ] 3. Endpoint GET /drivers/deliveries com histórico paginado
- [ ] 4. Detalhes de cada entrega com valores
- [ ] 5. Gráfico de ganhos por dia/semana
- [ ] 6. Informações de próximo repasse
- [ ] 7. Endpoint GET /drivers/earnings/export para PDF
- [ ] 8. Estatísticas: total entregas, rating, taxa de aceitação

---

## Technical Implementation

### 1. Module Structure

```
apps/api/src/modules/drivers/
├── ... (existing files)
└── earnings/
    ├── earnings.controller.ts
    ├── earnings.service.ts
    ├── earnings.routes.ts
    └── earnings.schema.ts
```

### 2. Zod Schemas

**apps/api/src/modules/drivers/earnings/earnings.schema.ts:**
```typescript
import { z } from 'zod';

export const earningsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'custom']).default('week'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const deliveriesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  status: z.enum(['DELIVERED', 'CANCELLED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type EarningsQuery = z.infer<typeof earningsQuerySchema>;
export type DeliveriesQuery = z.infer<typeof deliveriesQuerySchema>;
```

### 3. Earnings Service

**apps/api/src/modules/drivers/earnings/earnings.service.ts:**
```typescript
import { prisma, OrderStatus } from '@rotax1/database';
import { NotFoundError } from '../../../common/errors/app-error.js';
import PDFDocument from 'pdfkit';
import type { EarningsQuery, DeliveriesQuery } from './earnings.schema.js';

interface EarningsSummary {
  period: string;
  totalEarnings: number;
  totalDeliveries: number;
  averagePerDelivery: number;
  totalDistance: number;
  totalTime: number;
}

interface DailyEarning {
  date: string;
  earnings: number;
  deliveries: number;
}

interface PayoutInfo {
  nextPayoutDate: Date;
  pendingAmount: number;
  lastPayoutDate: Date | null;
  lastPayoutAmount: number | null;
}

export class EarningsService {
  async getEarnings(driverId: string, query: EarningsQuery) {
    const { startDate, endDate } = this.getPeriodDates(query);

    // Get earnings for period
    const earnings = await prisma.order.aggregate({
      where: {
        driverId,
        status: OrderStatus.DELIVERED,
        deliveredAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        driverEarning: true,
        distanceKm: true,
      },
      _count: true,
    });

    // Get daily breakdown
    const dailyEarnings = await this.getDailyBreakdown(driverId, startDate, endDate);

    // Get comparison with previous period
    const previousPeriod = this.getPreviousPeriod(startDate, endDate);
    const previousEarnings = await prisma.order.aggregate({
      where: {
        driverId,
        status: OrderStatus.DELIVERED,
        deliveredAt: {
          gte: previousPeriod.start,
          lte: previousPeriod.end,
        },
      },
      _sum: {
        driverEarning: true,
      },
      _count: true,
    });

    const totalEarnings = Number(earnings._sum.driverEarning || 0);
    const totalDeliveries = earnings._count;
    const previousTotal = Number(previousEarnings._sum.driverEarning || 0);

    return {
      summary: {
        period: query.period,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        totalDeliveries,
        averagePerDelivery: totalDeliveries > 0
          ? Math.round((totalEarnings / totalDeliveries) * 100) / 100
          : 0,
        totalDistance: Math.round(Number(earnings._sum.distanceKm || 0) * 100) / 100,
        comparison: {
          previousTotal: Math.round(previousTotal * 100) / 100,
          percentChange: previousTotal > 0
            ? Math.round(((totalEarnings - previousTotal) / previousTotal) * 100)
            : 0,
        },
      },
      daily: dailyEarnings,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    };
  }

  async getQuickStats(driverId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, week, month, driver] = await Promise.all([
      prisma.order.aggregate({
        where: {
          driverId,
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: todayStart },
        },
        _sum: { driverEarning: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: {
          driverId,
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: weekStart },
        },
        _sum: { driverEarning: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: {
          driverId,
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: monthStart },
        },
        _sum: { driverEarning: true },
        _count: true,
      }),
      prisma.driver.findUnique({
        where: { id: driverId },
        select: {
          totalDeliveries: true,
          ratingAvg: true,
          ratingCount: true,
        },
      }),
    ]);

    return {
      today: {
        earnings: Math.round(Number(today._sum.driverEarning || 0) * 100) / 100,
        deliveries: today._count,
      },
      week: {
        earnings: Math.round(Number(week._sum.driverEarning || 0) * 100) / 100,
        deliveries: week._count,
      },
      month: {
        earnings: Math.round(Number(month._sum.driverEarning || 0) * 100) / 100,
        deliveries: month._count,
      },
      lifetime: {
        totalDeliveries: driver?.totalDeliveries || 0,
        rating: Number(driver?.ratingAvg || 0),
        ratingCount: driver?.ratingCount || 0,
      },
    };
  }

  async getDeliveries(driverId: string, query: DeliveriesQuery) {
    const { page, limit, status, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where = {
      driverId,
      status: status || OrderStatus.DELIVERED,
      ...(startDate && endDate && {
        deliveredAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    };

    const [deliveries, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          category: true,
          urgency: true,
          pickupAddress: true,
          deliveryAddress: true,
          distanceKm: true,
          price: true,
          driverEarning: true,
          acceptedAt: true,
          deliveredAt: true,
          rating: {
            select: {
              stars: true,
              comment: true,
            },
          },
        },
        orderBy: { deliveredAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      deliveries: deliveries.map((d) => ({
        id: d.id,
        category: d.category,
        urgency: d.urgency,
        pickup: this.formatAddress(d.pickupAddress as Record<string, string>),
        delivery: this.formatAddress(d.deliveryAddress as Record<string, string>),
        distanceKm: Number(d.distanceKm),
        price: Number(d.price),
        earning: Number(d.driverEarning),
        acceptedAt: d.acceptedAt,
        deliveredAt: d.deliveredAt,
        duration: d.acceptedAt && d.deliveredAt
          ? Math.round((d.deliveredAt.getTime() - d.acceptedAt.getTime()) / 60000)
          : null,
        rating: d.rating,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPayoutInfo(driverId: string): Promise<PayoutInfo> {
    // Get driver's bank info
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        bankName: true,
        pixKey: true,
      },
    });

    if (!driver) {
      throw new NotFoundError('Entregador');
    }

    // Calculate pending earnings (not yet paid out)
    const lastPayout = await prisma.driverPayout.findFirst({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
    });

    const pendingEarnings = await prisma.order.aggregate({
      where: {
        driverId,
        status: OrderStatus.DELIVERED,
        deliveredAt: {
          gt: lastPayout?.periodEnd || new Date(0),
        },
      },
      _sum: { driverEarning: true },
    });

    // Next payout is every Monday
    const now = new Date();
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + ((7 - now.getDay() + 1) % 7 || 7));
    nextMonday.setHours(10, 0, 0, 0);

    return {
      nextPayoutDate: nextMonday,
      pendingAmount: Math.round(Number(pendingEarnings._sum.driverEarning || 0) * 100) / 100,
      lastPayoutDate: lastPayout?.createdAt || null,
      lastPayoutAmount: lastPayout ? Number(lastPayout.amount) : null,
    };
  }

  async exportEarningsPDF(driverId: string, query: EarningsQuery): Promise<Buffer> {
    const { startDate, endDate } = this.getPeriodDates(query);

    // Get driver info
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundError('Entregador');
    }

    // Get earnings data
    const earnings = await this.getEarnings(driverId, query);
    const deliveries = await this.getDeliveries(driverId, {
      page: 1,
      limit: 100,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).text('Rotax1', { align: 'center' });
      doc.fontSize(16).text('Relatório de Ganhos', { align: 'center' });
      doc.moveDown();

      // Driver info
      doc.fontSize(12);
      doc.text(`Entregador: ${driver.name}`);
      doc.text(`CPF: ${driver.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')}`);
      doc.text(`Período: ${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`);
      doc.moveDown();

      // Summary
      doc.fontSize(14).text('Resumo', { underline: true });
      doc.fontSize(12);
      doc.text(`Total de Ganhos: R$ ${earnings.summary.totalEarnings.toFixed(2)}`);
      doc.text(`Total de Entregas: ${earnings.summary.totalDeliveries}`);
      doc.text(`Média por Entrega: R$ ${earnings.summary.averagePerDelivery.toFixed(2)}`);
      doc.text(`Distância Total: ${earnings.summary.totalDistance.toFixed(2)} km`);
      doc.moveDown();

      // Daily breakdown
      doc.fontSize(14).text('Ganhos por Dia', { underline: true });
      doc.fontSize(10);

      const tableTop = doc.y + 10;
      const col1 = 50;
      const col2 = 200;
      const col3 = 350;

      doc.text('Data', col1, tableTop);
      doc.text('Entregas', col2, tableTop);
      doc.text('Valor', col3, tableTop);

      let y = tableTop + 20;
      for (const day of earnings.daily.slice(0, 30)) {
        doc.text(new Date(day.date).toLocaleDateString('pt-BR'), col1, y);
        doc.text(String(day.deliveries), col2, y);
        doc.text(`R$ ${day.earnings.toFixed(2)}`, col3, y);
        y += 15;
      }

      doc.moveDown(2);

      // Footer
      doc.fontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
      doc.text('Rotax1 - Entregas Última Milha', { align: 'center' });

      doc.end();
    });
  }

  private getPeriodDates(query: EarningsQuery): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date(now);

    switch (query.period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'custom':
        if (query.startDate && query.endDate) {
          startDate = new Date(query.startDate);
          endDate = new Date(query.endDate);
        } else {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    }

    return { startDate, endDate };
  }

  private getPreviousPeriod(startDate: Date, endDate: Date) {
    const diff = endDate.getTime() - startDate.getTime();
    return {
      start: new Date(startDate.getTime() - diff),
      end: new Date(startDate.getTime() - 1),
    };
  }

  private async getDailyBreakdown(
    driverId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DailyEarning[]> {
    const orders = await prisma.order.findMany({
      where: {
        driverId,
        status: OrderStatus.DELIVERED,
        deliveredAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        driverEarning: true,
        deliveredAt: true,
      },
    });

    // Group by date
    const dailyMap = new Map<string, { earnings: number; deliveries: number }>();

    for (const order of orders) {
      if (!order.deliveredAt) continue;

      const dateKey = order.deliveredAt.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey) || { earnings: 0, deliveries: 0 };

      dailyMap.set(dateKey, {
        earnings: existing.earnings + Number(order.driverEarning),
        deliveries: existing.deliveries + 1,
      });
    }

    // Convert to array sorted by date
    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        earnings: Math.round(data.earnings * 100) / 100,
        deliveries: data.deliveries,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private formatAddress(addr: Record<string, string>): string {
    return `${addr.street}, ${addr.number} - ${addr.neighborhood || addr.city}`;
  }
}

export const earningsService = new EarningsService();
```

### 4. Earnings Controller

**apps/api/src/modules/drivers/earnings/earnings.controller.ts:**
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { earningsService } from './earnings.service.js';
import type { EarningsQuery, DeliveriesQuery } from './earnings.schema.js';

export class EarningsController {
  async getEarnings(
    request: FastifyRequest<{ Querystring: EarningsQuery }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await earningsService.getEarnings(driverId, request.query);
    reply.send(result);
  }

  async getQuickStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const driverId = await this.getDriverId(request);
    const stats = await earningsService.getQuickStats(driverId);
    reply.send(stats);
  }

  async getDeliveries(
    request: FastifyRequest<{ Querystring: DeliveriesQuery }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await earningsService.getDeliveries(driverId, request.query);
    reply.send(result);
  }

  async getPayoutInfo(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const driverId = await this.getDriverId(request);
    const info = await earningsService.getPayoutInfo(driverId);
    reply.send(info);
  }

  async exportPDF(
    request: FastifyRequest<{ Querystring: EarningsQuery }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const pdf = await earningsService.exportEarningsPDF(driverId, request.query);

    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'attachment; filename=ganhos-rotax1.pdf')
      .send(pdf);
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

export const earningsController = new EarningsController();
```

### 5. Earnings Routes

**apps/api/src/modules/drivers/earnings/earnings.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { earningsController } from './earnings.controller.js';
import { authenticate } from '../../../common/middlewares/auth.middleware.js';

export async function earningsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/earnings', {
    schema: {
      tags: ['Earnings'],
      summary: 'Get earnings for period',
      security: [{ bearerAuth: [] }],
    },
    handler: earningsController.getEarnings.bind(earningsController),
  });

  fastify.get('/earnings/stats', {
    schema: {
      tags: ['Earnings'],
      summary: 'Get quick earnings stats',
      security: [{ bearerAuth: [] }],
    },
    handler: earningsController.getQuickStats.bind(earningsController),
  });

  fastify.get('/deliveries', {
    schema: {
      tags: ['Earnings'],
      summary: 'Get delivery history',
      security: [{ bearerAuth: [] }],
    },
    handler: earningsController.getDeliveries.bind(earningsController),
  });

  fastify.get('/earnings/payout', {
    schema: {
      tags: ['Earnings'],
      summary: 'Get payout information',
      security: [{ bearerAuth: [] }],
    },
    handler: earningsController.getPayoutInfo.bind(earningsController),
  });

  fastify.get('/earnings/export', {
    schema: {
      tags: ['Earnings'],
      summary: 'Export earnings report as PDF',
      security: [{ bearerAuth: [] }],
    },
    handler: earningsController.exportPDF.bind(earningsController),
  });
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/drivers/earnings` | Get earnings for period |
| GET | `/drivers/earnings/stats` | Get quick stats (today/week/month) |
| GET | `/drivers/deliveries` | Get delivery history |
| GET | `/drivers/earnings/payout` | Get payout information |
| GET | `/drivers/earnings/export` | Export PDF report |

---

## Query Parameters

### Earnings
| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | day, week, month, custom |
| `startDate` | datetime | Start date (custom period) |
| `endDate` | datetime | End date (custom period) |

### Deliveries
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page (1-50) |
| `status` | string | DELIVERED or CANCELLED |
| `startDate` | datetime | Filter from date |
| `endDate` | datetime | Filter to date |

---

## Response Examples

### Quick Stats
```json
{
  "today": { "earnings": 125.50, "deliveries": 5 },
  "week": { "earnings": 780.00, "deliveries": 32 },
  "month": { "earnings": 3250.00, "deliveries": 128 },
  "lifetime": {
    "totalDeliveries": 1250,
    "rating": 4.8,
    "ratingCount": 980
  }
}
```

### Earnings Summary
```json
{
  "summary": {
    "period": "week",
    "totalEarnings": 780.00,
    "totalDeliveries": 32,
    "averagePerDelivery": 24.37,
    "totalDistance": 245.5,
    "comparison": {
      "previousTotal": 650.00,
      "percentChange": 20
    }
  },
  "daily": [
    { "date": "2024-01-15", "earnings": 125.50, "deliveries": 5 },
    { "date": "2024-01-16", "earnings": 98.00, "deliveries": 4 }
  ],
  "period": {
    "start": "2024-01-14T00:00:00Z",
    "end": "2024-01-20T23:59:59Z"
  }
}
```

---

## Definition of Done

- [ ] Earnings endpoint with filters
- [ ] Quick stats (today/week/month)
- [ ] Delivery history paginated
- [ ] Daily earnings breakdown
- [ ] Payout information
- [ ] PDF export working
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 3.4 (Delivery Navigation)
- pdfkit for PDF generation
