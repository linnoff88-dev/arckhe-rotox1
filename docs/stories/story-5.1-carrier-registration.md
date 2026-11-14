# Story 5.1: Carrier Registration

**Epic:** 5 - Carrier Module (Phase 2)
**Status:** Backlog
**Priority:** P2 - Nice to Have
**Estimate:** Medium (4-6 hours)

---

## User Story

**As a** carrier company,
**I want** to register my company on the platform,
**so that** I can receive delivery requests.

---

## Acceptance Criteria

- [ ] 1. Cadastro de empresa com CNPJ
- [ ] 2. Upload de documentação (contrato social, alvará)
- [ ] 3. Definição de áreas de atuação
- [ ] 4. Aprovação por admin
- [ ] 5. Dashboard da transportadora
- [ ] 6. Configuração de capacidades e veículos
- [ ] 7. Termos de serviço e contrato digital
- [ ] 8. Notificações de aprovação

---

## Technical Implementation

### 1. Carrier Module Structure

```
apps/api/src/modules/carriers/
├── carriers.controller.ts
├── carriers.service.ts
├── carriers.routes.ts
├── carriers.schema.ts
├── carriers.errors.ts
├── documents/
│   ├── documents.controller.ts
│   ├── documents.service.ts
│   └── documents.schema.ts
└── regions/
    ├── regions.controller.ts
    ├── regions.service.ts
    └── regions.schema.ts
```

### 2. Database Schema Addition

**packages/database/prisma/schema.prisma:** (additions)
```prisma
model Carrier {
  id              String          @id @default(uuid())
  userId          String          @unique @map("user_id")
  companyName     String          @map("company_name")
  tradeName       String?         @map("trade_name")
  cnpj            String          @unique
  stateRegistration String?       @map("state_registration")
  phone           String
  email           String
  status          CarrierStatus   @default(PENDING_DOCUMENTS)

  // Address
  street          String
  number          String
  complement      String?
  neighborhood    String
  city            String
  state           String          @db.Char(2)
  zipCode         String          @map("zip_code")

  // Contact person
  contactName     String          @map("contact_name")
  contactPhone    String          @map("contact_phone")
  contactEmail    String          @map("contact_email")

  // Bank info
  bankName        String?         @map("bank_name")
  bankAgency      String?         @map("bank_agency")
  bankAccount     String?         @map("bank_account")
  pixKey          String?         @map("pix_key")

  // Capabilities
  maxWeightKg     Decimal?        @map("max_weight_kg") @db.Decimal(10, 2)
  vehicleTypes    String[]        @map("vehicle_types")
  categories      String[]        // Order categories they handle

  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")
  approvedAt      DateTime?       @map("approved_at")

  user            User            @relation(fields: [userId], references: [id])
  documents       CarrierDocument[]
  regions         CarrierRegion[]
  vehicles        CarrierVehicle[]
  drivers         CarrierDriver[]
  orders          Order[]
  payouts         CarrierPayout[]

  @@map("carriers")
}

model CarrierDocument {
  id              String              @id @default(uuid())
  carrierId       String              @map("carrier_id")
  type            CarrierDocumentType
  fileUrl         String              @map("file_url")
  status          DocumentStatus      @default(PENDING_REVIEW)
  uploadedAt      DateTime            @default(now()) @map("uploaded_at")
  reviewedAt      DateTime?           @map("reviewed_at")
  reviewedBy      String?             @map("reviewed_by")
  rejectionReason String?             @map("rejection_reason")
  expiresAt       DateTime?           @map("expires_at")

  carrier         Carrier             @relation(fields: [carrierId], references: [id])

  @@map("carrier_documents")
}

model CarrierRegion {
  id              String          @id @default(uuid())
  carrierId       String          @map("carrier_id")
  name            String
  type            RegionType      @default(CITY)
  value           String          // city name, state code, or CEP range
  isActive        Boolean         @default(true) @map("is_active")

  carrier         Carrier         @relation(fields: [carrierId], references: [id])

  @@map("carrier_regions")
}

enum CarrierStatus {
  PENDING_DOCUMENTS
  PENDING_APPROVAL
  APPROVED
  SUSPENDED
  REJECTED
}

enum CarrierDocumentType {
  SOCIAL_CONTRACT      // Contrato Social
  OPERATING_LICENSE    // Alvará de funcionamento
  CNPJ_CARD            // Cartão CNPJ
  ANTT_LICENSE         // Licença ANTT (if applicable)
  INSURANCE            // Seguro de carga
  ADDRESS_PROOF        // Comprovante de endereço
}

enum RegionType {
  CITY
  STATE
  CEP_RANGE
  POLYGON
}
```

