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
      className="flex items-center justify-center"
      style={{
        width: "100%",
        height: 300,
        borderRadius: 14,
        backgroundColor: "#EDE8DF",
        color: "#A0A0A0",
        fontSize: 13,
      }}
    >
      Loading map...
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
    <div
      className="rounded-2xl"
      style={{
        backgroundColor: "#F7F5F0",
        padding: 16,
        border: "1px solid #E4DFD6",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 12 }}
      >
        <div>
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#1A1A1A",
            }}
          >
            {title}
          </p>
          <p style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
            Click map or drag marker to set your base location.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchCurrentLocation}
          className="rounded-xl font-semibold"
          style={{
            backgroundColor: "#EDE8DF",
            color: "#1A1A1A",
            height: 40,
            padding: "0 14px",
            fontSize: 12,
          }}
        >
          {locating ? "Fetching..." : "Fetch location"}
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
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 12,
            padding: "10px 12px",
            border: "1px solid #EDE8DF",
          }}
        >
          <p style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>
            Coordinates
          </p>
          <p style={{ fontSize: 13, color: "#1A1A1A", fontWeight: 600 }}>
            {coordinateLabel}
          </p>
        </div>
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 12,
            padding: "10px 12px",
            border: "1px solid #EDE8DF",
          }}
        >
          <p style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>
            Service Radius
          </p>
          <p style={{ fontSize: 13, color: "#1A1A1A", fontWeight: 600 }}>
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
          style={{ width: "100%" }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#1A1A1A",
            marginBottom: 6,
          }}
        >
          Location Address (auto-fetched)
        </label>
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
          placeholder="Select location on map to auto-fill address"
          style={{
            width: "100%",
            borderRadius: 12,
            border: "1px solid #E4DFD6",
            backgroundColor: "#FFFFFF",
            padding: "10px 12px",
            fontSize: 13,
            color: "#1A1A1A",
            resize: "vertical",
          }}
        />
      </div>

      {(lookupState || error) && (
        <p style={{ marginTop: 8, fontSize: 12, color: "#B03A2E" }}>
          {error || lookupState}
        </p>
      )}
    </div>
  );
}
