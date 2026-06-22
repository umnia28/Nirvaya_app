import { predictRiskBatchWithModel } from "./riskModel.js";

const getBangladeshTimeOffset = (offsetHours) => {
  const now = new Date();
  const bdNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Dhaka" })
  );
  const future = new Date(
    bdNow.getTime() + offsetHours * 60 * 60 * 1000
  );

  return {
    hour: future.getHours(),
    day_of_week: future.getDay(),
    label: future.toLocaleTimeString("en-BD", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
};

export const predictSafeHours = async ({
  latitude,
  longitude,
  district,
  hoursAhead = 12,
}) => {
  const predictions = [];

  for (let i = 0; i <= hoursAhead; i++) {
    const { hour, day_of_week, label } = getBangladeshTimeOffset(i);

    const result = await predictRiskBatchWithModel([
      { latitude, longitude, district, hour, day_of_week },
    ]);

    predictions.push({
      hour_offset: i,
      hour,
      label,
      risk_score: Number(result[0]?.risk_score ?? 0),
      risk_level: result[0]?.risk_level ?? "unknown",
    });
  }

  const safeWindows = [];
  let windowStart = null;

  predictions.forEach((p, i) => {
    const isSafe =
      p.risk_level === "low" ||
      p.risk_level === "unknown" ||
      p.risk_level === "medium" ||
      p.risk_level === "high" && p.risk_score < 70 ||
      p.risk_score < 3;

    if (isSafe && windowStart === null) {
      windowStart = i;
    } else if (!isSafe && windowStart !== null) {
      if (i - windowStart >= 2) {
        const slice = predictions.slice(windowStart, i);
        safeWindows.push({
          from: predictions[windowStart].label,
          to: predictions[i - 1].label,
          duration_hours: i - windowStart,
          avg_risk:
            slice.reduce((s, p) => s + p.risk_score, 0) / slice.length,
        });
      }
      windowStart = null;
    }
  });

  if (windowStart !== null) {
    const slice = predictions.slice(windowStart);
    if (slice.length >= 2) {
      safeWindows.push({
        from: predictions[windowStart].label,
        to: predictions[predictions.length - 1].label,
        duration_hours: slice.length,
        avg_risk:
          slice.reduce((s, p) => s + p.risk_score, 0) / slice.length,
      });
    }
  }

  const bestWindow = safeWindows.sort(
    (a, b) => a.avg_risk - b.avg_risk
  )[0];

  return {
    predictions,
    safe_windows: safeWindows,
    best_window: bestWindow || null,
    recommendation: bestWindow
      ? `Safest window to travel: ${bestWindow.from} – ${bestWindow.to} (${bestWindow.duration_hours}h window)`
      : "No clearly safe window in the next 12 hours. Stay alert and travel with others.",
  };
};