import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as tf from "@tensorflow/tfjs";

import { API_URL } from "../config";
import { getOrCreateDeviceId } from "../services/deviceService";
import {
  getEmergencyContacts,
  getLocalProfile,
} from "../services/localProfileService";

import "./SosPage.css";

const ACTIVE_SOS_KEY = "nirvaya_active_sos";
const SAMPLE_RATE = 16000;
const DURATION = 2;
const N_MFCC = 40;
const N_FRAMES = 64;
const THRESHOLD = 0.60;
const COOLDOWN_MS = 15000;
const COUNTDOWN_SECONDS = 3;

// ─── Hanning window ──────────────────────────────────────────────────────────
const makeHanningWindow = (size) => {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
};

// ─── FFT ─────────────────────────────────────────────────────────────────────
const fft = (signal) => {
  const N = signal.length;
  if (N <= 1) return signal;
  const even = fft(signal.filter((_, i) => i % 2 === 0));
  const odd = fft(signal.filter((_, i) => i % 2 !== 0));
  const result = new Array(N);
  for (let k = 0; k < N / 2; k++) {
    const angle = (-2 * Math.PI * k) / N;
    const re = Math.cos(angle) * odd[k][0] - Math.sin(angle) * odd[k][1];
    const im = Math.cos(angle) * odd[k][1] + Math.sin(angle) * odd[k][0];
    result[k] = [even[k][0] + re, even[k][1] + im];
    result[k + N / 2] = [even[k][0] - re, even[k][1] - im];
  }
  return result;
};

// ─── Mel filterbank ──────────────────────────────────────────────────────────
const melFilterbank = (numFilters, fftSize, sampleRate) => {
  const melMin = 0;
  const melMax = 2595 * Math.log10(1 + sampleRate / 2 / 700);
  const melPoints = Array.from({ length: numFilters + 2 }, (_, i) =>
    melMin + (i * (melMax - melMin)) / (numFilters + 1)
  );
  const hzPoints = melPoints.map((m) => 700 * (Math.pow(10, m / 2595) - 1));
  const binPoints = hzPoints.map((h) =>
    Math.floor((fftSize * h) / sampleRate)
  );
  const filterbank = [];
  for (let m = 1; m <= numFilters; m++) {
    const filter = new Float32Array(fftSize / 2 + 1);
    for (let k = 0; k < fftSize / 2 + 1; k++) {
      if (k >= binPoints[m - 1] && k <= binPoints[m]) {
        filter[k] =
          (k - binPoints[m - 1]) / (binPoints[m] - binPoints[m - 1]);
      } else if (k >= binPoints[m] && k <= binPoints[m + 1]) {
        filter[k] =
          (binPoints[m + 1] - k) / (binPoints[m + 1] - binPoints[m]);
      }
    }
    filterbank.push(filter);
  }
  return filterbank;
};

const FILTERBANK = melFilterbank(128, 512, SAMPLE_RATE);
const HANNING = makeHanningWindow(512);

// ─── MFCC ────────────────────────────────────────────────────────────────────
const computeMFCC = (audioBuffer) => {
  const frameSize = 512;
  const hopSize = 256;
  const numMelFilters = 128;
  const frames = [];

  for (
    let start = 0;
    start + frameSize <= audioBuffer.length;
    start += hopSize
  ) {
    const frame = audioBuffer.slice(start, start + frameSize);
    const windowed = Array.from(frame).map((v, i) => v * HANNING[i]);
    const padded = windowed.map((v) => [v, 0]);
    const spectrum = fft(padded);
    const power = spectrum
      .slice(0, frameSize / 2 + 1)
      .map(([re, im]) => re * re + im * im);

    const melEnergies = FILTERBANK.map((filter) => {
      let energy = 0;
      for (let k = 0; k < filter.length; k++) energy += filter[k] * power[k];
      return Math.log(energy + 1e-6);
    });

    const mfcc = new Float32Array(N_MFCC);
    for (let i = 0; i < N_MFCC; i++) {
      let sum = 0;
      for (let j = 0; j < numMelFilters; j++) {
        sum +=
          melEnergies[j] *
          Math.cos((Math.PI * i * (2 * j + 1)) / (2 * numMelFilters));
      }
      mfcc[i] = sum;
    }
    frames.push(mfcc);
    if (frames.length >= N_FRAMES) break;
  }

  while (frames.length < N_FRAMES) {
    frames.push(new Float32Array(N_MFCC));
  }

  return frames.slice(0, N_FRAMES);
};

