# Story 4.4: Financial Control & Reports

**Epic:** 4 - Admin Module
**Status:** Ready for Development
**Priority:** P1 - Important
**Estimate:** Medium (4-6 hours)

---

## User Story

**As an** admin,
**I want** to manage finances and generate reports,
**so that** I can control revenue and payouts.

---

## Acceptance Criteria

- [ ] 1. Dashboard financeiro com métricas
- [ ] 2. Lista de transações com filtros
- [ ] 3. Processamento de repasses para drivers
- [ ] 4. Relatórios exportáveis (CSV, PDF)
- [ ] 5. Configuração de taxas por categoria/região
- [ ] 6. Histórico de repasses
- [ ] 7. Projeção de receita
- [ ] 8. Alertas de pendências financeiras

---

## Technical Implementation

### 1. Module Structure

```
apps/api/src/modules/admin/finance/
├── finance.controller.ts
├── finance.service.ts
├── finance.routes.ts
├── finance.schema.ts
├── payouts/
│   ├── payouts.controller.ts
│   ├── payouts.service.ts
│   └── payouts.routes.ts
├── reports/
│   ├── reports.controller.ts
│   ├── reports.service.ts
│   └── reports.routes.ts
└── settings/
    ├── pricing.controller.ts
    ├── pricing.service.ts
    └── pricing.routes.ts
```

### 2. Zod Schemas

**apps/api/src/modules/admin/finance/finance.schema.ts:**
```typescript
import { z } from 'zod';

export const financeDashboardQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).default('month'),
});

export const transactionsQuerySchema = z.object({
  type: z.enum(['ORDER', 'PAYOUT', 'REFUND']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  driverId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const processPayoutsSchema = z.object({
  driverIds: z.array(z.string().uuid()).optional(),
  periodEnd: z.string().datetime(),
});

export const updatePricingSchema = z.object({
  category: z.enum(['DOCUMENT', 'SMALL_PACKAGE', 'MEDIUM_PACKAGE', 'LARGE_PACKAGE', 'FRAGILE', 'REFRIGERATED']),
  region: z.string().optional(),
  basePrice: z.number().min(0),
  pricePerKm: z.number().min(0),
  platformFeePercent: z.number().min(0).max(100),
  urgencyMultiplier: z.object({
    STANDARD: z.number().default(1),
    EXPRESS: z.number().default(1.5),
    URGENT: z.number().default(2),
  }),
});

export type FinanceDashboardQuery = z.infer<typeof financeDashboardQuerySchema>;
export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;
export type ProcessPayoutsInput = z.infer<typeof processPayoutsSchema>;
export type UpdatePricingInput = z.infer<typeof updatePricingSchema>;
```

### 3. Finance Service

