# Story 5.2: Fleet Management

**Epic:** 5 - Carrier Module (Phase 2)
**Status:** Backlog
**Priority:** P2 - Nice to Have
**Estimate:** Medium (4-6 hours)

---

## User Story

**As a** carrier,
**I want** to manage my vehicles and drivers,
**so that** I can assign deliveries to my team.

---

## Acceptance Criteria

- [ ] 1. CRUD de veículos (placa, tipo, capacidade)
- [ ] 2. CRUD de motoristas vinculados
- [ ] 3. Disponibilidade por veículo/motorista
- [ ] 4. Calendário de disponibilidade
- [ ] 5. Atribuição de motorista a veículo
- [ ] 6. Dashboard de frota
- [ ] 7. Histórico de entregas por veículo/motorista
- [ ] 8. Alertas de manutenção/documentos vencendo

---

## Technical Implementation

### 1. Module Structure

```
apps/api/src/modules/carriers/fleet/
├── vehicles/
│   ├── vehicles.controller.ts
│   ├── vehicles.service.ts
│   ├── vehicles.routes.ts
│   └── vehicles.schema.ts
├── drivers/
│   ├── carrier-drivers.controller.ts
│   ├── carrier-drivers.service.ts
│   ├── carrier-drivers.routes.ts
│   └── carrier-drivers.schema.ts
└── availability/
    ├── availability.controller.ts
    ├── availability.service.ts
    └── availability.routes.ts
```

### 2. Database Schema Addition

**packages/database/prisma/schema.prisma:** (additions)
```prisma
model CarrierVehicle {
  id              String          @id @default(uuid())
  carrierId       String          @map("carrier_id")
  plate           String          @unique
  type            VehicleType
  brand           String?
  model           String?
  year            Int?
  color           String?
  capacityKg      Decimal         @map("capacity_kg") @db.Decimal(10, 2)
  capacityM3      Decimal?        @map("capacity_m3") @db.Decimal(10, 2)
  hasRefrigeration Boolean        @default(false) @map("has_refrigeration")
  isActive        Boolean         @default(true) @map("is_active")

  // Documents
  licensePlateDoc   String?       @map("license_plate_doc")
  insuranceDoc      String?       @map("insurance_doc")
  insuranceExpiry   DateTime?     @map("insurance_expiry")
  inspectionDoc     String?       @map("inspection_doc")
  inspectionExpiry  DateTime?     @map("inspection_expiry")

  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  carrier         Carrier         @relation(fields: [carrierId], references: [id])
  assignedDriver  CarrierDriver?  @relation("AssignedVehicle")
  orders          Order[]
  availability    VehicleAvailability[]

  @@map("carrier_vehicles")
}

model CarrierDriver {
  id              String          @id @default(uuid())
  carrierId       String          @map("carrier_id")
  name            String
  cpf             String          @unique
  cnh             String
  cnhCategory     String          @map("cnh_category")
  cnhExpiry       DateTime        @map("cnh_expiry")
  phone           String
  email           String?
  isActive        Boolean         @default(true) @map("is_active")

  // Current assignment
  assignedVehicleId String?       @unique @map("assigned_vehicle_id")

  // Location tracking (when on delivery)
  currentLat      Decimal?        @map("current_lat") @db.Decimal(10, 8)
  currentLng      Decimal?        @map("current_lng") @db.Decimal(11, 8)
  isOnline        Boolean         @default(false) @map("is_online")

  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  carrier         Carrier         @relation(fields: [carrierId], references: [id])
  assignedVehicle CarrierVehicle? @relation("AssignedVehicle", fields: [assignedVehicleId], references: [id])
  orders          Order[]
  availability    DriverAvailability[]

  @@map("carrier_drivers")
}

model VehicleAvailability {
  id              String          @id @default(uuid())
  vehicleId       String          @map("vehicle_id")
  dayOfWeek       Int             @map("day_of_week") // 0-6
  startTime       String          @map("start_time") // HH:MM
  endTime         String          @map("end_time")   // HH:MM
  isActive        Boolean         @default(true) @map("is_active")

  vehicle         CarrierVehicle  @relation(fields: [vehicleId], references: [id])

  @@unique([vehicleId, dayOfWeek])
  @@map("vehicle_availability")
}

model DriverAvailability {
  id              String          @id @default(uuid())
  driverId        String          @map("driver_id")
  dayOfWeek       Int             @map("day_of_week")
  startTime       String          @map("start_time")
  endTime         String          @map("end_time")
  isActive        Boolean         @default(true) @map("is_active")

  driver          CarrierDriver   @relation(fields: [driverId], references: [id])

  @@unique([driverId, dayOfWeek])
  @@map("driver_availability")
}
```