export default function SosPage() {
  const navigate = useNavigate();

  // ─── Existing refs ─────────────────────────────────────────────────────
  const sosUpdateIntervalRef = useRef(null);
  const normalTrackingIntervalRef = useRef(null);
  const lastRiskAlertTimeRef = useRef(0);
  const lastRiskAlertLocationRef = useRef(null);
  const audioRef = useRef(null);

  // ─── Voice refs ────────────────────────────────────────────────────────
  const modelRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const audioBufferRef = useRef([]);
  const lastTriggerRef = useRef(0);
  const isListeningRef = useRef(false);
  const countdownTimerRef = useRef(null);
  const countdownActiveRef = useRef(false);
  const inferenceCounterRef = useRef(0);
  const inferenceRunningRef = useRef(false);

  // ─── Existing state ────────────────────────────────────────────────────
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

  // ─── Voice state ───────────────────────────────────────────────────────
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceCountdown, setVoiceCountdown] = useState(null);
  const [voiceError, setVoiceError] = useState("");
  const [lastScore, setLastScore] = useState(null);

  // ─── Load TF.js model ──────────────────────────────────────────────────
  useEffect(() => {
    const loadModel = async () => {
      try {
        console.log("Loading keyword model...");
        const m = await tf.loadLayersModel(
          "/keyword_model_tfjs/model.json"
        );
        modelRef.current = m;
        const dummy = tf.zeros([1, N_FRAMES, N_MFCC, 1]);
        await modelRef.current.predict(dummy).data();
        dummy.dispose();
        setVoiceReady(true);
        console.log("Keyword model loaded and ready.");
      } catch (err) {
        console.error("Failed to load keyword model:", err);
        setVoiceError("Voice model failed to load.");
      }
    };
    loadModel();
  }, []);

  // ─── Existing init ─────────────────────────────────────────────────────
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
    };
  }, []);

  // ─── Voice: inference ──────────────────────────────────────────────────
  const runInference = useCallback(async (audioData) => {
    if (!modelRef.current) return;
    if (inferenceRunningRef.current) return;
    inferenceRunningRef.current = true;

    try {
      const mfcc = computeMFCC(audioData);
      const flat = [];
      for (let i = 0; i < N_FRAMES; i++) {
        for (let j = 0; j < N_MFCC; j++) {
          flat.push(mfcc[i][j]);
        }
      }
      const inputTensor = tf.tensor4d(flat, [1, N_FRAMES, N_MFCC, 1]);
      const prediction = modelRef.current.predict(inputTensor);
      const score = (await prediction.data())[0];
      inputTensor.dispose();
      prediction.dispose();

      setLastScore(score.toFixed(3));
      console.log("Keyword score:", score.toFixed(3));

      if (score >= THRESHOLD) {
        const now = Date.now();
        if (now - lastTriggerRef.current >= COOLDOWN_MS) {
          lastTriggerRef.current = now;
          startVoiceCountdown();
        }
      }
    } catch (err) {
      console.error("Inference error:", err);
    } finally {
      inferenceRunningRef.current = false;
    }
  }, []);

  // ─── Voice: start listening ────────────────────────────────────────────
  const startVoiceListening = useCallback(async () => {
    if (isListeningRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const targetSamples = SAMPLE_RATE * DURATION;

      processor.onaudioprocess = (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        audioBufferRef.current.push(...Array.from(channelData));

        if (audioBufferRef.current.length > targetSamples) {
          audioBufferRef.current = audioBufferRef.current.slice(
            audioBufferRef.current.length - targetSamples
          );
          inferenceCounterRef.current += 1;
          if (inferenceCounterRef.current % 3 === 0) {
            runInference(new Float32Array(audioBufferRef.current));
          }
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      isListeningRef.current = true;
      setVoiceError("");
      console.log("Voice SOS listening started.");
    } catch (err) {
      setVoiceError("Microphone access denied.");
      setVoiceEnabled(false);
      console.error("Mic error:", err);
    }
  }, [runInference]);

  // ─── Voice: stop listening ─────────────────────────────────────────────
  const stopVoiceListening = useCallback(() => {
    try {
      processorRef.current?.disconnect();
      audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    isListeningRef.current = false;
    inferenceRunningRef.current = false;
    audioBufferRef.current = [];
    inferenceCounterRef.current = 0;
    console.log("Voice SOS listening stopped.");
  }, []);

  // ─── Voice: toggle ─────────────────────────────────────────────────────
  const handleVoiceToggle = async () => {
    if (voiceEnabled) {
      stopVoiceListening();
      setVoiceEnabled(false);
      clearInterval(countdownTimerRef.current);
      countdownActiveRef.current = false;
      setVoiceCountdown(null);
      setLastScore(null);
    } else {
      setVoiceEnabled(true);
      await startVoiceListening();
    }
  };

  // ─── Voice: countdown ──────────────────────────────────────────────────
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

  // ─── Location ──────────────────────────────────────────────────────────
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
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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
    alert(`${title}\n${body}`);
  };

  const playSosAlarm = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => console.log("Audio play blocked."));
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
        throw new Error(data.message || "Failed to check location risk.");
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
      if (!response.ok || !data.success)
        throw new Error(data.message || "Failed to update location.");
      setCurrentRisk(data.risk);
      maybeNotifyHighRisk({ risk: data.risk, location });
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
      if (normalTrackingIntervalRef.current)
        clearInterval(normalTrackingIntervalRef.current);
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

  // ─── SOS trigger ───────────────────────────────────────────────────────
  const handleSosPress = async (triggerType = "button") => {
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
          trigger_type: triggerType,
          risk_score: currentRisk?.risk_score ?? null,
          emergency_contacts: emergencyContacts,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.message || "Failed to start SOS.");
      if (!data?.sos?.id)
        throw new Error("Invalid SOS response from server.");

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
          triggerType === "voice"
            ? "Voice SOS sent. Your emergency contacts can track your location."
            : "SOS sent. Your emergency contacts can use the tracking link to follow your location."
        );
      }
    } catch (error) {
      console.error("SOS error:", error.message);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const startSosLocationUpdates = (sosId) => {
    if (!sosId) return;
    if (sosUpdateIntervalRef.current)
      clearInterval(sosUpdateIntervalRef.current);
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
      if (!response.ok || !data.success)
        throw new Error(data.message || "Failed to update SOS location.");
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
      const response = await fetch(
        `${API_URL}/sos/${activeSos.id}/resolve`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": deviceId,
          },
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.message || "Failed to resolve SOS.");
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
    if (level === "critical" || level === "high") return "icon-red icon-danger";
    if (level === "medium") return "icon-red icon-medium";
    if (level === "low") return "icon-red icon-safe";
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
          <button
            className="avatar-wrapper"
            onClick={() => navigate("/setup")}
          >
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
              className={
                activeSos ? "sos-button sos-button-active" : "sos-button"
              }
              onClick={() => handleSosPress("button")}
              disabled={loading || resolving || Boolean(activeSos)}
            >
              {loading ? (
                <span className="spinner" />
              ) : activeSos ? (
                "ACTIVE"
              ) : (
                "SOS"
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

          {/* ── Voice countdown overlay ──────────────────────────────── */}
          {voiceCountdown !== null && (
            <div
              className="tracking-card"
              style={{ borderColor: "#ED234F", background: "#fff0f3" }}
            >
              <div className="icon-red icon-danger" />
              <div className="card-text-box">
                <p className="location-label">Voice SOS detected</p>
                <p className="location-text">
                  Sending SOS in {voiceCountdown}s...
                </p>
                <p className="zone-text">
                  Say nothing to send, or tap Cancel.
                </p>
              </div>
              <button
                className="small-button"
                onClick={cancelVoiceCountdown}
              >
                Cancel
              </button>
            </div>
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
              <button
                className="small-button"
                onClick={fetchCurrentLocationRiskOnce}
              >
                ↻
              </button>
            )}
          </div>

          <div className="tracking-card">
            <div
              className={
                normalTrackingEnabled ? "icon-red icon-safe" : "icon-light"
              }
            />
            <div className="card-text-box">
              <p className="card-title">Live safety tracking</p>
              <p className="card-subtitle">
                {normalTrackingEnabled
                  ? "Checking your location every 1 minute"
                  : "Turn on to check risk while this page is open"}
              </p>
            </div>
            <button
              className={
                normalTrackingEnabled ? "toggle-button on" : "toggle-button"
              }
              onClick={handleNormalTrackingToggle}
            >
              {normalTrackingEnabled ? "ON" : "OFF"}
            </button>
          </div>

          {/* ── Voice SOS card ───────────────────────────────────────── */}
          <div className="tracking-card">
            <div
              className={voiceEnabled ? "icon-red icon-safe" : "icon-light"}
            />
            <div className="card-text-box">
              <p className="card-title">Voice SOS — "সাহায্য করো"</p>
              <p className="card-subtitle">
                {!voiceReady
                  ? "Loading voice model..."
                  : voiceEnabled
                  ? `Listening... ${
                      lastScore ? `(score: ${lastScore})` : ""
                    }`
                  : "Say the keyword to trigger SOS hands-free"}
              </p>
              {voiceError && (
                <p className="zone-text" style={{ color: "#D90429" }}>
                  {voiceError}
                </p>
              )}
            </div>
            <button
              className={voiceEnabled ? "toggle-button on" : "toggle-button"}
              onClick={handleVoiceToggle}
              disabled={!voiceReady}
            >
              {voiceEnabled ? "ON" : "OFF"}
            </button>
          </div>

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