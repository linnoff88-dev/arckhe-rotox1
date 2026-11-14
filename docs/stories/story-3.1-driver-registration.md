# Story 3.1: Driver Registration & Document Upload

**Epic:** 3 - Driver Module
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Medium (4-6 hours)

---

## User Story

**As a** driver,
**I want** to register and upload my documents,
**so that** I can be approved to make deliveries.

---

## Acceptance Criteria

- [ ] 1. Endpoint POST /auth/register com role DRIVER
- [ ] 2. Endpoint POST /drivers/documents para upload de documentos
- [ ] 3. Upload de CNH, documento do veículo, foto de perfil
- [ ] 4. Validação de tipo (JPG, PNG, PDF) e tamanho (max 5MB)
- [ ] 5. Status PENDING_APPROVAL após cadastro completo
- [ ] 6. Armazenamento em R2/S3 com URLs assinadas
- [ ] 7. Endpoint GET /drivers/me com dados completos
- [ ] 8. Notificação para admin sobre novo cadastro

---

## Technical Implementation

### 1. Driver Module Structure

```
apps/api/src/modules/drivers/
├── drivers.controller.ts
├── drivers.service.ts
├── drivers.routes.ts
├── drivers.schema.ts
├── drivers.errors.ts
└── documents/
    ├── documents.controller.ts
    ├── documents.service.ts
    └── documents.schema.ts
```

### 2. Zod Schemas

**apps/api/src/modules/drivers/drivers.schema.ts:**
```typescript
import { z } from 'zod';

export const driverRegisterSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  phone: z.string().min(10, 'Telefone inválido'),
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  cpf: z.string().length(11, 'CPF deve ter 11 dígitos'),
  cnh: z.string().min(9, 'CNH inválida'),
  cnhCategory: z.enum(['A', 'B', 'AB', 'C', 'D', 'E']),
  vehicleType: z.enum(['MOTORCYCLE', 'CAR', 'VAN', 'TRUCK']),
  vehiclePlate: z.string().min(7, 'Placa inválida'),
  vehicleModel: z.string().optional(),
  vehicleYear: z.number().min(2000).max(new Date().getFullYear() + 1).optional(),
});

export const updateDriverSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(10).optional(),
  vehicleType: z.enum(['MOTORCYCLE', 'CAR', 'VAN', 'TRUCK']).optional(),
  vehiclePlate: z.string().min(7).optional(),
  vehicleModel: z.string().optional(),
  vehicleYear: z.number().optional(),
  bankName: z.string().optional(),
  bankAgency: z.string().optional(),
  bankAccount: z.string().optional(),
  pixKey: z.string().optional(),
});

export type DriverRegisterInput = z.infer<typeof driverRegisterSchema>;
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>;
```

### 3. Document Schemas

**apps/api/src/modules/drivers/documents/documents.schema.ts:**
```typescript
import { z } from 'zod';

export const documentTypeSchema = z.enum([
  'CNH_FRONT',
  'CNH_BACK',
  'VEHICLE_DOCUMENT',
  'PROFILE_PHOTO',
  'PROOF_OF_RESIDENCE',
]);

export const uploadDocumentSchema = z.object({
  type: documentTypeSchema,
});

export type DocumentType = z.infer<typeof documentTypeSchema>;
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
```

### 4. Driver Service

