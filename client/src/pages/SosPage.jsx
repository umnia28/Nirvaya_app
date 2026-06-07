// import { useEffect, useRef, useState } from "react";
// import { useNavigate } from "react-router-dom";

// import { API_URL } from "../config";
// import { getOrCreateDeviceId } from "../services/deviceService";
// import { getEmergencyContacts } from "../services/localProfileService";

// import "./SosPage.css";

// const ACTIVE_SOS_KEY = "nirvaya_active_sos";

// export default function SosPage() {
//   const navigate = useNavigate();

//   const [loading, setLoading] = useState(false);
//   const [resolving, setResolving] = useState(false);
//   const [activeSos, setActiveSos] = useState(null);
//   const [trackingLink, setTrackingLink] = useState("");
//   const [lastLocation, setLastLocation] = useState(null);
//   const locationIntervalRef = useRef(null);
//   const audioRef = useRef(null);

//   useEffect(() => {
//   const storedSos = localStorage.getItem(ACTIVE_SOS_KEY);

//   if (storedSos) {
//     const parsed = JSON.parse(storedSos);
//     setActiveSos(parsed.sos);
//     setTrackingLink(parsed.trackingLink || "");

//     if (parsed.sos?.id) {
//       startThirtySecondLocationUpdates(parsed.sos.id);
//     }
//   }

//   return () => {
//     stopThirtySecondLocationUpdates();
//   };
// }, []);

//   const getCurrentLocation = () => {
//     return new Promise((resolve, reject) => {
//       if (!navigator.geolocation) {
//         reject(new Error("Geolocation is not supported by this browser."));
//         return;
//       }

//       navigator.geolocation.getCurrentPosition(
//         (position) => {
//           resolve({
//             latitude: position.coords.latitude,
//             longitude: position.coords.longitude,
//           });
//         },
//         (error) => {
//           reject(
//             new Error(
//               error.message || "Could not get your current location."
//             )
//           );
//         },
//         {
//           enableHighAccuracy: true,
//           timeout: 15000,
//           maximumAge: 0,
//         }
//       );
//     });
//   };
//   const startThirtySecondLocationUpdates = (sosId) => {
//   if (locationIntervalRef.current) {
//     clearInterval(locationIntervalRef.current);
//   }

//   locationIntervalRef.current = setInterval(async () => {
//     try {
//       const deviceId = getOrCreateDeviceId();
//       const location = await getCurrentLocation();

//       setLastLocation(location);

//       const response = await fetch(`${API_URL}/sos/${sosId}/location`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           "x-device-id": deviceId,
//         },
//         body: JSON.stringify({
//           latitude: location.latitude,
//           longitude: location.longitude,
//         }),
//       });

//       const data = await response.json();

//       if (!response.ok || !data.success) {
//         throw new Error(data.message || "Failed to update SOS location.");
//       }

//       console.log("SOS location updated:", data.location);
//     } catch (error) {
//       console.log("30-sec location update error:", error.message);
//     }
//   }, 30000);
// };
//     const stopThirtySecondLocationUpdates = () => {
//   if (locationIntervalRef.current) {
//     clearInterval(locationIntervalRef.current);
//     locationIntervalRef.current = null;
//   }
// };

//   const playSosAlarm = () => {
//     try {
//       if (!audioRef.current) return;

//       audioRef.current.currentTime = 0;
//       audioRef.current.play().catch(() => {
//         console.log("Audio play blocked until user interaction.");
//       });
//     } catch (error) {
//       console.log("Audio error:", error.message);
//     }
//   };

//   const stopSosAlarm = () => {
//     try {
//       if (!audioRef.current) return;

//       audioRef.current.pause();
//       audioRef.current.currentTime = 0;
//     } catch (error) {
//       console.log("Stop audio error:", error.message);
//     }
//   };

//   const handleStartSos = async () => {
//     try {
//       setLoading(true);

//       const deviceId = getOrCreateDeviceId();
//       const location = await getCurrentLocation();
//       const emergencyContacts = getEmergencyContacts();

//       setLastLocation(location);

//       const response = await fetch(`${API_URL}/sos/start`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           "x-device-id": deviceId,
//         },
//         body: JSON.stringify({
//           latitude: location.latitude,
//           longitude: location.longitude,
//           trigger_type: "button",
//           risk_score: null,
//           emergency_contacts: emergencyContacts,
//         }),
//       });

