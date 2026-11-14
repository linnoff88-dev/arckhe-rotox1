import { prisma } from '@rotax1/database';
import { NotFoundError, ValidationError } from '../../../common/errors/app-error.js';
import { geocodeAddress } from '../../../common/services/geocoding.service.js';
import type { CreateAddressInput, UpdateAddressInput } from '../clients.schema.js';

export class AddressesService {
  async list(clientId: string) {
    const addresses = await prisma.address.findMany({
      where: { clientId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses.map((addr) => ({
      ...addr,
      lat: Number(addr.lat),
      lng: Number(addr.lng),
    }));
  }

  async getById(clientId: string, addressId: string) {
    const address = await prisma.address.findFirst({
      where: { id: addressId, clientId },
    });

    if (!address) {
      throw new NotFoundError('Endereço');
    }

    return {
      ...address,
      lat: Number(address.lat),
      lng: Number(address.lng),
    };
  }

  async create(clientId: string, data: CreateAddressInput) {
    // Geocode the address
    const fullAddress = `${data.street}, ${data.number}, ${data.neighborhood || ''}, ${data.city}, ${data.state}, ${data.zipCode}, Brasil`;
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

    const address = await prisma.address.create({
      data: {
        clientId,
        label: data.label,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        lat: coords.lat,
        lng: coords.lng,
        isDefault: data.isDefault,
      },
    });

    return {
      ...address,
      lat: Number(address.lat),
      lng: Number(address.lng),
    };
  }

  async update(clientId: string, addressId: string, data: UpdateAddressInput) {
    const address = await prisma.address.findFirst({
      where: { id: addressId, clientId },
    });

    if (!address) {
      throw new NotFoundError('Endereço');
    }

    let lat = Number(address.lat);
    let lng = Number(address.lng);

    // Re-geocode if address fields changed
    if (data.street || data.number || data.city || data.state || data.zipCode) {
      const fullAddress = `${data.street || address.street}, ${data.number || address.number}, ${data.neighborhood || address.neighborhood || ''}, ${data.city || address.city}, ${data.state || address.state}, ${data.zipCode || address.zipCode}, Brasil`;
      const newCoords = await geocodeAddress(fullAddress);
      if (newCoords) {
        lat = newCoords.lat;
        lng = newCoords.lng;
      }
    }

    // Handle default toggle
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { clientId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.address.update({
      where: { id: addressId },
      data: {
        ...data,
        lat,
        lng,
      },
    });

    return {
      ...updated,
      lat: Number(updated.lat),
      lng: Number(updated.lng),
    };
  }

  async delete(clientId: string, addressId: string) {
    const address = await prisma.address.findFirst({
      where: { id: addressId, clientId },
    });

    if (!address) {
      throw new NotFoundError('Endereço');
    }

    await prisma.address.delete({
      where: { id: addressId },
    });

    return { success: true };
  }

  async setDefault(clientId: string, addressId: string) {
    const address = await prisma.address.findFirst({
      where: { id: addressId, clientId },
    });

    if (!address) {
      throw new NotFoundError('Endereço');
    }

    // Unset all other defaults
    await prisma.address.updateMany({
      where: { clientId, isDefault: true },
      data: { isDefault: false },
    });

    // Set this one as default
    const updated = await prisma.address.update({
      where: { id: addressId },
      data: { isDefault: true },
    });

    return {
      ...updated,
      lat: Number(updated.lat),
      lng: Number(updated.lng),
    };
  }
}

export const addressesService = new AddressesService();