### 3. Zod Schemas

**apps/api/src/modules/carriers/fleet/vehicles/vehicles.schema.ts:**
```typescript
import { z } from 'zod';

export const createVehicleSchema = z.object({
  plate: z.string().min(7, 'Placa inválida'),
  type: z.enum(['CAR', 'VAN', 'TRUCK', 'MOTORCYCLE']),
  brand: z.string().optional(),
  model: z.string().optional(),
  year: z.number().min(2000).max(new Date().getFullYear() + 1).optional(),
  color: z.string().optional(),
  capacityKg: z.number().min(1, 'Capacidade é obrigatória'),
  capacityM3: z.number().min(0).optional(),
  hasRefrigeration: z.boolean().default(false),
});

export const updateVehicleSchema = createVehicleSchema.partial().omit({ plate: true });

export const vehicleAvailabilitySchema = z.object({
  schedule: z.array(z.object({
    dayOfWeek: z.number().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM'),
    isActive: z.boolean().default(true),
  })),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type VehicleAvailabilityInput = z.infer<typeof vehicleAvailabilitySchema>;
```

**apps/api/src/modules/carriers/fleet/drivers/carrier-drivers.schema.ts:**
```typescript
import { z } from 'zod';

export const createDriverSchema = z.object({
  name: z.string().min(2),
  cpf: z.string().length(11),
  cnh: z.string().min(9),
  cnhCategory: z.enum(['A', 'B', 'AB', 'C', 'D', 'E']),
  cnhExpiry: z.string().datetime(),
  phone: z.string().min(10),
  email: z.string().email().optional(),
});

export const updateDriverSchema = createDriverSchema.partial().omit({ cpf: true });

export const assignVehicleSchema = z.object({
  vehicleId: z.string().uuid().nullable(),
});

export const driverAvailabilitySchema = z.object({
  schedule: z.array(z.object({
    dayOfWeek: z.number().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    isActive: z.boolean().default(true),
  })),
});

export type CreateDriverInput = z.infer<typeof createDriverSchema>;
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>;
export type AssignVehicleInput = z.infer<typeof assignVehicleSchema>;
export type DriverAvailabilityInput = z.infer<typeof driverAvailabilitySchema>;
```

### 4. Vehicles Service

