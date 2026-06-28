// server/controllers/assistantController.js
//
// POST /api/assistant/ask   body: { question: string }
//
// Flow:
//   1. LLM call #1  -> extract { origin, destination, hour } from the question
//   2. analyzeRouteSafety() -> grounded numbers from YOUR Random Forest
//   3. LLM call #2  -> turn those numbers into a calm, conversational answer
//
// The model never invents risk values — it only phrases the numbers the model
// produced. If the LLM is unavailable, a deterministic fallback answer is built
// straight from the data so the feature still works in a demo.

import Anthropic from "@anthropic-ai/sdk";
import { analyzeRouteSafety } from "../services/safetyAssistantService.js";

// If you already export a configured client (e.g. from your incident-report
// util), import that instead of creating a second instance.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Default to the model you already use successfully; override via env if you
// want something cheaper/faster for this lightweight task.
const MODEL = process.env.ASSISTANT_MODEL || "claude-opus-4-5";

const safeJsonParse = (text) => {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    return null;
  }
};

const extractQuery = async (question) => {
  const system = `You extract structured travel-safety queries for Bangladesh (mostly Dhaka).
Return ONLY a JSON object — no prose, no code fences:
{"origin": string|null, "destination": string|null, "hour": integer 0-23 | null, "district": string}
Rules:
- origin/destination: area or place names exactly as written (e.g. "Bashundhara", "Mirpur"). null if not stated.
- hour: convert clock time to 24h (10 PM -> 22, "9am" -> 9, "midnight" -> 0, "noon" -> 12). null if no time is mentioned.
- district: best-guess Dhaka-area district; otherwise "Dhaka".`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system,
    messages: [{ role: "user", content: question }],
  });

  const text = msg.content?.find((b) => b.type === "text")?.text || "";
  return safeJsonParse(text);
};

const synthesizeAnswer = async (question, analysis) => {
  // strip heavy geometry before sending to the model
  const { safest_route_geometry, ...slim } = analysis;

  const system = `You are Nirvaya's safety assistant for Bangladesh. You are given pre-computed
risk data from a trained model. Write a short, calm, practical answer (4-7 sentences, plain prose,
no markdown headers, no bullet symbols) that covers, in order:
1. Route risk — how safe the path itself is.
2. Time risk — what the requested hour adds (use the route-vs-time split: the route can be fine while the hour is the problem).
3. The safer alternative route — and the time trade-off if it's slower.
4. The recommended travel window — the safest hours to go.
Only use the numbers provided; never invent figures. If risk is high or the hour is unsafe, give one or two
concrete precautions (share live location, prefer a trusted ride-hailing service, travel with company).
Be reassuring and direct, not alarmist.`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system,
    messages: [
      {
        role: "user",
        content: `User question: "${question}"\n\nRisk data (JSON):\n${JSON.stringify(slim, null, 2)}`,
      },
    ],
  });

  return msg.content?.find((b) => b.type === "text")?.text?.trim() || null;
};

const buildFallbackAnswer = (a) => {
  const o = a.origin?.label || "your start";
  const d = a.destination?.label || "your destination";
  const win = a.recommended_window;
  const parts = [];

  parts.push(
    `The safest route from ${o} to ${d} reads as ${a.route_risk.level} risk` +
      (a.route_risk.distance_km ? ` (${a.route_risk.distance_km} km, about ${a.route_risk.duration_min} min)` : "") +
      "."
  );
  parts.push(
    a.time_risk.requested_hour_is_safe
      ? `${a.requested_hour_label} is one of the calmer times on this route, so timing isn't adding much risk.`
      : `Travelling at ${a.requested_hour_label} adds ${a.time_risk.level} extra risk compared to the route's safest hour (${a.route_risk.baseline_hour_label}).`
  );
  if (a.safer_alternative.differs_from_fastest && a.safer_alternative.extra_minutes > 0) {
    parts.push(
      `A safer alternative exists but takes about ${a.safer_alternative.extra_minutes} min longer than the fastest path.`
    );
  } else {
    parts.push(`The safest route is also among the quickest, so there's no real trade-off.`);
  }
  if (win) {
    parts.push(`The safest window to travel is ${win.from_label} to ${win.to_label}.`);
  }
  if (a.route_risk.level === "high" || a.route_risk.level === "critical" || !a.time_risk.requested_hour_is_safe) {
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

    // 1) understand the question
    const parsed = await extractQuery(question);
    if (!parsed?.origin || !parsed?.destination) {
      return res.status(200).json({
        success: true,
        answer:
          "Tell me where you're starting from and where you're heading (and a time, if you have one) — for example, “Is it safe to travel from Bashundhara to Mirpur at 10 PM?”",
        data: null,
      });
    }

    // 2) grounded numbers from your model
    const analysis = await analyzeRouteSafety({
      origin: parsed.origin,
      destination: parsed.destination,
      hour: Number.isInteger(parsed.hour) ? parsed.hour : null,
      district: parsed.district || "Dhaka",
    });

    // 3) phrase them (with deterministic fallback)
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
      meta: {
        origin: parsed.origin,
        destination: parsed.destination,
        hour: analysis.requested_hour,
      },
    });
  } catch (error) {
    console.error("Safety assistant error:", error);
    const friendly =
      /locate|find|route|geocod/i.test(error.message)
        ? error.message
        : "I couldn't analyse that route right now. Please try again.";
    return res.status(200).json({ success: true, answer: friendly, data: null });
  }
};
