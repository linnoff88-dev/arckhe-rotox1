import { prisma, OrderStatus, OrderCategory, OrderUrgency, PaymentMethod, PaymentStatus } from '@rotax1/database';
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors/app-error.js';
import { calculateDistance } from '../../common/services/geocoding.service.js';
import { calculateOrderPrice, type PriceCalculation } from '../../common/services/pricing.service.js';
import type {
  CreateOrderInput,
  CalculatePriceInput,
  OrderHistoryQuery,
  CancelOrderInput,
  RateOrderInput,
} from './orders.schema.js';

export class OrdersService {
  // ==================== Price Calculation ====================

  async calculatePrice(clientId: string, input: CalculatePriceInput): Promise<PriceCalculation> {
    // Get pharmacy location
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: input.pharmacyId },
      select: { lat: true, lng: true, isActive: true },
    });

    if (!pharmacy || !pharmacy.isActive) {
      throw new NotFoundError('Farmácia');
    }

    // Get delivery location
    let deliveryLat: number;
    let deliveryLng: number;

    if (input.deliveryAddressId) {
      const address = await prisma.address.findFirst({
        where: { id: input.deliveryAddressId, clientId },
      });
      if (!address) {
        throw new NotFoundError('Endereço de entrega');
      }
      deliveryLat = Number(address.lat);
      deliveryLng = Number(address.lng);
    } else if (input.deliveryLat !== undefined && input.deliveryLng !== undefined) {
      deliveryLat = input.deliveryLat;
      deliveryLng = input.deliveryLng;
    } else {
      throw new ValidationError('Endereço de entrega é obrigatório');
    }

    // Calculate distance
    const distanceResult = await calculateDistance(
      { lat: Number(pharmacy.lat), lng: Number(pharmacy.lng) },
      { lat: deliveryLat, lng: deliveryLng }
    );

    if (!distanceResult) {
      throw new ValidationError('Não foi possível calcular a distância');
    }

    // Calculate price
    return calculateOrderPrice(
      distanceResult.distanceKm,
      distanceResult.durationMinutes,
      input.category,
      input.urgency
    );
  }

  // ==================== Create Order ====================

  async create(clientId: string, input: CreateOrderInput) {
    // Get pharmacy
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: input.pharmacyId },
    });

    if (!pharmacy || !pharmacy.isActive) {
      throw new NotFoundError('Farmácia');
    }

    // Check express availability
    if (input.urgency === 'EXPRESS' && !pharmacy.acceptsExpress) {
      throw new ValidationError('Esta farmácia não aceita entregas express');
    }

    // Get delivery address
    let deliveryAddress: any;
    let deliveryLat: number;
    let deliveryLng: number;

    if (input.deliveryAddressId) {
      const address = await prisma.address.findFirst({
        where: { id: input.deliveryAddressId, clientId },
      });
      if (!address) {
        throw new NotFoundError('Endereço de entrega');
      }
      deliveryAddress = {
        street: address.street,
        number: address.number,
        complement: address.complement,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
      };
      deliveryLat = Number(address.lat);
      deliveryLng = Number(address.lng);
    } else if (input.deliveryAddress) {
      deliveryAddress = input.deliveryAddress;
      deliveryLat = input.deliveryAddress.lat;
      deliveryLng = input.deliveryAddress.lng;
    } else {
      throw new ValidationError('Endereço de entrega é obrigatório');
    }

    // Calculate price
    const pricing = await this.calculatePrice(clientId, {
      pharmacyId: input.pharmacyId,
      deliveryLat,
      deliveryLng,
      category: input.category,
      urgency: input.urgency,
    });

    // Create pickup address from pharmacy
    const pickupAddress = {
      street: pharmacy.street,
      number: pharmacy.number,
      complement: pharmacy.complement,
      neighborhood: pharmacy.neighborhood,
      city: pharmacy.city,
      state: pharmacy.state,
      zipCode: pharmacy.zipCode,
      pharmacyName: pharmacy.name,
    };

    // Create order with payment
    const order = await prisma.order.create({
      data: {
        clientId,
        pharmacyId: input.pharmacyId,
        status: OrderStatus.PENDING_PAYMENT,
        category: input.category as OrderCategory,
        urgency: input.urgency as OrderUrgency,
        description: input.description,
        pickupAddress,
        pickupLat: pharmacy.lat,
        pickupLng: pharmacy.lng,
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        distanceKm: pricing.distanceKm,
        estimatedMinutes: pricing.estimatedMinutes,
        price: pricing.total,
        platformFee: pricing.platformFee,
        driverEarning: pricing.driverEarning,
        payment: {
          create: {
            method: input.paymentMethod as PaymentMethod,
            status: PaymentStatus.PENDING,
            amount: pricing.total,
            // PIX QR code would be generated here via payment gateway
            pixQrCode: input.paymentMethod === 'PIX' ? `pix://rotax1/${Date.now()}` : null,
          },
        },
        statusHistory: {
          create: {
            status: OrderStatus.PENDING_PAYMENT,
            notes: 'Pedido criado, aguardando pagamento',
          },
        },
      },
      include: {
        pharmacy: {
          select: { id: true, name: true, phone: true },
        },
        payment: true,
      },
    });

    return this.formatOrderResponse(order);
  }

  // ==================== Get Order ====================

  async getById(clientId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, clientId },
      include: {
        pharmacy: true,
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
            user: { select: { phone: true } },
          },
        },
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

    return this.formatOrderResponse(order);
  }

  // ==================== Track Order ====================

  async track(clientId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, clientId },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            profilePhotoUrl: true,
            vehicleType: true,
            currentLat: true,
            currentLng: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    return {
      orderId: order.id,
      status: order.status,
      driver: order.driver
        ? {
            id: order.driver.id,
            name: order.driver.name,
            photoUrl: order.driver.profilePhotoUrl,
            vehicleType: order.driver.vehicleType,
            currentLocation: order.driver.currentLat
              ? {
                  lat: Number(order.driver.currentLat),
                  lng: Number(order.driver.currentLng),
                }
              : null,
          }
        : null,
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
      estimatedMinutes: order.estimatedMinutes,
      statusHistory: order.statusHistory.map((h) => ({
        status: h.status,
        notes: h.notes,
        timestamp: h.createdAt.toISOString(),
        location: h.lat ? { lat: Number(h.lat), lng: Number(h.lng) } : null,
      })),
    };
  }

  // ==================== Order History ====================

  async getHistory(clientId: string, query: OrderHistoryQuery) {
    const { page, limit, status, startDate, endDate } = query;

    const where: any = { clientId };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          pharmacy: {
            select: { id: true, name: true },
          },
          driver: {
            select: { id: true, name: true },
          },
          rating: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map((order) => ({
        id: order.id,
        status: order.status,
        category: order.category,
        urgency: order.urgency,
        pharmacy: order.pharmacy,
        driver: order.driver,
        price: Number(order.price),
        distanceKm: Number(order.distanceKm),
        createdAt: order.createdAt.toISOString(),
        deliveredAt: order.deliveredAt?.toISOString() || null,
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

  // ==================== Cancel Order ====================

  async cancel(clientId: string, orderId: string, input: CancelOrderInput) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, clientId },
      include: { payment: true },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    // Only allow cancellation in certain states
    const cancellableStates: OrderStatus[] = [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.SEARCHING_DRIVER,
      OrderStatus.DRIVER_ASSIGNED,
    ];

    if (!cancellableStates.includes(order.status as OrderStatus)) {
      throw new ValidationError(
        'Não é possível cancelar este pedido. O pedido já está em andamento.'
      );
    }

    // Update order
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancelReason: input.reason,
        cancelledAt: new Date(),
        statusHistory: {
          create: {
            status: OrderStatus.CANCELLED,
            notes: `Cancelado pelo cliente: ${input.reason}`,
          },
        },
      },
    });

    // If payment was made, trigger refund (would integrate with payment gateway)
    if (order.payment?.status === PaymentStatus.PAID) {
      await prisma.payment.update({
        where: { id: order.payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });
      // TODO: Call payment gateway to process refund
    }

    return { success: true, message: 'Pedido cancelado com sucesso' };
  }

  // ==================== Rate Order ====================

  async rate(clientId: string, orderId: string, input: RateOrderInput) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, clientId },
      include: { rating: true, driver: true },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new ValidationError('Só é possível avaliar pedidos entregues');
    }

    if (order.rating) {
      throw new ValidationError('Este pedido já foi avaliado');
    }

    if (!order.driverId || !order.driver) {
      throw new ValidationError('Pedido sem motorista não pode ser avaliado');
    }

    // Create rating
    const rating = await prisma.rating.create({
      data: {
        orderId,
        driverId: order.driverId,
        clientId,
        stars: input.stars,
        comment: input.comment,
      },
    });

    // Update driver rating average
    const driverRatings = await prisma.rating.aggregate({
      where: { driverId: order.driverId },
      _avg: { stars: true },
      _count: true,
    });

    await prisma.driver.update({
      where: { id: order.driverId },
      data: {
        ratingAvg: driverRatings._avg.stars || 0,
        ratingCount: driverRatings._count,
      },
    });

    return {
      rating: {
        id: rating.id,
        stars: rating.stars,
        comment: rating.comment,
      },
    };
  }

  // ==================== Helpers ====================

  private formatOrderResponse(order: any) {
    return {
      id: order.id,
      status: order.status,
      category: order.category,
      urgency: order.urgency,
      description: order.description,
      pharmacy: order.pharmacy
        ? {
            id: order.pharmacy.id,
            name: order.pharmacy.name,
            address: `${(order.pickupAddress as any).street}, ${(order.pickupAddress as any).number}`,
            phone: order.pharmacy.phone,
            lat: Number(order.pickupLat),
            lng: Number(order.pickupLng),
          }
        : null,
      deliveryAddress: {
        street: (order.deliveryAddress as any).street,
        number: (order.deliveryAddress as any).number,
        complement: (order.deliveryAddress as any).complement,
        city: (order.deliveryAddress as any).city,
        state: (order.deliveryAddress as any).state,
        lat: Number(order.deliveryLat),
        lng: Number(order.deliveryLng),
      },
      driver: order.driver
        ? {
            id: order.driver.id,
            name: order.driver.name,
            phone: order.driver.user?.phone || null,
            photoUrl: order.driver.profilePhotoUrl,
            vehicleType: order.driver.vehicleType,
            vehiclePlate: order.driver.vehiclePlate,
            rating: Number(order.driver.ratingAvg),
            currentLat: order.driver.currentLat ? Number(order.driver.currentLat) : null,
            currentLng: order.driver.currentLng ? Number(order.driver.currentLng) : null,
          }
        : null,
      price: Number(order.price),
      distanceKm: Number(order.distanceKm),
      estimatedMinutes: order.estimatedMinutes,
      createdAt: order.createdAt.toISOString(),
      acceptedAt: order.acceptedAt?.toISOString() || null,
      pickedUpAt: order.pickedUpAt?.toISOString() || null,
      deliveredAt: order.deliveredAt?.toISOString() || null,
      payment: order.payment
        ? {
            method: order.payment.method,
            status: order.payment.status,
            pixQrCode: order.payment.pixQrCode,
          }
        : null,
      rating: order.rating
        ? {
            stars: order.rating.stars,
            comment: order.rating.comment,
          }
        : null,
    };
  }
}

export const ordersService = new OrdersService();
