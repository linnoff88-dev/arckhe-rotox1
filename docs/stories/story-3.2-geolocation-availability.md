# Story 3.2: Driver Availability & Geolocation

**Epic:** 3 - Driver Module
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Medium (4-6 hours)

---

## User Story

**As a** driver,
**I want** to toggle my availability and share my location,
**so that** I can receive delivery requests.

---

## Acceptance Criteria

- [ ] 1. Endpoint PUT /drivers/availability para toggle online/offline
- [ ] 2. Endpoint PUT /drivers/location para atualizar posição
- [ ] 3. Armazenamento de localização em Redis (TTL 60s)
- [ ] 4. Redis GEO para queries espaciais
- [ ] 5. Atualização de posição a cada 30 segundos quando online
- [ ] 6. Heartbeat para detectar drivers offline
- [ ] 7. Apenas drivers APPROVED podem ficar online
- [ ] 8. WebSocket para notificar clientes sobre posição

---

## Technical Implementation

### 1. Module Structure

```
apps/api/src/modules/drivers/
├── ... (existing files)
├── availability/
│   ├── availability.service.ts
│   └── availability.routes.ts
└── location/
    ├── location.service.ts
    └── location.routes.ts
```

### 2. Zod Schemas

**apps/api/src/modules/drivers/drivers.schema.ts:** (additions)
```typescript
export const setAvailabilitySchema = z.object({
  isOnline: z.boolean(),
});

export const updateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
  accuracy: z.number().min(0).optional(),
});

export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
```

### 3. Redis Service

**apps/api/src/common/services/redis.service.ts:**
```typescript
import Redis from 'ioredis';
import { config } from '../config/index.js';

class RedisService {
  private client: Redis;

  constructor() {
    this.client = new Redis(config.redis.url);
  }

  // Basic operations
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  // GEO operations for driver locations
  async geoAdd(key: string, lng: number, lat: number, member: string): Promise<void> {
    await this.client.geoadd(key, lng, lat, member);
  }

  async geoRemove(key: string, member: string): Promise<void> {
    await this.client.zrem(key, member);
  }

  async geoRadius(
    key: string,
    lng: number,
    lat: number,
    radiusKm: number
  ): Promise<{ member: string; distance: number; coords: [number, number] }[]> {
    const results = await this.client.georadius(
      key,
      lng,
      lat,
      radiusKm,
      'km',
      'WITHDIST',
      'WITHCOORD',
      'ASC'
    );

    return results.map((result: any) => ({
      member: result[0],
      distance: parseFloat(result[1]),
      coords: [parseFloat(result[2][0]), parseFloat(result[2][1])],
    }));
  }

  async geoPos(key: string, member: string): Promise<[number, number] | null> {
    const result = await this.client.geopos(key, member);
    if (result && result[0]) {
      return [parseFloat(result[0][0]), parseFloat(result[0][1])];
    }
    return null;
  }

  // Pub/Sub for real-time updates
  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  subscribe(channel: string, callback: (message: string) => void): void {
    const subscriber = this.client.duplicate();
    subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    });
  }

  getClient(): Redis {
    return this.client;
  }
}

export const redisService = new RedisService();
```

### 4. Availability Service

