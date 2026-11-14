import { prisma, OrderStatus, UserStatus } from '@rotax1/database';
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors/app-error.js';
import type {
  UpdateDriverProfileInput,
  UpdateLocationInput,
  AvailableOrdersQuery,
  UpdateOrderStatusInput,
  ConfirmPickupInput,
  ConfirmDeliveryInput,
  EarningsQuery,
} from './drivers.schema.js';

export class DriversService {
  // ==================== Profile ====================

  async getProfile(userId: string) {
    const driver = await prisma.driver.findFirst({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            phone: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundError('Motorista');
    }

    return {
      id: driver.id,
      name: driver.name,
      document: driver.document,
      cnhNumber: driver.cnhNumber,
      cnhPhotoUrl: driver.cnhPhotoUrl,
      profilePhotoUrl: driver.profilePhotoUrl,
      vehicleType: driver.vehicleType,
      vehiclePlate: driver.vehiclePlate,
      vehicleDocUrl: driver.vehicleDocUrl,
      isOnline: driver.isOnline,
      ratingAvg: Number(driver.ratingAvg),
      ratingCount: driver.ratingCount,
      user: driver.user,
    };
  }

  async updateProfile(userId: string, data: UpdateDriverProfileInput) {
    const driver = await prisma.driver.findFirst({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundError('Motorista');
    }

    return prisma.driver.update({
      where: { id: driver.id },
      data: {
        name: data.name,
        document: data.document,
        cnhNumber: data.cnhNumber,
        vehicleType: data.vehicleType,
        vehiclePlate: data.vehiclePlate,
        ...(data.phone && {
          user: {
            update: { phone: data.phone },
          },
        }),
      },
    });
  }

  async updateDocument(userId: string, type: string, url: string) {
    const driver = await prisma.driver.findFirst({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundError('Motorista');
    }

    const updateData: any = {};
    switch (type) {
      case 'CNH':
        updateData.cnhPhotoUrl = url;
        break;
      case 'VEHICLE_DOC':
        updateData.vehicleDocUrl = url;
        break;
      case 'PROFILE_PHOTO':
        updateData.profilePhotoUrl = url;
        break;
    }

    return prisma.driver.update({
      where: { id: driver.id },
      data: updateData,
    });
  }

  async getDriverIdByUserId(userId: string): Promise<string> {
    const driver = await prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (!driver) {
      throw new NotFoundError('Motorista');
    }

    return driver.id;
  }

  // ==================== Availability ====================

  async setOnlineStatus(userId: string, isOnline: boolean) {
    const driver = await prisma.driver.findFirst({
      where: { userId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundError('Motorista');
    }

    // Only approved drivers can go online
    if (isOnline && driver.user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenError('Seu cadastro ainda não foi aprovado');
    }

    return prisma.driver.update({
      where: { id: driver.id },
      data: { isOnline },
    });
  }

  async updateLocation(userId: string, location: UpdateLocationInput) {
    const driver = await prisma.driver.findFirst({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundError('Motorista');
    }

    return prisma.driver.update({
      where: { id: driver.id },
      data: {
        currentLat: location.lat,
        currentLng: location.lng,
      },
    });
  }

  // ==================== Orders ====================

  async getAvailableOrders(driverId: string, query: AvailableOrdersQuery) {
    // Get driver info
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundError('Motorista');
    }

    if (!driver.isOnline) {
      throw new ForbiddenError('Você precisa estar online para ver pedidos');
    }

    // Find orders searching for driver
    const orders = await prisma.order.findMany({
      where: {
        status: OrderStatus.SEARCHING_DRIVER,
        driverId: null,
      },
      include: {
        pharmacy: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Filter by distance and transform
    const availableOrders = orders
      .map((order) => {
        const distance = this.calculateDistance(
          query.lat,
          query.lng,
          Number(order.pickupLat),
          Number(order.pickupLng)
        );
        return { ...order, distanceToPickup: distance };
      })
      .filter((order) => order.distanceToPickup <= query.radius)
      .sort((a, b) => a.distanceToPickup - b.distanceToPickup)
      .slice(0, 10); // Limit to 10 orders

    return availableOrders.map((order) => ({
      id: order.id,
      category: order.category,
      urgency: order.urgency,
      pharmacy: order.pharmacy,
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
      distanceToPickup: order.distanceToPickup,
      driverEarning: Number(order.driverEarning),
      estimatedMinutes: order.estimatedMinutes,
      createdAt: order.createdAt.toISOString(),
    }));
  }

  async acceptOrder(driverId: string, orderId: string) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundError('Motorista');
    }

    if (!driver.isOnline) {
      throw new ForbiddenError('Você precisa estar online para aceitar pedidos');
    }

    // Check if driver already has an active order
    const activeOrder = await prisma.order.findFirst({
      where: {
        driverId,
        status: {
          in: [
            OrderStatus.DRIVER_ASSIGNED,
            OrderStatus.COLLECTING,
            OrderStatus.PICKED_UP,
            OrderStatus.DELIVERING,
          ],
        },
      },
    });

    if (activeOrder) {
      throw new ValidationError('Você já tem um pedido em andamento');
    }

    // Try to accept the order (with optimistic locking)
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        status: OrderStatus.SEARCHING_DRIVER,
        driverId: null,
      },
    });

    if (!order) {
      throw new ValidationError('Pedido não disponível ou já aceito por outro motorista');
    }

    // Accept the order
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        driverId,
        status: OrderStatus.DRIVER_ASSIGNED,
        acceptedAt: new Date(),
        statusHistory: {
          create: {
            status: OrderStatus.DRIVER_ASSIGNED,
            notes: `Aceito pelo motorista ${driver.name}`,
            lat: driver.currentLat,
            lng: driver.currentLng,
          },
        },
      },
      include: {
        pharmacy: true,
        client: {
          select: {
            name: true,
            user: { select: { phone: true } },
          },
        },
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      pharmacy: {
        name: updated.pharmacy?.name,
        address: updated.pickupAddress,
        lat: Number(updated.pickupLat),
        lng: Number(updated.pickupLng),
      },
      client: {
        name: updated.client.name,
        phone: updated.client.user.phone,
      },
      delivery: {
        address: updated.deliveryAddress,
        lat: Number(updated.deliveryLat),
        lng: Number(updated.deliveryLng),
      },
      driverEarning: Number(updated.driverEarning),
      estimatedMinutes: updated.estimatedMinutes,
    };
  }

  async getCurrentOrder(driverId: string) {
    const order = await prisma.order.findFirst({
      where: {
        driverId,
        status: {
          in: [
            OrderStatus.DRIVER_ASSIGNED,
            OrderStatus.COLLECTING,
            OrderStatus.PICKED_UP,
            OrderStatus.DELIVERING,
          ],
        },
      },
      include: {
        pharmacy: true,
        client: {
          select: {
            name: true,
            user: { select: { phone: true } },
          },
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
      description: order.description,
      pharmacy: {
        name: order.pharmacy?.name,
        address: order.pickupAddress,
        lat: Number(order.pickupLat),
        lng: Number(order.pickupLng),
      },
      client: {
        name: order.client.name,
        phone: order.client.user.phone,
      },
      delivery: {
        address: order.deliveryAddress,
        lat: Number(order.deliveryLat),
        lng: Number(order.deliveryLng),
      },
      driverEarning: Number(order.driverEarning),
      estimatedMinutes: order.estimatedMinutes,
      acceptedAt: order.acceptedAt?.toISOString(),
      pickedUpAt: order.pickedUpAt?.toISOString(),
    };
  }

  async updateOrderStatus(driverId: string, orderId: string, data: UpdateOrderStatusInput) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, driverId },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      DRIVER_ASSIGNED: ['COLLECTING'],
      COLLECTING: ['PICKED_UP'],
      PICKED_UP: ['DELIVERING'],
      DELIVERING: ['DELIVERED'],
    };

    if (!validTransitions[order.status]?.includes(data.status)) {
      throw new ValidationError(`Transição de status inválida: ${order.status} -> ${data.status}`);
    }

    const updateData: any = {
      status: data.status,
      statusHistory: {
        create: {
          status: data.status,
          notes: data.notes,
          lat: data.lat,
          lng: data.lng,
        },
      },
    };

    if (data.status === 'PICKED_UP') {
      updateData.pickedUpAt = new Date();
    } else if (data.status === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    }

    return prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });
  }

