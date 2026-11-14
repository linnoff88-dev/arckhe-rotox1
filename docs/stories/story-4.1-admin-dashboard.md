# Story 4.1: Admin Authentication & Dashboard

**Epic:** 4 - Admin Module
**Status:** Ready for Development
**Priority:** P1 - Important
**Estimate:** Medium (4-6 hours)

---

## User Story

**As an** admin,
**I want** a secure login and overview dashboard,
**so that** I can monitor platform operations.

---

## Acceptance Criteria

- [ ] 1. Login separado para admins com validação de role
- [ ] 2. 2FA opcional com TOTP (Google Authenticator)
- [ ] 3. Dashboard com métricas em tempo real
- [ ] 4. Gráficos de tendência (7/30 dias)
- [ ] 5. Alertas de problemas (pedidos stuck, reclamações)
- [ ] 6. WebSocket para atualizações em tempo real
- [ ] 7. Responsivo para tablet/desktop
- [ ] 8. Sessão segura com timeout

---

## Technical Implementation

### 1. Admin Panel Structure (Next.js 14)

```
apps/admin/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── setup-2fa/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── users/
│   │   ├── orders/
│   │   └── finance/
│   ├── layout.tsx
│   └── providers.tsx
├── components/
│   ├── dashboard/
│   │   ├── MetricCard.tsx
│   │   ├── OrdersChart.tsx
│   │   ├── RevenueChart.tsx
│   │   ├── AlertsPanel.tsx
│   │   └── LiveStats.tsx
│   ├── ui/
│   └── layout/
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   └── socket.ts
└── package.json
```

### 2. Admin Authentication API

**apps/api/src/modules/admin/auth/admin-auth.service.ts:**
```typescript
import { prisma, UserRole, UserStatus } from '@rotax1/database';
import { UnauthorizedError, ForbiddenError, ValidationError } from '../../../common/errors/app-error.js';
import { comparePassword, hashPassword } from '../../../common/utils/password.js';
import { generateAccessToken, generateRefreshToken } from '../../../common/utils/jwt.js';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export class AdminAuthService {
  async login(email: string, password: string, totpCode?: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { admin: true },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new UnauthorizedError('Credenciais inválidas');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenError('Conta desativada');
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Credenciais inválidas');
    }

    // Check 2FA if enabled
    if (user.admin?.totpEnabled) {
      if (!totpCode) {
        return { requires2FA: true };
      }

      const isValidTotp = speakeasy.totp.verify({
        secret: user.admin.totpSecret!,
        encoding: 'base32',
        token: totpCode,
        window: 1,
      });

      if (!isValidTotp) {
        throw new UnauthorizedError('Código 2FA inválido');
      }
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      role: user.role,
      adminId: user.admin?.id,
    });

    const refreshToken = generateRefreshToken(user.id);

    // Log admin login
    await prisma.adminAction.create({
      data: {
        adminId: user.admin!.id,
        action: 'LOGIN',
        targetType: 'SYSTEM',
        details: {
          ip: 'request.ip', // Will be set by controller
          userAgent: 'request.userAgent',
        },
      },
    });

    return {
      accessToken,
      refreshToken,
      admin: {
        id: user.admin!.id,
        name: user.admin!.name,
        email: user.email,
        role: user.admin!.adminRole,
        has2FA: user.admin!.totpEnabled,
      },
    };
  }

  async setup2FA(adminId: string) {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      include: { user: true },
    });

    if (!admin) {
      throw new ValidationError('Admin não encontrado');
    }

    if (admin.totpEnabled) {
      throw new ValidationError('2FA já está ativo');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Rotax1 Admin (${admin.user.email})`,
      length: 20,
    });

    // Store secret temporarily (not enabled yet)
    await prisma.admin.update({
      where: { id: adminId },
      data: { totpSecret: secret.base32 },
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
    };
  }

  async verify2FA(adminId: string, code: string) {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.totpSecret) {
      throw new ValidationError('Configure 2FA primeiro');
    }

    const isValid = speakeasy.totp.verify({
      secret: admin.totpSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!isValid) {
      throw new ValidationError('Código inválido');
    }

    // Enable 2FA
    await prisma.admin.update({
      where: { id: adminId },
      data: { totpEnabled: true },
    });

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );

    await prisma.admin.update({
      where: { id: adminId },
      data: {
        backupCodes: await Promise.all(
          backupCodes.map((code) => hashPassword(code))
        ),
      },
    });

    return { backupCodes };
  }

  async disable2FA(adminId: string, password: string) {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      include: { user: true },
    });

    if (!admin) {
      throw new ValidationError('Admin não encontrado');
    }

    const isValidPassword = await comparePassword(password, admin.user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Senha inválida');
    }

    await prisma.admin.update({
      where: { id: adminId },
      data: {
        totpEnabled: false,
        totpSecret: null,
        backupCodes: [],
      },
    });

    return { message: '2FA desativado' };
  }
}