**apps/api/src/modules/drivers/availability/availability.service.ts:**
```typescript
import { prisma, DriverStatus } from '@rotax1/database';
import { redisService } from '../../../common/services/redis.service.js';
import { ForbiddenError, ValidationError } from '../../../common/errors/app-error.js';

const DRIVER_ONLINE_KEY = 'drivers:online';
const DRIVER_LOCATIONS_KEY = 'drivers:locations';
const ONLINE_TTL = 60; // 60 seconds

export class AvailabilityService {
  async setAvailability(driverId: string, isOnline: boolean) {
    // Get driver to verify status
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new ValidationError('Entregador não encontrado');
    }

    if (driver.status !== DriverStatus.APPROVED) {
      throw new ForbiddenError('Apenas entregadores aprovados podem ficar online');
    }

    // Update database
    await prisma.driver.update({
      where: { id: driverId },
      data: { isOnline },
    });

    if (isOnline) {
      // Add to online drivers set with TTL
      await redisService.set(`${DRIVER_ONLINE_KEY}:${driverId}`, 'true', ONLINE_TTL);
    } else {
      // Remove from online drivers and locations
      await redisService.del(`${DRIVER_ONLINE_KEY}:${driverId}`);
      await redisService.geoRemove(DRIVER_LOCATIONS_KEY, driverId);
    }

    return { isOnline };
  }

  async updateLocation(
    driverId: string,
    lat: number,
    lng: number,
    heading?: number,
    speed?: number
  ) {
    // Check if driver is online
    const isOnline = await redisService.exists(`${DRIVER_ONLINE_KEY}:${driverId}`);

    if (!isOnline) {
      throw new ForbiddenError('Você precisa estar online para atualizar localização');
    }

    // Update location in Redis GEO
    await redisService.geoAdd(DRIVER_LOCATIONS_KEY, lng, lat, driverId);

    // Refresh online TTL (heartbeat)
    await redisService.set(`${DRIVER_ONLINE_KEY}:${driverId}`, 'true', ONLINE_TTL);

    // Store additional location data
    const locationData = JSON.stringify({
      lat,
      lng,
      heading,
      speed,
      timestamp: new Date().toISOString(),
    });
    await redisService.set(`driver:location:${driverId}`, locationData, ONLINE_TTL);

    // Update database (less frequently, every 5th update or so)
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        currentLat: lat,
        currentLng: lng,
      },
    });

    // Publish location update for active orders
    await this.publishLocationUpdate(driverId, lat, lng, heading, speed);

    return { lat, lng, heading, speed };
  }

  async getOnlineDrivers() {
    // Get all online driver IDs by scanning keys
    const client = redisService.getClient();
    const keys = await client.keys(`${DRIVER_ONLINE_KEY}:*`);

    const driverIds = keys.map((key) => key.replace(`${DRIVER_ONLINE_KEY}:`, ''));

    if (driverIds.length === 0) {
      return [];
    }

    // Get driver details from database
    const drivers = await prisma.driver.findMany({
      where: { id: { in: driverIds } },
      select: {
        id: true,
        name: true,
        vehicleType: true,
        ratingAvg: true,
        currentLat: true,
        currentLng: true,
      },
    });

    return drivers;
  }

  async getDriversNearLocation(lat: number, lng: number, radiusKm: number = 5) {
    // Query Redis GEO for nearby drivers
    const nearbyDrivers = await redisService.geoRadius(
      DRIVER_LOCATIONS_KEY,
      lng,
      lat,
      radiusKm
    );

    if (nearbyDrivers.length === 0) {
      return [];
    }

    const driverIds = nearbyDrivers.map((d) => d.member);

    // Get driver details
    const drivers = await prisma.driver.findMany({
      where: {
        id: { in: driverIds },
        status: DriverStatus.APPROVED,
        isOnline: true,
      },
      select: {
        id: true,
        name: true,
        vehicleType: true,
        ratingAvg: true,
        profilePhotoUrl: true,
      },
    });

    // Combine with distance data
    return drivers.map((driver) => {
      const locationData = nearbyDrivers.find((n) => n.member === driver.id);
      return {
        ...driver,
        distance: locationData?.distance || 0,
        location: locationData?.coords
          ? { lat: locationData.coords[1], lng: locationData.coords[0] }
          : null,
      };
    });
  }

  async getDriverLocation(driverId: string) {
    const locationJson = await redisService.get(`driver:location:${driverId}`);

    if (!locationJson) {
      // Fallback to database
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        select: { currentLat: true, currentLng: true },
      });

      if (!driver || !driver.currentLat || !driver.currentLng) {
        return null;
      }

      return {
        lat: Number(driver.currentLat),
        lng: Number(driver.currentLng),
        heading: null,
        speed: null,
        timestamp: null,
      };
    }

    return JSON.parse(locationJson);
  }

  private async publishLocationUpdate(
    driverId: string,
    lat: number,
    lng: number,
    heading?: number,
    speed?: number
  ) {
    // Find active orders for this driver
    const activeOrders = await prisma.order.findMany({
      where: {
        driverId,
        status: { in: ['COLLECTING', 'DELIVERING'] },
      },
      select: { id: true },
    });

    // Publish to each order's channel
    for (const order of activeOrders) {
      await redisService.publish(
        `order:${order.id}:location`,
        JSON.stringify({
          driverId,
          lat,
          lng,
          heading,
          speed,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }
}

export const availabilityService = new AvailabilityService();
```

### 5. Heartbeat Job

