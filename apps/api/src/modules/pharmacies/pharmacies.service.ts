import { prisma } from '@rotax1/database';
import { NotFoundError } from '../../common/errors/app-error.js';
import type { SearchPharmaciesQuery } from './pharmacies.schema.js';

interface OpeningHours {
  [key: string]: { open: string; close: string } | null;
}

export class PharmaciesService {
  // Check if pharmacy is currently open
  private isPharmacyOpen(openingHours: OpeningHours | null): boolean {
    if (!openingHours) return true; // Assume open if no hours specified

    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    const todayHours = openingHours[dayOfWeek];
    if (!todayHours) return false;

    return currentTime >= todayHours.open && currentTime <= todayHours.close;
  }

  // Calculate distance between two points (Haversine formula)
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async search(query: SearchPharmaciesQuery) {
    const { lat, lng, city, radius, page, limit, expressOnly } = query;

    // Build where clause
    const where: any = {
      isActive: true,
    };

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (expressOnly) {
      where.acceptsExpress = true;
    }

    // Fetch pharmacies
    let pharmacies = await prisma.pharmacy.findMany({
      where,
      orderBy: [{ rating: 'desc' }, { name: 'asc' }],
    });

    // If lat/lng provided, filter by distance and sort by proximity
    if (lat !== undefined && lng !== undefined) {
      pharmacies = pharmacies
        .map((pharmacy) => ({
          ...pharmacy,
          distance: this.calculateDistance(
            lat,
            lng,
            Number(pharmacy.lat),
            Number(pharmacy.lng)
          ),
        }))
        .filter((p) => p.distance <= radius)
        .sort((a, b) => a.distance - b.distance);
    }

    // Paginate
    const total = pharmacies.length;
    const paginatedPharmacies = pharmacies.slice((page - 1) * limit, page * limit);

    // Transform response
    const results = paginatedPharmacies.map((pharmacy) => ({
      id: pharmacy.id,
      name: pharmacy.name,
      tradeName: pharmacy.tradeName,
      phone: pharmacy.phone,
      logoUrl: pharmacy.logoUrl,
      address: {
        street: pharmacy.street,
        number: pharmacy.number,
        complement: pharmacy.complement,
        neighborhood: pharmacy.neighborhood,
        city: pharmacy.city,
        state: pharmacy.state,
        zipCode: pharmacy.zipCode,
      },
      lat: Number(pharmacy.lat),
      lng: Number(pharmacy.lng),
      distance: 'distance' in pharmacy ? pharmacy.distance : undefined,
      isOpen: this.isPharmacyOpen(pharmacy.openingHours as OpeningHours | null),
      acceptsExpress: pharmacy.acceptsExpress,
      rating: Number(pharmacy.rating),
      ratingCount: pharmacy.ratingCount,
      openingHours: pharmacy.openingHours,
    }));

    return {
      pharmacies: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string) {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id },
    });

    if (!pharmacy || !pharmacy.isActive) {
      throw new NotFoundError('Farmácia');
    }

    return {
      id: pharmacy.id,
      name: pharmacy.name,
      tradeName: pharmacy.tradeName,
      cnpj: pharmacy.cnpj,
      phone: pharmacy.phone,
      email: pharmacy.email,
      logoUrl: pharmacy.logoUrl,
      address: {
        street: pharmacy.street,
        number: pharmacy.number,
        complement: pharmacy.complement,
        neighborhood: pharmacy.neighborhood,
        city: pharmacy.city,
        state: pharmacy.state,
        zipCode: pharmacy.zipCode,
      },
      lat: Number(pharmacy.lat),
      lng: Number(pharmacy.lng),
      isOpen: this.isPharmacyOpen(pharmacy.openingHours as OpeningHours | null),
      acceptsExpress: pharmacy.acceptsExpress,
      rating: Number(pharmacy.rating),
      ratingCount: pharmacy.ratingCount,
      openingHours: pharmacy.openingHours,
    };
  }

  async getNearby(lat: number, lng: number, limit = 5) {
    const pharmacies = await prisma.pharmacy.findMany({
      where: { isActive: true },
    });

    return pharmacies
      .map((pharmacy) => ({
        id: pharmacy.id,
        name: pharmacy.name,
        lat: Number(pharmacy.lat),
        lng: Number(pharmacy.lng),
        distance: this.calculateDistance(lat, lng, Number(pharmacy.lat), Number(pharmacy.lng)),
        isOpen: this.isPharmacyOpen(pharmacy.openingHours as OpeningHours | null),
        acceptsExpress: pharmacy.acceptsExpress,
      }))
      .filter((p) => p.distance <= 20) // Max 20km
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }
}

export const pharmaciesService = new PharmaciesService();