//       const data = await response.json();

//       if (!response.ok || !data.success) {
//         throw new Error(data.message || "Failed to start SOS.");
//       }

//       setActiveSos(data.sos);
//       setTrackingLink(data.trackingLink || "");
//       startThirtySecondLocationUpdates(data.sos.id);

//       localStorage.setItem(
//         ACTIVE_SOS_KEY,
//         JSON.stringify({
//           sos: data.sos,
//           trackingLink: data.trackingLink,
//           publicToken: data.publicToken,
//         })
//       );

//       playSosAlarm();

//       if (data.alreadyActive) {
//         alert("SOS is already active for this device.");
//       } else {
//         alert("SOS started. Emergency contacts can use the tracking link.");
//       }
//     } catch (error) {
//       alert(error.message);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleResolveSos = async () => {
//     if (!activeSos?.id) {
//       alert("No active SOS found.");
//       return;
//     }

//     const confirmed = window.confirm(
//       "Are you safe now? This will mark your SOS as resolved."
//     );

//     if (!confirmed) return;

//     try {
//       setResolving(true);

//       const deviceId = getOrCreateDeviceId();

//       const response = await fetch(`${API_URL}/sos/${activeSos.id}/resolve`, {
//         method: "PATCH",
//         headers: {
//           "Content-Type": "application/json",
//           "x-device-id": deviceId,
//         },
//       });

//       const data = await response.json();

//       if (!response.ok || !data.success) {
//         throw new Error(data.message || "Failed to resolve SOS.");
//       }

//       stopSosAlarm();
//       stopThirtySecondLocationUpdates();

//       setActiveSos(null);
//       setTrackingLink("");
//       localStorage.removeItem(ACTIVE_SOS_KEY);

//       alert("SOS resolved successfully.");
//     } catch (error) {
//       alert(error.message);
//     } finally {
//       setResolving(false);
//     }
//   };

//   const copyTrackingLink = async () => {
//     if (!trackingLink) return;

//     try {
//       await navigator.clipboard.writeText(trackingLink);
//       alert("Tracking link copied.");
//     } catch {
//       alert(trackingLink);
//     }
//   };

//   return (
//     <main className="sos-page">
//       <audio ref={audioRef} loop>
//         <source src="/sos-alarm.mp3" type="audio/mpeg" />
//       </audio>

//       <section className="phone-frame">
//         <header className="sos-header">
//           <div>
//             <p className="welcome">Nirvaya safety panel</p>
//             <h1 className="name">Emergency SOS</h1>
//           </div>

//           <button className="avatar-wrapper" onClick={() => navigate("/")}>
//             <span className="avatar-text">N</span>
//             <span className={activeSos ? "badge active-badge" : "badge"}>
//               {activeSos ? "!" : "1"}
//             </span>
//           </button>
//         </header>

//         <section className="sos-content">
//           <h2 className="title">
//             {activeSos ? "SOS is active" : "Are you in danger?"}
//           </h2>

//           <p className="subtitle">
//             {activeSos
//               ? "Your emergency tracking link is active."
//               : "Press the button — your emergency contacts can receive your tracking link."}
//           </p>

//           <div className="sos-area">
//             <div className="outer-pulse" />
//             <div className="middle-pulse" />

//             <button
//               className={activeSos ? "sos-button sos-button-active" : "sos-button"}
//               onClick={handleStartSos}
//               disabled={loading || resolving || Boolean(activeSos)}
//             >
//               {loading ? (
//                 <span className="spinner" />
//               ) : (
//                 <span>{activeSos ? "ACTIVE" : "SOS"}</span>
//               )}
//             </button>
//           </div>

//           {activeSos && (
//             <button
//               className="safe-button"
//               onClick={handleResolveSos}
//               disabled={resolving || loading}
//             >
//               {resolving ? "Resolving..." : "✓ I'm Safe — Resolve SOS"}
//             </button>
//           )}

//           {trackingLink && (
//             <div className="tracking-card">
//               <div className="icon-red" />

//               <div className="card-text-box">
//                 <p className="location-label">Public tracking link</p>
//                 <p className="tracking-link">{trackingLink}</p>
//                 <p className="zone-text">
//                   Send this link to emergency contacts or police.
//                 </p>
//               </div>

//               <button className="small-button" onClick={copyTrackingLink}>
//                 Copy
//               </button>
//             </div>
//           )}