### 3. Zod Schemas

**apps/api/src/modules/carriers/carriers.schema.ts:**
```typescript
import { z } from 'zod';

const cnpjRegex = /^\d{14}$/;

export const carrierRegisterSchema = z.object({
  // Auth info
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),

  // Company info
  companyName: z.string().min(3, 'Razão social é obrigatória'),
  tradeName: z.string().optional(),
  cnpj: z.string().regex(cnpjRegex, 'CNPJ inválido (apenas números)'),
  stateRegistration: z.string().optional(),
  phone: z.string().min(10, 'Telefone inválido'),

  // Address
  street: z.string().min(3),
  number: z.string().min(1),
  complement: z.string().optional(),
  neighborhood: z.string().min(2),
  city: z.string().min(2),
  state: z.string().length(2),
  zipCode: z.string().min(8),

  // Contact person
  contactName: z.string().min(2),
  contactPhone: z.string().min(10),
  contactEmail: z.string().email(),

  // Capabilities
  maxWeightKg: z.number().min(1).optional(),
  vehicleTypes: z.array(z.enum(['CAR', 'VAN', 'TRUCK', 'MOTORCYCLE'])),
  categories: z.array(z.enum([
    'DOCUMENT',
    'SMALL_PACKAGE',
    'MEDIUM_PACKAGE',
    'LARGE_PACKAGE',
    'FRAGILE',
    'REFRIGERATED',
  ])),
});

export const updateCarrierSchema = carrierRegisterSchema
  .omit({ email: true, password: true, cnpj: true })
  .partial();

export const addRegionSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['CITY', 'STATE', 'CEP_RANGE', 'POLYGON']),
  value: z.string().min(2),
});

export const updateBankInfoSchema = z.object({
  bankName: z.string().min(2),
  bankAgency: z.string().min(4),
  bankAccount: z.string().min(5),
  pixKey: z.string().min(5),
});

export type CarrierRegisterInput = z.infer<typeof carrierRegisterSchema>;
export type UpdateCarrierInput = z.infer<typeof updateCarrierSchema>;
export type AddRegionInput = z.infer<typeof addRegionSchema>;
export type UpdateBankInfoInput = z.infer<typeof updateBankInfoSchema>;
```

### 4. Carrier Service

