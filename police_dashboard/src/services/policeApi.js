import { API_URL } from "../config";

export const getPoliceMe = async () => {
  const response = await fetch(`${API_URL}/police/me`, {
    method: "GET",
    credentials: "include",
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Police login required");
  }

  return data.policeStation;
};

export const logoutPolice = async () => {
  const response = await fetch(`${API_URL}/police/logout`, {
    method: "POST",
    credentials: "include",
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Logout failed");
  }

  return data;
};