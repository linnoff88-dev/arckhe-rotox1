# Story 4.2: User Management

**Epic:** 4 - Admin Module
**Status:** Ready for Development
**Priority:** P1 - Important
**Estimate:** Medium (4-6 hours)

---

## User Story

**As an** admin,
**I want** to manage clients, drivers and carriers,
**so that** I can control platform access.

---

## Acceptance Criteria

- [ ] 1. Lista de usuários com busca e filtros
- [ ] 2. Paginação server-side com cursor
- [ ] 3. Detalhes do usuário com histórico
- [ ] 4. Aprovar/rejeitar drivers (visualizar documentos)
- [ ] 5. Bloquear/desbloquear usuários
- [ ] 6. Log de ações administrativas
- [ ] 7. Filtros por role, status, data
- [ ] 8. Export de lista de usuários

---

## Technical Implementation

### 1. Module Structure

```
apps/api/src/modules/admin/users/
├── users.controller.ts
├── users.service.ts
├── users.routes.ts
├── users.schema.ts
└── drivers/
    ├── driver-approval.controller.ts
    ├── driver-approval.service.ts
    └── driver-approval.routes.ts
```

### 2. Zod Schemas

**apps/api/src/modules/admin/users/users.schema.ts:**
```typescript
import { z } from 'zod';

export const listUsersSchema = z.object({
  role: z.enum(['CLIENT', 'DRIVER', 'CARRIER', 'ADMIN']).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'BLOCKED']).optional(),
  search: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'name', 'email']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED']),
  reason: z.string().max(500).optional(),
});

export const driverApprovalSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().max(500).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type DriverApprovalInput = z.infer<typeof driverApprovalSchema>;
```

### 3. Admin Users Service

