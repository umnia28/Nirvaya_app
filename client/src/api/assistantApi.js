// client/src/api/assistantApi.js
//
// Uses the same calling pattern as your SosPage (fetch + API_URL + device id),
// so there's no axiosClient path to match. Drop it next to routeApi.js.

import { API_URL } from "../config";
import { getOrCreateDeviceId } from "../services/deviceService";

export const askSafetyAssistantApi = async (question) => {
  const response = await fetch(`${API_URL}/assistant/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": getOrCreateDeviceId(),
    },
    body: JSON.stringify({ question }),
  });

  return response.json(); // { success, answer, data, meta }
};
