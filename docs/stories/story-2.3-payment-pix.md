# Story 2.3: Payment Integration (Pix)

**Epic:** 2 - Client Module
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Large (6-8 hours)

---

## User Story

**As a** client,
**I want** to pay for my orders using Pix,
**so that** I can complete my delivery request instantly.

---

## Acceptance Criteria

- [ ] 1. Integração com Mercado Pago API
- [ ] 2. Endpoint POST /orders/:id/pay para gerar pagamento Pix
- [ ] 3. QR Code Pix gerado e retornado
- [ ] 4. Webhook para confirmação de pagamento
- [ ] 5. Status do pedido atualizado após pagamento
- [ ] 6. Expiração de pagamento (30 minutos)
- [ ] 7. Endpoint GET /payments/:id para status
- [ ] 8. Reembolso automático em caso de cancelamento

---

## Technical Implementation

### 1. Payments Module Structure

```
apps/api/src/modules/payments/
├── payments.controller.ts
├── payments.service.ts
├── payments.routes.ts
├── payments.schema.ts
├── payments.errors.ts
└── mercadopago.service.ts
```

### 2. Mercado Pago Service

**apps/api/src/modules/payments/mercadopago.service.ts:**
```typescript
import { config } from '../../common/config/index.js';

interface PixPaymentRequest {
  transactionAmount: number;
  description: string;
  externalReference: string;
  payer: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

interface PixPaymentResponse {
  id: number;
  status: string;
  externalReference: string;
  pointOfInteraction: {
    transactionData: {
      qrCode: string;
      qrCodeBase64: string;
      ticketUrl: string;
    };
  };
  dateOfExpiration: string;
}

interface PaymentStatus {
  id: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
  statusDetail: string;
  dateApproved: string | null;
}

export class MercadoPagoService {
  private readonly baseUrl = 'https://api.mercadopago.com/v1';
  private readonly accessToken: string;

  constructor() {
    this.accessToken = config.mercadoPago.accessToken;
  }

  async createPixPayment(data: PixPaymentRequest): Promise<PixPaymentResponse> {
    const response = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        'X-Idempotency-Key': data.externalReference,
      },
      body: JSON.stringify({
        transaction_amount: data.transactionAmount,
        description: data.description,
        payment_method_id: 'pix',
        external_reference: data.externalReference,
        payer: {
          email: data.payer.email,
          first_name: data.payer.firstName,
          last_name: data.payer.lastName,
        },
        date_of_expiration: this.getExpirationDate(),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Mercado Pago error: ${error.message}`);
    }

    return response.json();
  }

  async getPaymentStatus(paymentId: number): Promise<PaymentStatus> {
    const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get payment status');
    }

    return response.json();
  }

  async refundPayment(paymentId: number, amount?: number): Promise<void> {
    const body = amount ? { amount } : {};

    const response = await fetch(`${this.baseUrl}/payments/${paymentId}/refunds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Refund error: ${error.message}`);
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', config.mercadoPago.webhookSecret)
      .update(payload)
      .digest('hex');
    
    return signature === expectedSignature;
  }

  private getExpirationDate(): string {
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + 30);
    return expiration.toISOString();
  }
}

export const mercadoPagoService = new MercadoPagoService();
```

### 3. Payments Service

**apps/api/src/modules/payments/payments.service.ts:**
```typescript
import { prisma, OrderStatus, PaymentStatus, PaymentMethod } from '@rotax1/database';
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors/app-error.js';
import { mercadoPagoService } from './mercadopago.service.js';

export class PaymentsService {
  async createPixPayment(orderId: string, clientId: string) {
    // Get order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: {
          include: {
            user: { select: { email: true } },
          },
        },
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Pedido');
    }

    if (order.clientId !== clientId) {
      throw new ForbiddenError('Você não tem permissão para pagar este pedido');
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new ValidationError('Este pedido já foi pago ou não está aguardando pagamento');
    }

    // Check if payment already exists
    if (order.payment) {
      if (order.payment.status === PaymentStatus.PENDING) {
        // Return existing payment
        return {
          paymentId: order.payment.id,
          qrCode: order.payment.pixQrCode,
          qrCodeBase64: order.payment.pixQrCodeBase64,
          amount: order.payment.amount,
          expiresAt: new Date(order.payment.createdAt.getTime() + 30 * 60 * 1000),
        };
      }
      throw new ValidationError('Pagamento já processado para este pedido');
    }

    // Create Mercado Pago payment
    const mpPayment = await mercadoPagoService.createPixPayment({
      transactionAmount: Number(order.price),
      description: `Rotax1 - Entrega #${order.id.substring(0, 8)}`,
      externalReference: order.id,
      payer: {
        email: order.client.user.email,
        firstName: order.client.name.split(' ')[0],
        lastName: order.client.name.split(' ').slice(1).join(' '),
      },
    });

    // Save payment in database
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        method: PaymentMethod.PIX,
        status: PaymentStatus.PENDING,
        amount: order.price,
        externalId: String(mpPayment.id),
        pixQrCode: mpPayment.pointOfInteraction.transactionData.qrCode,
        pixQrCodeBase64: mpPayment.pointOfInteraction.transactionData.qrCodeBase64,
      },
    });

    return {
      paymentId: payment.id,
      qrCode: payment.pixQrCode,
      qrCodeBase64: payment.pixQrCodeBase64,
      amount: payment.amount,
      expiresAt: new Date(mpPayment.dateOfExpiration),
    };
  }

  async getPaymentStatus(paymentId: string, clientId: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: true,
      },
    });

    if (!payment) {
      throw new NotFoundError('Pagamento');
    }

    if (payment.order.clientId !== clientId) {
      throw new ForbiddenError('Você não tem permissão para ver este pagamento');
    }

    return {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      method: payment.method,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    };
  }

  async handleWebhook(data: { action: string; data: { id: string } }) {
    if (data.action !== 'payment.updated' && data.action !== 'payment.created') {
      return;
    }

    const paymentId = data.data.id;
    const mpStatus = await mercadoPagoService.getPaymentStatus(Number(paymentId));

    // Find payment by external ID
    const payment = await prisma.payment.findFirst({
      where: { externalId: paymentId },
      include: { order: true },
    });

    if (!payment) {
      console.warn(`Payment not found for external ID: ${paymentId}`);
      return;
    }

    // Map Mercado Pago status to our status
    let newStatus: PaymentStatus;
    switch (mpStatus.status) {
      case 'approved':
        newStatus = PaymentStatus.PAID;
        break;
      case 'rejected':
      case 'cancelled':
        newStatus = PaymentStatus.FAILED;
        break;
      case 'refunded':
        newStatus = PaymentStatus.REFUNDED;
        break;
      default:
        newStatus = PaymentStatus.PENDING;
    }

    // Update payment and order in transaction
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          paidAt: newStatus === PaymentStatus.PAID ? new Date() : null,
        },
      });

      // If payment approved, update order status
      if (newStatus === PaymentStatus.PAID) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.SEARCHING_DRIVER },
        });

        // TODO: Trigger driver matching algorithm
      }
    });
  }

  async refundPayment(orderId: string) {
    const payment = await prisma.payment.findFirst({
      where: {
        orderId,
        status: PaymentStatus.PAID,
      },
    });

    if (!payment) {
      throw new NotFoundError('Pagamento pago não encontrado');
    }

    // Refund via Mercado Pago
    await mercadoPagoService.refundPayment(Number(payment.externalId));

    // Update payment status
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED },
    });

    return { message: 'Reembolso processado com sucesso' };
  }
}