//           {lastLocation && (
//             <div className="card">
//               <div className="icon-light" />

//               <div className="card-text-box">
//                 <p className="card-title">Initial SOS location</p>
//                 <p className="card-subtitle">
//                   {lastLocation.latitude.toFixed(5)},{" "}
//                   {lastLocation.longitude.toFixed(5)}
//                 </p>
//               </div>
//             </div>
//           )}

//           <button
//             className="route-tab"
//             onClick={() => navigate("/safe-routes")}
//           >
//             <div className="icon-route" />

//             <div className="card-text-box">
//               <p className="card-title">Safe Routes Recommendation</p>
//               <p className="card-subtitle">
//                 Find safer paths ranked by Nirvaya.
//               </p>
//             </div>

//             <span className="arrow">›</span>
//           </button>
//         </section>

//         <div className="bottom-line" />
//       </section>
//     </main>
//   );
// }
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { API_URL } from "../config";
import { getOrCreateDeviceId } from "../services/deviceService";
import {
  getEmergencyContacts,
  getLocalProfile,
} from "../services/localProfileService";

import "./SosPage.css";

const ACTIVE_SOS_KEY = "nirvaya_active_sos";

const PRIMARY = "#ED234F";
const SAFE_GREEN = "#21A67A";
const MEDIUM_ORANGE = "#FF9900";
const DANGER_RED = "#D90429";

