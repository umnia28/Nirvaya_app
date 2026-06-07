import axios from "axios";
import { API_URL } from "../config";
import { getOrCreateDeviceId } from "../services/deviceService";

const axiosClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosClient.interceptors.request.use((config) => {
  const deviceId = getOrCreateDeviceId();

  config.headers["x-device-id"] = deviceId;

  return config;
});

export default axiosClient;