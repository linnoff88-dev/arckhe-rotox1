# Story 1.2: Database Setup & Core Models

**Epic:** 1 - Foundation & Core Infrastructure
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Small (2-4 hours)

---

## User Story

**As a** developer,
**I want** database schema with core entities,
**so that** I can persist and query application data.

---

## Acceptance Criteria

- [ ] 1. PostgreSQL + PostGIS configurado (Docker Compose ou Supabase)
- [ ] 2. Prisma schema com models: User, Client, Driver, Order, Payment, Rating, Address
- [ ] 3. Migrations iniciais criadas e aplicadas
- [ ] 4. Seed script com dados de teste
- [ ] 5. Conexão testada e documentada

---

## Technical Implementation

### 1. Docker Compose (Local Development)

**infrastructure/docker/docker-compose.yml:**
```yaml
version: '3.8'

services:
  postgres:
    image: postgis/postgis:16-3.4
    container_name: rotax1-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: rotax1
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: rotax1-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

### 2. Prisma Schema

**packages/database/prisma/schema.prisma:**
```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [postgis]
}

// ============================================
// ENUMS
// ============================================

enum UserRole {
  CLIENT
  DRIVER
  CARRIER
  ADMIN
}

enum UserStatus {
  PENDING
  ACTIVE
  BLOCKED
}

enum VehicleType {
  BIKE
  MOTO
  CAR
  VAN
}

enum OrderStatus {
  PENDING_PAYMENT
  SEARCHING_DRIVER
  DRIVER_ASSIGNED
  COLLECTING
  PICKED_UP
  DELIVERING
  DELIVERED
  CANCELLED
}

enum OrderCategory {
  VETERINARY
  FROZEN
  GENERAL
}

enum OrderUrgency {
  STANDARD
  EXPRESS
}

enum PaymentMethod {
  PIX
  CREDIT_CARD
  DEBIT_CARD
}

enum PaymentStatus {
  PENDING
  PAID
  REFUNDED
  FAILED
}

// ============================================
// MODELS
// ============================================

model User {
  id           String     @id @default(uuid())
  email        String     @unique
  phone        String
  passwordHash String     @map("password_hash")
  role         UserRole
  status       UserStatus @default(PENDING)
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  client  Client?
  driver  Driver?
  carrier Carrier?

  @@map("users")
}

model Client {
  id              String  @id @default(uuid())
  userId          String  @unique @map("user_id")
  name            String
  document        String?
  documentType    String? @map("document_type")
  profilePhotoUrl String? @map("profile_photo_url")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  addresses Address[]
  orders    Order[]
  ratings   Rating[]

  createdAt DateTime @default(now()) @map("created_at")

  @@map("clients")
}

model Driver {
  id              String      @id @default(uuid())
  userId          String      @unique @map("user_id")
  name            String
  document        String
  cnhNumber       String?     @map("cnh_number")
  cnhPhotoUrl     String?     @map("cnh_photo_url")
  profilePhotoUrl String?     @map("profile_photo_url")
  vehicleType     VehicleType @map("vehicle_type")
  vehiclePlate    String?     @map("vehicle_plate")
  vehicleDocUrl   String?     @map("vehicle_doc_url")
  isOnline        Boolean     @default(false) @map("is_online")
  currentLat      Decimal?    @map("current_lat") @db.Decimal(10, 8)
  currentLng      Decimal?    @map("current_lng") @db.Decimal(11, 8)
  ratingAvg       Decimal     @default(0) @map("rating_avg") @db.Decimal(3, 2)
  ratingCount     Int         @default(0) @map("rating_count")

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  orders  Order[]
  ratings Rating[]

  createdAt DateTime @default(now()) @map("created_at")

  @@map("drivers")
}

model Carrier {
  id          String  @id @default(uuid())
  userId      String  @unique @map("user_id")
  companyName String  @map("company_name")
  cnpj        String  @unique
  documents   Json?
  regions     Json?
  isActive    Boolean @default(false) @map("is_active")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")

  @@map("carriers")
}

model Address {
  id           String   @id @default(uuid())
  clientId     String   @map("client_id")
  label        String?
  street       String
  number       String
  complement   String?
  neighborhood String?
  city         String
  state        String   @db.Char(2)
  zipCode      String   @map("zip_code")
  lat          Decimal  @db.Decimal(10, 8)
  lng          Decimal  @db.Decimal(11, 8)
  isDefault    Boolean  @default(false) @map("is_default")
  createdAt    DateTime @default(now()) @map("created_at")

  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@map("addresses")
}

model Order {
  id               String        @id @default(uuid())
  clientId         String        @map("client_id")
  driverId         String?       @map("driver_id")
  status           OrderStatus   @default(PENDING_PAYMENT)
  category         OrderCategory
  urgency          OrderUrgency  @default(STANDARD)
  description      String?
  pickupAddress    Json          @map("pickup_address")
  pickupLat        Decimal       @map("pickup_lat") @db.Decimal(10, 8)
  pickupLng        Decimal       @map("pickup_lng") @db.Decimal(11, 8)
  deliveryAddress  Json          @map("delivery_address")
  deliveryLat      Decimal       @map("delivery_lat") @db.Decimal(10, 8)
  deliveryLng      Decimal       @map("delivery_lng") @db.Decimal(11, 8)
  distanceKm       Decimal       @map("distance_km") @db.Decimal(10, 2)
  price            Decimal       @db.Decimal(10, 2)
  platformFee      Decimal       @map("platform_fee") @db.Decimal(10, 2)
  driverEarning    Decimal       @map("driver_earning") @db.Decimal(10, 2)
  pickupPhotoUrl   String?       @map("pickup_photo_url")
  deliveryPhotoUrl String?       @map("delivery_photo_url")
  createdAt        DateTime      @default(now()) @map("created_at")
  acceptedAt       DateTime?     @map("accepted_at")
  pickedUpAt       DateTime?     @map("picked_up_at")
  deliveredAt      DateTime?     @map("delivered_at")
  cancelledAt      DateTime?     @map("cancelled_at")

  client  Client   @relation(fields: [clientId], references: [id])
  driver  Driver?  @relation(fields: [driverId], references: [id])
  payment Payment?
  rating  Rating?

  @@index([status])
  @@index([clientId])
  @@index([driverId])
  @@map("orders")
}