**apps/api/src/modules/carriers/carriers.service.ts:**
```typescript
import { prisma, UserRole, UserStatus, CarrierStatus } from '@rotax1/database';
import { ConflictError, NotFoundError, ForbiddenError } from '../../common/errors/app-error.js';
import { hashPassword } from '../../common/utils/password.js';
import { queueService } from '../../common/services/queue.service.js';
import type { CarrierRegisterInput, UpdateCarrierInput, AddRegionInput, UpdateBankInfoInput } from './carriers.schema.js';

export class CarriersService {
  async register(data: CarrierRegisterInput) {
    // Check if email exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError('Email já cadastrado');
    }

    // Check if CNPJ exists
    const existingCarrier = await prisma.carrier.findFirst({
      where: { cnpj: data.cnpj },
    });

    if (existingCarrier) {
      throw new ConflictError('CNPJ já cadastrado');
    }

    // Create user and carrier in transaction
    const result = await prisma.$transaction(async (tx) => {
      const passwordHash = await hashPassword(data.password);

      const user = await tx.user.create({
        data: {
          email: data.email,
          phone: data.phone,
          passwordHash,
          role: UserRole.CARRIER,
          status: UserStatus.PENDING,
        },
      });

      const carrier = await tx.carrier.create({
        data: {
          userId: user.id,
          companyName: data.companyName,
          tradeName: data.tradeName,
          cnpj: data.cnpj,
          stateRegistration: data.stateRegistration,
          phone: data.phone,
          email: data.email,
          street: data.street,
          number: data.number,
          complement: data.complement,
          neighborhood: data.neighborhood,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          contactEmail: data.contactEmail,
          maxWeightKg: data.maxWeightKg,
          vehicleTypes: data.vehicleTypes,
          categories: data.categories,
          status: CarrierStatus.PENDING_DOCUMENTS,
        },
      });

      return { user, carrier };
    });

    // Notify admin
    await queueService.addJob('notifications', 'new-carrier-registration', {
      carrierId: result.carrier.id,
      companyName: result.carrier.companyName,
      email: result.user.email,
    });

    return {
      id: result.carrier.id,
      userId: result.user.id,
      companyName: result.carrier.companyName,
      status: result.carrier.status,
    };
  }

  async getProfile(userId: string) {
    const carrier = await prisma.carrier.findFirst({
      where: { userId },
      include: {
        user: { select: { email: true, status: true, createdAt: true } },
        documents: {
          select: { id: true, type: true, status: true, uploadedAt: true, expiresAt: true },
        },
        regions: { where: { isActive: true } },
        vehicles: { select: { id: true, plate: true, type: true, capacityKg: true } },
        drivers: { select: { id: true, name: true, phone: true, isActive: true } },
        _count: { select: { orders: true } },
      },
    });

    if (!carrier) {
      throw new NotFoundError('Transportadora');
    }

    return {
      id: carrier.id,
      companyName: carrier.companyName,
      tradeName: carrier.tradeName,
      cnpj: carrier.cnpj,
      status: carrier.status,
      contact: {
        name: carrier.contactName,
        phone: carrier.contactPhone,
        email: carrier.contactEmail,
      },
      address: {
        street: carrier.street,
        number: carrier.number,
        complement: carrier.complement,
        neighborhood: carrier.neighborhood,
        city: carrier.city,
        state: carrier.state,
        zipCode: carrier.zipCode,
      },
      capabilities: {
        maxWeightKg: carrier.maxWeightKg,
        vehicleTypes: carrier.vehicleTypes,
        categories: carrier.categories,
      },
      bankInfo: {
        bankName: carrier.bankName,
        bankAgency: carrier.bankAgency,
        bankAccount: carrier.bankAccount,
        pixKey: carrier.pixKey,
      },
      documents: carrier.documents,
      regions: carrier.regions,
      vehicles: carrier.vehicles,
      drivers: carrier.drivers,
      stats: {
        totalOrders: carrier._count.orders,
      },
      user: carrier.user,
    };
  }

  async updateProfile(userId: string, data: UpdateCarrierInput) {
    const carrier = await prisma.carrier.findFirst({ where: { userId } });

    if (!carrier) {
      throw new NotFoundError('Transportadora');
    }

    return prisma.carrier.update({
      where: { id: carrier.id },
      data: {
        companyName: data.companyName,
        tradeName: data.tradeName,
        phone: data.phone,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        maxWeightKg: data.maxWeightKg,
        vehicleTypes: data.vehicleTypes,
        categories: data.categories,
      },
    });
  }

  async updateBankInfo(userId: string, data: UpdateBankInfoInput) {
    const carrier = await prisma.carrier.findFirst({ where: { userId } });

    if (!carrier) {
      throw new NotFoundError('Transportadora');
    }

    return prisma.carrier.update({
      where: { id: carrier.id },
      data: {
        bankName: data.bankName,
        bankAgency: data.bankAgency,
        bankAccount: data.bankAccount,
        pixKey: data.pixKey,
      },
    });
  }

  async addRegion(userId: string, data: AddRegionInput) {
    const carrier = await prisma.carrier.findFirst({ where: { userId } });

    if (!carrier) {
      throw new NotFoundError('Transportadora');
    }

    return prisma.carrierRegion.create({
      data: {
        carrierId: carrier.id,
        name: data.name,
        type: data.type,
        value: data.value,
      },
    });
  }

  async removeRegion(userId: string, regionId: string) {
    const carrier = await prisma.carrier.findFirst({ where: { userId } });

    if (!carrier) {
      throw new NotFoundError('Transportadora');
    }

    const region = await prisma.carrierRegion.findFirst({
      where: { id: regionId, carrierId: carrier.id },
    });

    if (!region) {
      throw new NotFoundError('Região');
    }

    return prisma.carrierRegion.delete({ where: { id: regionId } });
  }

  async getRegions(userId: string) {
    const carrier = await prisma.carrier.findFirst({ where: { userId } });

    if (!carrier) {
      throw new NotFoundError('Transportadora');
    }

    return prisma.carrierRegion.findMany({
      where: { carrierId: carrier.id },
      orderBy: { name: 'asc' },
    });
  }

  async getDashboard(userId: string) {
    const carrier = await prisma.carrier.findFirst({
      where: { userId },
    });

    if (!carrier) {
      throw new NotFoundError('Transportadora');
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayOrders, monthOrders, pendingOrders, vehicles, drivers] = await Promise.all([
      prisma.order.count({
        where: {
          carrierId: carrier.id,
          createdAt: { gte: todayStart },
        },
      }),
      prisma.order.aggregate({
        where: {
          carrierId: carrier.id,
          status: 'DELIVERED',
          deliveredAt: { gte: monthStart },
        },
        _sum: { price: true },
        _count: true,
      }),
      prisma.order.count({
        where: {
          carrierId: carrier.id,
          status: { in: ['SEARCHING_DRIVER', 'COLLECTING', 'DELIVERING'] },
        },
      }),
      prisma.carrierVehicle.count({
        where: { carrierId: carrier.id, isActive: true },
      }),
      prisma.carrierDriver.count({
        where: { carrierId: carrier.id, isActive: true },
      }),
    ]);

    return {
      today: {
        orders: todayOrders,
      },
      month: {
        orders: monthOrders._count,
        revenue: Number(monthOrders._sum.price || 0),
      },
      pending: {
        orders: pendingOrders,
      },
      fleet: {
        vehicles,
        drivers,
      },
    };
  }
}

export const carriersService = new CarriersService();
```

