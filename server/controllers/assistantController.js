// server/controllers/assistantController.js
//
// GEMINI version (Google AI Studio free tier).
//   1. Gemini call #1  -> extract { origin, destination, hour } from the question
//   2. analyzeRouteSafety() -> grounded numbers from your Random Forest
//   3. Gemini call #2  -> natural-language answer (with template fallback)
//
// Needs GEMINI_API_KEY (free from https://aistudio.google.com/apikey) and ORS_API_KEY.
// No Anthropic SDK, no npm install — uses plain fetch.

import { analyzeRouteSafety } from "../services/safetyAssistantService.js";

// Any free Flash-family model works; override with GEMINI_MODEL if one is retired.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const callGemini = async ({ system, user, json = false, maxTokens = 500, temperature = 0.4 }) => {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is missing in environment variables");

  const body = {
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };
  if (json) body.generationConfig.responseMimeType = "application/json";

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini request failed (${res.status})`);
  }

  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("")
      .trim() || ""
  );
};

const safeJsonParse = (text) => {
  const cleaned = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
    return null;
  }
};

const extractQuery = async (question) => {
  const system = `You extract structured travel-safety queries for Bangladesh (mostly Dhaka).
Return ONLY a JSON object:
{"origin": string|null, "destination": string|null, "hour": integer 0-23 | null, "district": string}
- origin/destination: area or place names exactly as written (e.g. "Bashundhara", "Mirpur"). null if not stated.
- hour: convert clock time to 24h (10 PM -> 22, "9am" -> 9, "midnight" -> 0, "noon" -> 12). null if no time mentioned.
- district: best-guess Dhaka-area district; otherwise "Dhaka".`;

  const text = await callGemini({ system, user: question, json: true, maxTokens: 200, temperature: 0 });
  return safeJsonParse(text);
};

const synthesizeAnswer = async (question, analysis) => {
  const { safest_route_geometry, ...slim } = analysis;

  const system = `You are Nirvaya's safety assistant for Bangladesh. You are given pre-computed
risk data from a trained model. Write a short, calm, practical answer (4-7 sentences, plain prose,
no markdown headers, no bullet points) covering, in order:
1. Route risk — how safe the path itself is.
2. Time risk — what the requested hour adds (the route can be fine while the hour is the problem).
3. The safer alternative route — and the time trade-off if it's slower.
4. The recommended travel window — the safest hours to go.
Only use the numbers provided; never invent figures. If risk is high or the hour is unsafe, give one or two
concrete precautions (share live location, prefer a trusted ride-hailing service, travel with company).
Be reassuring and direct, not alarmist.`;

  const user = `User question: "${question}"\n\nRisk data (JSON):\n${JSON.stringify(slim, null, 2)}`;
  return callGemini({ system, user, maxTokens: 500, temperature: 0.5 });
};

const buildFallbackAnswer = (a) => {
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

export const askSafetyAssistant = async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, message: "A question is required" });
    }

    const parsed = await extractQuery(question);
    if (!parsed?.origin || !parsed?.destination) {
      return res.status(200).json({
        success: true,
        answer:
          "Tell me where you're starting from and where you're heading (and a time, if you have one) — for example, “Is it safe to travel from Bashundhara to Mirpur at 10 PM?”",
        data: null,
      });
    }

    const analysis = await analyzeRouteSafety({
      origin: parsed.origin,
      destination: parsed.destination,
      hour: Number.isInteger(parsed.hour) ? parsed.hour : null,
      district: parsed.district || "Dhaka",
    });

    let answer = null;
    try {
      answer = await synthesizeAnswer(question, analysis);
    } catch (llmErr) {
      console.warn("Assistant synthesis failed, using fallback:", llmErr.message);
    }
    if (!answer) answer = buildFallbackAnswer(analysis);

    return res.status(200).json({
      success: true,
      answer,
      data: analysis,
      meta: { origin: parsed.origin, destination: parsed.destination, hour: analysis.requested_hour },
    });
  } catch (error) {
    console.error("Safety assistant error:", error);
    const friendly = /locate|find|route|geocod/i.test(error.message)
      ? error.message
      : "I couldn't analyse that route right now. Please try again.";
    return res.status(200).json({ success: true, answer: friendly, data: null });
  }
};