**apps/api/src/common/jobs/heartbeat.job.ts:**
```typescript
import { prisma } from '@rotax1/database';
import { redisService } from '../services/redis.service.js';

const DRIVER_ONLINE_KEY = 'drivers:online';
const DRIVER_LOCATIONS_KEY = 'drivers:locations';

export async function checkOfflineDrivers() {
  // Get all drivers marked as online in database
  const onlineDrivers = await prisma.driver.findMany({
    where: { isOnline: true },
    select: { id: true },
  });

  for (const driver of onlineDrivers) {
    // Check if they have a valid online key in Redis
    const isOnline = await redisService.exists(`${DRIVER_ONLINE_KEY}:${driver.id}`);

    if (!isOnline) {
      // Driver hasn't sent heartbeat, mark as offline
      await prisma.driver.update({
        where: { id: driver.id },
        data: { isOnline: false },
      });

      // Remove from geo index
      await redisService.geoRemove(DRIVER_LOCATIONS_KEY, driver.id);

      console.log(`Driver ${driver.id} marked as offline (no heartbeat)`);
    }
  }
}
```

### 6. Availability Routes

**apps/api/src/modules/drivers/availability/availability.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { availabilityController } from './availability.controller.js';
import { setAvailabilitySchema, updateLocationSchema } from '../drivers.schema.js';
import { zodToJsonSchema } from '../../../common/utils/zod-to-json.js';
import { authenticate } from '../../../common/middlewares/auth.middleware.js';

export async function availabilityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  fastify.put('/availability', {
    schema: {
      body: zodToJsonSchema(setAvailabilitySchema),
      tags: ['Driver Availability'],
      summary: 'Set driver online/offline status',
      security: [{ bearerAuth: [] }],
    },
    handler: availabilityController.setAvailability.bind(availabilityController),
  });

  fastify.put('/location', {
    schema: {
      body: zodToJsonSchema(updateLocationSchema),
      tags: ['Driver Availability'],
      summary: 'Update driver location',
      security: [{ bearerAuth: [] }],
    },
    handler: availabilityController.updateLocation.bind(availabilityController),
  });

  fastify.get('/location', {
    schema: {
      tags: ['Driver Availability'],
      summary: 'Get current driver location',
      security: [{ bearerAuth: [] }],
    },
    handler: availabilityController.getLocation.bind(availabilityController),
  });
}
```

### 7. Availability Controller

**apps/api/src/modules/drivers/availability/availability.controller.ts:**
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { availabilityService } from './availability.service.js';
import type { SetAvailabilityInput, UpdateLocationInput } from '../drivers.schema.js';

export class AvailabilityController {
  async setAvailability(
    request: FastifyRequest<{ Body: SetAvailabilityInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const result = await availabilityService.setAvailability(driverId, request.body.isOnline);
    reply.send(result);
  }

  async updateLocation(
    request: FastifyRequest<{ Body: UpdateLocationInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const driverId = await this.getDriverId(request);
    const { lat, lng, heading, speed } = request.body;
    const result = await availabilityService.updateLocation(driverId, lat, lng, heading, speed);
    reply.send(result);
  }

  async getLocation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const driverId = await this.getDriverId(request);
    const location = await availabilityService.getDriverLocation(driverId);
    reply.send(location || { message: 'Localização não disponível' });
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

export const availabilityController = new AvailabilityController();
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/drivers/availability` | Set online/offline |
| PUT | `/drivers/location` | Update location |
| GET | `/drivers/location` | Get current location |

---

## Redis Data Structures

### Online Drivers (String with TTL)
```
Key: drivers:online:{driver_id}
Value: "true"
TTL: 60 seconds
```

### Driver Locations (Geo Set)
```
Key: drivers:locations
Members: driver_id with lat/lng coordinates
Used for: GEORADIUS queries
```

### Location Details (String)
```
Key: driver:location:{driver_id}
Value: JSON { lat, lng, heading, speed, timestamp }
TTL: 60 seconds
```

---

## Location Update Flow

```
1. Driver goes online
   PUT /drivers/availability { isOnline: true }
   → Redis: SET drivers:online:{id} "true" EX 60
   → DB: UPDATE drivers SET is_online = true

2. Driver updates location (every 30s)
   PUT /drivers/location { lat, lng, heading, speed }
   → Redis: GEOADD drivers:locations {lng} {lat} {id}
   → Redis: SET drivers:online:{id} "true" EX 60 (refresh TTL)
   → Redis: SET driver:location:{id} {json} EX 60
   → DB: UPDATE drivers SET current_lat, current_lng

3. If no update for 60s
   → Heartbeat job detects missing key
   → DB: UPDATE drivers SET is_online = false
   → Redis: ZREM drivers:locations {id}
```

---

## Definition of Done

- [ ] Toggle online/offline working
- [ ] Location updates stored in Redis
- [ ] GEO queries returning nearby drivers
- [ ] Heartbeat detecting offline drivers
- [ ] WebSocket publishing location updates
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 3.1 (Driver Registration)
- Redis configured
- BullMQ for heartbeat job
