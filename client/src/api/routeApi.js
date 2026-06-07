import axiosClient from "./axiosClient";

export const getSafeRoutesApi = async ({
  startLatitude,
  startLongitude,
  destination,
  district,
}) => {
  const response = await axiosClient.post("/routes/safe-alternatives", {
    start_latitude: startLatitude,
    start_longitude: startLongitude,
    destination,
    district,
  });

  return response.data;
};