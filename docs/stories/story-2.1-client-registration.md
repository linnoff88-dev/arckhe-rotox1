# Story 2.1: Client Registration & Profile

**Epic:** 2 - Client Module
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Medium (4-6 hours)

---

## User Story

**As a** client,
**I want** to register and manage my profile,
**so that** I can use the platform to request deliveries.

---

## Acceptance Criteria

- [ ] 1. Endpoint POST /clients/profile para completar perfil
- [ ] 2. Upload de foto de perfil funcional
- [ ] 3. Validação de CPF/CNPJ
- [ ] 4. CRUD de endereços (múltiplos por cliente)
- [ ] 5. Endpoint GET /clients/me com dados completos
- [ ] 6. Endpoint PATCH /clients/me para atualização
- [ ] 7. Geocodificação automática de endereços (Google Maps)
- [ ] 8. Testes unitários (>70% coverage)

---

## Technical Implementation

### 1. Client Module Structure

```
apps/api/src/modules/clients/
├── clients.controller.ts
├── clients.service.ts
├── clients.routes.ts
├── clients.schema.ts
├── clients.errors.ts
└── addresses/
    ├── addresses.controller.ts
    ├── addresses.service.ts
    ├── addresses.routes.ts
    └── addresses.schema.ts
```

### 2. Zod Schemas

**apps/api/src/modules/clients/clients.schema.ts:**
```typescript
import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').optional(),
  document: z.string().min(11, 'CPF/CNPJ inválido').optional(),
  documentType: z.enum(['CPF', 'CNPJ']).optional(),
  phone: z.string().min(10, 'Telefone inválido').optional(),
});

export const createAddressSchema = z.object({
  label: z.string().optional(),
  street: z.string().min(3, 'Rua é obrigatória'),
  number: z.string().min(1, 'Número é obrigatório'),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().min(2, 'Cidade é obrigatória'),
  state: z.string().length(2, 'Estado deve ter 2 caracteres'),
  zipCode: z.string().min(8, 'CEP inválido'),
  isDefault: z.boolean().default(false),
});

export const updateAddressSchema = createAddressSchema.partial();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
```

### 3. Client Service

**apps/api/src/modules/clients/clients.service.ts:**
```typescript
import { prisma } from '@rotax1/database';
import { NotFoundError } from '../../common/errors/app-error.js';
import type { UpdateProfileInput } from './clients.schema.js';

export class ClientsService {
  async getProfile(userId: string) {
    const client = await prisma.client.findFirst({
      where: { userId },
      include: {
        addresses: {
          orderBy: { isDefault: 'desc' },
        },
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

    if (!client) {
      throw new NotFoundError('Cliente');
    }

    return client;
  }

  async updateProfile(userId: string, data: UpdateProfileInput) {
    const client = await prisma.client.findFirst({
      where: { userId },
    });

    if (!client) {
      throw new NotFoundError('Cliente');
    }

    return prisma.client.update({
      where: { id: client.id },
      data: {
        name: data.name,
        document: data.document,
        documentType: data.documentType,
        ...(data.phone && {
          user: {
            update: { phone: data.phone },
          },
        }),
      },
      include: {
        user: {
          select: { email: true, phone: true },
        },
      },
    });
  }

  async updateProfilePhoto(userId: string, photoUrl: string) {
    const client = await prisma.client.findFirst({
      where: { userId },
    });

    if (!client) {
      throw new NotFoundError('Cliente');
    }

    return prisma.client.update({
      where: { id: client.id },
      data: { profilePhotoUrl: photoUrl },
    });
  }
}

export const clientsService = new ClientsService();
```

### 4. Address Service with Geocoding

