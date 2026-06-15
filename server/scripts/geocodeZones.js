import "dotenv/config";
import pool from "../config/db.js";

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE_URL = "https://api.openrouteservice.org";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isInsideBangladesh = (latitude, longitude) => {
  const lat = Number(latitude);
  const lon = Number(longitude);

  return lat >= 20.5 && lat <= 26.8 && lon >= 88.0 && lon <= 92.8;
};

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

  if (!feature?.geometry?.coordinates) {
    return null;
  }

  const [longitude, latitude] = feature.geometry.coordinates;

  if (!isInsideBangladesh(latitude, longitude)) {
    throw new Error(
      `Result outside Bangladesh: ${latitude}, ${longitude}, label: ${
        feature.properties?.label || "unknown"
      }`
    );
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
    label: feature.properties?.label || searchText,
    confidence: feature.properties?.confidence ?? null,
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
      ORDER BY district ASC, zone_name ASC
      `
    );

    const zones = result.rows;

    console.log(`Found ${zones.length} zones with missing coordinates`);

    let updatedCount = 0;
    let notFoundCount = 0;
    let failedCount = 0;

    for (const zone of zones) {
      const queryName = `${zone.zone_name}, ${zone.district}`;

      try {
        console.log(`\nGeocoding: ${queryName}`);

        const geo = await geocodeZone({
          district: zone.district,
          zoneName: zone.zone_name,
        });

        if (!geo) {
          notFoundCount++;
          console.log(`Not found: ${queryName}`);
          await sleep(1200);
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

        updatedCount++;

        console.log(
          `Updated: ${queryName} -> ${geo.latitude}, ${geo.longitude}`
        );
        console.log(`ORS label: ${geo.label}`);
        console.log(`Confidence: ${geo.confidence}`);

        // Avoid hitting ORS too fast
        await sleep(1200);
      } catch (error) {
        failedCount++;
        console.error(`Failed: ${queryName}`);
        console.error(error.message);

        await sleep(1200);
      }
    }

    console.log("\nGeocoding completed");
    console.log("Updated:", updatedCount);
    console.log("Not found:", notFoundCount);
    console.log("Failed:", failedCount);
  } catch (error) {
    console.error("Geocoding script failed:", error);
  } finally {
    client.release();
    process.exit();
  }
};

geocodeMissingZones();
