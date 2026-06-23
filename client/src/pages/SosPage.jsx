

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Link2,
  FileText,
  MapPin,
  Mic,
  Clock,
  Route,
  Map,
  ChevronRight,
  AlertTriangle,
  X,
} from "lucide-react";

import { API_URL } from "../config";
import { getOrCreateDeviceId } from "../services/deviceService";
import {
  getEmergencyContacts,
  getLocalProfile,
} from "../services/localProfileService";

import "./SosPage.css";

const ACTIVE_SOS_KEY = "nirvaya_active_sos";
const COOLDOWN_MS = 15000;
const COUNTDOWN_SECONDS = 3;
const STATIONARY_CHECK_MS = 10000;
const STATIONARY_THRESHOLD_METERS = 30;
const STATIONARY_DANGER_MINUTES = 0.5;
const BUFFER_SILENCE_RESET_MS = 5000;
const VOICE_DEBUG = import.meta.env.DEV; // logs what the mic hears, dev builds only

const normalizeText = (text = "") =>
  text.toLowerCase().trim().replace(/\s+/g, " ");

const normalizeBanglaKeyword = (text = "") =>
  normalizeText(text)
    .replace(/[।,!?.\-_'"]/g, "")
    .replace(/\s/g, "");

// All patterns are space-free; transcripts are compacted the same way
// before matching, so word breaks never matter.
const KEYWORD_PATTERNS = [
  "সাহায্যকর", // also covers সাহায্যকরো / সাহায্যকরুন as substrings
  "সাহায্যোকর",
  "শাহায্যকর",
  "sahajyokoro",
  "sahajjokor",
  "shahajjokor",
  "shahajyokoro",
];

const containsKeyword = (transcript) => {
  const normalized = normalizeBanglaKeyword(transcript);
  if (!normalized) return false;
  return KEYWORD_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const RISK_LABELS = {
  critical: "Critical risk zone",
  high: "High risk zone",
  medium: "Medium risk zone",
  low: "Low risk zone",
};

// Community report categories — keep these values in sync with the
// CHECK constraint on the user_reports table.
const REPORT_CATEGORIES = [
  { value: "stalking", label: "Stalking", emoji: "🚶" },
  { value: "eve_teasing", label: "Eve teasing", emoji: "🗣️" },
  { value: "suspicious_person", label: "Suspicious person", emoji: "👤" },
  { value: "snatching", label: "Snatching", emoji: "👜" },
  { value: "poor_lighting", label: "Poor lighting", emoji: "💡" },
  { value: "other", label: "Other", emoji: "⚠️" },
];

export default function SosPage() {
  const navigate = useNavigate();

  const sosUpdateIntervalRef = useRef(null);
  const normalTrackingIntervalRef = useRef(null);
  const lastRiskAlertTimeRef = useRef(0);
  const lastRiskAlertLocationRef = useRef(null);
  const audioRef = useRef(null);

  const recognitionRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const countdownActiveRef = useRef(false);
  const lastTriggerRef = useRef(0);
  const restartTimeoutRef = useRef(null);
  const transcriptBufferRef = useRef("");
  const lastResultTimeRef = useRef(0);

  const stationaryCheckIntervalRef = useRef(null);
  const stationaryStartTimeRef = useRef(null);
  const lastMovementLocationRef = useRef(null);
  const responseTimeoutRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // Live mirrors of state the stationary interval needs to read.
  // The interval is created once, so it must read these refs (not the
  // closed-over state) to see up-to-date values on every tick.
  const currentRiskRef = useRef(null);
  const safetyPromptVisibleRef = useRef(false);

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

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceCountdown, setVoiceCountdown] = useState(null);
  const [voiceError, setVoiceError] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");

  const [safetyPromptVisible, setSafetyPromptVisible] = useState(false);
  const [safetyPromptCountdown, setSafetyPromptCountdown] = useState(120);

  const [safeHours, setSafeHours] = useState(null);
  const [safeHoursLoading, setSafeHoursLoading] = useState(false);

  const [incidentReport, setIncidentReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Community incident report (user-submitted)
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState(null);
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const [toast, setToast] = useState(null); // { message, type: "info" | "success" | "danger" }

  const showToast = useCallback((message, type = "info") => {
    clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 5000);
  }, []);

  // Keep the refs in sync so the stationary interval always reads fresh values.
  useEffect(() => {
    currentRiskRef.current = currentRisk;
  }, [currentRisk]);

  useEffect(() => {
    safetyPromptVisibleRef.current = safetyPromptVisible;
  }, [safetyPromptVisible]);

  useEffect(() => {
    if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
      setVoiceReady(true);
    } else {
      setVoiceError(
        "Voice SOS requires Chrome browser. Please open this app in Chrome."
      );
    }
  }, []);

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
      stopVoiceListening();
      stopStationaryMonitoring();
      clearTimeout(toastTimeoutRef.current);
    };
  }, []);
  const getRiskScoreText = () => {
    if (currentRisk?.risk_score == null) return "";
    return `Risk Score: ${currentRisk.risk_score}`;
  };
  const startVoiceListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError("Voice SOS requires Chrome browser.");
      setVoiceEnabled(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "bn-BD";
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setVoiceError("");
      if (VOICE_DEBUG) console.log("Voice SOS listening started.");
    };

    recognition.onresult = (event) => {
      const now = Date.now();
      let primaryChunk = "";
      let keywordInAlternatives = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];

        // Primary transcript goes into the rolling buffer.
        if (result[0]?.transcript) {
          primaryChunk += " " + result[0].transcript;
        }

        // Alternatives are checked directly but NOT buffered,
        // so near-duplicates don't pollute the buffer.
        for (let j = 1; j < result.length; j++) {
          const alt = result[j]?.transcript;
          if (!alt) continue;
          if (VOICE_DEBUG) console.log(`Speech alt[${j}]: "${alt}"`);
          if (containsKeyword(alt)) keywordInAlternatives = true;
        }
      }

      primaryChunk = primaryChunk.trim();
      if (!primaryChunk && !keywordInAlternatives) return;

      if (primaryChunk) {
        if (VOICE_DEBUG) console.log(`Speech heard: "${primaryChunk}"`);
        setLastTranscript(primaryChunk);

        // A long silence gap means earlier words are stale — don't let
        // them combine with new ones into a false trigger.
        if (now - lastResultTimeRef.current > BUFFER_SILENCE_RESET_MS) {
          transcriptBufferRef.current = "";
        }
        lastResultTimeRef.current = now;

        transcriptBufferRef.current =
          `${transcriptBufferRef.current} ${primaryChunk}`.trim().slice(-200);
      }

      const matched =
        keywordInAlternatives || containsKeyword(transcriptBufferRef.current);

      if (matched) {
        // Always clear on a hit — even during cooldown — so the leftover
        // keyword text can't ghost-trigger on the next unrelated phrase.
        transcriptBufferRef.current = "";

        if (now - lastTriggerRef.current >= COOLDOWN_MS) {
          if (VOICE_DEBUG) console.log("Keyword detected — starting countdown.");
          lastTriggerRef.current = now;
          startVoiceCountdown();
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setVoiceError("Microphone access denied.");
        setVoiceEnabled(false);
      } else if (event.error === "network") {
        setVoiceError("Network error. Voice SOS requires internet connection.");
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        restartTimeoutRef.current = setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch (_) {}
        }, 300);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      setVoiceError("Failed to start voice recognition.");
    }
  }, []);

  const stopVoiceListening = useCallback(() => {
    clearTimeout(restartTimeoutRef.current);

    transcriptBufferRef.current = "";
    lastResultTimeRef.current = 0;

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      try {
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }
  }, []);

  const handleVoiceToggle = () => {
    if (voiceEnabled) {
      stopVoiceListening();
      setVoiceEnabled(false);
      clearInterval(countdownTimerRef.current);
      countdownActiveRef.current = false;
      setVoiceCountdown(null);
      setLastTranscript("");
    } else {
      setVoiceEnabled(true);
      startVoiceListening();
    }
  };

  const startVoiceCountdown = useCallback(() => {
    if (countdownActiveRef.current) return;
    countdownActiveRef.current = true;
    let remaining = COUNTDOWN_SECONDS;
    setVoiceCountdown(remaining);

    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setVoiceCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        countdownActiveRef.current = false;
        setVoiceCountdown(null);
        handleSosPress("voice");
      }
    }, 1000);
  }, []);

  const cancelVoiceCountdown = () => {
    clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    countdownActiveRef.current = false;
    setVoiceCountdown(null);
  };

  const startStationaryMonitoring = useCallback(() => {
    if (stationaryCheckIntervalRef.current) return;

    stationaryCheckIntervalRef.current = setInterval(async () => {
      try {
        const location = await getCurrentLocation();
        // Read live values via refs — the interval is created once, so
        // closing over state directly would freeze these on the first run.
        const riskLevel = currentRiskRef.current?.risk_level;
        const isHighRisk = riskLevel === "high" || riskLevel === "critical";

        if (!isHighRisk) {
          stationaryStartTimeRef.current = null;
          lastMovementLocationRef.current = location;
          return;
        }

        const distance = calculateDistanceMeters(
          lastMovementLocationRef.current,
          location
        );

        if (distance < STATIONARY_THRESHOLD_METERS) {
          if (!stationaryStartTimeRef.current) {
            stationaryStartTimeRef.current = Date.now();
          }
          const stationaryMinutes =
            (Date.now() - stationaryStartTimeRef.current) / 60000;

          if (
            stationaryMinutes >= STATIONARY_DANGER_MINUTES &&
            !safetyPromptVisibleRef.current
          ) {
            triggerSafetyPrompt();
          }
        } else {
          stationaryStartTimeRef.current = null;
          lastMovementLocationRef.current = location;
        }
      } catch (err) {
        console.log("Stationary check error:", err.message);
      }
    }, STATIONARY_CHECK_MS);
  }, []); // reads refs only — no stale-closure deps needed

  const stopStationaryMonitoring = () => {
    if (stationaryCheckIntervalRef.current) {
      clearInterval(stationaryCheckIntervalRef.current);
      stationaryCheckIntervalRef.current = null;
    }
    clearInterval(responseTimeoutRef.current);
    stationaryStartTimeRef.current = null;
  };

  const triggerSafetyPrompt = () => {
    setSafetyPromptVisible(true);
    let countdown = 120;
    setSafetyPromptCountdown(countdown);

    responseTimeoutRef.current = setInterval(() => {
      countdown -= 1;
      setSafetyPromptCountdown(countdown);
      if (countdown <= 0) {
        clearInterval(responseTimeoutRef.current);
        setSafetyPromptVisible(false);
        stationaryStartTimeRef.current = null;
        handleSosPress("auto_stationary");
      }
    }, 1000);
  };

  const confirmSafe = () => {
    clearInterval(responseTimeoutRef.current);
    setSafetyPromptVisible(false);
    stationaryStartTimeRef.current = null;
    setSafetyPromptCountdown(120);
  };

  const fetchSafeHours = async () => {
    if (!currentCoords) return;
    try {
      setSafeHoursLoading(true);
      const deviceId = getOrCreateDeviceId();
      const response = await fetch(`${API_URL}/location/safe-hours`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          latitude: currentCoords.latitude,
          longitude: currentCoords.longitude,
          district: selectedDistrict,
        }),
      });
      const data = await response.json();
      if (data.success) setSafeHours(data);
    } catch (err) {
      console.log("Safe hours error:", err.message);
    } finally {
      setSafeHoursLoading(false);
    }
  };

  const generateReport = async (sosId) => {
    try {
      setReportLoading(true);
      const deviceId = getOrCreateDeviceId();
      const response = await fetch(`${API_URL}/sos/${sosId}/incident-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
      });
      const data = await response.json();
      if (data.success) setIncidentReport(data.report);
    } catch (err) {
      console.log("Report error:", err.message);
    } finally {
      setReportLoading(false);
    }
  };

  const copyReport = async () => {
    if (!incidentReport) return;
    try {
      await navigator.clipboard.writeText(incidentReport);
      showToast("Incident report copied to clipboard.", "success");
    } catch {
      showToast("Couldn't copy automatically — select the text to copy.", "info");
    }
  };

  // ── Community incident report ─────────────────────────────────
  const openReport = () => setReportOpen(true);

  const resetReport = () => {
    setReportOpen(false);
    setReportCategory(null);
    setReportDescription("");
  };

  const closeReport = () => {
    if (reportSubmitting) return;
    resetReport();
  };

  const submitUserReport = async () => {
    if (!reportCategory) {
      showToast("Please pick what happened.", "info");
      return;
    }
    try {
      setReportSubmitting(true);

      // Prefer a fresh fix; fall back to the last known coordinates.
      let coords = currentCoords;
      try {
        coords = await getCurrentLocation();
        setCurrentCoords(coords);
      } catch {
        /* keep currentCoords */
      }
      if (!coords) throw new Error("Couldn't get your location. Try again.");

      const deviceId = getOrCreateDeviceId();
      const response = await fetch(`${API_URL}/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          category: reportCategory,
          description: reportDescription.trim() || null,
          latitude: coords.latitude,
          longitude: coords.longitude,
          district: selectedDistrict,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.message || "Failed to submit report.");

      showToast(
        "Report submitted. Thank you for keeping others safe.",
        "success"
      );
      resetReport();
    } catch (error) {
      showToast(error.message, "danger");
    } finally {
      setReportSubmitting(false);
    }
  };

  const getCurrentLocation = () => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.log("❌ Geolocation NOT supported");
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log("✅ Geolocation SUCCESS");
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        console.log("❌ Geolocation FAILED:", err.message);
        resolve(null); // IMPORTANT: never crash UI
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
      new Notification(title, { body, icon: "/favicon.ico" });
      return;
    }
    showToast(`${title} — ${body}`, "danger");
  };

  const playSosAlarm = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
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
      if (!response.ok || !data.success)
        throw new Error(data.message || "Failed to check risk.");
      setCurrentRisk(data.risk);
    } catch (error) {
      console.log("Risk check error:", error.message);
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
      if (!response.ok || !data.success)
        throw new Error(data.message || "Failed to update location.");
      setCurrentRisk(data.risk);
      maybeNotifyHighRisk({ risk: data.risk, location });
    } catch (error) {
      console.log("Location update error:", error.message);
    }
  };

  const maybeNotifyHighRisk = ({ risk, location }) => {
    const level = risk?.risk_level;
    if (level !== "high" && level !== "critical") return;
    const now = Date.now();
    const fiveMinutesPassed =
      now - lastRiskAlertTimeRef.current >= 5 * 60 * 1000;
    const movedDistance = calculateDistanceMeters(
      lastRiskAlertLocationRef.current,
      location
    );
    const shouldNotify =
      lastRiskAlertTimeRef.current === 0 ||
      fiveMinutesPassed ||
      movedDistance >= 50;
    if (!shouldNotify) return;
    lastRiskAlertTimeRef.current = now;
    lastRiskAlertLocationRef.current = location;
    showRiskNotification({
      title:
        level === "critical"
          ? "Critical Risk Zone Alert"
          : "High Risk Zone Alert",
      body: `You are in a ${level} risk area. Stay alert.`,
    });
  };

  const startNormalLocationTracking = async () => {
    try {
      await requestNotificationPermission();
      if (normalTrackingIntervalRef.current)
        clearInterval(normalTrackingIntervalRef.current);
      setNormalTrackingEnabled(true);
      await sendNormalLocationUpdateOnce();
      normalTrackingIntervalRef.current = setInterval(
        sendNormalLocationUpdateOnce,
        60000
      );
      startStationaryMonitoring();
      showToast(
        "Live safety tracking is on. Nirvaya checks your location every minute.",
        "success"
      );
    } catch (error) {
      setNormalTrackingEnabled(false);
      showToast(error.message, "danger");
    }
  };

  const stopNormalLocationTracking = () => {
    if (normalTrackingIntervalRef.current) {
      clearInterval(normalTrackingIntervalRef.current);
      normalTrackingIntervalRef.current = null;
    }
    stopStationaryMonitoring();
    setNormalTrackingEnabled(false);
  };

  const handleNormalTrackingToggle = async () => {
    if (normalTrackingEnabled) {
      stopNormalLocationTracking();
      showToast("Live safety tracking stopped.", "info");
      return;
    }
    await startNormalLocationTracking();
  };

  const handleSosPress = async (triggerType = "button") => {
    try {
      setLoading(true);
      const deviceId = getOrCreateDeviceId();
      const location = await getCurrentLocation();
      const emergencyContacts = getEmergencyContacts();
      setCurrentCoords(location);

      // Use the live risk score via ref so an auto-stationary trigger logs
      // the current value rather than a stale closure capture.
      const riskScore =
        currentRiskRef.current?.risk_score ?? currentRisk?.risk_score ?? null;

      const response = await fetch(`${API_URL}/sos/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          trigger_type: triggerType,
          risk_score: riskScore,
          emergency_contacts: emergencyContacts,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.message || "Failed to start SOS.");
      if (!data?.sos?.id) throw new Error("Invalid SOS response from server.");

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

      const triggerMessages = {
        voice: "Voice SOS sent. Your emergency contacts can track your location.",
        auto_stationary:
          "AI detected you were stationary in a danger zone, so SOS was sent automatically.",
        button:
          "SOS sent. Your emergency contacts can follow your live location.",
      };

      showToast(
        data.alreadyActive
          ? "SOS is already active. Your live location keeps updating."
          : triggerMessages[triggerType] || triggerMessages.button,
        "success"
      );
    } catch (error) {
      console.error("SOS error:", error.message);
      showToast(error.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  const startSosLocationUpdates = (sosId) => {
    if (!sosId) return;
    if (sosUpdateIntervalRef.current)
      clearInterval(sosUpdateIntervalRef.current);
    sendSosLocationUpdateOnce(sosId);
    sosUpdateIntervalRef.current = setInterval(
      () => sendSosLocationUpdateOnce(sosId),
      30000
    );
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
      if (!response.ok || !data.success)
        throw new Error(data.message || "Failed to update SOS location.");
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
      showToast("There is no active SOS to resolve.", "info");
      return;
    }
    const confirmed = window.confirm(
      "Are you safe now? This will stop live location updates and mark your SOS as resolved."
    );
    if (!confirmed) return;
    try {
      setResolving(true);
      const deviceId = getOrCreateDeviceId();
      const resolvedSosId = activeSos.id;

      const response = await fetch(`${API_URL}/sos/${resolvedSosId}/resolve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
      });
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.message || "Failed to resolve SOS.");

      stopSosLocationUpdates();
      stopSosAlarm();
      setActiveSos(null);
      setTrackingLink("");
      localStorage.removeItem(ACTIVE_SOS_KEY);
      showToast("SOS resolved. Live location updates have stopped.", "success");

      generateReport(resolvedSosId);
    } catch (error) {
      showToast(error.message, "danger");
    } finally {
      setResolving(false);
    }
  };

  const copyTrackingLink = async () => {
    if (!trackingLink) return;
    try {
      await navigator.clipboard.writeText(trackingLink);
      showToast("Tracking link copied.", "success");
    } catch {
      showToast("Couldn't copy automatically — long-press the link to copy.", "info");
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

  const riskLevel = currentRisk?.risk_level || "unknown";

  const getRiskDisplayText = () => {
    if (initialRiskLoading) return "Checking your area…";
    if (!currentRisk) return "Risk not checked yet";
    return RISK_LABELS[riskLevel] || "Risk unknown";
  };

  return (
    <main className={activeSos ? "sos-page sos-page-active" : "sos-page"}>
      <audio ref={audioRef} loop>
        <source src="/sos-alarm.mp3" type="audio/mpeg" />
      </audio>

      <section className="phone-frame">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="sos-header">
          <div>
            <p className="welcome">Welcome back,</p>
            <h1 className="name">{profile?.name || "User"}</h1>
          </div>
          <button
            className="avatar-wrapper"
            onClick={() => navigate("/setup")}
            aria-label="Open profile and emergency contacts"
          >
            <span className="avatar-text">{getInitials()}</span>
            {activeSos && <span className="badge active-badge">!</span>}
          </button>
        </header>

        {/* ── Current risk strip ─────────────────────────────────── */}
        <button
          className={`risk-strip risk-${riskLevel}`}
          onClick={fetchCurrentLocationRiskOnce}
          disabled={initialRiskLoading}
          aria-live="polite"
        >
          <span className="risk-strip-dot" />

          <span className="risk-strip-info">
            <span className="risk-strip-text">{getRiskDisplayText()}</span>

            {!initialRiskLoading && getRiskScoreText() && (
              <span className="risk-strip-score">{getRiskScoreText()}</span>
            )}
          </span>

          <span className="risk-strip-action">
            {initialRiskLoading ? <span className="mini-loader" /> : "Refresh"}
          </span>
        </button>

        <section className="sos-content">
          {/* ── Hero: the SOS button ─────────────────────────────── */}
          <div className="sos-hero">
            <h2 className="title">
              {activeSos ? "SOS is active" : "Are you in danger?"}
            </h2>
            <p className="subtitle">
              {activeSos
                ? "Your live location is shared with your emergency contacts every 30 seconds."
                : "Press and hold — one tap alerts your emergency contacts with your live location."}
            </p>

            <div className={`sos-area ring-${riskLevel}`}>
              {activeSos && (
                <>
                  <div className="outer-pulse" />
                  <div className="middle-pulse" />
                </>
              )}
              <button
                className={
                  activeSos ? "sos-button sos-button-active" : "sos-button"
                }
                onClick={() => handleSosPress("button")}
                disabled={loading || resolving || Boolean(activeSos)}
                aria-label="Send SOS alert"
              >
                {loading ? (
                  <span className="spinner" />
                ) : activeSos ? (
                  <>
                    <span className="sos-button-main">ACTIVE</span>
                    <span className="sos-button-sub">help is on the way</span>
                  </>
                ) : (
                  <>
                    <span className="sos-button-main">SOS</span>
                    <span className="sos-button-sub">tap for help</span>
                  </>
                )}
              </button>
            </div>

            {activeSos && (
              <button
                className="safe-button"
                onClick={handleResolveSos}
                disabled={resolving || loading}
              >
                {resolving ? "Resolving…" : "I'm safe — resolve SOS"}
              </button>
            )}
          </div>

          {/* ── Active SOS: tracking link ────────────────────────── */}
          {trackingLink && (
            <div className="card card-tracking">
              <div className="card-icon icon-link" aria-hidden="true">
                <Link2 size={20} strokeWidth={2.2} />
              </div>
              <div className="card-text-box">
                <p className="card-title">Live tracking link</p>
                <p className="tracking-link">{trackingLink}</p>
                <p className="card-hint">
                  Anyone with this link can follow your location until you
                  resolve the SOS.
                </p>
              </div>
              <button className="small-button" onClick={copyTrackingLink}>
                Copy
              </button>
            </div>
          )}

          {/* ── Incident report ──────────────────────────────────── */}
          {reportLoading && (
            <div className="card">
              <span className="mini-loader" />
              <div className="card-text-box">
                <p className="card-subtitle">Generating incident report…</p>
              </div>
            </div>
          )}

          {incidentReport && (
            <div className="card card-column">
              <div className="card-row">
                <div className="card-icon icon-doc" aria-hidden="true">
                  <FileText size={20} strokeWidth={2.2} />
                </div>
                <div className="card-text-box">
                  <p className="card-title">Incident report ready</p>
                  <p className="card-subtitle">
                    A summary of this SOS you can share with police or family.
                  </p>
                </div>
                <button className="small-button" onClick={copyReport}>
                  Copy
                </button>
              </div>
              <div className="report-body">{incidentReport}</div>
            </div>
          )}

          {/* ── Protection tools ─────────────────────────────────── */}
          <h3 className="section-heading">Protection tools</h3>

          <div className="card">
            <div
              className={
                normalTrackingEnabled
                  ? "card-icon icon-on"
                  : "card-icon icon-off"
              }
              aria-hidden="true"
            >
              <MapPin size={20} strokeWidth={2.2} />
            </div>
            <div className="card-text-box">
              <p className="card-title">Live safety tracking</p>
              <p className="card-subtitle">
                {normalTrackingEnabled
                  ? "Checking your area every minute and watching for danger"
                  : "Checks your area every minute while this page is open"}
              </p>
            </div>
            <button
              className={
                normalTrackingEnabled ? "toggle-button on" : "toggle-button"
              }
              onClick={handleNormalTrackingToggle}
              aria-pressed={normalTrackingEnabled}
            >
              {normalTrackingEnabled ? "ON" : "OFF"}
            </button>
          </div>

          <div className="card">
            <div
              className={voiceEnabled ? "card-icon icon-on" : "card-icon icon-off"}
              aria-hidden="true"
            >
              <Mic size={20} strokeWidth={2.2} />
            </div>
            <div className="card-text-box">
              <p className="card-title">Voice SOS — "সাহায্য করো"</p>
              <p className="card-subtitle">
                {!voiceReady && !voiceError
                  ? "Checking browser support…"
                  : voiceEnabled
                  ? lastTranscript
                    ? `Heard: "${lastTranscript}"`
                    : "Listening for the keyword…"
                  : "Say \u201cসাহায্য করো\u201d to send SOS hands-free"}
              </p>
              {voiceError && <p className="card-error">{voiceError}</p>}
            </div>
            <button
              className={voiceEnabled ? "toggle-button on" : "toggle-button"}
              onClick={handleVoiceToggle}
              disabled={!voiceReady}
              aria-pressed={voiceEnabled}
            >
              {voiceEnabled ? "ON" : "OFF"}
            </button>
          </div>

          {/* ── Community safety ─────────────────────────────────── */}
          <h3 className="section-heading">Community safety</h3>

          <button className="route-tab" onClick={openReport}>
            <div className="card-icon icon-report" aria-hidden="true">
              <AlertTriangle size={20} strokeWidth={2.2} />
            </div>
            <div className="card-text-box">
              <p className="card-title">Report an incident</p>
              <p className="card-subtitle">
                Warn nearby women about stalking, snatching, poor lighting &amp;
                more
              </p>
            </div>
            <span className="arrow" aria-hidden="true">
              <ChevronRight size={22} strokeWidth={2.2} />
            </span>
          </button>

          {/* ── Plan ahead ───────────────────────────────────────── */}
          <h3 className="section-heading">Plan ahead</h3>

          <div className="card">
            <div className="card-icon icon-off" aria-hidden="true">
              <Clock size={20} strokeWidth={2.2} />
            </div>
            <div className="card-text-box">
              <p className="card-title">Safest time to travel</p>
              <p className="card-subtitle">
                {safeHoursLoading
                  ? "Analyzing the next 12 hours…"
                  : safeHours?.recommendation ||
                    "Check the safest hours for your area"}
              </p>
            </div>
            {safeHoursLoading ? (
              <span className="mini-loader" />
            ) : (
              <button
                className="small-button"
                onClick={fetchSafeHours}
                disabled={false}
              >
                {safeHours ? "Refresh" : "Check"}
              </button>
            )}
          </div>

          <button className="route-tab" onClick={() => navigate("/safe-routes")}>
            <div className="card-icon icon-off" aria-hidden="true">
              <Route size={20} strokeWidth={2.2} />
            </div>
            <div className="card-text-box">
              <p className="card-title">Safe routes</p>
              <p className="card-subtitle">Find safer paths ranked by Nirvaya</p>
            </div>
            <span className="arrow" aria-hidden="true">
              <ChevronRight size={22} strokeWidth={2.2} />
            </span>
          </button>

          <button className="route-tab" onClick={() => navigate("/heatmap")}>
            <div className="card-icon icon-off" aria-hidden="true">
              <Map size={20} strokeWidth={2.2} />
            </div>
            <div className="card-text-box">
              <p className="card-title">Safety heatmap</p>
              <p className="card-subtitle">See live risk zones on the map</p>
            </div>
            <span className="arrow" aria-hidden="true">
              <ChevronRight size={22} strokeWidth={2.2} />
            </span>
          </button>
        </section>
      </section>

      {/* ── Urgent overlays: cannot be missed ──────────────────────── */}
      {safetyPromptVisible && (
        <div className="urgent-overlay" role="alertdialog" aria-live="assertive">
          <div className="urgent-sheet urgent-warning">
            <p className="urgent-title">Are you safe?</p>
            <p className="urgent-text">
              You've been in the same spot inside a high-risk zone for over{" "}
              {STATIONARY_DANGER_MINUTES} minutes.
            </p>
            <p className="urgent-countdown">
              SOS sends automatically in <strong>{safetyPromptCountdown}s</strong>
            </p>
            <div className="urgent-actions">
              <button className="urgent-confirm" onClick={confirmSafe}>
                I'm safe
              </button>
              <button
                className="urgent-sos"
                onClick={() => {
                  confirmSafe();
                  handleSosPress("button");
                }}
              >
                Send SOS now
              </button>
            </div>
          </div>
        </div>
      )}

      {voiceCountdown !== null && (
        <div className="urgent-overlay" role="alertdialog" aria-live="assertive">
          <div className="urgent-sheet urgent-danger">
            <p className="urgent-title">Voice SOS detected</p>
            <p className="urgent-countdown-big">{voiceCountdown}</p>
            <p className="urgent-text">
              Sending SOS to your emergency contacts. Do nothing to send.
            </p>
            <div className="urgent-actions">
              <button className="urgent-confirm" onClick={cancelVoiceCountdown}>
                Cancel — I'm safe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Report an incident sheet ───────────────────────────────── */}
      {reportOpen && (
        <div className="urgent-overlay" role="dialog" aria-modal="true">
          <div className="urgent-sheet report-sheet">
            <div className="report-head">
              <p className="urgent-title report-title">
                <AlertTriangle size={20} strokeWidth={2.2} />
                Report an incident
              </p>
              <button
                className="report-close"
                onClick={closeReport}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <p className="urgent-text report-sub">
              Your report is anonymous and helps warn other women nearby.
            </p>

            <div className="report-grid">
              {REPORT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={
                    reportCategory === c.value
                      ? "report-chip report-chip-active"
                      : "report-chip"
                  }
                  onClick={() => setReportCategory(c.value)}
                >
                  <span className="report-chip-emoji">{c.emoji}</span>
                  {c.label}
                </button>
              ))}
            </div>

            <textarea
              className="report-textarea"
              placeholder="Add a short note (optional) — what did you see?"
              maxLength={500}
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
            />

            <div className="urgent-actions">
              <button
                type="button"
                className="report-cancel"
                onClick={closeReport}
                disabled={reportSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="report-submit"
                onClick={submitUserReport}
                disabled={reportSubmitting}
              >
                {reportSubmitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────── */}
      {toast && (
        <div className={`toast toast-${toast.type}`} role="status">
          {toast.message}
        </div>
      )}
    </main>
  );
}