export const paymentsService = new PaymentsService();
```

### 4. Payments Routes

**apps/api/src/modules/payments/payments.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { paymentsController } from './payments.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';

export async function paymentsRoutes(fastify: FastifyInstance): Promise<void> {
  // Webhook route (no auth required)
  fastify.post('/webhook', {
    schema: {
      tags: ['Payments'],
      summary: 'Mercado Pago webhook',
    },
    handler: paymentsController.webhook.bind(paymentsController),
  });

  // Authenticated routes
  fastify.register(async (authenticatedRoutes) => {
    authenticatedRoutes.addHook('preHandler', authenticate);

    authenticatedRoutes.post('/orders/:orderId/pay', {
      schema: {
        tags: ['Payments'],
        summary: 'Create Pix payment for order',
        security: [{ bearerAuth: [] }],
      },
      handler: paymentsController.createPixPayment.bind(paymentsController),
    });

    authenticatedRoutes.get('/:id', {
      schema: {
        tags: ['Payments'],
        summary: 'Get payment status',
        security: [{ bearerAuth: [] }],
      },
      handler: paymentsController.getStatus.bind(paymentsController),
    });
  });
}
```

### 5. Payments Controller

**apps/api/src/modules/payments/payments.controller.ts:**
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { paymentsService } from './payments.service.js';

export class PaymentsController {
  async createPixPayment(
    request: FastifyRequest<{ Params: { orderId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const client = await this.getClientId(request);
    const result = await paymentsService.createPixPayment(request.params.orderId, client.id);
    reply.status(201).send(result);
  }

  async getStatus(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const client = await this.getClientId(request);
    const result = await paymentsService.getPaymentStatus(request.params.id, client.id);
    reply.send(result);
  }

  async webhook(
    request: FastifyRequest<{ Body: { action: string; data: { id: string } } }>,
    reply: FastifyReply
  ): Promise<void> {
    await paymentsService.handleWebhook(request.body);
    reply.status(200).send({ received: true });
  }

  private async getClientId(request: FastifyRequest) {
    const { prisma } = await import('@rotax1/database');
    const client = await prisma.client.findFirst({
      where: { userId: request.user!.id },
    });
    if (!client) {
      throw new Error('Client not found');
    }
    return client;
  }
}

export const paymentsController = new PaymentsController();
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/payments/orders/:orderId/pay` | Generate Pix payment |
| GET | `/payments/:id` | Get payment status |
| POST | `/payments/webhook` | Mercado Pago webhook |

---

## Payment Flow

```
1. Client creates order → status: PENDING_PAYMENT
2. Client calls /pay → Mercado Pago creates Pix, returns QR code
3. Client pays via Pix (bank app)
4. Mercado Pago sends webhook → payment confirmed
5. Order status updated → SEARCHING_DRIVER
6. If cancelled before payment → no action
7. If cancelled after payment → automatic refund
```

---

## Webhook Events

| Event | Action |
|-------|--------|
| `payment.created` | Log event |
| `payment.updated` | Update payment status |
| Approved | Order → SEARCHING_DRIVER |
| Rejected/Failed | Payment → FAILED |
| Refunded | Payment → REFUNDED |

---

## Definition of Done

- [ ] Mercado Pago integration working
- [ ] Pix QR code generation
- [ ] Webhook handling payment confirmations
- [ ] Order status updated on payment
- [ ] Refund on cancellation
- [ ] Payment expiration handling
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 2.2 (Order Creation)
- Mercado Pago account and credentials

---

## Environment Variables

```bash
MERCADO_PAGO_ACCESS_TOKEN=your-access-token
MERCADO_PAGO_WEBHOOK_SECRET=your-webhook-secret
```