**apps/api/src/modules/carriers/fleet/vehicles/vehicles.service.ts:**
```typescript
import { prisma } from '@rotax1/database';
import { ConflictError, NotFoundError, ForbiddenError } from '../../../../common/errors/app-error.js';
import type { CreateVehicleInput, UpdateVehicleInput, VehicleAvailabilityInput } from './vehicles.schema.js';

export class VehiclesService {
  async list(carrierId: string) {
    const vehicles = await prisma.carrierVehicle.findMany({
      where: { carrierId },
      include: {
        assignedDriver: {
          select: { id: true, name: true, phone: true },
        },
        _count: {
          select: { orders: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return vehicles.map((v) => ({
      id: v.id,
      plate: v.plate,
      type: v.type,
      brand: v.brand,
      model: v.model,
      year: v.year,
      color: v.color,
      capacityKg: Number(v.capacityKg),
      capacityM3: v.capacityM3 ? Number(v.capacityM3) : null,
      hasRefrigeration: v.hasRefrigeration,
      isActive: v.isActive,
      assignedDriver: v.assignedDriver,
      totalOrders: v._count.orders,
      documents: {
        insuranceExpiry: v.insuranceExpiry,
        inspectionExpiry: v.inspectionExpiry,
      },
    }));
  }

  async create(carrierId: string, data: CreateVehicleInput) {
    // Check if plate exists
    const existing = await prisma.carrierVehicle.findFirst({
      where: { plate: data.plate },
    });

    if (existing) {
      throw new ConflictError('Placa já cadastrada');
    }

    return prisma.carrierVehicle.create({
      data: {
        carrierId,
        plate: data.plate.toUpperCase(),
        type: data.type,
        brand: data.brand,
        model: data.model,
        year: data.year,
        color: data.color,
        capacityKg: data.capacityKg,
        capacityM3: data.capacityM3,
        hasRefrigeration: data.hasRefrigeration,
      },
    });
  }

  async update(carrierId: string, vehicleId: string, data: UpdateVehicleInput) {
    const vehicle = await this.getVehicle(carrierId, vehicleId);

    return prisma.carrierVehicle.update({
      where: { id: vehicleId },
      data: {
        type: data.type,
        brand: data.brand,
        model: data.model,
        year: data.year,
        color: data.color,
        capacityKg: data.capacityKg,
        capacityM3: data.capacityM3,
        hasRefrigeration: data.hasRefrigeration,
      },
    });
  }

  async toggleActive(carrierId: string, vehicleId: string) {
    const vehicle = await this.getVehicle(carrierId, vehicleId);

    return prisma.carrierVehicle.update({
      where: { id: vehicleId },
      data: { isActive: !vehicle.isActive },
    });
  }

  async delete(carrierId: string, vehicleId: string) {
    const vehicle = await this.getVehicle(carrierId, vehicleId);

    // Check if has active orders
    const activeOrders = await prisma.order.count({
      where: {
        carrierVehicleId: vehicleId,
        status: { in: ['COLLECTING', 'DELIVERING'] },
      },
    });

    if (activeOrders > 0) {
      throw new ForbiddenError('Veículo possui entregas em andamento');
    }

    return prisma.carrierVehicle.delete({ where: { id: vehicleId } });
  }

  async setAvailability(carrierId: string, vehicleId: string, data: VehicleAvailabilityInput) {
    await this.getVehicle(carrierId, vehicleId);

    // Delete existing availability
    await prisma.vehicleAvailability.deleteMany({
      where: { vehicleId },
    });

    // Create new availability
    await prisma.vehicleAvailability.createMany({
      data: data.schedule.map((s) => ({
        vehicleId,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        isActive: s.isActive,
      })),
    });

    return this.getAvailability(carrierId, vehicleId);
  }

  async getAvailability(carrierId: string, vehicleId: string) {
    await this.getVehicle(carrierId, vehicleId);

    return prisma.vehicleAvailability.findMany({
      where: { vehicleId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async getDeliveryHistory(carrierId: string, vehicleId: string, page: number, limit: number) {
    await this.getVehicle(carrierId, vehicleId);

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { carrierVehicleId: vehicleId },
        select: {
          id: true,
          status: true,
          category: true,
          distanceKm: true,
          price: true,
          createdAt: true,
          deliveredAt: true,
          carrierDriver: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: { carrierVehicleId: vehicleId } }),
    ]);

    return {
      orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async uploadDocument(carrierId: string, vehicleId: string, type: string, fileUrl: string) {
    await this.getVehicle(carrierId, vehicleId);

    const data: any = {};
    data[`${type}Doc`] = fileUrl;

    return prisma.carrierVehicle.update({
      where: { id: vehicleId },
      data,
    });
  }

  private async getVehicle(carrierId: string, vehicleId: string) {
    const vehicle = await prisma.carrierVehicle.findFirst({
      where: { id: vehicleId, carrierId },
    });

    if (!vehicle) {
      throw new NotFoundError('Veículo');
    }

    return vehicle;
  }
}

export const vehiclesService = new VehiclesService();
```

### 5. Carrier Drivers Service