model Payment {
  id              String        @id @default(uuid())
  orderId         String        @unique @map("order_id")
  method          PaymentMethod
  status          PaymentStatus @default(PENDING)
  amount          Decimal       @db.Decimal(10, 2)
  externalId      String?       @map("external_id")
  pixQrCode       String?       @map("pix_qr_code")
  pixQrCodeBase64 String?       @map("pix_qr_code_base64")
  paidAt          DateTime?     @map("paid_at")
  createdAt       DateTime      @default(now()) @map("created_at")

  order Order @relation(fields: [orderId], references: [id])

  @@map("payments")
}

model Rating {
  id        String   @id @default(uuid())
  orderId   String   @unique @map("order_id")
  driverId  String   @map("driver_id")
  clientId  String   @map("client_id")
  stars     Int
  comment   String?
  createdAt DateTime @default(now()) @map("created_at")

  order  Order  @relation(fields: [orderId], references: [id])
  driver Driver @relation(fields: [driverId], references: [id])
  client Client @relation(fields: [clientId], references: [id])

  @@map("ratings")
}

model AdminAction {
  id        String   @id @default(uuid())
  adminId   String   @map("admin_id")
  action    String
  targetId  String?  @map("target_id")
  details   Json?
  createdAt DateTime @default(now()) @map("created_at")

  @@map("admin_actions")
}
```

### 3. Seed Script

**packages/database/prisma/seed.ts:**
```typescript
import { PrismaClient, UserRole, VehicleType, OrderStatus, OrderCategory } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@rotax1.com.br' },
    update: {},
    create: {
      email: 'admin@rotax1.com.br',
      phone: '+5511999999999',
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Admin created:', admin.email);

  // Create test clients
  const clientPassword = await hash('cliente123', 12);
  for (let i = 1; i <= 3; i++) {
    const user = await prisma.user.upsert({
      where: { email: `cliente${i}@teste.com` },
      update: {},
      create: {
        email: `cliente${i}@teste.com`,
        phone: `+551199900000${i}`,
        passwordHash: clientPassword,
        role: UserRole.CLIENT,
        status: 'ACTIVE',
        client: {
          create: {
            name: `Cliente Teste ${i}`,
            document: `1234567890${i}`,
            documentType: 'CPF',
          },
        },
      },
    });
    console.log('✅ Client created:', user.email);
  }

  // Create test drivers
  const driverPassword = await hash('entregador123', 12);
  const vehicleTypes: VehicleType[] = ['MOTO', 'MOTO', 'CAR', 'BIKE', 'VAN'];
  for (let i = 1; i <= 5; i++) {
    const user = await prisma.user.upsert({
      where: { email: `entregador${i}@teste.com` },
      update: {},
      create: {
        email: `entregador${i}@teste.com`,
        phone: `+551198800000${i}`,
        passwordHash: driverPassword,
        role: UserRole.DRIVER,
        status: 'ACTIVE',
        driver: {
          create: {
            name: `Entregador Teste ${i}`,
            document: `9876543210${i}`,
            cnhNumber: `CNH${i}23456789`,
            vehicleType: vehicleTypes[i - 1],
            vehiclePlate: `ABC${i}D${i}${i}`,
            isOnline: i <= 2, // First 2 drivers are online
            currentLat: -23.5505 + (Math.random() * 0.1 - 0.05),
            currentLng: -46.6333 + (Math.random() * 0.1 - 0.05),
            ratingAvg: 4.0 + Math.random(),
            ratingCount: 10 + i * 5,
          },
        },
      },
    });
    console.log('✅ Driver created:', user.email);
  }

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### 4. Database Client Export

**packages/database/src/index.ts:**
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
```

---

## Definition of Done

- [ ] Docker Compose running (or Supabase configured)
- [ ] PostGIS extension enabled
- [ ] Prisma schema created with all models
- [ ] Migrations generated and applied
- [ ] Seed script runs successfully
- [ ] Database connection verified via Prisma Studio
- [ ] `pnpm db:migrate` and `pnpm db:seed` work from root

---

## Dev Notes

### Supabase Setup

1. Create project at supabase.com
2. Go to Database → Extensions → Enable `postgis`
3. Copy connection string from Settings → Database
4. Use "Connection pooling" URL for serverless

### Commands

```bash
# Start local database
cd infrastructure/docker && docker-compose up -d

# Generate Prisma client
pnpm --filter database generate

# Run migrations
pnpm --filter database migrate

# Seed database
pnpm --filter database seed

# Open Prisma Studio
pnpm --filter database studio
```

### Testing Connection

```bash
# Via psql
psql $DATABASE_URL -c "SELECT PostGIS_Version();"

# Via Prisma
pnpm --filter database studio
```
