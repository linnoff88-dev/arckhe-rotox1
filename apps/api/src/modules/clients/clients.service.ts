import { prisma } from '@rotax1/database';
import { NotFoundError } from '../../common/errors/app-error.js';
import type { UpdateProfileInput } from './clients.schema.js';

export class ClientsService {
  async getProfile(userId: string) {
    const client = await prisma.client.findFirst({
      where: { userId },
      include: {
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
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

    return {
      ...client,
      addresses: client.addresses.map((addr) => ({
        ...addr,
        lat: Number(addr.lat),
        lng: Number(addr.lng),
      })),
    };
  }

  async updateProfile(userId: string, data: UpdateProfileInput) {
    const client = await prisma.client.findFirst({
      where: { userId },
    });

    if (!client) {
      throw new NotFoundError('Cliente');
    }

    // Determine document type if document is provided
    let documentType = data.documentType;
    if (data.document && !documentType) {
      documentType = data.document.length === 11 ? 'CPF' : 'CNPJ';
    }

    return prisma.client.update({
      where: { id: client.id },
      data: {
        name: data.name,
        document: data.document,
        documentType,
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

  async getClientIdByUserId(userId: string): Promise<string> {
    const client = await prisma.client.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (!client) {
      throw new NotFoundError('Cliente');
    }

    return client.id;
  }
}

export const clientsService = new ClientsService();
