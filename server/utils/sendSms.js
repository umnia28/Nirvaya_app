// utils/sendSms.js

const SMS_API_URL = "https://api.sms.net.bd/sendsms";

const normalizeBdPhone = (phone) => {
  if (!phone) return null;

  let cleaned = String(phone).trim().replace(/\s+/g, "");

  // Remove + sign if exists
  cleaned = cleaned.replace(/^\+/, "");

  // 8801XXXXXXXXX
  if (/^8801\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  // 01XXXXXXXXX
  if (/^01\d{9}$/.test(cleaned)) {
    return `88${cleaned}`;
  }

  return cleaned;
};

export const sendSmsNetBd = async ({ to, message }) => {
  const apiKey = process.env.SMS_NET_BD_API_KEY;
  const senderId = process.env.SMS_NET_BD_SENDER_ID;

  if (!apiKey) {
    throw new Error("SMS_NET_BD_API_KEY is missing");
  }

  const normalizedTo = normalizeBdPhone(to);

  if (!normalizedTo) {
    throw new Error("Recipient phone number is required");
  }

  const params = new URLSearchParams();
  params.set("api_key", apiKey);
  params.set("msg", message);
  params.set("to", normalizedTo);

  if (senderId) {
    params.set("sender_id", senderId);
  }

  const response = await fetch(`${SMS_API_URL}?${params.toString()}`, {
    method: "GET",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`SMS API HTTP error: ${response.status}`);
  }

  if (data?.error !== 0) {
    throw new Error(data?.msg || "SMS sending failed");
  }

  return {
    success: true,
    to: normalizedTo,
    data,
  };
};

export const sendBulkEmergencySms = async ({ contacts, message }) => {
  const results = [];

  for (const contact of contacts) {
    try {
      const result = await sendSmsNetBd({
        to: contact.phone,
        message,
      });

      results.push({
        success: true,
        contact,
        sms: result,
      });
    } catch (error) {
      results.push({
        success: false,
        contact,
        error: error.message,
      });
    }
  }

  return results;
};