// client/src/api/assistantApi.js
//
// Matches your existing service style (axiosClient with the /api base URL).
// Adjust the import path below to wherever your configured axiosClient lives.

import axiosClient from "./axiosClient";

export const askSafetyAssistantApi = async (question) => {
  const response = await axiosClient.post("/assistant/ask", { question });
  return response.data; // { success, answer, data, meta }
};