### 5. Carrier Routes

**apps/api/src/modules/carriers/carriers.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { carriersController } from './carriers.controller.js';
import { documentsController } from './documents/documents.controller.js';
import { carrierRegisterSchema, updateCarrierSchema, addRegionSchema, updateBankInfoSchema } from './carriers.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { authenticate, requireRole } from '../../common/middlewares/auth.middleware.js';

export async function carriersRoutes(fastify: FastifyInstance): Promise<void> {
  // Public registration
  fastify.post('/register', {
    schema: {
      body: zodToJsonSchema(carrierRegisterSchema),
      tags: ['Carriers'],
      summary: 'Register as carrier',
    },
    handler: carriersController.register.bind(carriersController),
  });

  // Authenticated routes
  fastify.register(async (authRoutes) => {
    authRoutes.addHook('preHandler', authenticate);
    authRoutes.addHook('preHandler', requireRole('CARRIER'));

    // Profile
    authRoutes.get('/me', {
      schema: { tags: ['Carriers'], summary: 'Get carrier profile', security: [{ bearerAuth: [] }] },
      handler: carriersController.getProfile.bind(carriersController),
    });

    authRoutes.patch('/me', {
      schema: { body: zodToJsonSchema(updateCarrierSchema), tags: ['Carriers'], summary: 'Update profile', security: [{ bearerAuth: [] }] },
      handler: carriersController.updateProfile.bind(carriersController),
    });

    authRoutes.put('/me/bank', {
      schema: { body: zodToJsonSchema(updateBankInfoSchema), tags: ['Carriers'], summary: 'Update bank info', security: [{ bearerAuth: [] }] },
      handler: carriersController.updateBankInfo.bind(carriersController),
    });

    // Dashboard
    authRoutes.get('/dashboard', {
      schema: { tags: ['Carriers'], summary: 'Get carrier dashboard', security: [{ bearerAuth: [] }] },
      handler: carriersController.getDashboard.bind(carriersController),
    });

    // Regions
    authRoutes.get('/regions', {
      schema: { tags: ['Carriers'], summary: 'List regions', security: [{ bearerAuth: [] }] },
      handler: carriersController.getRegions.bind(carriersController),
    });

    authRoutes.post('/regions', {
      schema: { body: zodToJsonSchema(addRegionSchema), tags: ['Carriers'], summary: 'Add region', security: [{ bearerAuth: [] }] },
      handler: carriersController.addRegion.bind(carriersController),
    });

    authRoutes.delete('/regions/:id', {
      schema: { tags: ['Carriers'], summary: 'Remove region', security: [{ bearerAuth: [] }] },
      handler: carriersController.removeRegion.bind(carriersController),
    });

    // Documents
    authRoutes.get('/documents', {
      schema: { tags: ['Carriers'], summary: 'List documents', security: [{ bearerAuth: [] }] },
      handler: documentsController.list.bind(documentsController),
    });

    authRoutes.post('/documents/upload-url', {
      schema: { tags: ['Carriers'], summary: 'Get upload URL', security: [{ bearerAuth: [] }] },
      handler: documentsController.getUploadUrl.bind(documentsController),
    });

    authRoutes.post('/documents/confirm', {
      schema: { tags: ['Carriers'], summary: 'Confirm upload', security: [{ bearerAuth: [] }] },
      handler: documentsController.confirmUpload.bind(documentsController),
    });
  });
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/carriers/register` | Register carrier |
| GET | `/carriers/me` | Get carrier profile |
| PATCH | `/carriers/me` | Update profile |
| PUT | `/carriers/me/bank` | Update bank info |
| GET | `/carriers/dashboard` | Get dashboard |
| GET | `/carriers/regions` | List regions |
| POST | `/carriers/regions` | Add region |
| DELETE | `/carriers/regions/:id` | Remove region |
| GET | `/carriers/documents` | List documents |
| POST | `/carriers/documents/upload-url` | Get upload URL |
| POST | `/carriers/documents/confirm` | Confirm upload |

---

## Required Documents

| Document | Description | Required |
|----------|-------------|----------|
| SOCIAL_CONTRACT | Contrato Social | Yes |
| OPERATING_LICENSE | Alvará de Funcionamento | Yes |
| CNPJ_CARD | Cartão CNPJ | Yes |
| ANTT_LICENSE | Licença ANTT | If applicable |
| INSURANCE | Seguro de Carga | Yes |
| ADDRESS_PROOF | Comprovante de Endereço | Yes |

---

## Registration Flow

```
1. Carrier submits registration form
   POST /carriers/register
   → Status: PENDING_DOCUMENTS

2. Carrier uploads required documents
   POST /carriers/documents/upload-url
   POST /carriers/documents/confirm
   → All docs uploaded → Status: PENDING_APPROVAL

3. Admin reviews and approves
   → Status: APPROVED
   → User status: ACTIVE
   → Carrier can receive orders

4. Carrier configures regions and fleet
   POST /carriers/regions
   POST /carriers/vehicles
```

---

## Definition of Done

- [ ] Carrier registration working
- [ ] Document upload flow
- [ ] Region management
- [ ] Admin approval integration
- [ ] Dashboard with stats
- [ ] Bank info management
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- MVP Complete (Epic 1-4)
- Admin approval flow (Story 4.2)