**apps/api/src/modules/carriers/fleet/drivers/carrier-drivers.service.ts:**
```typescript
import { prisma } from '@rotax1/database';
import { ConflictError, NotFoundError, ForbiddenError, ValidationError } from '../../../../common/errors/app-error.js';
import type { CreateDriverInput, UpdateDriverInput, AssignVehicleInput, DriverAvailabilityInput } from './carrier-drivers.schema.js';

export class CarrierDriversService {
  async list(carrierId: string) {
    const drivers = await prisma.carrierDriver.findMany({
      where: { carrierId },
      include: {
        assignedVehicle: {
          select: { id: true, plate: true, type: true },
        },
        _count: {
          select: { orders: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return drivers.map((d) => ({
      id: d.id,
      name: d.name,
      cpf: d.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4'),
      cnh: d.cnh,
      cnhCategory: d.cnhCategory,
      cnhExpiry: d.cnhExpiry,
      phone: d.phone,
      email: d.email,
      isActive: d.isActive,
      isOnline: d.isOnline,
      assignedVehicle: d.assignedVehicle,
      totalOrders: d._count.orders,
    }));
  }

  async create(carrierId: string, data: CreateDriverInput) {
    // Check if CPF exists
    const existing = await prisma.carrierDriver.findFirst({
      where: { cpf: data.cpf },
    });

    if (existing) {
      throw new ConflictError('CPF já cadastrado');
    }

    return prisma.carrierDriver.create({
      data: {
        carrierId,
        name: data.name,
        cpf: data.cpf,
        cnh: data.cnh,
        cnhCategory: data.cnhCategory,
        cnhExpiry: new Date(data.cnhExpiry),
        phone: data.phone,
        email: data.email,
      },
    });
  }

  async update(carrierId: string, driverId: string, data: UpdateDriverInput) {
    await this.getDriver(carrierId, driverId);

    return prisma.carrierDriver.update({
      where: { id: driverId },
      data: {
        name: data.name,
        cnh: data.cnh,
        cnhCategory: data.cnhCategory,
        cnhExpiry: data.cnhExpiry ? new Date(data.cnhExpiry) : undefined,
        phone: data.phone,
        email: data.email,
      },
    });
  }

  async assignVehicle(carrierId: string, driverId: string, data: AssignVehicleInput) {
    const driver = await this.getDriver(carrierId, driverId);

    if (data.vehicleId) {
      // Verify vehicle belongs to carrier
      const vehicle = await prisma.carrierVehicle.findFirst({
        where: { id: data.vehicleId, carrierId },
      });

      if (!vehicle) {
        throw new NotFoundError('Veículo');
      }

      // Check if vehicle already assigned
      const currentlyAssigned = await prisma.carrierDriver.findFirst({
        where: {
          assignedVehicleId: data.vehicleId,
          id: { not: driverId },
        },
      });

      if (currentlyAssigned) {
        throw new ConflictError('Veículo já está atribuído a outro motorista');
      }
    }

    return prisma.carrierDriver.update({
      where: { id: driverId },
      data: { assignedVehicleId: data.vehicleId },
      include: {
        assignedVehicle: { select: { id: true, plate: true, type: true } },
      },
    });
  }

  async toggleActive(carrierId: string, driverId: string) {
    const driver = await this.getDriver(carrierId, driverId);

    // Check for active orders
    if (driver.isActive) {
      const activeOrders = await prisma.order.count({
        where: {
          carrierDriverId: driverId,
          status: { in: ['COLLECTING', 'DELIVERING'] },
        },
      });

      if (activeOrders > 0) {
        throw new ForbiddenError('Motorista possui entregas em andamento');
      }
    }

    return prisma.carrierDriver.update({
      where: { id: driverId },
      data: { isActive: !driver.isActive },
    });
  }

  async delete(carrierId: string, driverId: string) {
    const driver = await this.getDriver(carrierId, driverId);

    const totalOrders = await prisma.order.count({
      where: { carrierDriverId: driverId },
    });

    if (totalOrders > 0) {
      throw new ForbiddenError('Motorista possui histórico de entregas. Desative em vez de excluir.');
    }

    return prisma.carrierDriver.delete({ where: { id: driverId } });
  }

  async setAvailability(carrierId: string, driverId: string, data: DriverAvailabilityInput) {
    await this.getDriver(carrierId, driverId);

    await prisma.driverAvailability.deleteMany({
      where: { driverId },
    });

    await prisma.driverAvailability.createMany({
      data: data.schedule.map((s) => ({
        driverId,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        isActive: s.isActive,
      })),
    });

    return this.getAvailability(carrierId, driverId);
  }

  async getAvailability(carrierId: string, driverId: string) {
    await this.getDriver(carrierId, driverId);

    return prisma.driverAvailability.findMany({
      where: { driverId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async getDeliveryHistory(carrierId: string, driverId: string, page: number, limit: number) {
    await this.getDriver(carrierId, driverId);

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { carrierDriverId: driverId },
        select: {
          id: true,
          status: true,
          category: true,
          distanceKm: true,
          price: true,
          createdAt: true,
          deliveredAt: true,
          carrierVehicle: { select: { plate: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: { carrierDriverId: driverId } }),
    ]);

    return {
      orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async getDriver(carrierId: string, driverId: string) {
    const driver = await prisma.carrierDriver.findFirst({
      where: { id: driverId, carrierId },
    });

    if (!driver) {
      throw new NotFoundError('Motorista');
    }

    return driver;
  }
}

export const carrierDriversService = new CarrierDriversService();
```

### 6. Fleet Routes

**apps/api/src/modules/carriers/fleet/vehicles/vehicles.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { vehiclesController } from './vehicles.controller.js';
import { createVehicleSchema, updateVehicleSchema, vehicleAvailabilitySchema } from './vehicles.schema.js';
import { zodToJsonSchema } from '../../../../common/utils/zod-to-json.js';
import { authenticate, requireRole } from '../../../../common/middlewares/auth.middleware.js';

