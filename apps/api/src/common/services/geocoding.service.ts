import { config } from '../config/index.js';

interface GeocodingResult {
  lat: number;
  lng: number;
  formattedAddress?: string;
}

export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  // If no API key, use a fallback for development
  if (!config.googleMapsApiKey) {
    console.warn('Google Maps API key not configured, using fallback coordinates');
    // Return approximate center of Sao Paulo for development
    return {
      lat: -23.5505,
      lng: -46.6333,
      formattedAddress: address,
    };
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${config.googleMapsApiKey}&region=br`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: data.results[0].formatted_address,
      };
    }

    console.error('Geocoding failed:', data.status, data.error_message);
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!config.googleMapsApiKey) {
    console.warn('Google Maps API key not configured');
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${config.googleMapsApiKey}&region=br`;

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

export async function calculateDistance(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{ distanceKm: number; durationMinutes: number } | null> {
  if (!config.googleMapsApiKey) {
    // Fallback: calculate straight-line distance using Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
    const dLng = ((destination.lng - origin.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((origin.lat * Math.PI) / 180) *
        Math.cos((destination.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;

    // Estimate duration: 30 km/h average speed in urban areas
    const durationMinutes = (distanceKm / 30) * 60;

    return { distanceKm, durationMinutes };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${destination.lat},${destination.lng}&key=${config.googleMapsApiKey}&mode=driving`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      const element = data.rows[0].elements[0];
      return {
        distanceKm: element.distance.value / 1000,
        durationMinutes: element.duration.value / 60,
      };
    }

    return null;
  } catch (error) {
    console.error('Distance calculation error:', error);
    return null;
  }
}