**apps/api/src/modules/admin/finance/finance.service.ts:**
```typescript
import { prisma, OrderStatus, PaymentStatus } from '@rotax1/database';
import type { FinanceDashboardQuery, TransactionsQuery } from './finance.schema.js';

interface FinanceDashboard {
  revenue: {
    total: number;
    platformFees: number;
    driverEarnings: number;
    change: number;
  };
  orders: {
    total: number;
    delivered: number;
    cancelled: number;
    avgValue: number;
  };
  payouts: {
    pending: number;
    processed: number;
    nextPayoutDate: Date;
  };
  topCategories: { category: string; revenue: number; count: number }[];
  dailyRevenue: { date: string; revenue: number; orders: number }[];
}

export class FinanceService {
  async getDashboard(query: FinanceDashboardQuery): Promise<FinanceDashboard> {
    const { startDate, endDate, previousStart, previousEnd } = this.getPeriodDates(query.period);

    // Current period stats
    const [
      currentOrders,
      currentRevenue,
      previousRevenue,
      pendingPayouts,
      processedPayouts,
      categoryStats,
      dailyStats,
    ] = await Promise.all([
      // Orders in period
      prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          status: true,
          price: true,
          platformFee: true,
          driverEarning: true,
          category: true,
        },
      }),

      // Revenue current period
      prisma.order.aggregate({
        where: {
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: startDate, lte: endDate },
        },
        _sum: { price: true, platformFee: true, driverEarning: true },
      }),

      // Revenue previous period
      prisma.order.aggregate({
        where: {
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: previousStart, lte: previousEnd },
        },
        _sum: { platformFee: true },
      }),

      // Pending payouts
      prisma.order.aggregate({
        where: {
          status: OrderStatus.DELIVERED,
          driverPayout: null,
        },
        _sum: { driverEarning: true },
      }),

      // Processed payouts this period
      prisma.driverPayout.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'COMPLETED',
        },
        _sum: { amount: true },
      }),

      // Category breakdown
      prisma.order.groupBy({
        by: ['category'],
        where: {
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: startDate, lte: endDate },
        },
        _sum: { price: true },
        _count: true,
      }),

      // Daily stats
      this.getDailyStats(startDate, endDate),
    ]);

    const deliveredOrders = currentOrders.filter((o) => o.status === OrderStatus.DELIVERED);
    const cancelledOrders = currentOrders.filter((o) => o.status === OrderStatus.CANCELLED);
    const totalRevenue = Number(currentRevenue._sum.price || 0);
    const platformFees = Number(currentRevenue._sum.platformFee || 0);
    const driverEarnings = Number(currentRevenue._sum.driverEarning || 0);
    const previousFees = Number(previousRevenue._sum.platformFee || 0);

    // Calculate next Monday for payouts
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((7 - nextMonday.getDay() + 1) % 7 || 7));
    nextMonday.setHours(10, 0, 0, 0);

    return {
      revenue: {
        total: Math.round(totalRevenue * 100) / 100,
        platformFees: Math.round(platformFees * 100) / 100,
        driverEarnings: Math.round(driverEarnings * 100) / 100,
        change: previousFees > 0
          ? Math.round(((platformFees - previousFees) / previousFees) * 100)
          : 0,
      },
      orders: {
        total: currentOrders.length,
        delivered: deliveredOrders.length,
        cancelled: cancelledOrders.length,
        avgValue: deliveredOrders.length > 0
          ? Math.round((totalRevenue / deliveredOrders.length) * 100) / 100
          : 0,
      },
      payouts: {
        pending: Math.round(Number(pendingPayouts._sum.driverEarning || 0) * 100) / 100,
        processed: Math.round(Number(processedPayouts._sum.amount || 0) * 100) / 100,
        nextPayoutDate: nextMonday,
      },
      topCategories: categoryStats.map((c) => ({
        category: c.category,
        revenue: Math.round(Number(c._sum.price || 0) * 100) / 100,
        count: c._count,
      })),
      dailyRevenue: dailyStats,
    };
  }

  async getTransactions(query: TransactionsQuery) {
    const { type, dateFrom, dateTo, driverId, status, page, limit } = query;
    const skip = (page - 1) * limit;

    // Build transactions from multiple sources
    const transactions: any[] = [];

    // Order transactions
    if (!type || type === 'ORDER') {
      const orderWhere: any = {
        status: OrderStatus.DELIVERED,
      };

      if (dateFrom || dateTo) {
        orderWhere.deliveredAt = {};
        if (dateFrom) orderWhere.deliveredAt.gte = new Date(dateFrom);
        if (dateTo) orderWhere.deliveredAt.lte = new Date(dateTo);
      }

      if (driverId) {
        orderWhere.driverId = driverId;
      }

      const orders = await prisma.order.findMany({
        where: orderWhere,
        include: {
          client: { select: { name: true } },
          driver: { select: { name: true } },
          payment: true,
        },
        orderBy: { deliveredAt: 'desc' },
      });

      for (const order of orders) {
        transactions.push({
          id: order.id,
          type: 'ORDER',
          description: `Pedido #${order.id.substring(0, 8)}`,
          amount: Number(order.price),
          platformFee: Number(order.platformFee),
          driverEarning: Number(order.driverEarning),
          client: order.client?.name,
          driver: order.driver?.name,
          status: 'COMPLETED',
          date: order.deliveredAt,
        });
      }
    }

    // Payout transactions
    if (!type || type === 'PAYOUT') {
      const payoutWhere: any = {};

      if (dateFrom || dateTo) {
        payoutWhere.createdAt = {};
        if (dateFrom) payoutWhere.createdAt.gte = new Date(dateFrom);
        if (dateTo) payoutWhere.createdAt.lte = new Date(dateTo);
      }

      if (driverId) {
        payoutWhere.driverId = driverId;
      }

      if (status) {
        payoutWhere.status = status;
      }

      const payouts = await prisma.driverPayout.findMany({
        where: payoutWhere,
        include: {
          driver: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const payout of payouts) {
        transactions.push({
          id: payout.id,
          type: 'PAYOUT',
          description: `Repasse para ${payout.driver.name}`,
          amount: -Number(payout.amount),
          driver: payout.driver.name,
          status: payout.status,
          date: payout.createdAt,
        });
      }
    }

    // Refund transactions
    if (!type || type === 'REFUND') {
      const refundPayments = await prisma.payment.findMany({
        where: {
          status: PaymentStatus.REFUNDED,
          ...(dateFrom || dateTo
            ? {
                updatedAt: {
                  ...(dateFrom && { gte: new Date(dateFrom) }),
                  ...(dateTo && { lte: new Date(dateTo) }),
                },
              }
            : {}),
        },
        include: {
          order: {
            include: { client: { select: { name: true } } },
          },
        },
      });

      for (const payment of refundPayments) {
        transactions.push({
          id: payment.id,
          type: 'REFUND',
          description: `Reembolso pedido #${payment.orderId.substring(0, 8)}`,
          amount: -Number(payment.amount),
          client: payment.order.client?.name,
          status: 'COMPLETED',
          date: payment.updatedAt,
        });
      }
    }

    // Sort by date and paginate
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const paginatedTransactions = transactions.slice(skip, skip + limit);

    return {
      transactions: paginatedTransactions,
      pagination: {
        page,
        limit,
        total: transactions.length,
        totalPages: Math.ceil(transactions.length / limit),
      },
    };
  }

  async getFinancialAlerts() {
    const alerts = [];

    // Large pending payouts
    const pendingPayouts = await prisma.order.aggregate({
      where: {
        status: OrderStatus.DELIVERED,
        driverPayout: null,
        deliveredAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // > 7 days ago
        },
      },
      _sum: { driverEarning: true },
      _count: true,
    });

    if (pendingPayouts._count > 0) {
      alerts.push({
        type: 'warning',
        title: 'Repasses pendentes',
        message: `${pendingPayouts._count} entregas com repasse pendente há mais de 7 dias (R$ ${Number(pendingPayouts._sum.driverEarning || 0).toFixed(2)})`,
      });
    }

    // Failed payments
    const failedPayments = await prisma.payment.count({
      where: {
        status: PaymentStatus.FAILED,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24h
        },
      },
    });

    if (failedPayments > 0) {
      alerts.push({
        type: 'error',
        title: 'Pagamentos falhados',
        message: `${failedPayments} pagamentos falharam nas últimas 24 horas`,
      });
    }

    // High refund rate
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [deliveredToday, refundedToday] = await Promise.all([
      prisma.order.count({
        where: { status: OrderStatus.DELIVERED, deliveredAt: { gte: todayStart } },
      }),
      prisma.payment.count({
        where: { status: PaymentStatus.REFUNDED, updatedAt: { gte: todayStart } },
      }),
    ]);

    if (deliveredToday > 10 && refundedToday / deliveredToday > 0.1) {
      alerts.push({
        type: 'warning',
        title: 'Taxa de reembolso alta',
        message: `${Math.round((refundedToday / deliveredToday) * 100)}% de reembolsos hoje`,
      });
    }

    return alerts;
  }

  private async getDailyStats(startDate: Date, endDate: Date) {
    const orders = await prisma.order.findMany({
      where: {
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: startDate, lte: endDate },
      },
      select: {
        price: true,
        deliveredAt: true,
      },
    });

    const dailyMap = new Map<string, { revenue: number; orders: number }>();

    for (const order of orders) {
      if (!order.deliveredAt) continue;
      const dateKey = order.deliveredAt.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey) || { revenue: 0, orders: 0 };
      existing.revenue += Number(order.price);
      existing.orders += 1;
      dailyMap.set(dateKey, existing);
    }

    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        revenue: Math.round(data.revenue * 100) / 100,
        orders: data.orders,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private getPeriodDates(period: string) {
    const now = new Date();
    let startDate: Date;
    let previousStart: Date;
    let previousEnd: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        previousStart = new Date(startDate);
        previousStart.setDate(previousStart.getDate() - 1);
        previousEnd = new Date(startDate);
        previousEnd.setMilliseconds(-1);
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        previousStart = new Date(startDate);
        previousStart.setDate(previousStart.getDate() - 7);
        previousEnd = new Date(startDate);
        previousEnd.setMilliseconds(-1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        previousStart = new Date(now.getFullYear() - 1, 0, 1);
        previousEnd = new Date(startDate);
        previousEnd.setMilliseconds(-1);
        break;
      default: // month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEnd = new Date(startDate);
        previousEnd.setMilliseconds(-1);
    }

    return { startDate, endDate: now, previousStart, previousEnd };
  }
}

