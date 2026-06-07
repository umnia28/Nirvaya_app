import axiosClient from "./axiosClient";

export const checkCurrentLocationRiskApi = async ({
  latitude,
  longitude,
  district = "Dhaka",
}) => {
  const response = await axiosClient.post("/location/risk-check", {
    latitude,
    longitude,
    district,
  });

  return response.data;
};

export const updateDeviceLocationApi = async ({
  latitude,
  longitude,
  district = "Dhaka",
}) => {
  const response = await axiosClient.post("/location/update", {
    latitude,
    longitude,
    district,
  });

  return response.data;
};