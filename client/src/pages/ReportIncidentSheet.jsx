import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import { API_URL } from "../config";
import { getOrCreateDeviceId } from "../services/deviceService";

import "./ReportIncidentSheet.css";

const CATEGORIES = [
  { value: "stalking", label: "Stalking", emoji: "🚶" },
  { value: "eve_teasing", label: "Eve teasing", emoji: "🗣️" },
  { value: "suspicious_person", label: "Suspicious person", emoji: "👤" },
  { value: "snatching", label: "Snatching", emoji: "👜" },
  { value: "poor_lighting", label: "Poor lighting", emoji: "💡" },
  { value: "other", label: "Other", emoji: "⚠️" },
];

export default function ReportIncidentSheet({
  open,
  onClose,
  district = "Dhaka",
  getCurrentLocation, // optional: () => Promise<{latitude, longitude}>
  currentCoords, // optional fallback: { latitude, longitude }
  showToast,
  onReported, // optional callback(report) after a successful submit
}) {
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const reset = () => {
    setCategory(null);
    setDescription("");
    setSubmitting(false);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (!category) {
      showToast?.("Please pick what happened.", "info");
      return;
    }
    try {
      setSubmitting(true);

      // Prefer a fresh fix; fall back to the last known coords.
      let coords = currentCoords;
      if (getCurrentLocation) {
        try {
          coords = await getCurrentLocation();
        } catch {
          /* keep currentCoords */
        }
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
          category,
          description: description.trim() || null,
          latitude: coords.latitude,
          longitude: coords.longitude,
          district,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to submit report.");
      }

      showToast?.(
        "Report submitted. Thank you for keeping others safe.",
        "success"
      );
      onReported?.(data.report);
      reset();
      onClose();
    } catch (err) {
      showToast?.(err.message, "danger");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="urgent-overlay" role="dialog" aria-modal="true">
      <div className="report-sheet">
        <div className="report-sheet-head">
          <div className="report-sheet-title">
            <AlertTriangle size={20} strokeWidth={2.2} />
            <span>Report an incident</span>
          </div>
          <button className="report-close" onClick={close} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className="report-sheet-sub">
          Your report is anonymous and helps warn other women nearby.
        </p>

        <div className="report-grid">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              className={
                category === c.value
                  ? "report-chip report-chip-active"
                  : "report-chip"
              }
              onClick={() => setCategory(c.value)}
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="report-actions">
          <button
            type="button"
            className="report-cancel"
            onClick={close}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="report-submit"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}