  async confirmPickup(driverId: string, orderId: string, data: ConfirmPickupInput) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, driverId },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    if (order.status !== OrderStatus.COLLECTING) {
      throw new ValidationError('O pedido precisa estar em coleta para confirmar');
    }

    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.PICKED_UP,
        pickedUpAt: new Date(),
        pickupPhotoUrl: data.photoUrl,
        statusHistory: {
          create: {
            status: OrderStatus.PICKED_UP,
            notes: data.notes || 'Coleta confirmada pelo motorista',
          },
        },
      },
    });
  }

  async confirmDelivery(driverId: string, orderId: string, data: ConfirmDeliveryInput) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, driverId },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    if (order.status !== OrderStatus.PICKED_UP && order.status !== OrderStatus.DELIVERING) {
      throw new ValidationError('O pedido precisa estar em entrega para confirmar');
    }

    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date(),
        deliveryPhotoUrl: data.photoUrl,
        receiverName: data.receiverName,
        statusHistory: {
          create: {
            status: OrderStatus.DELIVERED,
            notes: data.notes || 'Entrega confirmada pelo motorista',
          },
        },
      },
    });
  }

  async getOrderHistory(driverId: string, page = 1, limit = 20) {
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          driverId,
          status: { in: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] },
        },
        include: {
          pharmacy: { select: { id: true, name: true } },
          rating: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({
        where: {
          driverId,
          status: { in: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] },
        },
      }),
    ]);

    return {
      orders: orders.map((order) => ({
        id: order.id,
        status: order.status,
        pharmacy: order.pharmacy,
        driverEarning: Number(order.driverEarning),
        distanceKm: Number(order.distanceKm),
        createdAt: order.createdAt.toISOString(),
        deliveredAt: order.deliveredAt?.toISOString(),
        rating: order.rating
          ? { stars: order.rating.stars, comment: order.rating.comment }
          : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==================== Earnings ====================

  async getEarnings(driverId: string, query: EarningsQuery) {
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
        default:
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
      }
    }

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
        id: true,
        driverEarning: true,
        distanceKm: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: 'desc' },
    });

    const totalEarnings = orders.reduce(
      (sum, order) => sum + Number(order.driverEarning),
      0
    );
    const totalDistance = orders.reduce(
      (sum, order) => sum + Number(order.distanceKm),
      0
    );
    const totalOrders = orders.length;
    const averagePerOrder = totalOrders > 0 ? totalEarnings / totalOrders : 0;

    // Group by day
    const earningsByDay: Record<string, { date: string; earnings: number; orders: number }> = {};
    for (const order of orders) {
      if (order.deliveredAt) {
        const dateKey = order.deliveredAt.toISOString().split('T')[0];
        if (!earningsByDay[dateKey]) {
          earningsByDay[dateKey] = { date: dateKey, earnings: 0, orders: 0 };
        }
        earningsByDay[dateKey].earnings += Number(order.driverEarning);
        earningsByDay[dateKey].orders += 1;
      }
    }

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      summary: {
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        totalOrders,
        totalDistanceKm: Math.round(totalDistance * 100) / 100,
        averagePerOrder: Math.round(averagePerOrder * 100) / 100,
      },
      dailyBreakdown: Object.values(earningsByDay).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
      recentOrders: orders.slice(0, 10).map((order) => ({
        id: order.id,
        earning: Number(order.driverEarning),
        distanceKm: Number(order.distanceKm),
        deliveredAt: order.deliveredAt?.toISOString(),
      })),
    };
  }

  // ==================== Helpers ====================

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }
}

export const driversService = new DriversService();