**apps/api/src/modules/admin/users/users.service.ts:**
```typescript
import { prisma, UserRole, UserStatus, DriverStatus } from '@rotax1/database';
import { NotFoundError } from '../../../common/errors/app-error.js';
import { storageService } from '../../../common/services/storage.service.js';
import { queueService } from '../../../common/services/queue.service.js';
import type { ListUsersQuery, UpdateUserStatusInput } from './users.schema.js';

interface UserListItem {
  id: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  createdAt: Date;
  profile: {
    name: string;
    photo: string | null;
  } | null;
}

export class AdminUsersService {
  async listUsers(query: ListUsersQuery, adminId: string) {
    const {
      role,
      status,
      search,
      startDate,
      endDate,
      cursor,
      limit,
      sortBy,
      sortOrder,
    } = query;

    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { driver: { name: { contains: search, mode: 'insensitive' } } },
        { carrier: { companyName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Cursor-based pagination
    const cursorObj = cursor ? { id: cursor } : undefined;

    const users = await prisma.user.findMany({
      where,
      include: {
        client: { select: { name: true, profilePhotoUrl: true } },
        driver: { select: { name: true, profilePhotoUrl: true, status: true } },
        carrier: { select: { companyName: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      take: limit + 1,
      cursor: cursorObj,
      skip: cursor ? 1 : 0,
    });

    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, -1) : users;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const formattedUsers: UserListItem[] = items.map((user) => ({
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      profile: this.getProfile(user),
    }));

    return {
      users: formattedUsers,
      pagination: {
        hasMore,
        nextCursor,
        total: await prisma.user.count({ where }),
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
            orders: {
              take: 10,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                status: true,
                price: true,
                createdAt: true,
              },
            },
          },
        },
        driver: {
          include: {
            documents: true,
            orders: {
              take: 10,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                status: true,
                driverEarning: true,
                createdAt: true,
              },
            },
            ratings: {
              take: 5,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        carrier: {
          include: {
            vehicles: true,
            drivers: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('Usuário');
    }

    // Get admin actions for this user
    const adminActions = await prisma.adminAction.findMany({
      where: { targetId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        admin: { select: { name: true } },
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
      profile: this.getDetailedProfile(user),
      history: adminActions.map((action) => ({
        id: action.id,
        action: action.action,
        details: action.details,
        adminName: action.admin.name,
        createdAt: action.createdAt,
      })),
    };
  }

  async updateUserStatus(
    userId: string,
    data: UpdateUserStatusInput,
    adminId: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('Usuário');
    }

    const previousStatus = user.status;

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { status: data.status as UserStatus },
      }),
      prisma.adminAction.create({
        data: {
          adminId,
          action: 'USER_STATUS_CHANGE',
          targetId: userId,
          targetType: 'USER',
          details: {
            previousStatus,
            newStatus: data.status,
            reason: data.reason,
          },
        },
      }),
    ]);

    // Notify user about status change
    await queueService.addJob('notifications', 'user-status-changed', {
      userId,
      previousStatus,
      newStatus: data.status,
      reason: data.reason,
    });

    return {
      id: updatedUser.id,
      status: updatedUser.status,
    };
  }

  async getDriversForApproval(adminId: string) {
    const drivers = await prisma.driver.findMany({
      where: {
        status: { in: [DriverStatus.PENDING_DOCUMENTS, DriverStatus.PENDING_APPROVAL] },
      },
      include: {
        user: { select: { email: true, phone: true, createdAt: true } },
        documents: {
          select: {
            id: true,
            type: true,
            status: true,
            uploadedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return drivers.map((driver) => ({
      id: driver.id,
      name: driver.name,
      cpf: driver.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4'),
      email: driver.user.email,
      phone: driver.user.phone,
      vehicleType: driver.vehicleType,
      vehiclePlate: driver.vehiclePlate,
      status: driver.status,
      createdAt: driver.createdAt,
      documents: driver.documents,
      documentsComplete: this.checkDocumentsComplete(driver.documents),
    }));
  }

  async getDriverDocuments(driverId: string) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        documents: true,
      },
    });

    if (!driver) {
      throw new NotFoundError('Entregador');
    }

    const documentsWithUrls = await Promise.all(
      driver.documents.map(async (doc) => ({
        id: doc.id,
        type: doc.type,
        status: doc.status,
        uploadedAt: doc.uploadedAt,
        reviewedAt: doc.reviewedAt,
        rejectionReason: doc.rejectionReason,
        downloadUrl: await storageService.getPresignedDownloadUrl(doc.fileUrl),
      }))
    );

    return {
      driver: {
        id: driver.id,
        name: driver.name,
        cpf: driver.cpf,
        cnh: driver.cnh,
        cnhCategory: driver.cnhCategory,
        vehicleType: driver.vehicleType,
        vehiclePlate: driver.vehiclePlate,
        vehicleModel: driver.vehicleModel,
        vehicleYear: driver.vehicleYear,
      },
      documents: documentsWithUrls,
    };
  }

  async approveDriver(driverId: string, adminId: string) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundError('Entregador');
    }

    await prisma.$transaction([
      prisma.driver.update({
        where: { id: driverId },
        data: { status: DriverStatus.APPROVED },
      }),
      prisma.user.update({
        where: { id: driver.userId },
        data: { status: UserStatus.ACTIVE },
      }),
      prisma.adminAction.create({
        data: {
          adminId,
          action: 'DRIVER_APPROVED',
          targetId: driverId,
          targetType: 'DRIVER',
          details: {
            driverName: driver.name,
            vehicleType: driver.vehicleType,
          },
        },
      }),
    ]);

    // Notify driver
    await queueService.addJob('notifications', 'driver-approved', {
      driverId,
      userId: driver.userId,
      email: driver.user.email,
      name: driver.name,
    });

    return { message: 'Entregador aprovado com sucesso' };
  }

  async rejectDriver(driverId: string, reason: string, adminId: string) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundError('Entregador');
    }

    await prisma.$transaction([
      prisma.driver.update({
        where: { id: driverId },
        data: { status: DriverStatus.REJECTED },
      }),
      prisma.adminAction.create({
        data: {
          adminId,
          action: 'DRIVER_REJECTED',
          targetId: driverId,
          targetType: 'DRIVER',
          details: {
            driverName: driver.name,
            reason,
          },
        },
      }),
    ]);

    // Notify driver
    await queueService.addJob('notifications', 'driver-rejected', {
      driverId,
      userId: driver.userId,
      email: driver.user.email,
      name: driver.name,
      reason,
    });

    return { message: 'Entregador rejeitado' };
  }

  async reviewDocument(
    documentId: string,
    approved: boolean,
    rejectionReason: string | undefined,
    adminId: string
  ) {
    const document = await prisma.driverDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundError('Documento');
    }

    await prisma.$transaction([
      prisma.driverDocument.update({
        where: { id: documentId },
        data: {
          status: approved ? 'APPROVED' : 'REJECTED',
          reviewedAt: new Date(),
          reviewedBy: adminId,
          rejectionReason: approved ? null : rejectionReason,
        },
      }),
      prisma.adminAction.create({
        data: {
          adminId,
          action: approved ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
          targetId: documentId,
          targetType: 'DRIVER_DOCUMENT',
          details: {
            driverId: document.driverId,
            documentType: document.type,
            rejectionReason,
          },
        },
      }),
    ]);

    return { message: approved ? 'Documento aprovado' : 'Documento rejeitado' };
  }

  async exportUsers(query: ListUsersQuery, format: 'csv' | 'json') {
    const { users } = await this.listUsers({ ...query, limit: 10000 }, '');

    if (format === 'json') {
      return JSON.stringify(users, null, 2);
    }

    // CSV format
    const headers = ['ID', 'Email', 'Phone', 'Role', 'Status', 'Name', 'Created At'];
    const rows = users.map((u) => [
      u.id,
      u.email,
      u.phone,
      u.role,
      u.status,
      u.profile?.name || '',
      u.createdAt.toISOString(),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  private getProfile(user: any) {
    if (user.client) {
      return { name: user.client.name, photo: user.client.profilePhotoUrl };
    }
    if (user.driver) {
      return { name: user.driver.name, photo: user.driver.profilePhotoUrl };
    }
    if (user.carrier) {
      return { name: user.carrier.companyName, photo: null };
    }
    return null;
  }

  private getDetailedProfile(user: any) {
    if (user.client) {
      return {
        type: 'client',
        name: user.client.name,
        document: user.client.document,
        addresses: user.client.addresses,
        ordersCount: user.client.orders?.length || 0,
        recentOrders: user.client.orders,
      };
    }
    if (user.driver) {
      return {
        type: 'driver',
        name: user.driver.name,
        cpf: user.driver.cpf,
        cnh: user.driver.cnh,
        vehicleType: user.driver.vehicleType,
        vehiclePlate: user.driver.vehiclePlate,
        status: user.driver.status,
        ratingAvg: user.driver.ratingAvg,
        totalDeliveries: user.driver.totalDeliveries,
        documents: user.driver.documents,
        recentOrders: user.driver.orders,
        recentRatings: user.driver.ratings,
      };
    }
    if (user.carrier) {
      return {
        type: 'carrier',
        companyName: user.carrier.companyName,
        cnpj: user.carrier.cnpj,
        vehicles: user.carrier.vehicles,
        drivers: user.carrier.drivers,
      };
    }
    return null;
  }

  private checkDocumentsComplete(documents: any[]): boolean {
    const requiredTypes = ['CNH_FRONT', 'CNH_BACK', 'VEHICLE_DOCUMENT', 'PROFILE_PHOTO'];
    const uploadedTypes = documents.map((d) => d.type);
    return requiredTypes.every((type) => uploadedTypes.includes(type));
  }
}

export const adminUsersService = new AdminUsersService();
```

