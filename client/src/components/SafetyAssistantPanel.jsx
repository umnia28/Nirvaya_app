// client/src/components/SafetyAssistantPanel.jsx
//
// Rose Quartz Safety Assistant panel — styled with your SosPage.css
// class system (.sa-* classes) so it matches your exact theme tokens.
// Logic is unchanged; only the markup/styling switched from inline to classes.

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Shield,
  Clock,
  Route,
  CalendarClock,
  Navigation,
} from "lucide-react";
import { askSafetyAssistantApi } from "../api/assistantApi";

const badgeClass = (level) => {
  const map = {
    low: "sa-badge-low",
    moderate: "sa-badge-moderate",
    medium: "sa-badge-medium",
    high: "sa-badge-high",
    critical: "sa-badge-critical",
  };
  return `sa-badge ${map[level] || "sa-badge-low"}`;
};

function AssistantCards({ data }) {
  if (!data) return null;
  const {
    route_risk: rr,
    time_risk: tr,
    safer_alternative: sa,
    recommended_window: win,
  } = data;

  return (
    <div className="sa-cards">
      <div className="sa-card">
        <div className="sa-card-icon">
          <Route size={18} />
        </div>
        <div className="sa-card-body">
          <p className="sa-card-label">Route risk</p>
          <div className="sa-card-value">
            <span>
              {rr.distance_km
                ? `Safest path · ${rr.distance_km} km · ${rr.duration_min} min`
                : "Safest path ready"}
            </span>
            <span className={badgeClass(rr.level)}>{rr.level}</span>
          </div>
        </div>
      </div>

      <div className="sa-card">
        <div className="sa-card-icon">
          <Clock size={18} />
        </div>
        <div className="sa-card-body">
          <p className="sa-card-label">Time risk at {data.requested_hour_label}</p>
          <div className="sa-card-value">
            <span>
              {tr.requested_hour_is_safe
                ? "One of the calmer hours on this route"
                : `Quieter around ${rr.baseline_hour_label}`}
            </span>
            <span className={badgeClass(tr.level)}>{tr.level}</span>
          </div>
        </div>
      </div>

      <div className="sa-card">
        <div className="sa-card-icon">
          <Navigation size={18} />
        </div>
        <div className="sa-card-body">
          <p className="sa-card-label">Safer alternative</p>
          <div className="sa-card-value">
            <span>
              {sa.differs_from_fastest
                ? `Safer route available${
                    sa.extra_minutes > 0 ? ` · ~${sa.extra_minutes} min slower` : ""
                  }`
                : "Safest route is also among the quickest"}
            </span>
          </div>
        </div>
      </div>

      <div className="sa-card">
        <div className="sa-card-icon">
          <CalendarClock size={18} />
        </div>
        <div className="sa-card-body">
          <p className="sa-card-label">Recommended window</p>
          <div className="sa-card-value">
            <span>
              {win
                ? `Safest from ${win.from_label} to ${win.to_label}`
                : "No clearly safer window today — stay alert whenever you travel"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SafetyAssistantPanel() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Ask me whether a trip looks safe — for example, “Is it safe to travel from Bashundhara to Mirpur at 10 PM?” I'll check the route, the time, a safer alternative, and the best window to go.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  const suggestions = [
    "Is it safe to travel from Bashundhara to Mirpur at 10 PM?",
    "Dhanmondi to Uttara at 7 AM?",
    "Gulshan to Mohammadpur right now",
  ];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;

    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await askSafetyAssistantApi(question);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: res.answer || "Sorry, I couldn't analyse that.",
          data: res.data,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Something went wrong reaching the server. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sa-panel">
      <div className="sa-header">
        <div className="sa-header-icon">
          <Shield size={19} />
        </div>
        <div>
          <p className="sa-header-title">Safety Assistant</p>
          <p className="sa-header-sub">Route · time · safer path · best window</p>
        </div>
      </div>

      <div className="sa-messages">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`sa-row ${
              m.role === "user" ? "sa-row-user" : "sa-row-assistant"
            }`}
          >
            <div
              className={`sa-bubble ${
                m.role === "user" ? "sa-bubble-user" : "sa-bubble-assistant"
              }`}
            >
              {m.text}
            </div>
            {m.role === "assistant" && m.data && <AssistantCards data={m.data} />}
          </div>
        ))}

        {loading && (
          <div className="sa-loading">
            <Loader2 size={16} className="sa-spin" /> Checking route and time…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="sa-suggestions">
          {suggestions.map((s) => (
            <button key={s} className="sa-chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="sa-inputbar">
        <input
          className="sa-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Ask about a route and time…"
        />
        <button
          className="sa-send"
          onClick={() => send()}
          disabled={loading || !input.trim()}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