export const adminAuthService = new AdminAuthService();
```

### 3. Dashboard Service

**apps/api/src/modules/admin/dashboard/dashboard.service.ts:**
```typescript
import { prisma, OrderStatus, PaymentStatus } from '@rotax1/database';
import { redisService } from '../../../common/services/redis.service.js';

interface DashboardMetrics {
  ordersToday: number;
  activeDeliveries: number;
  revenueToday: number;
  driversOnline: number;
  ordersChange: number;
  revenueChange: number;
}

interface ChartData {
  date: string;
  orders: number;
  revenue: number;
  deliveries: number;
}

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  orderId?: string;
  createdAt: Date;
}

export class DashboardService {
  async getMetrics(): Promise<DashboardMetrics> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const [
      ordersToday,
      ordersYesterday,
      activeDeliveries,
      revenueToday,
      revenueYesterday,
      driversOnline,
    ] = await Promise.all([
      // Orders today
      prisma.order.count({
        where: { createdAt: { gte: todayStart } },
      }),

      // Orders yesterday (for comparison)
      prisma.order.count({
        where: {
          createdAt: {
            gte: yesterdayStart,
            lt: todayStart,
          },
        },
      }),

      // Active deliveries
      prisma.order.count({
        where: {
          status: { in: [OrderStatus.COLLECTING, OrderStatus.DELIVERING] },
        },
      }),

      // Revenue today (platform fees)
      prisma.order.aggregate({
        where: {
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: todayStart },
        },
        _sum: { platformFee: true },
      }),

      // Revenue yesterday
      prisma.order.aggregate({
        where: {
          status: OrderStatus.DELIVERED,
          deliveredAt: {
            gte: yesterdayStart,
            lt: todayStart,
          },
        },
        _sum: { platformFee: true },
      }),

      // Drivers online from Redis
      this.getOnlineDriversCount(),
    ]);

    const revToday = Number(revenueToday._sum.platformFee || 0);
    const revYesterday = Number(revenueYesterday._sum.platformFee || 0);

    return {
      ordersToday,
      activeDeliveries,
      revenueToday: Math.round(revToday * 100) / 100,
      driversOnline,
      ordersChange: ordersYesterday > 0
        ? Math.round(((ordersToday - ordersYesterday) / ordersYesterday) * 100)
        : 0,
      revenueChange: revYesterday > 0
        ? Math.round(((revToday - revYesterday) / revYesterday) * 100)
        : 0,
    };
  }

  async getChartData(days: number = 7): Promise<ChartData[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        status: true,
        platformFee: true,
        deliveredAt: true,
      },
    });

    // Group by date
    const dataMap = new Map<string, { orders: number; revenue: number; deliveries: number }>();

    // Initialize all days
    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      dataMap.set(dateKey, { orders: 0, revenue: 0, deliveries: 0 });
    }

    // Aggregate data
    for (const order of orders) {
      const dateKey = order.createdAt.toISOString().split('T')[0];
      const existing = dataMap.get(dateKey) || { orders: 0, revenue: 0, deliveries: 0 };

      existing.orders += 1;

      if (order.status === OrderStatus.DELIVERED && order.deliveredAt) {
        const deliveredKey = order.deliveredAt.toISOString().split('T')[0];
        const deliveredData = dataMap.get(deliveredKey) || { orders: 0, revenue: 0, deliveries: 0 };
        deliveredData.deliveries += 1;
        deliveredData.revenue += Number(order.platformFee || 0);
        dataMap.set(deliveredKey, deliveredData);
      }

      dataMap.set(dateKey, existing);
    }

    return Array.from(dataMap.entries())
      .map(([date, data]) => ({
        date,
        orders: data.orders,
        revenue: Math.round(data.revenue * 100) / 100,
        deliveries: data.deliveries,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getAlerts(): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const now = new Date();

    // Stuck orders (searching for driver > 30 min)
    const stuckSearching = await prisma.order.findMany({
      where: {
        status: OrderStatus.SEARCHING_DRIVER,
        updatedAt: {
          lt: new Date(now.getTime() - 30 * 60 * 1000),
        },
      },
      take: 10,
    });

    for (const order of stuckSearching) {
      alerts.push({
        id: `stuck-${order.id}`,
        type: 'warning',
        title: 'Pedido aguardando entregador',
        message: `Pedido #${order.id.substring(0, 8)} está há mais de 30 minutos sem entregador`,
        orderId: order.id,
        createdAt: order.updatedAt,
      });
    }

    // Stuck collecting (> 1 hour)
    const stuckCollecting = await prisma.order.findMany({
      where: {
        status: OrderStatus.COLLECTING,
        acceptedAt: {
          lt: new Date(now.getTime() - 60 * 60 * 1000),
        },
      },
      take: 10,
    });

    for (const order of stuckCollecting) {
      alerts.push({
        id: `collecting-${order.id}`,
        type: 'error',
        title: 'Coleta demorada',
        message: `Pedido #${order.id.substring(0, 8)} está há mais de 1 hora aguardando coleta`,
        orderId: order.id,
        createdAt: order.acceptedAt!,
      });
    }

    // Low-rated deliveries today
    const lowRatings = await prisma.rating.findMany({
      where: {
        stars: { lte: 2 },
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
      include: {
        order: { select: { id: true } },
        driver: { select: { name: true } },
      },
      take: 5,
    });

    for (const rating of lowRatings) {
      alerts.push({
        id: `rating-${rating.id}`,
        type: 'warning',
        title: 'Avaliação negativa',
        message: `Entrega #${rating.orderId.substring(0, 8)} recebeu ${rating.stars} estrelas`,
        orderId: rating.orderId,
        createdAt: rating.createdAt,
      });
    }

    // Sort by date descending
    return alerts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getLiveStats() {
    const [
      pendingPayments,
      pendingApprovals,
      cancelledToday,
    ] = await Promise.all([
      prisma.payment.count({
        where: { status: PaymentStatus.PENDING },
      }),
      prisma.driver.count({
        where: { status: 'PENDING_APPROVAL' },
      }),
      prisma.order.count({
        where: {
          status: OrderStatus.CANCELLED,
          cancelledAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return {
      pendingPayments,
      pendingApprovals,
      cancelledToday,
    };
  }

  private async getOnlineDriversCount(): Promise<number> {
    const client = redisService.getClient();
    const keys = await client.keys('drivers:online:*');
    return keys.length;
  }
}

export const dashboardService = new DashboardService();
```

### 4. Dashboard Routes

**apps/api/src/modules/admin/dashboard/dashboard.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { dashboardController } from './dashboard.controller.js';
import { authenticate, requireRole } from '../../../common/middlewares/auth.middleware.js';

export async function adminDashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole('ADMIN'));

  fastify.get('/metrics', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Get dashboard metrics',
      security: [{ bearerAuth: [] }],
    },
    handler: dashboardController.getMetrics.bind(dashboardController),
  });

  fastify.get('/charts', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Get chart data',
      security: [{ bearerAuth: [] }],
    },
    handler: dashboardController.getChartData.bind(dashboardController),
  });

  fastify.get('/alerts', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Get system alerts',
      security: [{ bearerAuth: [] }],
    },
    handler: dashboardController.getAlerts.bind(dashboardController),
  });

  fastify.get('/live', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Get live stats',
      security: [{ bearerAuth: [] }],
    },
    handler: dashboardController.getLiveStats.bind(dashboardController),
  });
}
```

### 5. Admin Auth Routes

**apps/api/src/modules/admin/auth/admin-auth.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { adminAuthController } from './admin-auth.controller.js';
import { authenticate, requireRole } from '../../../common/middlewares/auth.middleware.js';

export async function adminAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // Public routes
  fastify.post('/login', {
    schema: {
      tags: ['Admin Auth'],
      summary: 'Admin login',
    },
    handler: adminAuthController.login.bind(adminAuthController),
  });

  // Protected routes
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);
    protectedRoutes.addHook('preHandler', requireRole('ADMIN'));

    protectedRoutes.post('/2fa/setup', {
      schema: {
        tags: ['Admin Auth'],
        summary: 'Setup 2FA',
        security: [{ bearerAuth: [] }],
      },
      handler: adminAuthController.setup2FA.bind(adminAuthController),
    });

    protectedRoutes.post('/2fa/verify', {
      schema: {
        tags: ['Admin Auth'],
        summary: 'Verify and enable 2FA',
        security: [{ bearerAuth: [] }],
      },
      handler: adminAuthController.verify2FA.bind(adminAuthController),
    });

    protectedRoutes.post('/2fa/disable', {
      schema: {
        tags: ['Admin Auth'],
        summary: 'Disable 2FA',
        security: [{ bearerAuth: [] }],
      },
      handler: adminAuthController.disable2FA.bind(adminAuthController),
    });

    protectedRoutes.get('/me', {
      schema: {
        tags: ['Admin Auth'],
        summary: 'Get current admin',
        security: [{ bearerAuth: [] }],
      },
      handler: adminAuthController.getMe.bind(adminAuthController),
    });
  });
}
```

### 6. Next.js Dashboard Page

**apps/admin/app/(dashboard)/page.tsx:**
```tsx
'use client';

import { useEffect, useState } from 'react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { OrdersChart } from '@/components/dashboard/OrdersChart';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { LiveStats } from '@/components/dashboard/LiveStats';
import { useSocket } from '@/lib/socket';
import { api } from '@/lib/api';

interface Metrics {
  ordersToday: number;
  activeDeliveries: number;
  revenueToday: number;
  driversOnline: number;
  ordersChange: number;
  revenueChange: number;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [chartData, setChartData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const socket = useSocket();

  useEffect(() => {
    loadData();

    // Subscribe to real-time updates
    if (socket) {
      socket.on('metrics:update', (data) => {
        setMetrics((prev) => ({ ...prev, ...data }));
      });

      socket.on('alert:new', (alert) => {
        setAlerts((prev) => [alert, ...prev].slice(0, 10));
      });
    }

    return () => {
      if (socket) {
        socket.off('metrics:update');
        socket.off('alert:new');
      }
    };
  }, [socket]);

  const loadData = async () => {
    try {
      const [metricsRes, chartsRes, alertsRes] = await Promise.all([
        api.get('/admin/dashboard/metrics'),
        api.get('/admin/dashboard/charts?days=7'),
        api.get('/admin/dashboard/alerts'),
      ]);

      setMetrics(metricsRes.data);
      setChartData(chartsRes.data);
      setAlerts(alertsRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Pedidos Hoje"
          value={metrics?.ordersToday || 0}
          change={metrics?.ordersChange || 0}
          icon="orders"
        />
        <MetricCard
          title="Entregas Ativas"
          value={metrics?.activeDeliveries || 0}
          icon="delivery"
          live
        />
        <MetricCard
          title="Receita Hoje"
          value={`R$ ${(metrics?.revenueToday || 0).toFixed(2)}`}
          change={metrics?.revenueChange || 0}
          icon="revenue"
        />
        <MetricCard
          title="Drivers Online"
          value={metrics?.driversOnline || 0}
          icon="drivers"
          live
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OrdersChart data={chartData} />
        <RevenueChart data={chartData} />
      </div>

      {/* Alerts and Live Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AlertsPanel alerts={alerts} />
        </div>
        <LiveStats />
      </div>
    </div>
  );
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/auth/login` | Admin login |
| POST | `/admin/auth/2fa/setup` | Setup 2FA |
| POST | `/admin/auth/2fa/verify` | Verify and enable 2FA |
| POST | `/admin/auth/2fa/disable` | Disable 2FA |
| GET | `/admin/auth/me` | Get current admin |
| GET | `/admin/dashboard/metrics` | Get dashboard metrics |
| GET | `/admin/dashboard/charts` | Get chart data |
| GET | `/admin/dashboard/alerts` | Get system alerts |
| GET | `/admin/dashboard/live` | Get live stats |

---

## Dashboard Metrics

| Metric | Query |
|--------|-------|
| Pedidos Hoje | `COUNT WHERE created_at >= today` |
| Entregas Ativas | `COUNT WHERE status IN (COLLECTING, DELIVERING)` |
| Receita Hoje | `SUM(platform_fee) WHERE delivered_at >= today` |
| Drivers Online | `Redis KEYS drivers:online:*` |

---

## WebSocket Events

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `metrics:update` | `{ metric, value }` | Real-time metric update |
| `alert:new` | `Alert` | New system alert |
| `order:status` | `{ orderId, status }` | Order status change |

---

## Definition of Done

- [ ] Admin login with role validation
- [ ] 2FA setup and verification
- [ ] Dashboard metrics loading
- [ ] Charts with 7/30 day data
- [ ] Alerts panel working
- [ ] WebSocket real-time updates
- [ ] Responsive design
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Epic 1 complete
- Next.js 14 setup
- speakeasy for TOTP
- recharts or tremor for charts
- Socket.IO client

---

## Environment Variables

```bash
# Admin Panel
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000
```
