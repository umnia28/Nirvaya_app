import "dotenv/config";
import pool from "../config/db.js";

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE_URL = "https://api.openrouteservice.org";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const geocodeZone = async ({ district, zoneName }) => {
  const searchText = `${zoneName}, ${district}, Bangladesh`;

  const params = new URLSearchParams({
    text: searchText,
    "boundary.country": "BD",
    size: "1",
  });

  const response = await fetch(
    `${ORS_BASE_URL}/geocode/search?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: ORS_API_KEY,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Geocoding request failed");
  }

  const feature = data?.features?.[0];

  if (!feature) {
    return null;
  }

  const [longitude, latitude] = feature.geometry.coordinates;

  return {
    latitude,
    longitude,
    label: feature.properties?.label || searchText,
  };
};

const geocodeMissingZones = async () => {
  if (!ORS_API_KEY) {
    console.error("ORS_API_KEY is missing in .env");
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      `
      SELECT id, district, zone_name
      FROM zones
      WHERE latitude IS NULL
         OR longitude IS NULL
         OR geocoded = FALSE
      ORDER BY district ASC, zone_name ASC
      `
    );

    const zones = result.rows;

    console.log(`Found ${zones.length} zones to geocode`);

    for (const zone of zones) {
      try {
        const geo = await geocodeZone({
          district: zone.district,
          zoneName: zone.zone_name,
        });

        if (!geo) {
          console.log(`Not found: ${zone.zone_name}, ${zone.district}`);
          continue;
        }

        await client.query(
          `
          UPDATE zones
          SET
            latitude = $1,
            longitude = $2,
            geocoded = TRUE,
            source = 'ors_geocoding',
            updated_at = NOW()
          WHERE id = $3
          `,
          [geo.latitude, geo.longitude, zone.id]
        );

        console.log(
          `Updated: ${zone.zone_name}, ${zone.district} -> ${geo.latitude}, ${geo.longitude}`
        );

        // Avoid hitting ORS too fast
        await sleep(500);
      } catch (error) {
        console.error(
          `Failed: ${zone.zone_name}, ${zone.district}`,
          error.message
        );
      }
    }

    console.log("Geocoding completed");
  } catch (error) {
    console.error("Geocoding script failed:", error);
  } finally {
    client.release();
    process.exit();
  }
};

geocodeMissingZones();