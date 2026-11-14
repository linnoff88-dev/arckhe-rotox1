import { prisma, OrderStatus, UserStatus, UserRole, PaymentStatus } from '@rotax1/database';
import { NotFoundError, ValidationError } from '../../common/errors/app-error.js';
import type {
  DashboardPeriod,
  ListUsersQuery,
  UpdateUserStatusInput,
  PendingDriversQuery,
  ApproveDriverInput,
  ListOrdersQuery,
  CancelOrderInput,
  ReassignOrderInput,
  FinancialReportQuery,
  PayoutQuery,
  ProcessPayoutInput,
} from './admin.schema.js';

export class AdminService {
  // ==================== Dashboard ====================

  async getDashboardMetrics(query: DashboardPeriod) {
    let startDate: Date;
    let endDate = new Date();

    if (query.startDate && query.endDate) {
      startDate = query.startDate;
      endDate = query.endDate;
    } else {
      switch (query.period) {
        case 'day':
          startDate = new Date();
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate = new Date();
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'year':
          startDate = new Date();
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
      }
    }

    // Get metrics in parallel
    const [
      totalUsers,
      activeDrivers,
      pendingDrivers,
      ordersMetrics,
      revenueMetrics,
    ] = await Promise.all([
      // Total users by role
      prisma.user.groupBy({
        by: ['role'],
        _count: true,
      }),
      // Active drivers (online)
      prisma.driver.count({
        where: { isOnline: true },
      }),
      // Pending driver approvals
      prisma.driver.count({
        where: {
          user: { status: UserStatus.PENDING },
        },
      }),
      // Orders metrics
      prisma.order.groupBy({
        by: ['status'],
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
        _sum: { price: true },
      }),
      // Revenue metrics
      prisma.order.aggregate({
        where: {
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: startDate, lte: endDate },
        },
        _sum: {
          price: true,
          platformFee: true,
          driverEarning: true,
        },
        _count: true,
      }),
    ]);

    // Transform user counts
    const userCounts: Record<string, number> = {};
    for (const item of totalUsers) {
      userCounts[item.role] = item._count;
    }

    // Transform order counts
    const orderCounts: Record<string, { count: number; revenue: number }> = {};
    for (const item of ordersMetrics) {
      orderCounts[item.status] = {
        count: item._count,
        revenue: Number(item._sum.price) || 0,
      };
    }

    const totalOrders = Object.values(orderCounts).reduce((sum, v) => sum + v.count, 0);
    const deliveredOrders = orderCounts[OrderStatus.DELIVERED]?.count || 0;
    const cancelledOrders = orderCounts[OrderStatus.CANCELLED]?.count || 0;