### 4. Users Routes

**apps/api/src/modules/admin/users/users.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { usersController } from './users.controller.js';
import { authenticate, requireRole } from '../../../common/middlewares/auth.middleware.js';

export async function adminUsersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole('ADMIN'));

  // User list and details
  fastify.get('/', {
    schema: {
      tags: ['Admin Users'],
      summary: 'List users with filters',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.listUsers.bind(usersController),
  });

  fastify.get('/:id', {
    schema: {
      tags: ['Admin Users'],
      summary: 'Get user details',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.getUserDetails.bind(usersController),
  });

  fastify.put('/:id/status', {
    schema: {
      tags: ['Admin Users'],
      summary: 'Update user status',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.updateUserStatus.bind(usersController),
  });

  fastify.get('/export', {
    schema: {
      tags: ['Admin Users'],
      summary: 'Export users list',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.exportUsers.bind(usersController),
  });

  // Driver approval
  fastify.get('/drivers/pending', {
    schema: {
      tags: ['Admin Users'],
      summary: 'List drivers pending approval',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.getDriversForApproval.bind(usersController),
  });

  fastify.get('/drivers/:id/documents', {
    schema: {
      tags: ['Admin Users'],
      summary: 'Get driver documents',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.getDriverDocuments.bind(usersController),
  });

  fastify.put('/drivers/:id/approve', {
    schema: {
      tags: ['Admin Users'],
      summary: 'Approve driver',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.approveDriver.bind(usersController),
  });

  fastify.put('/drivers/:id/reject', {
    schema: {
      tags: ['Admin Users'],
      summary: 'Reject driver',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.rejectDriver.bind(usersController),
  });

  fastify.put('/documents/:id/review', {
    schema: {
      tags: ['Admin Users'],
      summary: 'Review document',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.reviewDocument.bind(usersController),
  });
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List users with filters |
| GET | `/admin/users/:id` | Get user details |
| PUT | `/admin/users/:id/status` | Update user status |
| GET | `/admin/users/export` | Export users list |
| GET | `/admin/users/drivers/pending` | List pending drivers |
| GET | `/admin/users/drivers/:id/documents` | Get driver documents |
| PUT | `/admin/users/drivers/:id/approve` | Approve driver |
| PUT | `/admin/users/drivers/:id/reject` | Reject driver |
| PUT | `/admin/users/documents/:id/review` | Review document |

---

## Query Parameters (List Users)

| Parameter | Type | Description |
|-----------|------|-------------|
| `role` | string | Filter by role |
| `status` | string | Filter by status |
| `search` | string | Search in name/email |
| `startDate` | datetime | Created after |
| `endDate` | datetime | Created before |
| `cursor` | string | Pagination cursor |
| `limit` | number | Items per page (1-100) |
| `sortBy` | string | Sort field |
| `sortOrder` | string | asc or desc |

---

## Driver Approval Flow

```
1. Driver registers and uploads documents
   → Status: PENDING_DOCUMENTS

2. All documents uploaded
   → Status: PENDING_APPROVAL

3. Admin reviews documents
   GET /admin/users/drivers/pending
   GET /admin/users/drivers/:id/documents

4. Admin approves or rejects each document
   PUT /admin/users/documents/:id/review
   { approved: true/false, rejectionReason }

5. Admin approves or rejects driver
   PUT /admin/users/drivers/:id/approve
   PUT /admin/users/drivers/:id/reject

6. Driver notified via email/push
   → Status: APPROVED or REJECTED
```

---

## Audit Log

All admin actions are logged:

| Field | Type | Description |
|-------|------|-------------|
| `adminId` | string | Admin who performed action |
| `action` | string | Action type |
| `targetId` | string | Target entity ID |
| `targetType` | string | Entity type |
| `details` | json | Additional details |
| `createdAt` | datetime | When action occurred |

---

## Definition of Done

- [ ] User list with pagination
- [ ] Search and filters working
- [ ] User details with history
- [ ] Driver approval flow
- [ ] Document review with presigned URLs
- [ ] Status changes logged
- [ ] Notifications sent
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Story 4.1 (Admin Authentication)
- Story 3.1 (Driver Registration)
