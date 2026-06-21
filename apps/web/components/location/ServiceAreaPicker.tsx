"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

type ServiceAreaValues = {
  locationAddress?: string;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm?: number;
};

type Props = {
  value: ServiceAreaValues;
  onChange: (next: ServiceAreaValues) => void;
  title?: string;
  error?: string;
};

const DEFAULT_CENTER = {
  latitude: 20.5937,
  longitude: 78.9629,
};

const ServiceAreaLeafletMap = dynamic(() => import("./ServiceAreaLeafletMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center bg-sunk text-ink-faint"
      style={{ width: "100%", height: 300, borderRadius: 14, fontSize: 13 }}
    >
      Loading map…
    </div>
  ),
});

export function ServiceAreaPicker({
  value,
  onChange,
  title = "Service Area",
  error,
}: Props) {
  const [locating, setLocating] = useState(false);
  const [lookupState, setLookupState] = useState("");

  const latitude =
    typeof value.latitude === "number"
      ? value.latitude
      : DEFAULT_CENTER.latitude;
  const longitude =
    typeof value.longitude === "number"
      ? value.longitude
      : DEFAULT_CENTER.longitude;
  const radiusKm =
    typeof value.serviceRadiusKm === "number" && value.serviceRadiusKm > 0
      ? value.serviceRadiusKm
      : 25;

  const hasLocation =
    typeof value.latitude === "number" && typeof value.longitude === "number";

  const coordinateLabel = useMemo(() => {
    if (!hasLocation) return "No location selected yet";
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }, [hasLocation, latitude, longitude]);

  async function reverseGeocode(latitude: number, longitude: number) {
    try {
      setLookupState("Resolving address...");
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2`,
      );
      if (!response.ok) {
        setLookupState("");
        return undefined;
      }
      const data = (await response.json()) as { display_name?: string };
      setLookupState("");
      return data.display_name?.trim() || undefined;
    } catch {
      setLookupState("");
      return undefined;
    }
  }

  async function applySelectedPoint(latitude: number, longitude: number) {
    const roundedLatitude = Number(latitude.toFixed(6));
    const roundedLongitude = Number(longitude.toFixed(6));
    const fallbackAddress = `Lat ${roundedLatitude}, Lng ${roundedLongitude}`;
    const fetchedAddress = await reverseGeocode(
      roundedLatitude,
      roundedLongitude,
    );

    onChange({
      ...value,
      latitude: roundedLatitude,
      longitude: roundedLongitude,
      locationAddress: fetchedAddress ?? fallbackAddress,
      serviceRadiusKm: radiusKm,
    });
  }

  async function fetchCurrentLocation() {
    if (!navigator.geolocation) {
      setLookupState("Geolocation is not available in this browser.");
      return;
    }

    setLocating(true);
    setLookupState("");

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        },
      );

      await applySelectedPoint(
        position.coords.latitude,
        position.coords.longitude,
      );
    } catch {
      setLookupState(
        "Unable to fetch location. Please allow location permission.",
      );
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="inset" style={{ padding: 16, border: "1px solid var(--color-line)" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div>
          <p className="text-ink" style={{ fontSize: 14, fontWeight: 700 }}>
            {title}
          </p>
          <p className="text-ink-faint" style={{ fontSize: 12, marginTop: 2 }}>
            Click the map or drag the marker to set your base location.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchCurrentLocation}
          className="btn btn-ghost btn-sm"
        >
          {locating ? "Fetching…" : "Use my location"}
        </button>
      </div>

      <div style={{ height: 300, marginBottom: 12 }}>
        <ServiceAreaLeafletMap
          latitude={latitude}
          longitude={longitude}
          radiusKm={radiusKm}
          onSelectPoint={applySelectedPoint}
        />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div
          className="bg-surface"
          style={{ borderRadius: 12, padding: "10px 12px", border: "1px solid var(--color-line)" }}
        >
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Coordinates
          </p>
          <p className="text-ink tnum" style={{ fontSize: 13, fontWeight: 600 }}>
            {coordinateLabel}
          </p>
        </div>
        <div
          className="bg-surface"
          style={{ borderRadius: 12, padding: "10px 12px", border: "1px solid var(--color-line)" }}
        >
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Service radius
          </p>
          <p className="text-ink tnum" style={{ fontSize: 13, fontWeight: 600 }}>
            {radiusKm.toFixed(0)} km
          </p>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          type="range"
          min={1}
          max={250}
          step={1}
          value={radiusKm}
          onChange={(event) => {
            onChange({
              ...value,
              latitude,
              longitude,
              serviceRadiusKm: Number(event.target.value),
            });
          }}
          style={{ width: "100%", accentColor: "var(--color-leaf-600)" }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="field-label">Location address (auto-filled)</label>
        <textarea
          value={value.locationAddress ?? ""}
          onChange={(event) => {
            onChange({
              ...value,
              locationAddress: event.target.value,
              latitude,
              longitude,
              serviceRadiusKm: radiusKm,
            });
          }}
          rows={2}
          placeholder="Select a location on the map to auto-fill the address"
          className="field"
        />
      </div>

      {(lookupState || error) && (
        <p className="text-danger" style={{ marginTop: 8, fontSize: 12 }}>
          {error || lookupState}
        </p>
      )}
    </div>
  );
}
