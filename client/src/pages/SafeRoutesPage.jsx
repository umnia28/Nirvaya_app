import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";

import { getSafeAlternativeRoutesApi } from "../api/routeApi";


import "./SafeRoutesPage.css";

const PRIMARY = "#ED234F";
const DISTRICTS = [
  "Bagerhat",
  "Bandarban",
  "Barguna",
  "Barishal",
  "Bhola",
  "Bogura",
  "Brahmanbaria",
  "Chandpur",
  "Chapai Nawabganj",
  "Chattogram",
  "Chuadanga",
  "Cox's Bazar",
  "Cumilla",
  "Dhaka",
  "Dinajpur",
  "Faridpur",
  "Feni",
  "Gaibandha",
  "Gazipur",
  "Gopalganj",
  "Habiganj",
  "Jamalpur",
  "Jashore",
  "Jhalokathi",
  "Jhenaidah",
  "Joypurhat",
  "Khagrachhari",
  "Khulna",
  "Kishoreganj",
  "Kurigram",
  "Kushtia",
  "Lakshmipur",
  "Lalmonirhat",
  "Madaripur",
  "Magura",
  "Manikganj",
  "Meherpur",
  "Moulvibazar",
  "Munshiganj",
  "Mymensingh",
  "Naogaon",
  "Narail",
  "Narayanganj",
  "Narsingdi",
  "Natore",
  "Netrokona",
  "Nilphamari",
  "Noakhali",
  "Pabna",
  "Panchagarh",
  "Patuakhali",
  "Pirojpur",
  "Rajbari",
  "Rajshahi",
  "Rangamati",
  "Rangpur",
  "Satkhira",
  "Shariatpur",
  "Sherpur",
  "Sirajganj",
  "Sunamganj",
  "Sylhet",
  "Tangail",
  "Thakurgaon",
];


const startIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const destinationIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function FitMapToRoutes({ start, destination, routes }) {
  const map = useMap();

  useEffect(() => {
    if (!start || !destination || !routes.length) return;

    const points = [];

    points.push([start.latitude, start.longitude]);
    points.push([destination.latitude, destination.longitude]);

    routes.forEach((route) => {
      route.geometry.forEach(([longitude, latitude]) => {
        points.push([latitude, longitude]);
      });
    });

    if (points.length > 0) {
      map.fitBounds(points, {
        padding: [50, 50],
      });
    }
  }, [start, destination, routes, map]);

  return null;
}