**apps/api/src/modules/clients/addresses/addresses.service.ts:**
```typescript
import { prisma } from '@rotax1/database';
import { NotFoundError, ValidationError } from '../../../common/errors/app-error.js';
import { geocodeAddress } from '../../../common/services/geocoding.service.js';
import type { CreateAddressInput, UpdateAddressInput } from '../clients.schema.js';

export class AddressesService {
  async list(clientId: string) {
    return prisma.address.findMany({
      where: { clientId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(clientId: string, data: CreateAddressInput) {
    // Geocode the address
    const fullAddress = `${data.street}, ${data.number}, ${data.city}, ${data.state}, ${data.zipCode}`;
    const coords = await geocodeAddress(fullAddress);

    if (!coords) {
      throw new ValidationError('Não foi possível localizar o endereço');
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { clientId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return prisma.address.create({
      data: {
        clientId,
        ...data,
        lat: coords.lat,
        lng: coords.lng,
      },
    });
  }

  async update(clientId: string, addressId: string, data: UpdateAddressInput) {
    const address = await prisma.address.findFirst({
      where: { id: addressId, clientId },
    });

    if (!address) {
      throw new NotFoundError('Endereço');
    }

    let coords = { lat: address.lat, lng: address.lng };

    // Re-geocode if address changed
    if (data.street || data.number || data.city || data.state || data.zipCode) {
      const fullAddress = `${data.street || address.street}, ${data.number || address.number}, ${data.city || address.city}, ${data.state || address.state}, ${data.zipCode || address.zipCode}`;
      const newCoords = await geocodeAddress(fullAddress);
      if (newCoords) {
        coords = newCoords;
      }
    }

    // Handle default toggle
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { clientId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    return prisma.address.update({
      where: { id: addressId },
      data: {
        ...data,
        lat: coords.lat,
        lng: coords.lng,
      },
    });
  }

  async delete(clientId: string, addressId: string) {
    const address = await prisma.address.findFirst({
      where: { id: addressId, clientId },
    });

    if (!address) {
      throw new NotFoundError('Endereço');
    }

    return prisma.address.delete({
      where: { id: addressId },
    });
  }

  async setDefault(clientId: string, addressId: string) {
    const address = await prisma.address.findFirst({
      where: { id: addressId, clientId },
    });

    if (!address) {
      throw new NotFoundError('Endereço');
    }

    await prisma.address.updateMany({
      where: { clientId, isDefault: true },
      data: { isDefault: false },
    });

    return prisma.address.update({
      where: { id: addressId },
      data: { isDefault: true },
    });
  }
}

export const addressesService = new AddressesService();
```

### 5. Geocoding Service

**apps/api/src/common/services/geocoding.service.ts:**
```typescript
import { config } from '../config/index.js';

interface GeocodingResult {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${config.googleMapsApiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${config.googleMapsApiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      return data.results[0].formatted_address;
    }

    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}
```

### 6. Client Routes

**apps/api/src/modules/clients/clients.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { clientsController } from './clients.controller.js';
import { addressesController } from './addresses/addresses.controller.js';
import { updateProfileSchema, createAddressSchema, updateAddressSchema } from './clients.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';

export async function clientsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // Profile routes
  fastify.get('/me', {
    schema: {
      tags: ['Clients'],
      summary: 'Get current client profile',
      security: [{ bearerAuth: [] }],
    },
    handler: clientsController.getProfile.bind(clientsController),
  });

  fastify.patch('/me', {
    schema: {
      body: zodToJsonSchema(updateProfileSchema),
      tags: ['Clients'],
      summary: 'Update client profile',
      security: [{ bearerAuth: [] }],
    },
    handler: clientsController.updateProfile.bind(clientsController),
  });

  fastify.post('/me/photo', {
    schema: {
      tags: ['Clients'],
      summary: 'Upload profile photo',
      security: [{ bearerAuth: [] }],
    },
    handler: clientsController.uploadPhoto.bind(clientsController),
  });

  // Address routes
  fastify.get('/addresses', {
    schema: {
      tags: ['Addresses'],
      summary: 'List client addresses',
      security: [{ bearerAuth: [] }],
    },
    handler: addressesController.list.bind(addressesController),
  });

  fastify.post('/addresses', {
    schema: {
      body: zodToJsonSchema(createAddressSchema),
      tags: ['Addresses'],
      summary: 'Create new address',
      security: [{ bearerAuth: [] }],
    },
    handler: addressesController.create.bind(addressesController),
  });

  fastify.patch('/addresses/:id', {
    schema: {
      body: zodToJsonSchema(updateAddressSchema),
      tags: ['Addresses'],
      summary: 'Update address',
      security: [{ bearerAuth: [] }],
    },
    handler: addressesController.update.bind(addressesController),
  });

  fastify.delete('/addresses/:id', {
    schema: {
      tags: ['Addresses'],
      summary: 'Delete address',
      security: [{ bearerAuth: [] }],
    },
    handler: addressesController.delete.bind(addressesController),
  });

  fastify.post('/addresses/:id/default', {
    schema: {
      tags: ['Addresses'],
      summary: 'Set address as default',
      security: [{ bearerAuth: [] }],
    },
    handler: addressesController.setDefault.bind(addressesController),
  });
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients/me` | Get client profile |
| PATCH | `/clients/me` | Update profile |
| POST | `/clients/me/photo` | Upload profile photo |
| GET | `/clients/addresses` | List addresses |
| POST | `/clients/addresses` | Create address |
| PATCH | `/clients/addresses/:id` | Update address |
| DELETE | `/clients/addresses/:id` | Delete address |
| POST | `/clients/addresses/:id/default` | Set as default |

---

## Definition of Done

- [ ] All CRUD operations working for profile
- [ ] All CRUD operations working for addresses
- [ ] Geocoding working for new addresses
- [ ] Profile photo upload functional
- [ ] CPF/CNPJ validation implemented
- [ ] Unit tests passing (>70% coverage)
- [ ] Swagger documentation complete

---

## Dependencies

- Story 1.3 (Authentication)
- Story 1.4 (API Base)
- Google Maps API Key configured