export async function vehiclesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole('CARRIER'));

  fastify.get('/', {
    schema: { tags: ['Fleet - Vehicles'], summary: 'List vehicles', security: [{ bearerAuth: [] }] },
    handler: vehiclesController.list.bind(vehiclesController),
  });

  fastify.post('/', {
    schema: { body: zodToJsonSchema(createVehicleSchema), tags: ['Fleet - Vehicles'], summary: 'Create vehicle', security: [{ bearerAuth: [] }] },
    handler: vehiclesController.create.bind(vehiclesController),
  });

  fastify.patch('/:id', {
    schema: { body: zodToJsonSchema(updateVehicleSchema), tags: ['Fleet - Vehicles'], summary: 'Update vehicle', security: [{ bearerAuth: [] }] },
    handler: vehiclesController.update.bind(vehiclesController),
  });

  fastify.post('/:id/toggle-active', {
    schema: { tags: ['Fleet - Vehicles'], summary: 'Toggle vehicle active', security: [{ bearerAuth: [] }] },
    handler: vehiclesController.toggleActive.bind(vehiclesController),
  });

  fastify.delete('/:id', {
    schema: { tags: ['Fleet - Vehicles'], summary: 'Delete vehicle', security: [{ bearerAuth: [] }] },
    handler: vehiclesController.delete.bind(vehiclesController),
  });

  fastify.get('/:id/availability', {
    schema: { tags: ['Fleet - Vehicles'], summary: 'Get availability', security: [{ bearerAuth: [] }] },
    handler: vehiclesController.getAvailability.bind(vehiclesController),
  });

  fastify.put('/:id/availability', {
    schema: { body: zodToJsonSchema(vehicleAvailabilitySchema), tags: ['Fleet - Vehicles'], summary: 'Set availability', security: [{ bearerAuth: [] }] },
    handler: vehiclesController.setAvailability.bind(vehiclesController),
  });

  fastify.get('/:id/history', {
    schema: { tags: ['Fleet - Vehicles'], summary: 'Get delivery history', security: [{ bearerAuth: [] }] },
    handler: vehiclesController.getDeliveryHistory.bind(vehiclesController),
  });
}
```

---

## API Endpoints

### Vehicles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/carriers/vehicles` | List vehicles |
| POST | `/carriers/vehicles` | Create vehicle |
| PATCH | `/carriers/vehicles/:id` | Update vehicle |
| POST | `/carriers/vehicles/:id/toggle-active` | Toggle active |
| DELETE | `/carriers/vehicles/:id` | Delete vehicle |
| GET | `/carriers/vehicles/:id/availability` | Get schedule |
| PUT | `/carriers/vehicles/:id/availability` | Set schedule |
| GET | `/carriers/vehicles/:id/history` | Delivery history |

### Drivers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/carriers/drivers` | List drivers |
| POST | `/carriers/drivers` | Create driver |
| PATCH | `/carriers/drivers/:id` | Update driver |
| PUT | `/carriers/drivers/:id/assign-vehicle` | Assign vehicle |
| POST | `/carriers/drivers/:id/toggle-active` | Toggle active |
| DELETE | `/carriers/drivers/:id` | Delete driver |
| GET | `/carriers/drivers/:id/availability` | Get schedule |
| PUT | `/carriers/drivers/:id/availability` | Set schedule |
| GET | `/carriers/drivers/:id/history` | Delivery history |

---

## Availability Schedule Format

```json
{
  "schedule": [
    { "dayOfWeek": 1, "startTime": "08:00", "endTime": "18:00", "isActive": true },
    { "dayOfWeek": 2, "startTime": "08:00", "endTime": "18:00", "isActive": true },
    { "dayOfWeek": 3, "startTime": "08:00", "endTime": "18:00", "isActive": true },
    { "dayOfWeek": 4, "startTime": "08:00", "endTime": "18:00", "isActive": true },
    { "dayOfWeek": 5, "startTime": "08:00", "endTime": "18:00", "isActive": true },
    { "dayOfWeek": 6, "startTime": "08:00", "endTime": "12:00", "isActive": true }
  ]
}
```

---

## Fleet Dashboard

```json
{
  "vehicles": {
    "total": 10,
    "active": 8,
    "onDelivery": 3,
    "available": 5
  },
  "drivers": {
    "total": 12,
    "active": 10,
    "online": 6,
    "onDelivery": 3
  },
  "alerts": [
    { "type": "CNH_EXPIRING", "driverId": "...", "daysLeft": 15 },
    { "type": "INSURANCE_EXPIRING", "vehicleId": "...", "daysLeft": 30 }
  ]
}
```

---

## Definition of Done

- [ ] Vehicle CRUD working
- [ ] Driver CRUD working
- [ ] Vehicle-Driver assignment
- [ ] Availability calendar
- [ ] Delivery history
- [ ] Document expiry alerts
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 5.1 (Carrier Registration)