export const financeService = new FinanceService();
```

### 4. Payouts Service

**apps/api/src/modules/admin/finance/payouts/payouts.service.ts:**
```typescript
import { prisma, OrderStatus } from '@rotax1/database';
import { ValidationError } from '../../../../common/errors/app-error.js';
import { queueService } from '../../../../common/services/queue.service.js';
import type { ProcessPayoutsInput } from '../finance.schema.js';

interface DriverPayout {
  driverId: string;
  driverName: string;
  pixKey: string | null;
  ordersCount: number;
  totalAmount: number;
  orderIds: string[];
}

export class PayoutsService {
  async getPendingPayouts() {
    const pendingOrders = await prisma.order.findMany({
      where: {
        status: OrderStatus.DELIVERED,
        driverPayoutId: null,
        driverId: { not: null },
      },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            pixKey: true,
            bankName: true,
            bankAccount: true,
          },
        },
      },
    });

    // Group by driver
    const driverPayouts = new Map<string, DriverPayout>();

    for (const order of pendingOrders) {
      if (!order.driver) continue;

      const existing = driverPayouts.get(order.driverId!) || {
        driverId: order.driverId!,
        driverName: order.driver.name,
        pixKey: order.driver.pixKey,
        ordersCount: 0,
        totalAmount: 0,
        orderIds: [],
      };

      existing.ordersCount += 1;
      existing.totalAmount += Number(order.driverEarning);
      existing.orderIds.push(order.id);

      driverPayouts.set(order.driverId!, existing);
    }

    return Array.from(driverPayouts.values())
      .map((p) => ({
        ...p,
        totalAmount: Math.round(p.totalAmount * 100) / 100,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }

  async processPayouts(data: ProcessPayoutsInput, adminId: string) {
    const pendingPayouts = await this.getPendingPayouts();

    // Filter by driver IDs if specified
    const payoutsToProcess = data.driverIds
      ? pendingPayouts.filter((p) => data.driverIds!.includes(p.driverId))
      : pendingPayouts;

    if (payoutsToProcess.length === 0) {
      throw new ValidationError('Nenhum repasse pendente encontrado');
    }

    const results = [];

    for (const payout of payoutsToProcess) {
      // Create payout record
      const payoutRecord = await prisma.driverPayout.create({
        data: {
          driverId: payout.driverId,
          amount: payout.totalAmount,
          ordersCount: payout.ordersCount,
          periodEnd: new Date(data.periodEnd),
          status: 'PENDING',
          processedBy: adminId,
        },
      });

      // Link orders to payout
      await prisma.order.updateMany({
        where: { id: { in: payout.orderIds } },
        data: { driverPayoutId: payoutRecord.id },
      });

      // Queue payout processing (PIX transfer)
      await queueService.addJob('payouts', 'process-payout', {
        payoutId: payoutRecord.id,
        driverId: payout.driverId,
        amount: payout.totalAmount,
        pixKey: payout.pixKey,
      });

      results.push({
        payoutId: payoutRecord.id,
        driverId: payout.driverId,
        driverName: payout.driverName,
        amount: payout.totalAmount,
        ordersCount: payout.ordersCount,
      });

      // Log admin action
      await prisma.adminAction.create({
        data: {
          adminId,
          action: 'PAYOUT_INITIATED',
          targetId: payoutRecord.id,
          targetType: 'PAYOUT',
          details: {
            driverId: payout.driverId,
            amount: payout.totalAmount,
            ordersCount: payout.ordersCount,
          },
        },
      });
    }

    return {
      message: `${results.length} repasses iniciados`,
      payouts: results,
      totalAmount: results.reduce((sum, r) => sum + r.amount, 0),
    };
  }

  async getPayoutHistory(query: { page: number; limit: number; driverId?: string }) {
    const { page, limit, driverId } = query;
    const skip = (page - 1) * limit;

    const where = driverId ? { driverId } : {};

    const [payouts, total] = await Promise.all([
      prisma.driverPayout.findMany({
        where,
        include: {
          driver: { select: { name: true } },
          processedByAdmin: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.driverPayout.count({ where }),
    ]);

    return {
      payouts: payouts.map((p) => ({
        id: p.id,
        driverName: p.driver.name,
        amount: Number(p.amount),
        ordersCount: p.ordersCount,
        status: p.status,
        periodEnd: p.periodEnd,
        processedBy: p.processedByAdmin?.name,
        createdAt: p.createdAt,
        completedAt: p.completedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const payoutsService = new PayoutsService();
```

### 5. Reports Service

**apps/api/src/modules/admin/finance/reports/reports.service.ts:**
```typescript
import { prisma, OrderStatus } from '@rotax1/database';
import PDFDocument from 'pdfkit';

interface ReportQuery {
  dateFrom: Date;
  dateTo: Date;
  type: 'revenue' | 'orders' | 'drivers' | 'complete';
}

export class ReportsService {
  async generateReport(query: ReportQuery, format: 'csv' | 'pdf') {
    const data = await this.getReportData(query);

    if (format === 'csv') {
      return this.generateCSV(data, query.type);
    }

    return this.generatePDF(data, query);
  }

  private async getReportData(query: ReportQuery) {
    const { dateFrom, dateTo } = query;

    const [orders, payouts, drivers] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        include: {
          client: { select: { name: true } },
          driver: { select: { name: true } },
          payment: true,
        },
      }),
      prisma.driverPayout.findMany({
        where: {
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        include: {
          driver: { select: { name: true } },
        },
      }),
      prisma.driver.findMany({
        where: {
          orders: {
            some: {
              status: OrderStatus.DELIVERED,
              deliveredAt: { gte: dateFrom, lte: dateTo },
            },
          },
        },
        include: {
          _count: {
            select: {
              orders: {
                where: {
                  status: OrderStatus.DELIVERED,
                  deliveredAt: { gte: dateFrom, lte: dateTo },
                },
              },
            },
          },
        },
      }),
    ]);

    // Calculate summaries
    const deliveredOrders = orders.filter((o) => o.status === OrderStatus.DELIVERED);
    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + Number(o.price), 0);
    const totalFees = deliveredOrders.reduce((sum, o) => sum + Number(o.platformFee), 0);
    const totalDriverEarnings = deliveredOrders.reduce((sum, o) => sum + Number(o.driverEarning), 0);

    return {
      period: { from: dateFrom, to: dateTo },
      summary: {
        totalOrders: orders.length,
        deliveredOrders: deliveredOrders.length,
        cancelledOrders: orders.filter((o) => o.status === OrderStatus.CANCELLED).length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        platformFees: Math.round(totalFees * 100) / 100,
        driverEarnings: Math.round(totalDriverEarnings * 100) / 100,
        totalPayouts: payouts.reduce((sum, p) => sum + Number(p.amount), 0),
      },
      orders: deliveredOrders.map((o) => ({
        id: o.id,
        date: o.deliveredAt,
        client: o.client?.name,
        driver: o.driver?.name,
        category: o.category,
        price: Number(o.price),
        platformFee: Number(o.platformFee),
        driverEarning: Number(o.driverEarning),
      })),
      drivers: drivers.map((d) => ({
        name: d.name,
        deliveries: d._count.orders,
        rating: Number(d.ratingAvg),
      })),
      payouts: payouts.map((p) => ({
        date: p.createdAt,
        driver: p.driver.name,
        amount: Number(p.amount),
        status: p.status,
      })),
    };
  }

  private generateCSV(data: any, type: string): string {
    let rows: string[] = [];

    if (type === 'revenue' || type === 'complete') {
      rows.push('=== RESUMO ===');
      rows.push(`Período,${data.period.from.toISOString()},${data.period.to.toISOString()}`);
      rows.push(`Total Pedidos,${data.summary.totalOrders}`);
      rows.push(`Entregas Realizadas,${data.summary.deliveredOrders}`);
      rows.push(`Receita Total,R$ ${data.summary.totalRevenue.toFixed(2)}`);
      rows.push(`Taxa Plataforma,R$ ${data.summary.platformFees.toFixed(2)}`);
      rows.push(`Ganhos Entregadores,R$ ${data.summary.driverEarnings.toFixed(2)}`);
      rows.push('');
    }

    if (type === 'orders' || type === 'complete') {
      rows.push('=== PEDIDOS ===');
      rows.push('ID,Data,Cliente,Entregador,Categoria,Valor,Taxa,Ganho Entregador');
      for (const order of data.orders) {
        rows.push(
          `${order.id},${order.date?.toISOString() || ''},${order.client || ''},${order.driver || ''},${order.category},${order.price.toFixed(2)},${order.platformFee.toFixed(2)},${order.driverEarning.toFixed(2)}`
        );
      }
      rows.push('');
    }

    if (type === 'drivers' || type === 'complete') {
      rows.push('=== ENTREGADORES ===');
      rows.push('Nome,Entregas,Avaliação');
      for (const driver of data.drivers) {
        rows.push(`${driver.name},${driver.deliveries},${driver.rating.toFixed(1)}`);
      }
    }

    return rows.join('\n');
  }

  private generatePDF(data: any, query: ReportQuery): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).text('Rotax1', { align: 'center' });
      doc.fontSize(16).text('Relatório Financeiro', { align: 'center' });
      doc.fontSize(10).text(
        `Período: ${data.period.from.toLocaleDateString('pt-BR')} a ${data.period.to.toLocaleDateString('pt-BR')}`,
        { align: 'center' }
      );
      doc.moveDown(2);

      // Summary
      doc.fontSize(14).text('Resumo', { underline: true });
      doc.fontSize(11);
      doc.text(`Total de Pedidos: ${data.summary.totalOrders}`);
      doc.text(`Entregas Realizadas: ${data.summary.deliveredOrders}`);
      doc.text(`Pedidos Cancelados: ${data.summary.cancelledOrders}`);
      doc.moveDown();
      doc.text(`Receita Total: R$ ${data.summary.totalRevenue.toFixed(2)}`);
      doc.text(`Taxa da Plataforma: R$ ${data.summary.platformFees.toFixed(2)}`);
      doc.text(`Ganhos Entregadores: R$ ${data.summary.driverEarnings.toFixed(2)}`);
      doc.moveDown(2);

      // Top drivers
      if (data.drivers.length > 0) {
        doc.fontSize(14).text('Top Entregadores', { underline: true });
        doc.fontSize(10);
        const topDrivers = data.drivers.slice(0, 10);
        for (const driver of topDrivers) {
          doc.text(`${driver.name}: ${driver.deliveries} entregas (${driver.rating.toFixed(1)} estrelas)`);
        }
      }

      doc.moveDown(2);

      // Footer
      doc.fontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });

      doc.end();
    });
  }
}

