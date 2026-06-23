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

/* ─── Custom marker icon ───────────────────────────────────────────── */
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

/* ─── Map auto-recenter helper ─────────────────────────────────────── */
function RecenterMap({ latitude, longitude }) {
  const map = useMap();

  useEffect(() => {
    if (!latitude || !longitude) return;
    map.setView([Number(latitude), Number(longitude)], 16, { animate: true });
  }, [latitude, longitude, map]);

  return null;
}

/* ─── Inline SVG icons (no extra dep) ─────────────────────────────── */
function IconMap() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

/* ─── Main component ───────────────────────────────────────────────── */
export default function TrackingPage() {
  const { publicToken } = useParams();
  const socketRef = useRef(null);

  const [tracking, setTracking]           = useState(null);
  const [loading, setLoading]             = useState(true);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [error, setError]                 = useState("");

  /* ── Effects ── */
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

  /* ── Data fetch ── */
  const fetchInitialTrackingLocation = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/sos/track/${publicToken}`);
      const data     = await response.json();

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

  /* ── Socket ── */
  const connectSocket = () => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");
      socket.emit("join_tracking_room", publicToken);
    });

    socket.on("disconnect",    () => setConnectionStatus("disconnected"));
    socket.on("connect_error", () => setConnectionStatus("error"));

    socket.on("location_update", (location) => {
      setTracking((prev) => ({
        ...(prev || {}),
        latitude:    location.latitude,
        longitude:   location.longitude,
        recorded_at: location.recorded_at,
        status:      prev?.status || "active",
      }));
    });

    socket.on("sos_resolved", (payload) => {
      setTracking((prev) => ({
        ...(prev || {}),
        status:      payload.status      || "resolved",
        resolved_at: payload.resolved_at || new Date().toISOString(),
      }));
    });
  };

  /* ── Actions ── */
  const openInGoogleMaps = () => {
    if (!tracking?.latitude || !tracking?.longitude) return;
    window.open(
      `https://maps.google.com/?q=${tracking.latitude},${tracking.longitude}`,
      "_blank"
    );
  };

  /* ── Formatters ── */
  const formatTime = (value) => {
    if (!value) return "Unknown";
    return new Date(value).toLocaleString("en-BD", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getStatusText = () => {
    if (!tracking) return "Unknown";
    if (tracking.status === "active")      return "SOS Active";
    if (tracking.status === "resolved")    return "SOS Resolved";
    if (tracking.status === "false_alarm") return "False Alarm";
    return tracking.status;
  };

  const getStatusClass = () => {
    if (!tracking || tracking.status === "active") return "active";
    if (tracking.status === "resolved")            return "resolved";
    return "warning";
  };

  const getConnectionText = () => {
    if (connectionStatus === "connected")    return "Live updates active";
    if (connectionStatus === "connecting")   return "Connecting to live feed…";
    if (connectionStatus === "disconnected") return "Live connection lost";
    return "Connection error";
  };

  const getConnDotClass = () => {
    if (connectionStatus === "connected") return "live";
    if (connectionStatus === "connecting") return "connecting";
    return "error";
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <main className="tracking-page">
        <div className="center-card">
          <div className="loader" />
          <h1>Locating…</h1>
          <p>Fetching the latest SOS location. This only takes a moment.</p>
        </div>
      </main>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <main className="tracking-page">
        <div className="center-card">
          <div className="brand-icon danger">!</div>
          <h1>Link unavailable</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  const latitude  = Number(tracking.latitude);
  const longitude = Number(tracking.longitude);

  /* ── Main view ── */
  return (
    <main className="tracking-page">
      <section className="tracking-layout">

        {/* ── Sidebar ── */}
        <aside className="tracking-sidebar">

          {/* Brand */}
          <div className="brand-row">
            <div className="brand-icon">N</div>
            <div className="brand-text">
              <h1>Nirvaya Live Tracking</h1>
              <p>Real-time emergency location</p>
            </div>
          </div>

          {/* Status */}
          <div className={`status-card ${getStatusClass()}`}>
            <div className="status-dot-wrap">
              <span className="status-dot-ring" />
              <span className="status-dot" />
            </div>
            <div className="status-text">
              <h2>{getStatusText()}</h2>
              <p>
                <span className={`conn-dot ${getConnDotClass()}`} />
                {getConnectionText()}
              </p>
            </div>
          </div>

          {/* Latest location */}
          <div className="info-card">
            <p className="info-label">Latest location</p>
            <span className="coord-chip">
              {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </span>
            <p className="info-muted">
              <IconClock />
              {" "}Updated {formatTime(tracking.recorded_at)}
            </p>
          </div>

          {/* SOS created */}
          <div className="info-card">
            <p className="info-label">SOS triggered</p>
            <h3>{formatTime(tracking.created_at)}</h3>
            {tracking.resolved_at && (
              <p className="info-muted">
                Resolved: {formatTime(tracking.resolved_at)}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="sidebar-actions">
            <button className="primary-button" onClick={openInGoogleMaps}>
              <IconMap />
              Open in Google Maps
            </button>

            <button className="secondary-button" onClick={fetchInitialTrackingLocation}>
              <IconRefresh />
              Refresh location
            </button>
          </div>

          {/* Privacy */}
          <p className="privacy-note">
            <IconShield />
            This page only shows the SOS location shared via this link.
            No other personal data is accessible.
          </p>

        </aside>

        {/* ── Map Panel ── */}
        <section className="tracking-map-panel">

          {/* Live badge overlay */}
          <div className="map-live-badge">
            <span className="map-live-dot" />
            Live tracking
          </div>

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
                color:       "#e11d48",
                fillColor:   "#e11d48",
                fillOpacity: 0.14,
                weight:      1.5,
              }}
            />

            <RecenterMap latitude={latitude} longitude={longitude} />
          </MapContainer>

        </section>
      </section>
    </main>
  );
}
