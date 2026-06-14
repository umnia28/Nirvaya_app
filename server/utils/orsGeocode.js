export const geocodePoliceStationWithORS = async ({
  name,
  district,
  thana,
  address,
}) => {
  const apiKey = process.env.ORS_API_KEY;

  if (!apiKey) {
    throw new Error("ORS_API_KEY is missing");
  }

  const queryParts = [name, address, thana, district, "Bangladesh"].filter(
    Boolean
  );

  const searchText = queryParts.join(", ");

  const url = new URL("https://api.openrouteservice.org/geocode/search");

  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("text", searchText);
  url.searchParams.set("size", "1");
  url.searchParams.set("boundary.country", "BD");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error("ORS geocoding failed");
  }

  const data = await response.json();

  const feature = data.features?.[0];

  if (!feature?.geometry?.coordinates) {
    return null;
  }

  const [longitude, latitude] = feature.geometry.coordinates;

  return {
    latitude,
    longitude,
    label: feature.properties?.label || searchText,
  };
};