**apps/api/src/modules/drivers/drivers.service.ts:**
```typescript
import { prisma, UserRole, UserStatus, DriverStatus } from '@rotax1/database';
import { ConflictError, NotFoundError, ForbiddenError } from '../../common/errors/app-error.js';
import { hashPassword } from '../../common/utils/password.js';
import type { DriverRegisterInput, UpdateDriverInput } from './drivers.schema.js';
import { queueService } from '../../common/services/queue.service.js';

export class DriversService {
  async register(data: DriverRegisterInput) {
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError('Email já cadastrado');
    }

    // Check if CPF already exists
    const existingDriver = await prisma.driver.findFirst({
      where: { cpf: data.cpf },
    });

    if (existingDriver) {
      throw new ConflictError('CPF já cadastrado');
    }

    // Create user and driver in transaction
    const result = await prisma.$transaction(async (tx) => {
      const passwordHash = await hashPassword(data.password);

      const user = await tx.user.create({
        data: {
          email: data.email,
          phone: data.phone,
          passwordHash,
          role: UserRole.DRIVER,
          status: UserStatus.PENDING,
        },
      });

      const driver = await tx.driver.create({
        data: {
          userId: user.id,
          name: data.name,
          cpf: data.cpf,
          cnh: data.cnh,
          cnhCategory: data.cnhCategory,
          vehicleType: data.vehicleType,
          vehiclePlate: data.vehiclePlate,
          vehicleModel: data.vehicleModel,
          vehicleYear: data.vehicleYear,
          status: DriverStatus.PENDING_DOCUMENTS,
        },
      });

      return { user, driver };
    });

    // Notify admin about new driver registration
    await queueService.addJob('notifications', 'new-driver-registration', {
      driverId: result.driver.id,
      driverName: result.driver.name,
      email: result.user.email,
    });

    return {
      id: result.driver.id,
      userId: result.user.id,
      name: result.driver.name,
      email: result.user.email,
      status: result.driver.status,
    };
  }

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
        documents: {
          select: {
            id: true,
            type: true,
            status: true,
            uploadedAt: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundError('Entregador');
    }

    return {
      id: driver.id,
      name: driver.name,
      cpf: driver.cpf,
      cnh: driver.cnh,
      cnhCategory: driver.cnhCategory,
      status: driver.status,
      vehicleType: driver.vehicleType,
      vehiclePlate: driver.vehiclePlate,
      vehicleModel: driver.vehicleModel,
      vehicleYear: driver.vehicleYear,
      profilePhotoUrl: driver.profilePhotoUrl,
      ratingAvg: driver.ratingAvg,
      ratingCount: driver.ratingCount,
      totalDeliveries: driver.totalDeliveries,
      isOnline: driver.isOnline,
      bankInfo: {
        bankName: driver.bankName,
        bankAgency: driver.bankAgency,
        bankAccount: driver.bankAccount,
        pixKey: driver.pixKey,
      },
      user: driver.user,
      documents: driver.documents,
    };
  }

  async updateProfile(userId: string, data: UpdateDriverInput) {
    const driver = await prisma.driver.findFirst({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundError('Entregador');
    }

    return prisma.driver.update({
      where: { id: driver.id },
      data: {
        name: data.name,
        vehicleType: data.vehicleType,
        vehiclePlate: data.vehiclePlate,
        vehicleModel: data.vehicleModel,
        vehicleYear: data.vehicleYear,
        bankName: data.bankName,
        bankAgency: data.bankAgency,
        bankAccount: data.bankAccount,
        pixKey: data.pixKey,
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

  async updateStatus(driverId: string, status: DriverStatus, adminId: string) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundError('Entregador');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update driver status
      const updatedDriver = await tx.driver.update({
        where: { id: driverId },
        data: { status },
      });

      // If approved, activate user account
      if (status === DriverStatus.APPROVED) {
        await tx.user.update({
          where: { id: driver.userId },
          data: { status: UserStatus.ACTIVE },
        });
      }

      // Log admin action
      await tx.adminAction.create({
        data: {
          adminId,
          action: `DRIVER_STATUS_CHANGE`,
          targetId: driverId,
          targetType: 'DRIVER',
          details: {
            previousStatus: driver.status,
            newStatus: status,
          },
        },
      });

      return updatedDriver;
    });

    // Notify driver about status change
    await queueService.addJob('notifications', 'driver-status-changed', {
      driverId: driver.id,
      userId: driver.userId,
      newStatus: status,
      email: driver.user.email,
    });

    return result;
  }
}

export const driversService = new DriversService();
```

### 5. Document Service with R2/S3 Upload

