import { OrderCategory, OrderUrgency } from '@rotax1/database';

interface PricingConfig {
  basePrice: number;
  pricePerKm: number;
  categoryMultipliers: Record<string, number>;
  urgencyMultipliers: Record<string, number>;
  platformFeePercent: number;
  minimumPrice: number;
  maximumPrice: number;
}

const DEFAULT_CONFIG: PricingConfig = {
  basePrice: 8.00,
  pricePerKm: 2.50,
  categoryMultipliers: {
    VETERINARY: 1.0,
    FROZEN: 1.3, // 30% extra for refrigerated
    GENERAL: 1.0,
  },
  urgencyMultipliers: {
    STANDARD: 1.0,
    EXPRESS: 1.5, // 50% extra for express
  },
  platformFeePercent: 20, // 20% platform fee
  minimumPrice: 10.00,
  maximumPrice: 200.00,
};

export interface PriceCalculation {
  basePrice: number;
  distancePrice: number;
  categoryMultiplier: number;
  urgencyMultiplier: number;
  subtotal: number;
  platformFee: number;
  total: number;
  driverEarning: number;
  distanceKm: number;
  estimatedMinutes: number;
}

export function calculateOrderPrice(
  distanceKm: number,
  estimatedMinutes: number,
  category: OrderCategory | string,
  urgency: OrderUrgency | string,
  config: PricingConfig = DEFAULT_CONFIG
): PriceCalculation {
  const categoryKey = String(category);
  const urgencyKey = String(urgency);

  // Get multipliers
  const categoryMultiplier = config.categoryMultipliers[categoryKey] || 1.0;
  const urgencyMultiplier = config.urgencyMultipliers[urgencyKey] || 1.0;

  // Calculate distance price
  const distancePrice = distanceKm * config.pricePerKm;

  // Calculate subtotal (before multipliers)
  const baseTotal = config.basePrice + distancePrice;

  // Apply multipliers
  const subtotal = baseTotal * categoryMultiplier * urgencyMultiplier;

  // Apply min/max bounds
  const boundedSubtotal = Math.min(
    Math.max(subtotal, config.minimumPrice),
    config.maximumPrice
  );

  // Calculate platform fee
  const platformFee = boundedSubtotal * (config.platformFeePercent / 100);

  // Round to 2 decimal places
  const total = Math.round(boundedSubtotal * 100) / 100;
  const driverEarning = Math.round((boundedSubtotal - platformFee) * 100) / 100;

  return {
    basePrice: config.basePrice,
    distancePrice: Math.round(distancePrice * 100) / 100,
    categoryMultiplier,
    urgencyMultiplier,
    subtotal: Math.round(subtotal * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    total,
    driverEarning,
    distanceKm: Math.round(distanceKm * 100) / 100,
    estimatedMinutes: Math.round(estimatedMinutes),
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}
