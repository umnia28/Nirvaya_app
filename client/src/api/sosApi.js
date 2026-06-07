import axiosClient from "./axiosClient";
import {
  getLocalProfile,
  getEmergencyContacts,
} from "../services/localProfileService";

export const startSosApi = async ({ latitude, longitude }) => {
  const profile = getLocalProfile();
  const emergencyContacts = getEmergencyContacts();

  const response = await axiosClient.post("/sos/start", {
    latitude,
    longitude,
    trigger_type: "button",
    risk_score: null,
    emergency_contacts: emergencyContacts,
  });

  return response.data;
};

export const updateSosLocationApi = async ({ sosId, latitude, longitude }) => {
  const response = await axiosClient.post(`/sos/${sosId}/location`, {
    latitude,
    longitude,
  });

  return response.data;
};

export const resolveSosApi = async (sosId) => {
  const response = await axiosClient.patch(`/sos/${sosId}/resolve`);

  return response.data;
};

export const getTrackingLocationApi = async (publicToken) => {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/sos/track/${publicToken}`
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to get tracking location");
  }

  return data;
};