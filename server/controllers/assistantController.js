// server/controllers/assistantController.js
//
// LLM-FREE version.
//   1. Regex/keyword parse  -> { origin, destination, hour }
//   2. analyzeRouteSafety() -> grounded numbers from your Random Forest
//   3. Template synthesis   -> a clean, natural answer built from the data
//
// No Anthropic, no Gemini, no API keys beyond ORS. Nothing to fail at runtime.

import { analyzeRouteSafety } from "../services/safetyAssistantService.js";

// ---------------------------------------------------------------------------
// 1) Parse the question  (no LLM)
// ---------------------------------------------------------------------------

// "10 PM" / "10pm" / "7 am" / "22:00" / "noon" / "midnight" -> 0-23
const parseHour = (text) => {
  const t = text.toLowerCase();

  if (/\bnoon\b/.test(t)) return 12;
  if (/\bmidnight\b/.test(t)) return 0;

  // 24h "22:00" or "22.00"
  const h24 = t.match(/\b([01]?\d|2[0-3])[:.]\s*[0-5]\d\b/);
  if (h24) return Number(h24[1]);

  // "10 pm", "7am", "10 p.m."
  const ampm = t.match(/\b(\d{1,2})\s*(?:o'?clock\s*)?(a\.?m\.?|p\.?m\.?)\b/);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (/p/.test(ampm[2])) h += 12;
    return h;
  }

  // bare "at 22" / "at 9"
  const bare = t.match(/\bat\s+(\d{1,2})\b/);
  if (bare) {
    const h = Number(bare[1]);
    if (h >= 0 && h <= 23) return h;
  }

  return null; // service falls back to current Dhaka hour
};

// Pull origin + destination from "from X to Y" / "X to Y"
const parsePlaces = (text) => {
  // strip the time part so it doesn't leak into the destination
  const cleaned = text
    .replace(/\bat\s+\d{1,2}\s*(?:o'?clock)?\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi, " ")
    .replace(/\b([01]?\d|2[0-3])[:.]\s*[0-5]\d\b/g, " ")
    .replace(/\b(right now|now|tonight|today|noon|midnight)\b/gi, " ")
    .replace(/[?.!]/g, " ")
    .trim();

  // "from X to Y"
  let m = cleaned.match(/from\s+(.+?)\s+to\s+(.+)/i);
  if (m) return { origin: m[1].trim(), destination: m[2].trim() };

  // "X to Y"
  m = cleaned.match(/^(.+?)\s+to\s+(.+)/i);
  if (m) return { origin: m[1].trim(), destination: m[2].trim() };

  return { origin: null, destination: null };
};

// ---------------------------------------------------------------------------
// 3) Build the answer from the data  (no LLM)
// ---------------------------------------------------------------------------

const buildAnswer = (a) => {
  const o = a.origin?.label || "your start";
  const d = a.destination?.label || "your destination";
  const win = a.recommended_window;
  const parts = [];

  parts.push(
    `The safest route from ${o} to ${d} reads as ${a.route_risk.level} risk` +
      (a.route_risk.distance_km
        ? ` (${a.route_risk.distance_km} km, about ${a.route_risk.duration_min} min).`
        : ".")
  );

  parts.push(
    a.time_risk.requested_hour_is_safe
      ? `${a.requested_hour_label} is one of the calmer times on this route, so the timing isn't adding much risk.`
      : `Travelling at ${a.requested_hour_label} adds ${a.time_risk.level} extra risk compared with the route's safest hour (${a.route_risk.baseline_hour_label}).`
  );

  if (a.safer_alternative.differs_from_fastest && a.safer_alternative.extra_minutes > 0) {
    parts.push(
      `A safer alternative is available — it takes about ${a.safer_alternative.extra_minutes} min longer than the fastest path but lowers your exposure.`
    );
  } else {
    parts.push(`The safest route is also among the quickest, so there's no real trade-off.`);
  }

  if (win) {
    parts.push(`The safest window to travel is ${win.from_label} to ${win.to_label}.`);
  }

  if (
    a.route_risk.level === "high" ||
    a.route_risk.level === "critical" ||
    !a.time_risk.requested_hour_is_safe
  ) {
    parts.push(`If you go now, share your live location and prefer a trusted ride-hailing service.`);
  }

  return parts.join(" ");
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const askSafetyAssistant = async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, message: "A question is required" });
    }

    const { origin, destination } = parsePlaces(question);
    const hour = parseHour(question);

    if (!origin || !destination) {
      return res.status(200).json({
        success: true,
        answer:
          "Tell me where you're starting from and where you're heading (and a time, if you have one) — for example, “from Bashundhara to Mirpur at 10 PM”.",
        data: null,
      });
    }

    const analysis = await analyzeRouteSafety({
      origin,
      destination,
      hour: Number.isInteger(hour) ? hour : null,
      district: "Dhaka",
    });

    return res.status(200).json({
      success: true,
      answer: buildAnswer(analysis),
      data: analysis,
      meta: { origin, destination, hour: analysis.requested_hour },
    });
  } catch (error) {
    console.error("Safety assistant error:", error);
    const friendly = /locate|find|route|geocod/i.test(error.message)
      ? error.message
      : "I couldn't analyse that route right now. Please try again.";
    return res.status(200).json({ success: true, answer: friendly, data: null });
  }
};
