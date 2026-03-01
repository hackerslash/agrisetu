"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

type Props = {
  latitude: number;
  longitude: number;
  radiusKm: number;
  onSelectPoint: (latitude: number, longitude: number) => void;
};

function MapClickHandler({
  onSelectPoint,
}: {
  onSelectPoint: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(event) {
      onSelectPoint(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function RecenterMap({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude], Math.max(map.getZoom(), 12), {
      animate: true,
    });
  }, [latitude, longitude, map]);

  return null;
}

export default function ServiceAreaLeafletMap({
  latitude,
  longitude,
  radiusKm,
  onSelectPoint,
}: Props) {
  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: "vendor-location-marker",
        html: `<div style="
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: #2C5F2D;
          border: 4px solid #FFFFFF;
          box-shadow: 0 3px 10px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    [],
  );

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={12}
      scrollWheelZoom
      style={{ width: "100%", height: "100%", borderRadius: 14 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterMap latitude={latitude} longitude={longitude} />
      <MapClickHandler onSelectPoint={onSelectPoint} />
      <Circle
        center={[latitude, longitude]}
        radius={Math.max(1, radiusKm) * 1000}
        pathOptions={{
          color: "#2C5F2D",
          weight: 2,
          fillColor: "#2C5F2D",
          fillOpacity: 0.12,
        }}
      />
      <Marker
        icon={markerIcon}
        position={[latitude, longitude]}
        draggable
        eventHandlers={{
          dragend: (event) => {
            const marker = event.target as L.Marker;
            const point = marker.getLatLng();
            onSelectPoint(point.lat, point.lng);
          },
        }}
      />
    </MapContainer>
  );
}
