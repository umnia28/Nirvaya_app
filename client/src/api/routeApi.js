import axios from "axios";
import axiosClient from "./axiosClient";

// export const getSafeAlternativeRoutesApi = async ({
//   startLatitude,
//   startLongitude,
//   destination,
//   district,
// }) => {
//   const response = await axiosClient.post("/routes/safe-alternatives", {
//     start_latitude: startLatitude,
//     start_longitude: startLongitude,
//     destination,
//     district,
//   });

//   return response.data;
// };
const API_URL = import.meta.env.VITE_API_URL;


export const getSafeAlternativeRoutesApi = async ({
  startLatitude,
  startLongitude,
  destination,
  destinationLatitude,
  destinationLongitude,
  district,
}) => {
  const response = await axiosClient.post("/routes/safe-alternatives", {
    start_latitude: startLatitude,
    start_longitude: startLongitude,

    destination,

    destination_latitude: destinationLatitude,
    destination_longitude: destinationLongitude,

    district,
  });

  return response.data;
};