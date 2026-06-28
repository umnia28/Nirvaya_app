// server/controllers/assistantController.js
//
// HYBRID version — robust.
//   1. Regex parse        -> { origin, destination, hour }   (deterministic, never fails)
//   2. analyzeRouteSafety -> grounded numbers from your Random Forest
//   3. Gemini synthesis   -> natural answer, with template fallback if Gemini is down
//
// Extraction no longer depends on any LLM, so well-formed questions always work.
// Needs ORS_API_KEY. GEMINI_API_KEY is optional now (only used to prettify the prose).

import { analyzeRouteSafety } from "../services/safetyAssistantService.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ---------------------------------------------------------------------------
// 1) Parse the question  (no LLM)
// ---------------------------------------------------------------------------

const parseHour = (text) => {
  const t = text.toLowerCase();
  if (/\bnoon\b/.test(t)) return 12;
  if (/\bmidnight\b/.test(t)) return 0;

  const h24 = t.match(/\b([01]?\d|2[0-3])[:.]\s*[0-5]\d\b/);
  if (h24) return Number(h24[1]);

  const ampm = t.match(/\b(\d{1,2})\s*(?:o'?clock\s*)?(a\.?m\.?|p\.?m\.?)\b/);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (/p/.test(ampm[2])) h += 12;
    return h;
  }

  const bare = t.match(/\bat\s+(\d{1,2})\b/);
  if (bare) {
    const h = Number(bare[1]);
    if (h >= 0 && h <= 23) return h;
  }
  return null; // service falls back to current Dhaka hour
};

const parsePlaces = (text) => {
  const cleaned = text
    .replace(/\bat\s+\d{1,2}\s*(?:o'?clock)?\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi, " ")
    .replace(/\b([01]?\d|2[0-3])[:.]\s*[0-5]\d\b/g, " ")
    .replace(/\b(right now|now|tonight|today|noon|midnight)\b/gi, " ")
    .replace(/[?.!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let m = cleaned.match(/from\s+(.+?)\s+to\s+(.+)/i);
  if (m) return { origin: m[1].trim(), destination: m[2].trim() };

  m = cleaned.match(/^(.+?)\s+to\s+(.+)/i);
  if (m) return { origin: m[1].trim(), destination: m[2].trim() };

  return { origin: null, destination: null };
};

// ---------------------------------------------------------------------------
// 3a) Gemini synthesis  (optional — prettifies the answer)
// ---------------------------------------------------------------------------

const geminiSynthesize = async (question, analysis) => {
  if (!GEMINI_KEY) return null;

  const { safest_route_geometry, ...slim } = analysis;

  const system = `You are Nirvaya's safety assistant for Bangladesh. You are given pre-computed
risk data from a trained model. Write a short, calm, practical answer (4-7 sentences, plain prose,
no markdown, no bullet points) covering, in order: route risk, the risk the requested hour adds,
the safer alternative route (with the time trade-off if slower), and the recommended travel window.
Only use the numbers provided; never invent figures. If risk is high or the hour is unsafe, add one
or two concrete precautions (share live location, prefer a trusted ride-hailing service, travel with
company). Be reassuring and direct, not alarmist.`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${system}\n\nUser question: "${question}"\n\nRisk data (JSON):\n${JSON.stringify(slim, null, 2)}`,
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 500, temperature: 0.5 },
  };

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("").trim() || "";
  return text || null;
};

// ---------------------------------------------------------------------------
// 3b) Template answer  (always works, used as fallback)
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
      `A safer alternative is available — about ${a.safer_alternative.extra_minutes} min longer than the fastest path but lower exposure.`
    );
  } else {
    parts.push(`The safest route is also among the quickest, so there's no real trade-off.`);
  }
  if (win) parts.push(`The safest window to travel is ${win.from_label} to ${win.to_label}.`);
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

    let answer = null;
    try {
      answer = await geminiSynthesize(question, analysis);
    } catch (llmErr) {
      console.warn("Gemini synthesis failed, using template:", llmErr.message);
    }
    if (!answer) answer = buildAnswer(analysis);

    return res.status(200).json({
      success: true,
      answer,
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
