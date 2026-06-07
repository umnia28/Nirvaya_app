import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { io } from "socket.io-client";

import { API_URL, SOCKET_URL } from "../config";

import "./TrackingPage.css";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function RecenterMap({ latitude, longitude }) {
  const map = useMap();

  useEffect(() => {
    if (!latitude || !longitude) return;

    map.setView([Number(latitude), Number(longitude)], 16, {
      animate: true,
    });
  }, [latitude, longitude, map]);

  return null;
}

export default function TrackingPage() {
  const { publicToken } = useParams();

  const socketRef = useRef(null);

  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchInitialTrackingLocation();
    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("leave_tracking_room", publicToken);
        socketRef.current.disconnect();
      }
    };
  }, [publicToken]);

  const fetchInitialTrackingLocation = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/sos/track/${publicToken}`);

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Tracking link not found");
      }

      setTracking(data.tracking);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const connectSocket = () => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");
      socket.emit("join_tracking_room", publicToken);
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    socket.on("connect_error", () => {
      setConnectionStatus("error");
    });

    socket.on("location_update", (location) => {
      setTracking((previous) => ({
        ...(previous || {}),
        latitude: location.latitude,
        longitude: location.longitude,
        recorded_at: location.recorded_at,
        status: previous?.status || "active",
      }));
    });

    socket.on("sos_resolved", (payload) => {
      setTracking((previous) => ({
        ...(previous || {}),
        status: payload.status || "resolved",
        resolved_at: payload.resolved_at || new Date().toISOString(),
      }));
    });
  };

  const openInGoogleMaps = () => {
    if (!tracking?.latitude || !tracking?.longitude) return;

    const url = `https://maps.google.com/?q=${tracking.latitude},${tracking.longitude}`;
    window.open(url, "_blank");
  };

  const formatTime = (value) => {
    if (!value) return "Unknown";

    return new Date(value).toLocaleString("en-BD", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getStatusText = () => {
    if (!tracking) return "Unknown";

    if (tracking.status === "active") return "SOS Active";
    if (tracking.status === "resolved") return "SOS Resolved";
    if (tracking.status === "false_alarm") return "False Alarm";

    return tracking.status;
  };

  const getConnectionText = () => {
    if (connectionStatus === "connected") return "Live connection active";
    if (connectionStatus === "connecting") return "Connecting to live updates...";
    if (connectionStatus === "disconnected") return "Live connection disconnected";
    return "Live connection error";
  };

  if (loading) {
    return (
      <main className="tracking-page">
        <section className="tracking-card center-card">
          <div className="loader" />
          <h1>Loading tracking link...</h1>
          <p>Please wait while Nirvaya fetches the latest SOS location.</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="tracking-page">
        <section className="tracking-card center-card">
          <div className="brand-icon danger">!</div>
          <h1>Tracking link unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  const latitude = Number(tracking.latitude);
  const longitude = Number(tracking.longitude);

  return (
    <main className="tracking-page">
      <section className="tracking-layout">
        <aside className="tracking-sidebar">
          <div className="brand-row">
            <div className="brand-icon">N</div>

            <div>
              <h1>Nirvaya Live Tracking</h1>
              <p>Emergency location sharing page</p>
            </div>
          </div>

          <div
            className={
              tracking.status === "active"
                ? "status-card active"
                : "status-card resolved"
            }
          >
            <span className="status-dot" />
            <div>
              <h2>{getStatusText()}</h2>
              <p>{getConnectionText()}</p>
            </div>
          </div>

          <div className="info-card">
            <p className="info-label">Latest location</p>
            <h3>
              {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </h3>
            <p className="info-muted">
              Last updated: {formatTime(tracking.recorded_at)}
            </p>
          </div>

          <div className="info-card">
            <p className="info-label">SOS created</p>
            <h3>{formatTime(tracking.created_at)}</h3>
            {tracking.resolved_at && (
              <p className="info-muted">
                Resolved: {formatTime(tracking.resolved_at)}
              </p>
            )}
          </div>

          <button className="primary-button" onClick={openInGoogleMaps}>
            Open in Google Maps
          </button>

          <button className="secondary-button" onClick={fetchInitialTrackingLocation}>
            Refresh location
          </button>

          <p className="privacy-note">
            This page only shows the shared SOS location for this tracking link.
          </p>
        </aside>

        <section className="tracking-map-panel">
          <MapContainer
            center={[latitude, longitude]}
            zoom={16}
            className="tracking-map"
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <Marker position={[latitude, longitude]} icon={markerIcon}>
              <Popup>
                <strong>Latest SOS Location</strong>
                <br />
                {formatTime(tracking.recorded_at)}
              </Popup>
            </Marker>

            <Circle
              center={[latitude, longitude]}
              radius={80}
              pathOptions={{
                color: "#ED234F",
                fillColor: "#ED234F",
                fillOpacity: 0.16,
              }}
            />

            <RecenterMap latitude={latitude} longitude={longitude} />
          </MapContainer>
        </section>
      </section>
    </main>
  );
}