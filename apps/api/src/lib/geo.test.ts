import assert from 'node:assert';
import { haversineDistanceKm, isWithinRadiusKm, isValidCoordinate, getCoordinateCentroid } from './geo.ts';
import type { Coordinate } from './geo.ts';

const nyc: Coordinate = { latitude: 40.7128, longitude: -74.0060 };
const london: Coordinate = { latitude: 51.5074, longitude: -0.1278 };
const paris: Coordinate = { latitude: 48.8566, longitude: 2.3522 };

console.log('Running tests for geo.ts...');

// Test isValidCoordinate
assert.strictEqual(isValidCoordinate(40.7128, -74.0060), true, 'Valid coordinate should be true');
assert.strictEqual(isValidCoordinate(91, 0), false, 'Latitude > 90 should be false');
assert.strictEqual(isValidCoordinate(-91, 0), false, 'Latitude < -90 should be false');
assert.strictEqual(isValidCoordinate(0, 181), false, 'Longitude > 180 should be false');
assert.strictEqual(isValidCoordinate(0, -181), false, 'Longitude < -180 should be false');
assert.strictEqual(isValidCoordinate(null, 0), false, 'Null latitude should be false');

// Test haversineDistanceKm
// NYC to London is approx 5570 km
const distNycLondon = haversineDistanceKm(nyc, london);
assert.ok(Math.abs(distNycLondon - 5570) < 50, 'NYC to London distance');

// Test isWithinRadiusKm
assert.strictEqual(isWithinRadiusKm(nyc, nyc, 1), true, 'Same point should be within radius');
assert.strictEqual(isWithinRadiusKm(london, paris, 400), true, 'London and Paris are within 400km');
assert.strictEqual(isWithinRadiusKm(london, paris, 300), false, 'London and Paris are not within 300km');
assert.strictEqual(isWithinRadiusKm(nyc, london, 5600), true, 'NYC and London are within 5600km');
assert.strictEqual(isWithinRadiusKm(nyc, london, 5500), false, 'NYC and London are not within 5500km');

// Boundary conditions for isWithinRadiusKm
const radius = haversineDistanceKm(nyc, london);
assert.strictEqual(isWithinRadiusKm(nyc, london, radius), true, 'Distance exactly equal to radius should be true');
assert.strictEqual(isWithinRadiusKm(nyc, london, radius + 0.001), true, 'Distance slightly more than radius should be true');
assert.strictEqual(isWithinRadiusKm(nyc, london, radius - 0.001), false, 'Distance slightly less than radius should be false');

// Test getCoordinateCentroid
const centroid = getCoordinateCentroid([nyc, london, paris]);
if (centroid) {
  assert.ok(Math.abs(centroid.latitude - (nyc.latitude + london.latitude + paris.latitude) / 3) < 0.0001, 'Centroid latitude');
  assert.ok(Math.abs(centroid.longitude - (nyc.longitude + london.longitude + paris.longitude) / 3) < 0.0001, 'Centroid longitude');
} else {
  assert.fail('Centroid should not be null');
}
assert.strictEqual(getCoordinateCentroid([]), null, 'Centroid of empty list should be null');

console.log('All tests passed!');
