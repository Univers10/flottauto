"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLngBounds, type LatLngExpression } from "leaflet";

export type MapMarker = { id: string | number; lat: number; lng: number; label: string; color: string; onClick?: () => void };

/** Côte d'Ivoire entière quand il n'y a encore aucune position. */
const CI_CENTER: LatLngExpression = [7.54, -5.55];

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 13);
    else map.fitBounds(latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/** Carte OpenStreetMap : cars (points de couleur) et, pour un car, son trajet du jour et ses arrêts. */
export default function GpsMap({
  markers = [],
  line = [],
  stops = [],
  className,
}: {
  markers?: MapMarker[];
  line?: [number, number][];
  stops?: { lat: number; lng: number; label: string }[];
  className?: string;
}) {
  const fit: [number, number][] = line.length > 0 ? line : markers.map((m) => [m.lat, m.lng]);
  return (
    <MapContainer center={CI_CENTER} zoom={7} scrollWheelZoom className={className} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#7a1f4f", weight: 4, opacity: 0.85 }} />}
      {stops.map((s, i) => (
        <CircleMarker key={`s${i}`} center={[s.lat, s.lng]} radius={6} pathOptions={{ color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.9, weight: 2 }}>
          <Tooltip>{s.label}</Tooltip>
        </CircleMarker>
      ))}
      {markers.map((m) => (
        <CircleMarker
          key={m.id}
          center={[m.lat, m.lng]}
          radius={9}
          pathOptions={{ color: "#ffffff", fillColor: m.color, fillOpacity: 1, weight: 3 }}
          eventHandlers={m.onClick ? { click: m.onClick } : undefined}
        >
          <Tooltip direction="top" offset={[0, -8]} permanent={markers.length <= 12}>
            {m.label}
          </Tooltip>
        </CircleMarker>
      ))}
      <FitBounds points={fit} />
    </MapContainer>
  );
}