export default function SosPage() {
  const navigate = useNavigate();

  const sosUpdateIntervalRef = useRef(null);
  const normalTrackingIntervalRef = useRef(null);
  const lastRiskAlertTimeRef = useRef(0);
  const lastRiskAlertLocationRef = useRef(null);
  const audioRef = useRef(null);

  const [profile, setProfile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [activeSos, setActiveSos] = useState(null);
  const [trackingLink, setTrackingLink] = useState("");

  const [initialRiskLoading, setInitialRiskLoading] = useState(false);
  const [currentRisk, setCurrentRisk] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);

  const [normalTrackingEnabled, setNormalTrackingEnabled] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState("Dhaka");

  useEffect(() => {
    const savedProfile = getLocalProfile();
    setProfile(savedProfile);

    const storedSos = localStorage.getItem(ACTIVE_SOS_KEY);

    if (storedSos) {
      const parsed = JSON.parse(storedSos);

      if (parsed?.sos?.id) {
        setActiveSos(parsed.sos);
        setTrackingLink(parsed.trackingLink || "");
        startSosLocationUpdates(parsed.sos.id);
      }
    }

    fetchCurrentLocationRiskOnce();

    return () => {
      stopSosLocationUpdates();
      stopNormalLocationTracking();
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
          reject(new Error(error.message || "Failed to get location."));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  };

  const calculateDistanceMeters = (pointA, pointB) => {
    if (!pointA || !pointB) return Infinity;

    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(pointB.latitude - pointA.latitude);
    const dLon = toRad(pointB.longitude - pointA.longitude);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(pointA.latitude)) *
        Math.cos(toRad(pointB.latitude)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) return false;

    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;

    const permission = await Notification.requestPermission();
    return permission === "granted";
  };

  const showRiskNotification = ({ title, body }) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
      });
      return;
    }

    alert(`${title}\n${body}`);
  };

  const playSosAlarm = () => {
    if (!audioRef.current) return;

    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {
      console.log("Audio play blocked by browser.");
    });
  };

  const stopSosAlarm = () => {
    if (!audioRef.current) return;

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  };

  const fetchCurrentLocationRiskOnce = async () => {
    try {
      setInitialRiskLoading(true);

      const location = await getCurrentLocation();

      setCurrentCoords(location);

      const deviceId = getOrCreateDeviceId();

      const response = await fetch(`${API_URL}/location/risk-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          district: selectedDistrict,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to check location risk.");
      }

      setCurrentRisk(data.risk);
    } catch (error) {
      console.log("Initial risk check error:", error.message);

      setCurrentRisk({
        risk_level: "unknown",
        risk_score: 0,
        message: error.message,
      });
    } finally {
      setInitialRiskLoading(false);
    }
  };

  const sendNormalLocationUpdateOnce = async () => {
    try {
      const location = await getCurrentLocation();

      setCurrentCoords(location);

      const deviceId = getOrCreateDeviceId();

      const response = await fetch(`${API_URL}/location/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          district: selectedDistrict,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update location.");
      }

      setCurrentRisk(data.risk);

      maybeNotifyHighRisk({
        risk: data.risk,
        location,
      });

      console.log("Normal location updated:", data.location);
    } catch (error) {
      console.log("Normal location update error:", error.message);
    }
  };

  const maybeNotifyHighRisk = ({ risk, location }) => {
    const level = risk?.risk_level;
    const isHighRisk = level === "high" || level === "critical";

    if (!isHighRisk) return;

    const now = Date.now();

    const fiveMinutesPassed =
      now - lastRiskAlertTimeRef.current >= 5 * 60 * 1000;

    const movedDistance = calculateDistanceMeters(
      lastRiskAlertLocationRef.current,
      location
    );

    const movedAtLeast50Meters = movedDistance >= 50;

    const shouldNotify =
      lastRiskAlertTimeRef.current === 0 ||
      fiveMinutesPassed ||
      movedAtLeast50Meters;

    if (!shouldNotify) return;

    lastRiskAlertTimeRef.current = now;
    lastRiskAlertLocationRef.current = location;

    showRiskNotification({
      title:
        level === "critical"
          ? "Critical Risk Zone Alert"
          : "High Risk Zone Alert",
      body: `You are currently in a ${level} risk area. Stay alert and consider using a safer route.`,
    });
  };

  const startNormalLocationTracking = async () => {
    try {
      await requestNotificationPermission();

      if (normalTrackingIntervalRef.current) {
        clearInterval(normalTrackingIntervalRef.current);
      }

      setNormalTrackingEnabled(true);

      await sendNormalLocationUpdateOnce();

      normalTrackingIntervalRef.current = setInterval(() => {
        sendNormalLocationUpdateOnce();
      }, 60000);

      alert(
        "Live safety tracking started. Nirvaya will check your location every 1 minute while this page is open."
      );
    } catch (error) {
      setNormalTrackingEnabled(false);
      alert(error.message);
    }
  };

  const stopNormalLocationTracking = () => {
    if (normalTrackingIntervalRef.current) {
      clearInterval(normalTrackingIntervalRef.current);
      normalTrackingIntervalRef.current = null;
    }

    setNormalTrackingEnabled(false);
  };

  const handleNormalTrackingToggle = async () => {
    if (normalTrackingEnabled) {
      stopNormalLocationTracking();
      alert("Live safety tracking stopped.");
      return;
    }

    await startNormalLocationTracking();
  };

  const handleSosPress = async () => {
    try {
      setLoading(true);

      const deviceId = getOrCreateDeviceId();
      const location = await getCurrentLocation();
      const emergencyContacts = getEmergencyContacts();

      setCurrentCoords(location);

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
          risk_score: currentRisk?.risk_score ?? null,
          emergency_contacts: emergencyContacts,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to start SOS.");
      }

      if (!data?.sos?.id) {
        throw new Error("Invalid SOS response from server.");
      }

      setActiveSos(data.sos);
      setTrackingLink(data.trackingLink || "");

      localStorage.setItem(
        ACTIVE_SOS_KEY,
        JSON.stringify({
          sos: data.sos,
          publicToken: data.publicToken,
          trackingLink: data.trackingLink,
        })
      );

      startSosLocationUpdates(data.sos.id);
      playSosAlarm();

      if (data.alreadyActive) {
        alert(
          "SOS is already active. Nirvaya will continue updating your live location."
        );
      } else {
        alert(
          "SOS sent. Your emergency contacts can use the tracking link to follow your location."
        );
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const startSosLocationUpdates = (sosId) => {
    if (!sosId) return;

    if (sosUpdateIntervalRef.current) {
      clearInterval(sosUpdateIntervalRef.current);
    }

    sendSosLocationUpdateOnce(sosId);

    sosUpdateIntervalRef.current = setInterval(() => {
      sendSosLocationUpdateOnce(sosId);
    }, 30000);
  };

  const sendSosLocationUpdateOnce = async (sosId) => {
    try {
      const location = await getCurrentLocation();

      setCurrentCoords(location);

      const deviceId = getOrCreateDeviceId();

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
      console.log("SOS location update error:", error.message);
    }
  };

  const stopSosLocationUpdates = () => {
    if (sosUpdateIntervalRef.current) {
      clearInterval(sosUpdateIntervalRef.current);
      sosUpdateIntervalRef.current = null;
    }
  };

  const handleResolveSos = async () => {
    if (!activeSos?.id) {
      alert("There is no active SOS to resolve.");
      return;
    }

    const confirmed = window.confirm(
      "Are you safe now? This will stop live location updates and mark your SOS as resolved."
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

      stopSosLocationUpdates();
      stopSosAlarm();

      setActiveSos(null);
      setTrackingLink("");
      localStorage.removeItem(ACTIVE_SOS_KEY);

      alert("SOS resolved. Live location updates have stopped.");
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

  const getInitials = () => {
    const name = profile?.name || "User";

    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const getRiskDisplayText = () => {
    if (initialRiskLoading) return "Checking your area...";
    if (!currentRisk) return "Risk zone not checked yet";

    const level = currentRisk.risk_level;

    if (level === "critical") return "Critical Risk Zone";
    if (level === "high") return "High Risk Zone";
    if (level === "medium") return "Medium Risk Zone";
    if (level === "low") return "Low Risk Zone";

    return "Unknown Risk Zone";
  };

  const getRiskSubtitle = () => {
    if (initialRiskLoading) return "Fetching your current location once";
    if (!currentRisk) return "Waiting for location check";
    if (currentRisk.message) return currentRisk.message;

    const score = currentRisk.risk_score ?? 0;
    const district = currentRisk.district || selectedDistrict || "Unknown";

    return `${district} • Score: ${Number(score).toFixed(1)}`;
  };

  const getRiskIconClass = () => {
    const level = currentRisk?.risk_level;

    if (level === "critical" || level === "high") {
      return "icon-red icon-danger";
    }

    if (level === "medium") {
      return "icon-red icon-medium";
    }

    if (level === "low") {
      return "icon-red icon-safe";
    }

    return "icon-red";
  };

  return (
    <main className="sos-page">
      <audio ref={audioRef} loop>
        <source src="/sos-alarm.mp3" type="audio/mpeg" />
      </audio>

      <section className="phone-frame">
        <header className="sos-header">
          <div>
            <p className="welcome">Welcome back,</p>
            <h1 className="name">{profile?.name || "User"}</h1>
          </div>

          <button className="avatar-wrapper" onClick={() => navigate("/setup")}>
            <span className="avatar-text">{getInitials()}</span>
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
              ? "Your live SOS location is being updated every 30 seconds."
              : "Press the button — help will reach you soon."}
          </p>

          <div className="sos-area">
            <div className="outer-pulse" />
            <div className="middle-pulse" />

            <button
              className={activeSos ? "sos-button sos-button-active" : "sos-button"}
              onClick={handleSosPress}
              disabled={loading || resolving || Boolean(activeSos)}
            >
              {loading ? <span className="spinner" /> : activeSos ? "ACTIVE" : "SOS"}
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
                  Emergency contacts can open this link to track you.
                </p>
              </div>

              <button className="small-button" onClick={copyTrackingLink}>
                Copy
              </button>
            </div>
          )}

          <div className="tracking-card risk-card">
            <div className={getRiskIconClass()} />

            <div className="card-text-box">
              <p className="location-label">Current area risk</p>
              <p className="location-text">{getRiskDisplayText()}</p>
              <p className="zone-text">{getRiskSubtitle()}</p>

              {currentCoords && (
                <p className="coord-text">
                  {currentCoords.latitude.toFixed(5)},{" "}
                  {currentCoords.longitude.toFixed(5)}
                </p>
              )}
            </div>

            {initialRiskLoading ? (
              <span className="mini-loader" />
            ) : (
              <button className="small-button" onClick={fetchCurrentLocationRiskOnce}>
                ↻
              </button>
            )}
          </div>

          <div className="tracking-card">
            <div className={normalTrackingEnabled ? "icon-red icon-safe" : "icon-light"} />

            <div className="card-text-box">
              <p className="card-title">Live safety tracking</p>
              <p className="card-subtitle">
                {normalTrackingEnabled
                  ? "Checking your location every 1 minute"
                  : "Turn on to check risk while this page is open"}
              </p>
            </div>

            <button
              className={normalTrackingEnabled ? "toggle-button on" : "toggle-button"}
              onClick={handleNormalTrackingToggle}
            >
              {normalTrackingEnabled ? "ON" : "OFF"}
            </button>
          </div>

          <button className="route-tab" onClick={() => navigate("/safe-routes")}>
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