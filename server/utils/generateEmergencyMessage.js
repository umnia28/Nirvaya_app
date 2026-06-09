export const generateEmergencyMessage = ({
  userName,
  latitude,
  longitude,
  district,
  riskLevel,
  riskScore,
  trackingLink,
  triggerType,
  timestamp,
}) => {
  const time = new Date(timestamp).toLocaleTimeString("en-BD", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const date = new Date(timestamp).toLocaleDateString("en-BD", {
    timeZone: "Asia/Dhaka",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const triggerLabel =
    triggerType === "voice"
      ? "voice keyword activation"
      : triggerType === "auto_stationary"
      ? "AI-detected danger (stationary in risk zone)"
      : "manual SOS button";

  const riskText =
    riskLevel === "critical"
      ? "CRITICAL risk zone"
      : riskLevel === "high"
      ? "HIGH risk zone"
      : riskLevel === "medium"
      ? "medium risk zone"
      : "unknown risk area";

  return `🚨 EMERGENCY ALERT — NIRVAYA SAFETY APP

${userName || "A user"} has triggered an SOS via ${triggerLabel}.

📍 Location: ${district}, Bangladesh
🗺️ Coordinates: ${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}
⚠️ Risk level: ${riskText} (score: ${riskScore ?? "N/A"})
🕐 Time: ${time} on ${date}

📡 Track live location:
${trackingLink}

Please respond immediately. This alert was generated automatically by Nirvaya Women Safety App.`;
};