export const reportsService = new ReportsService();
```

### 6. Pricing Service

**apps/api/src/modules/admin/finance/settings/pricing.service.ts:**
```typescript
import { prisma } from '@rotax1/database';
import type { UpdatePricingInput } from '../finance.schema.js';

const DEFAULT_PRICING = {
  DOCUMENT: { basePrice: 8, pricePerKm: 1.5, platformFeePercent: 20 },
  SMALL_PACKAGE: { basePrice: 10, pricePerKm: 2, platformFeePercent: 20 },
  MEDIUM_PACKAGE: { basePrice: 15, pricePerKm: 2.5, platformFeePercent: 20 },
  LARGE_PACKAGE: { basePrice: 25, pricePerKm: 3, platformFeePercent: 20 },
  FRAGILE: { basePrice: 20, pricePerKm: 3, platformFeePercent: 20 },
  REFRIGERATED: { basePrice: 30, pricePerKm: 4, platformFeePercent: 25 },
};

export class PricingService {
  async getPricing() {
    const settings = await prisma.systemSettings.findFirst({
      where: { key: 'pricing' },
    });

    if (!settings) {
      return DEFAULT_PRICING;
    }

    return settings.value as typeof DEFAULT_PRICING;
  }

  async updatePricing(data: UpdatePricingInput, adminId: string) {
    const currentPricing = await this.getPricing();

    const newPricing = {
      ...currentPricing,
      [data.category]: {
        basePrice: data.basePrice,
        pricePerKm: data.pricePerKm,
        platformFeePercent: data.platformFeePercent,
        urgencyMultiplier: data.urgencyMultiplier,
        region: data.region,
      },
    };

    await prisma.$transaction([
      prisma.systemSettings.upsert({
        where: { key: 'pricing' },
        create: { key: 'pricing', value: newPricing },
        update: { value: newPricing },
      }),
      prisma.adminAction.create({
        data: {
          adminId,
          action: 'PRICING_UPDATED',
          targetId: 'pricing',
          targetType: 'SETTINGS',
          details: {
            category: data.category,
            changes: data,
          },
        },
      }),
    ]);

    return newPricing;
  }
}

export const pricingService = new PricingService();
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/finance/dashboard` | Financial dashboard |
| GET | `/admin/finance/transactions` | List transactions |
| GET | `/admin/finance/alerts` | Financial alerts |
| GET | `/admin/finance/payouts/pending` | Pending payouts |
| POST | `/admin/finance/payouts/process` | Process payouts |
| GET | `/admin/finance/payouts/history` | Payout history |
| GET | `/admin/finance/reports/export` | Export report |
| GET | `/admin/settings/pricing` | Get pricing config |
| PUT | `/admin/settings/pricing` | Update pricing |

---

## Definition of Done

- [ ] Financial dashboard working
- [ ] Transaction list with filters
- [ ] Payout processing
- [ ] CSV/PDF reports
- [ ] Pricing configuration
- [ ] Financial alerts
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 4.3 (Order Management)
- BullMQ for payout processing
- pdfkit for reports