**apps/api/src/modules/drivers/documents/documents.service.ts:**
```typescript
import { prisma, DocumentStatus } from '@rotax1/database';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../common/errors/app-error.js';
import { storageService } from '../../../common/services/storage.service.js';
import type { DocumentType } from './documents.schema.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export class DocumentsService {
  async getUploadUrl(driverId: string, type: DocumentType, mimeType: string) {
    // Validate mime type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new ValidationError('Tipo de arquivo não permitido. Use JPG, PNG ou PDF');
    }

    const extension = this.getExtension(mimeType);
    const key = `drivers/${driverId}/documents/${type}.${extension}`;

    // Generate presigned upload URL
    const uploadUrl = await storageService.getPresignedUploadUrl(key, mimeType, MAX_FILE_SIZE);

    return {
      uploadUrl,
      key,
      expiresIn: 3600, // 1 hour
    };
  }

  async confirmUpload(driverId: string, type: DocumentType, key: string) {
    // Verify file exists in storage
    const exists = await storageService.fileExists(key);
    if (!exists) {
      throw new ValidationError('Arquivo não encontrado. Faça o upload novamente');
    }

    // Check if document already exists
    const existingDoc = await prisma.driverDocument.findFirst({
      where: { driverId, type },
    });

    if (existingDoc) {
      // Update existing document
      return prisma.driverDocument.update({
        where: { id: existingDoc.id },
        data: {
          fileUrl: key,
          status: DocumentStatus.PENDING_REVIEW,
          uploadedAt: new Date(),
        },
      });
    }

    // Create new document record
    const document = await prisma.driverDocument.create({
      data: {
        driverId,
        type,
        fileUrl: key,
        status: DocumentStatus.PENDING_REVIEW,
      },
    });

    // Check if all required documents are uploaded
    await this.checkDocumentsComplete(driverId);

    return document;
  }

  async getDocuments(driverId: string) {
    const documents = await prisma.driverDocument.findMany({
      where: { driverId },
      orderBy: { uploadedAt: 'desc' },
    });

    // Generate presigned download URLs for each document
    const docsWithUrls = await Promise.all(
      documents.map(async (doc) => ({
        id: doc.id,
        type: doc.type,
        status: doc.status,
        uploadedAt: doc.uploadedAt,
        downloadUrl: await storageService.getPresignedDownloadUrl(doc.fileUrl),
        rejectionReason: doc.rejectionReason,
      }))
    );

    return docsWithUrls;
  }

  async reviewDocument(
    documentId: string,
    adminId: string,
    approved: boolean,
    rejectionReason?: string
  ) {
    const document = await prisma.driverDocument.findUnique({
      where: { id: documentId },
      include: { driver: true },
    });

    if (!document) {
      throw new NotFoundError('Documento');
    }

    const newStatus = approved ? DocumentStatus.APPROVED : DocumentStatus.REJECTED;

    const result = await prisma.$transaction(async (tx) => {
      // Update document status
      const updatedDoc = await tx.driverDocument.update({
        where: { id: documentId },
        data: {
          status: newStatus,
          reviewedAt: new Date(),
          reviewedBy: adminId,
          rejectionReason: approved ? null : rejectionReason,
        },
      });

      // Log admin action
      await tx.adminAction.create({
        data: {
          adminId,
          action: 'DOCUMENT_REVIEW',
          targetId: documentId,
          targetType: 'DRIVER_DOCUMENT',
          details: {
            driverId: document.driverId,
            documentType: document.type,
            approved,
            rejectionReason,
          },
        },
      });

      return updatedDoc;
    });

    // Check if all documents are approved
    if (approved) {
      await this.checkAllDocumentsApproved(document.driverId);
    }

    return result;
  }

  private async checkDocumentsComplete(driverId: string) {
    const requiredTypes = ['CNH_FRONT', 'CNH_BACK', 'VEHICLE_DOCUMENT', 'PROFILE_PHOTO'];

    const documents = await prisma.driverDocument.findMany({
      where: { driverId },
    });

    const uploadedTypes = documents.map((d) => d.type);
    const allUploaded = requiredTypes.every((type) => uploadedTypes.includes(type));

    if (allUploaded) {
      await prisma.driver.update({
        where: { id: driverId },
        data: { status: 'PENDING_APPROVAL' },
      });
    }
  }

  private async checkAllDocumentsApproved(driverId: string) {
    const documents = await prisma.driverDocument.findMany({
      where: { driverId },
    });

    const requiredTypes = ['CNH_FRONT', 'CNH_BACK', 'VEHICLE_DOCUMENT', 'PROFILE_PHOTO'];
    const allApproved = requiredTypes.every((type) => {
      const doc = documents.find((d) => d.type === type);
      return doc && doc.status === DocumentStatus.APPROVED;
    });

    if (allApproved) {
      await prisma.driver.update({
        where: { id: driverId },
        data: { status: 'APPROVED' },
      });

      await prisma.user.update({
        where: { id: (await prisma.driver.findUnique({ where: { id: driverId } }))!.userId },
        data: { status: 'ACTIVE' },
      });
    }
  }

  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'application/pdf': 'pdf',
    };
    return map[mimeType] || 'bin';
  }
}

export const documentsService = new DocumentsService();
```