    return {
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
      users: {
        total: Object.values(userCounts).reduce((sum, v) => sum + v, 0),
        clients: userCounts[UserRole.CLIENT] || 0,
        drivers: userCounts[UserRole.DRIVER] || 0,
        admins: userCounts[UserRole.ADMIN] || 0,
        activeDrivers,
        pendingApprovals: pendingDrivers,
      },
      orders: {
        total: totalOrders,
        delivered: deliveredOrders,
        cancelled: cancelledOrders,
        inProgress:
          totalOrders - deliveredOrders - cancelledOrders - (orderCounts[OrderStatus.PENDING_PAYMENT]?.count || 0),
        conversionRate: totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0,
      },
      revenue: {
        total: Number(revenueMetrics._sum.price) || 0,
        platformFees: Number(revenueMetrics._sum.platformFee) || 0,
        driverPayouts: Number(revenueMetrics._sum.driverEarning) || 0,
        averageOrderValue:
          revenueMetrics._count > 0
            ? (Number(revenueMetrics._sum.price) || 0) / revenueMetrics._count
            : 0,
      },
    };
  }

  // ==================== User Management ====================

  async listUsers(query: ListUsersQuery) {
    const where: any = {};

    if (query.role) {
      where.role = query.role;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
        { driver: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          driver: { select: { id: true, name: true, vehicleType: true, ratingAvg: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        name: user.client?.name || user.driver?.name || null,
        driverInfo: user.driver
          ? {
              vehicleType: user.driver.vehicleType,
              rating: Number(user.driver.ratingAvg),
            }
          : null,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getUserDetails(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        client: {
          include: {
            addresses: true,
            _count: { select: { orders: true } },
          },
        },
        driver: {
          include: {
            _count: { select: { orders: true, ratings: true } },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('Usuário');
    }

    return user;
  }

  async updateUserStatus(adminId: string, userId: string, data: UpdateUserStatusInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('Usuário');
    }

    // Update user status
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { status: data.status as UserStatus },
    });

    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId,
        action: 'UPDATE_USER_STATUS',
        targetId: userId,
        details: {
          previousStatus: user.status,
          newStatus: data.status,
          reason: data.reason,
        },
      },
    });

    return updated;
  }

  async getPendingDrivers(query: PendingDriversQuery) {
    const [drivers, total] = await Promise.all([
      prisma.driver.findMany({
        where: {
          user: { status: UserStatus.PENDING },
        },
        include: {
          user: {
            select: { email: true, phone: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.driver.count({
        where: {
          user: { status: UserStatus.PENDING },
        },
      }),
    ]);

    return {
      drivers: drivers.map((driver) => ({
        id: driver.id,
        userId: driver.userId,
        name: driver.name,
        document: driver.document,
        cnhNumber: driver.cnhNumber,
        cnhPhotoUrl: driver.cnhPhotoUrl,
        vehicleType: driver.vehicleType,
        vehiclePlate: driver.vehiclePlate,
        vehicleDocUrl: driver.vehicleDocUrl,
        email: driver.user.email,
        phone: driver.user.phone,
        createdAt: driver.createdAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async approveDriver(adminId: string, driverId: string, data: ApproveDriverInput) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundError('Motorista');
    }

    if (driver.user.status !== UserStatus.PENDING) {
      throw new ValidationError('Motorista já foi processado');
    }

    const newStatus = data.approved ? UserStatus.ACTIVE : UserStatus.BLOCKED;

    await prisma.user.update({
      where: { id: driver.userId },
      data: { status: newStatus },
    });

    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId,
        action: data.approved ? 'APPROVE_DRIVER' : 'REJECT_DRIVER',
        targetId: driverId,
        details: {
          approved: data.approved,
          rejectionReason: data.rejectionReason,
        },
      },
    });

    return { success: true, approved: data.approved };
  }

  // ==================== Order Management ====================

  async listOrders(query: ListOrdersQuery) {
    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = query.startDate;
      if (query.endDate) where.createdAt.lte = query.endDate;
    }

    if (query.search) {
      where.OR = [
        { id: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
        { driver: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          driver: { select: { id: true, name: true } },
          pharmacy: { select: { id: true, name: true } },
          payment: { select: { status: true, method: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map((order) => ({
        id: order.id,
        status: order.status,
        category: order.category,
        urgency: order.urgency,
        client: order.client,
        driver: order.driver,
        pharmacy: order.pharmacy,
        price: Number(order.price),
        distanceKm: Number(order.distanceKm),
        payment: order.payment,
        createdAt: order.createdAt.toISOString(),
        deliveredAt: order.deliveredAt?.toISOString(),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getOrderDetails(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            user: { select: { phone: true, email: true } },
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            vehicleType: true,
            vehiclePlate: true,
            user: { select: { phone: true } },
          },
        },
        pharmacy: true,
        payment: true,
        rating: true,
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    return order;
  }

  async cancelOrder(adminId: string, orderId: string, data: CancelOrderInput) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
      throw new ValidationError('Não é possível cancelar este pedido');
    }

    // Update order
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancelReason: data.reason,
        cancelledAt: new Date(),
        statusHistory: {
          create: {
            status: OrderStatus.CANCELLED,
            notes: `Cancelado pelo admin: ${data.reason}`,
          },
        },
      },
    });

    // Process refund if requested
    if (data.refund && order.payment?.status === PaymentStatus.PAID) {
      await prisma.payment.update({
        where: { id: order.payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });
      // TODO: Call payment gateway to process refund
    }

    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId,
        action: 'CANCEL_ORDER',
        targetId: orderId,
        details: {
          reason: data.reason,
          refund: data.refund,
        },
      },
    });

    return { success: true };
  }

  async reassignOrder(adminId: string, orderId: string, data: ReassignOrderInput) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    const validStatuses: OrderStatus[] = [
      OrderStatus.SEARCHING_DRIVER,
      OrderStatus.DRIVER_ASSIGNED,
      OrderStatus.COLLECTING,
    ];

    if (!validStatuses.includes(order.status as OrderStatus)) {
      throw new ValidationError('Não é possível reatribuir este pedido');
    }

    // Check if new driver exists and is available
    const newDriver = await prisma.driver.findFirst({
      where: {
        id: data.driverId,
        isOnline: true,
        user: { status: UserStatus.ACTIVE },
      },
    });

    if (!newDriver) {
      throw new NotFoundError('Motorista não encontrado ou não disponível');
    }

    const previousDriverId = order.driverId;

    // Reassign order
    await prisma.order.update({
      where: { id: orderId },
      data: {
        driverId: data.driverId,
        status: OrderStatus.DRIVER_ASSIGNED,
        acceptedAt: new Date(),
        statusHistory: {
          create: {
            status: OrderStatus.DRIVER_ASSIGNED,
            notes: `Reatribuído pelo admin. ${data.reason || ''}`,
          },
        },
      },
    });

    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId,
        action: 'REASSIGN_ORDER',
        targetId: orderId,
        details: {
          previousDriverId,
          newDriverId: data.driverId,
          reason: data.reason,
        },
      },
    });

    return { success: true };
  }

  // ==================== Financial ====================

  async getFinancialReport(query: FinancialReportQuery) {
    let startDate: Date;
    let endDate = new Date();

    if (query.startDate && query.endDate) {
      startDate = query.startDate;
      endDate = query.endDate;
    } else {
      switch (query.period) {
        case 'day':
          startDate = new Date();
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate = new Date();
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'year':
          startDate = new Date();
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate = new Date();
          startDate.setMonth(startDate.getMonth() - 1);
      }
    }

    // Get delivered orders in period
    const orders = await prisma.order.findMany({
      where: {
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: startDate, lte: endDate },
      },
      select: {
        price: true,
        platformFee: true,
        driverEarning: true,
        category: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: 'asc' },
    });

    // Calculate totals
    const totals = orders.reduce(
      (acc, order) => ({
        revenue: acc.revenue + Number(order.price),
        platformFees: acc.platformFees + Number(order.platformFee),
        driverPayouts: acc.driverPayouts + Number(order.driverEarning),
        orderCount: acc.orderCount + 1,
      }),
      { revenue: 0, platformFees: 0, driverPayouts: 0, orderCount: 0 }
    );

    // Group by period
    const groupedData: Record<string, { revenue: number; orders: number; fees: number }> = {};

    for (const order of orders) {
      if (!order.deliveredAt) continue;

      let key: string;
      switch (query.groupBy) {
        case 'day':
          key = order.deliveredAt.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(order.deliveredAt);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${order.deliveredAt.getFullYear()}-${String(order.deliveredAt.getMonth() + 1).padStart(2, '0')}`;
          break;
        default:
          key = order.deliveredAt.toISOString().split('T')[0];
      }

      if (!groupedData[key]) {
        groupedData[key] = { revenue: 0, orders: 0, fees: 0 };
      }
      groupedData[key].revenue += Number(order.price);
      groupedData[key].orders += 1;
      groupedData[key].fees += Number(order.platformFee);
    }

    // Revenue by category
    const byCategory: Record<string, { revenue: number; count: number }> = {};
    for (const order of orders) {
      if (!byCategory[order.category]) {
        byCategory[order.category] = { revenue: 0, count: 0 };
      }
      byCategory[order.category].revenue += Number(order.price);
      byCategory[order.category].count += 1;
    }

    return {
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
      summary: {
        totalRevenue: Math.round(totals.revenue * 100) / 100,
        platformFees: Math.round(totals.platformFees * 100) / 100,
        driverPayouts: Math.round(totals.driverPayouts * 100) / 100,
        netRevenue: Math.round(totals.platformFees * 100) / 100,
        orderCount: totals.orderCount,
        averageOrderValue:
          totals.orderCount > 0 ? Math.round((totals.revenue / totals.orderCount) * 100) / 100 : 0,
      },
      timeline: Object.entries(groupedData)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byCategory: Object.entries(byCategory).map(([category, data]) => ({
        category,
        ...data,
      })),
    };
  }

  async getPayoutsList(query: PayoutQuery) {
    // Get pending payouts (drivers with unpaid delivered orders)
    const drivers = await prisma.driver.findMany({
      where: {
        orders: {
          some: {
            status: OrderStatus.DELIVERED,
          },
        },
      },
      include: {
        user: { select: { email: true } },
        orders: {
          where: { status: OrderStatus.DELIVERED },
          select: { driverEarning: true, deliveredAt: true },
        },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    const payouts = drivers.map((driver) => {
      const totalEarnings = driver.orders.reduce(
        (sum, order) => sum + Number(order.driverEarning),
        0
      );
      const lastDelivery = driver.orders.reduce(
        (latest, order) =>
          order.deliveredAt && (!latest || order.deliveredAt > latest) ? order.deliveredAt : latest,
        null as Date | null
      );

      return {
        driverId: driver.id,
        driverName: driver.name,
        email: driver.user.email,
        orderCount: driver.orders.length,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        lastDelivery: lastDelivery?.toISOString() || null,
      };
    });

    return {
      payouts,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: drivers.length,
        totalPages: Math.ceil(drivers.length / query.limit),
      },
    };
  }

  async processPayouts(adminId: string, data: ProcessPayoutInput) {
    // This would integrate with a payment gateway in production
    const results: { driverId: string; amount: number; status: string }[] = [];

    for (const driverId of data.driverIds) {
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        include: {
          orders: {
            where: {
              status: OrderStatus.DELIVERED,
              deliveredAt: { lte: data.periodEnd },
            },
            select: { id: true, driverEarning: true },
          },
        },
      });

      if (!driver) continue;

      const totalPayout = driver.orders.reduce(
        (sum, order) => sum + Number(order.driverEarning),
        0
      );

      // Log admin action
      await prisma.adminAction.create({
        data: {
          adminId,
          action: 'PROCESS_PAYOUT',
          targetId: driverId,
          details: {
            amount: totalPayout,
            orderCount: driver.orders.length,
            periodEnd: data.periodEnd.toISOString(),
          },
        },
      });

      results.push({
        driverId,
        amount: Math.round(totalPayout * 100) / 100,
        status: 'PROCESSED', // In production, this would be the actual payment status
      });
    }

    return { results };
  }
}

export const adminService = new AdminService();
