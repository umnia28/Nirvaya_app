import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import {
  Bell,
  ExternalLink,
  LogOut,
  MapPin,
  Phone,
  Radio,
  ShieldAlert,
  Siren,
} from "lucide-react";

import { SOCKET_URL } from "../config";
import { getPoliceMe, logoutPolice } from "../services/policeApi";
import "./PoliceDashboardPage.css";

export default function PoliceDashboardPage() {
  const navigate = useNavigate();

  const socketRef = useRef(null);
  const audioRef = useRef(null);

  const [policeStation, setPoliceStation] = useState(null);
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    let socket;

    const setupDashboard = async () => {
      try {
        setLoading(true);
        setError("");

        const station = await getPoliceMe();
        setPoliceStation(station);

        socket = io(SOCKET_URL, {
          transports: ["websocket", "polling"],
          withCredentials: true,
        });

        socketRef.current = socket;

        socket.on("connect", () => {
          setConnected(true);

          socket.emit("join_police_station", station.id);

          console.log("Police dashboard socket connected:", socket.id);
          console.log("Joined room:", `police_${station.id}`);
        });

        socket.on("disconnect", () => {
          setConnected(false);
        });

        socket.on("connect_error", (err) => {
          console.log("Socket connection error:", err.message);
          setConnected(false);
        });

        socket.on("new_sos_alert", (alertData) => {
          console.log("New SOS alert received:", alertData);
          if (alertData.publicToken) {
            socket.emit("join_tracking_room", alertData.publicToken);
          }
          setAlerts((prev) => {
            const alreadyExists = prev.some(
              (alert) => alert.sosId === alertData.sosId
            );

            if (alreadyExists) {
              return prev;
            }

            return [
              {
                ...alertData,
                localReceivedAt: new Date().toISOString(),
                localStatus: "new",
              },
              ...prev,
            ];
          });

          if (!mutedRef.current && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => { });
          }

          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(" New Nirvaya SOS Alert", {
              body: `SOS received near ${alertData.policeStation?.name || "your station"
                }`,
            });
          }
        });
        socket.on("sos_resolved", (data) => {
          console.log("SOS resolved:", data);

          setAlerts((prev) =>
            prev.map((alert) =>
              alert.sosId === data.sosId || alert.publicToken === data.publicToken
                ? {
                  ...alert,
                  status: "resolved",
                  localStatus: "resolved",
                  resolvedAt: data.resolvedAt,
                }
                : alert
            )
          );
        });
      } catch (err) {
        console.error(err);
        setError(err.message);
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    };

    setupDashboard();

    return () => {
      if (socket && policeStation?.id) {
        socket.emit("leave_police_station", policeStation.id);
      }

      socket?.disconnect();
    };
  }, [navigate]);

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      alert("Browser notifications are not supported.");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      alert("Notifications enabled.");
    } else {
      alert("Notifications were not enabled.");
    }
  };

  const handleLogout = async () => {
    try {
      await logoutPolice();
    } catch (err) {
      console.log(err.message);
    } finally {
      socketRef.current?.disconnect();
      navigate("/auth");
    }
  };

  const markViewed = (sosId) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.sosId === sosId ? { ...alert, localStatus: "viewed" } : alert
      )
    );
  };

  const markResponding = (sosId) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.sosId === sosId ? { ...alert, localStatus: "responding" } : alert
      )
    );
  };

  const closeAlert = (sosId) => {
    setAlerts((prev) => prev.filter((alert) => alert.sosId !== sosId));
  };

  const activeAlerts = alerts.filter((alert) => alert.localStatus !== "closed");
  const criticalAlerts = alerts.filter(
    (alert) => alert.riskLevel === "critical" || alert.riskLevel === "high"
  );

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-loader">Loading police dashboard...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-loader">{error}</div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <audio ref={audioRef}>
        <source src="/sos-alarm.mp3" type="audio/mpeg" />
      </audio>

      <header className="dashboard-header">
        <div>
          <div className="brand-line">
            <div className="brand-dot" />
            <div>
              <h1>Nirvaya Police Dashboard</h1>
              <p>
                {policeStation?.name} · {policeStation?.thana},{" "}
                {policeStation?.district}
              </p>
            </div>
          </div>

          <div className={connected ? "socket-status on" : "socket-status off"}>
            <Radio size={15} />
            {connected
              ? `Connected to police room: police_${policeStation?.id}`
              : "Disconnected from live SOS alerts"}
          </div>
        </div>

        <div className="header-actions">
          <button onClick={requestNotifications} className="soft-button">
            <Bell size={17} />
            Enable notifications
          </button>

          <button
            onClick={() => setMuted((prev) => !prev)}
            className={muted ? "soft-button muted" : "soft-button"}
          >
            <Siren size={17} />
            {muted ? "Alarm muted" : "Alarm on"}
          </button>

          <button onClick={handleLogout} className="logout-button">
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <p>Total alerts</p>
          <h2>{alerts.length}</h2>
        </div>

        <div className="stat-card">
          <p>Active alerts</p>
          <h2>{activeAlerts.length}</h2>
        </div>

        <div className="stat-card danger-stat">
          <p>High/Critical</p>
          <h2>{criticalAlerts.length}</h2>
        </div>

        <div className="stat-card">
          <p>Station phone</p>
          <h3>{policeStation?.phone}</h3>
        </div>
      </section>

      <section className="alerts-section">
        <div className="section-heading-row">
          <div>
            <h2>Incoming SOS Alerts</h2>
            <p>
              Keep this dashboard open. Nearby SOS alerts will appear here
              instantly.
            </p>
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="empty-state">
            <ShieldAlert size={58} />
            <h3>No SOS alerts yet</h3>
            <p>
              When a Nirvaya user near your police station triggers SOS, you
              will receive the initial location and live tracking link here.
            </p>
          </div>
        ) : (
          <div className="alerts-list">
            {alerts.map((alert) => (
              <article
                key={alert.sosId}
                className={`alert-card status-${alert.localStatus}`}
              >
                <div className="alert-top">
                  <div>
                    <div className="alert-title-row">
                      <Siren size={22} />
                      <h3>Emergency SOS Alert</h3>
                    </div>

                    <p>
                      Received:{" "}
                      {alert.recordedAt
                        ? new Date(alert.recordedAt).toLocaleString()
                        : new Date(alert.localReceivedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="badge-column">
                    <span className={`risk-badge risk-${alert.riskLevel || "unknown"}`}>
                      {alert.riskLevel || "unknown"}
                    </span>

                    <span className={`status-badge status-${alert.localStatus}`}>
                      {alert.localStatus}
                    </span>
                  </div>
                </div>

                <div className="alert-grid">
                  <div>
                    <p className="label">Risk Score</p>
                    <strong>{alert.riskScore ?? "N/A"}</strong>
                  </div>

                  <div>
                    <p className="label">Trigger Type</p>
                    <strong>{alert.triggerType || "button"}</strong>
                  </div>

                  <div>
                    <p className="label">Status</p>
                    <strong>{alert.status || "active"}</strong>
                  </div>

                  <div>
                    <p className="label">Latitude</p>
                    <strong>{alert.latitude}</strong>
                  </div>

                  <div>
                    <p className="label">Longitude</p>
                    <strong>{alert.longitude}</strong>
                  </div>

                  <div>
                    <p className="label">Distance from station</p>
                    <strong>
                      {alert.policeStation?.distance_meters
                        ? `${Math.round(alert.policeStation.distance_meters)} m`
                        : "N/A"}
                    </strong>
                  </div>
                </div>

                <div className="location-box">
                  <MapPin size={18} />
                  <span>
                    Initial location: {alert.latitude}, {alert.longitude}
                  </span>
                </div>

                {alert.emergencyContacts?.length > 0 && (
                  <div className="contacts-box">
                    <p className="label">Emergency Contacts</p>

                    {alert.emergencyContacts.map((contact, index) => (
                      <div key={index} className="contact-row">
                        <Phone size={14} />
                        <span>
                          {contact.name} · {contact.phone}
                          {contact.relation ? ` · ${contact.relation}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {alert.message && (
                  <pre className="message-box">{alert.message}</pre>
                )}

                <div className="alert-actions">
                  <a
                    href={alert.trackingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="primary-link"
                    onClick={() => markViewed(alert.sosId)}
                  >
                    <MapPin size={17} />
                    Open Live Tracking
                  </a>

                  <a
                    href={alert.googleMapsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-link"
                  >
                    <ExternalLink size={17} />
                    Open Google Maps
                  </a>

                  <button
                    className="action-button"
                    onClick={() => markResponding(alert.sosId)}
                  >
                    Mark responding
                  </button>

                  <button
                    className="close-button"
                    onClick={() => closeAlert(alert.sosId)}
                  >
                    Close
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}