### 6. Storage Service (R2/S3)

**apps/api/src/common/services/storage.service.ts:**
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';

export class StorageService {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.r2.endpoint,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    });
    this.bucket = config.r2.bucket;
  }

  async getPresignedUploadUrl(key: string, contentType: string, maxSize: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  async getPresignedDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}

export const storageService = new StorageService();
```

### 7. Driver Routes

**apps/api/src/modules/drivers/drivers.routes.ts:**
```typescript
import type { FastifyInstance } from 'fastify';
import { driversController } from './drivers.controller.js';
import { documentsController } from './documents/documents.controller.js';
import { driverRegisterSchema, updateDriverSchema } from './drivers.schema.js';
import { uploadDocumentSchema } from './documents/documents.schema.js';
import { zodToJsonSchema } from '../../common/utils/zod-to-json.js';
import { authenticate, requireRole } from '../../common/middlewares/auth.middleware.js';

export async function driversRoutes(fastify: FastifyInstance): Promise<void> {
  // Public registration route
  fastify.post('/register', {
    schema: {
      body: zodToJsonSchema(driverRegisterSchema),
      tags: ['Drivers'],
      summary: 'Register as a driver',
    },
    handler: driversController.register.bind(driversController),
  });

  // Authenticated routes
  fastify.register(async (authRoutes) => {
    authRoutes.addHook('preHandler', authenticate);

    // Driver profile
    authRoutes.get('/me', {
      schema: {
        tags: ['Drivers'],
        summary: 'Get driver profile',
        security: [{ bearerAuth: [] }],
      },
      handler: driversController.getProfile.bind(driversController),
    });

    authRoutes.patch('/me', {
      schema: {
        body: zodToJsonSchema(updateDriverSchema),
        tags: ['Drivers'],
        summary: 'Update driver profile',
        security: [{ bearerAuth: [] }],
      },
      handler: driversController.updateProfile.bind(driversController),
    });

    // Document routes
    authRoutes.get('/documents', {
      schema: {
        tags: ['Documents'],
        summary: 'List driver documents',
        security: [{ bearerAuth: [] }],
      },
      handler: documentsController.list.bind(documentsController),
    });

    authRoutes.post('/documents/upload-url', {
      schema: {
        body: zodToJsonSchema(uploadDocumentSchema),
        tags: ['Documents'],
        summary: 'Get presigned upload URL',
        security: [{ bearerAuth: [] }],
      },
      handler: documentsController.getUploadUrl.bind(documentsController),
    });

    authRoutes.post('/documents/confirm', {
      schema: {
        tags: ['Documents'],
        summary: 'Confirm document upload',
        security: [{ bearerAuth: [] }],
      },
      handler: documentsController.confirmUpload.bind(documentsController),
    });
  });
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/drivers/register` | Register as driver |
| GET | `/drivers/me` | Get driver profile |
| PATCH | `/drivers/me` | Update profile |
| GET | `/drivers/documents` | List documents |
| POST | `/drivers/documents/upload-url` | Get upload URL |
| POST | `/drivers/documents/confirm` | Confirm upload |

---

## Document Upload Flow

```
1. Client requests upload URL
   POST /drivers/documents/upload-url { type: "CNH_FRONT" }

2. Server returns presigned URL
   { uploadUrl, key, expiresIn }

3. Client uploads directly to R2/S3
   PUT {uploadUrl} [file binary]

4. Client confirms upload
   POST /drivers/documents/confirm { type: "CNH_FRONT", key }

5. Server verifies and creates document record
```

---

## Definition of Done

- [ ] Driver registration endpoint working
- [ ] Document upload with presigned URLs
- [ ] All document types supported
- [ ] File validation (type, size)
- [ ] Status transitions correct
- [ ] Admin notification sent
- [ ] Unit tests (>70% coverage)

---

## Dependencies

- Epic 1 complete
- Cloudflare R2 or AWS S3 configured
- BullMQ for notifications

---

## Environment Variables

```bash
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET=rotax1-documents
```
