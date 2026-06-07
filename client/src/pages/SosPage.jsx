import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { API_URL } from "../config";
import { getOrCreateDeviceId } from "../services/deviceService";
import { getEmergencyContacts } from "../services/localProfileService";

import "./SosPage.css";

const ACTIVE_SOS_KEY = "nirvaya_active_sos";

export default function SosPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [activeSos, setActiveSos] = useState(null);
  const [trackingLink, setTrackingLink] = useState("");
  const [lastLocation, setLastLocation] = useState(null);
  const locationIntervalRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
  const storedSos = localStorage.getItem(ACTIVE_SOS_KEY);

  if (storedSos) {
    const parsed = JSON.parse(storedSos);
    setActiveSos(parsed.sos);
    setTrackingLink(parsed.trackingLink || "");

    if (parsed.sos?.id) {
      startThirtySecondLocationUpdates(parsed.sos.id);
    }
  }

  return () => {
    stopThirtySecondLocationUpdates();
  };
}, []);

  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          reject(
            new Error(
              error.message || "Could not get your current location."
            )
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  };
  const startThirtySecondLocationUpdates = (sosId) => {
  if (locationIntervalRef.current) {
    clearInterval(locationIntervalRef.current);
  }

  locationIntervalRef.current = setInterval(async () => {
    try {
      const deviceId = getOrCreateDeviceId();
      const location = await getCurrentLocation();

      setLastLocation(location);

      const response = await fetch(`${API_URL}/sos/${sosId}/location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update SOS location.");
      }

      console.log("SOS location updated:", data.location);
    } catch (error) {
      console.log("30-sec location update error:", error.message);
    }
  }, 30000);
};
    const stopThirtySecondLocationUpdates = () => {
  if (locationIntervalRef.current) {
    clearInterval(locationIntervalRef.current);
    locationIntervalRef.current = null;
  }
};

  const playSosAlarm = () => {
    try {
      if (!audioRef.current) return;

      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        console.log("Audio play blocked until user interaction.");
      });
    } catch (error) {
      console.log("Audio error:", error.message);
    }
  };

  const stopSosAlarm = () => {
    try {
      if (!audioRef.current) return;

      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } catch (error) {
      console.log("Stop audio error:", error.message);
    }
  };

  const handleStartSos = async () => {
    try {
      setLoading(true);

      const deviceId = getOrCreateDeviceId();
      const location = await getCurrentLocation();
      const emergencyContacts = getEmergencyContacts();

      setLastLocation(location);

      const response = await fetch(`${API_URL}/sos/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          trigger_type: "button",
          risk_score: null,
          emergency_contacts: emergencyContacts,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to start SOS.");
      }

      setActiveSos(data.sos);
      setTrackingLink(data.trackingLink || "");
      startThirtySecondLocationUpdates(data.sos.id);

      localStorage.setItem(
        ACTIVE_SOS_KEY,
        JSON.stringify({
          sos: data.sos,
          trackingLink: data.trackingLink,
          publicToken: data.publicToken,
        })
      );

      playSosAlarm();

      if (data.alreadyActive) {
        alert("SOS is already active for this device.");
      } else {
        alert("SOS started. Emergency contacts can use the tracking link.");
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveSos = async () => {
    if (!activeSos?.id) {
      alert("No active SOS found.");
      return;
    }

    const confirmed = window.confirm(
      "Are you safe now? This will mark your SOS as resolved."
    );

    if (!confirmed) return;

    try {
      setResolving(true);

      const deviceId = getOrCreateDeviceId();

      const response = await fetch(`${API_URL}/sos/${activeSos.id}/resolve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to resolve SOS.");
      }

      stopSosAlarm();
      stopThirtySecondLocationUpdates();

      setActiveSos(null);
      setTrackingLink("");
      localStorage.removeItem(ACTIVE_SOS_KEY);

      alert("SOS resolved successfully.");
    } catch (error) {
      alert(error.message);
    } finally {
      setResolving(false);
    }
  };

  const copyTrackingLink = async () => {
    if (!trackingLink) return;

    try {
      await navigator.clipboard.writeText(trackingLink);
      alert("Tracking link copied.");
    } catch {
      alert(trackingLink);
    }
  };

  return (
    <main className="sos-page">
      <audio ref={audioRef} loop>
        <source src="/sos-alarm.mp3" type="audio/mpeg" />
      </audio>

      <section className="phone-frame">
        <header className="sos-header">
          <div>
            <p className="welcome">Nirvaya safety panel</p>
            <h1 className="name">Emergency SOS</h1>
          </div>

          <button className="avatar-wrapper" onClick={() => navigate("/")}>
            <span className="avatar-text">N</span>
            <span className={activeSos ? "badge active-badge" : "badge"}>
              {activeSos ? "!" : "1"}
            </span>
          </button>
        </header>

        <section className="sos-content">
          <h2 className="title">
            {activeSos ? "SOS is active" : "Are you in danger?"}
          </h2>

          <p className="subtitle">
            {activeSos
              ? "Your emergency tracking link is active."
              : "Press the button — your emergency contacts can receive your tracking link."}
          </p>

          <div className="sos-area">
            <div className="outer-pulse" />
            <div className="middle-pulse" />

            <button
              className={activeSos ? "sos-button sos-button-active" : "sos-button"}
              onClick={handleStartSos}
              disabled={loading || resolving || Boolean(activeSos)}
            >
              {loading ? (
                <span className="spinner" />
              ) : (
                <span>{activeSos ? "ACTIVE" : "SOS"}</span>
              )}
            </button>
          </div>

          {activeSos && (
            <button
              className="safe-button"
              onClick={handleResolveSos}
              disabled={resolving || loading}
            >
              {resolving ? "Resolving..." : "✓ I'm Safe — Resolve SOS"}
            </button>
          )}

          {trackingLink && (
            <div className="tracking-card">
              <div className="icon-red" />

              <div className="card-text-box">
                <p className="location-label">Public tracking link</p>
                <p className="tracking-link">{trackingLink}</p>
                <p className="zone-text">
                  Send this link to emergency contacts or police.
                </p>
              </div>

              <button className="small-button" onClick={copyTrackingLink}>
                Copy
              </button>
            </div>
          )}

          {lastLocation && (
            <div className="card">
              <div className="icon-light" />

              <div className="card-text-box">
                <p className="card-title">Initial SOS location</p>
                <p className="card-subtitle">
                  {lastLocation.latitude.toFixed(5)},{" "}
                  {lastLocation.longitude.toFixed(5)}
                </p>
              </div>
            </div>
          )}

          <button
            className="route-tab"
            onClick={() => navigate("/safe-routes")}
          >
            <div className="icon-route" />

            <div className="card-text-box">
              <p className="card-title">Safe Routes Recommendation</p>
              <p className="card-subtitle">
                Find safer paths ranked by Nirvaya.
              </p>
            </div>

            <span className="arrow">›</span>
          </button>
        </section>

        <div className="bottom-line" />
      </section>
    </main>
  );
}