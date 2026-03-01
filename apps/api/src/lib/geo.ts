export type Coordinate = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function isValidCoordinate(
  latitude?: number | null,
  longitude?: number | null,
): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function haversineDistanceKm(a: Coordinate, b: Coordinate) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function isWithinRadiusKm(
  from: Coordinate,
  to: Coordinate,
  radiusKm: number,
) {
  return haversineDistanceKm(from, to) <= radiusKm;
}

export function getCoordinateCentroid(points: Coordinate[]): Coordinate | null {
  if (points.length === 0) return null;

  const total = points.reduce(
    (acc, point) => {
      acc.latitude += point.latitude;
      acc.longitude += point.longitude;
      return acc;
    },
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: total.latitude / points.length,
    longitude: total.longitude / points.length,
  };
}