export default function SafeRoutesPage() {
  const navigate = useNavigate();

  const [destination, setDestination] = useState("");
  const [district, setDistrict] = useState("Dhaka");

  const [currentLocation, setCurrentLocation] = useState(null);
  const [destinationLocation, setDestinationLocation] = useState(null);

  const [routes, setRoutes] = useState([]);
  const [selectedRouteRank, setSelectedRouteRank] = useState(1);

  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = () => {
    setLoadingLocation(true);
    setError("");

    if (!navigator.geolocation) {
      setLoadingLocation(false);
      setError("Geolocation is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        setLoadingLocation(false);
      },
      (err) => {
        setError(err.message || "Failed to get current location.");
        setLoadingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const convertRouteGeometry = (geometry = []) => {
    return geometry.map(([longitude, latitude]) => [latitude, longitude]);
  };

  const getRouteColor = (rank) => {
    if (rank === 1) return "#21A67A";
    if (rank === 2) return "#FF9900";
    return "#777777";
  };

  const formatDistance = (meters) => {
    if (!meters) return "Unknown distance";
    return `${(meters / 1000).toFixed(2)} km`;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return "Unknown time";
    return `${Math.round(seconds / 60)} min`;
  };

  const handleFindRoutes = async () => {
    try {
      setError("");

      if (!currentLocation) {
        throw new Error("Please allow location access first.");
      }

      if (!destination.trim()) {
        throw new Error("Please enter your destination.");
      }

      setLoadingRoutes(true);

      const data = await getSafeAlternativeRoutesApi({
        startLatitude: currentLocation.latitude,
        startLongitude: currentLocation.longitude,
        destination: destination.trim(),
        district,
      });

      if (!data.success) {
        throw new Error(data.message || "Failed to generate safe routes.");
      }

      setRoutes(data.routes || []);
      setDestinationLocation(data.destination);
      setSelectedRouteRank(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRoutes(false);
    }
  };

  const selectedRoute = useMemo(() => {
    return routes.find((route) => route.safety_rank === selectedRouteRank);
  }, [routes, selectedRouteRank]);

  const mapCenter = currentLocation
    ? [currentLocation.latitude, currentLocation.longitude]
    : [23.7456, 90.4208];

  return (
    <main className="safe-routes-page">
      <section className="safe-routes-shell">
        <aside className="safe-routes-panel">
          <button className="back-button" onClick={() => navigate("/sos")}>
            ‹ Back
          </button>

          <div className="brand-row">
            <div className="brand-icon">N</div>

            <div>
              <h1>Safe Routes</h1>
              <p>Enter a destination and get safer route options.</p>
            </div>
          </div>

          <div className="form-card">
            <label>Your destination</label>
            <input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Example: Mirpur 10, Dhaka"
            />

            <label>District used for risk model</label>
            <select
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
            >
              {DISTRICTS.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>

            <div className="button-row">
              <button
                className="secondary-button"
                onClick={getCurrentLocation}
                disabled={loadingLocation}
              >
                {loadingLocation ? "Locating..." : "Use Current Location"}
              </button>

              <button
                className="primary-button"
                onClick={handleFindRoutes}
                disabled={loadingRoutes}
              >
                {loadingRoutes ? "Finding..." : "Find Routes"}
              </button>
            </div>

            {currentLocation && (
              <p className="small-text">
                Start: {currentLocation.latitude.toFixed(5)},{" "}
                {currentLocation.longitude.toFixed(5)}
              </p>
            )}

            {destinationLocation && (
              <p className="small-text">
                Destination: {destinationLocation.label}
              </p>
            )}

            {error && <p className="error-text">{error}</p>}
          </div>

          {routes.length > 0 && (
            <div className="route-list">
              <h2>Suggested routes</h2>
              <p className="route-note">
                Routes are ranked by safety. Risk score is hidden from users.
              </p>

              {routes.map((route) => (
                <button
                  key={route.safety_rank}
                  className={
                    selectedRouteRank === route.safety_rank
                      ? "route-card active"
                      : "route-card"
                  }
                  onClick={() => setSelectedRouteRank(route.safety_rank)}
                >
                  <div className="route-card-top">
                    <span
                      className="rank-pill"
                      style={{
                        backgroundColor: getRouteColor(route.safety_rank),
                      }}
                    >
                      #{route.safety_rank}
                    </span>

                    <strong>{route.label}</strong>
                  </div>

                  <p>
                    {formatDistance(route.distance_meters)} •{" "}
                    {formatDuration(route.duration_seconds)}
                  </p>

                  <span>Tap to highlight this route</span>
                </button>
              ))}

              {selectedRoute && (
                <p className="selected-route">
                  Selected: {selectedRoute.label}
                </p>
              )}
            </div>
          )}
        </aside>

        <section className="safe-routes-map-panel">
          <MapContainer
            center={mapCenter}
            zoom={13}
            className="safe-routes-map"
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {currentLocation && (
              <Marker
                position={[currentLocation.latitude, currentLocation.longitude]}
                icon={startIcon}
              >
                <Popup>Your current location</Popup>
              </Marker>
            )}

            {destinationLocation && (
              <Marker
                position={[
                  destinationLocation.latitude,
                  destinationLocation.longitude,
                ]}
                icon={destinationIcon}
              >
                <Popup>{destinationLocation.label}</Popup>
              </Marker>
            )}

            {routes.map((route) => (
              <Polyline
                key={route.safety_rank}
                positions={convertRouteGeometry(route.geometry)}
                pathOptions={{
                  color: getRouteColor(route.safety_rank),
                  weight: selectedRouteRank === route.safety_rank ? 7 : 4,
                  opacity: selectedRouteRank === route.safety_rank ? 0.95 : 0.55,
                }}
                eventHandlers={{
                  click: () => setSelectedRouteRank(route.safety_rank),
                }}
              />
            ))}

            <FitMapToRoutes
              start={currentLocation}
              destination={destinationLocation}
              routes={routes}
            />
          </MapContainer>
        </section>
      </section>
    </main>
  );
}