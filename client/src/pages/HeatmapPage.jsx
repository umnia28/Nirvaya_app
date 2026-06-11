import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  Popup,
  useMap,
} from "react-leaflet";
import "./HeatmapPage.css";

const API_BASE_URL = import.meta.env.VITE_API_URL;

const BANGLADESH_CENTER = [23.685, 90.3563];

const BANGLADESH_BOUNDS = [
  [20.55, 88.0],  // south-west
  [26.75, 92.75], // north-east
];

const DISTRICTS = [
  "all",
  "Dhaka",
  "Chattogram",
  "Mymensingh",
  "Sylhet",
  "Rajshahi",
  "Khulna",
  "Barishal",
  "Rangpur",
];


const getCircleColor = (riskLevel) => {
  if (riskLevel === "critical") return "#7f0000";
  if (riskLevel === "high") return "#e53935";
  if (riskLevel === "medium") return "#fb8c00";
  return "#2e7d32";
};

const getCircleOpacity = (riskLevel) => {
  if (riskLevel === "critical") return 0.5;
  if (riskLevel === "high") return 0.42;
  if (riskLevel === "medium") return 0.34;
  return 0.24;
};

const getCircleRadius = (riskScore) => {
  const score = Number(riskScore || 0);

  if (score >= 80) return 1200;
  if (score >= 60) return 900;
  if (score >= 35) return 650;
  return 400;
};

const getRiskLabel = (riskLevel) => {
  if (riskLevel === "critical") return "Critical";
  if (riskLevel === "high") return "High";
  if (riskLevel === "medium") return "Medium";
  return "Low";
};

function ChangeMapView({ district, points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    if (district === "all") {
      map.setView(BANGLADESH_CENTER, 7);
      return;
    }

    const avgLat =
      points.reduce((sum, point) => sum + Number(point.latitude), 0) /
      points.length;

    const avgLng =
      points.reduce((sum, point) => sum + Number(point.longitude), 0) /
      points.length;

    map.setView([avgLat, avgLng], 12);
  }, [district, points, map]);

  return null;
}

export default function HeatmapPage() {
  const [heatmap, setHeatmap] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);


  const fetchHeatmap = async (district = selectedDistrict) => {
    try {
      setErrorMessage("");

      let url = `${API_BASE_URL}/heatmap/live`;

      if (district && district !== "all") {
        url += `?district=${encodeURIComponent(district)}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to fetch heatmap");
      }

      setHeatmap(data.heatmap || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Heatmap fetch error:", error);
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHeatmap(selectedDistrict);

    const interval = setInterval(() => {
      fetchHeatmap(selectedDistrict);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [selectedDistrict]);

  const stats = useMemo(() => {
    const total = heatmap.length;

    const critical = heatmap.filter(
      (point) => point.risk_level === "critical"
    ).length;

    const high = heatmap.filter((point) => point.risk_level === "high").length;

    const medium = heatmap.filter(
      (point) => point.risk_level === "medium"
    ).length;

    const low = heatmap.filter((point) => point.risk_level === "low").length;

    return { total, critical, high, medium, low };
  }, [heatmap]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHeatmap(selectedDistrict);
  };

  if (loading) {
    return (
      <div className="heatmap-center">
        <div className="loader" />
        <p>Loading live AI safety heatmap...</p>
      </div>
    );
  }

  return (
    <div className="heatmap-page">
      <div className="heatmap-sidebar">
        <h2>Live AI Safety Heatmap</h2>

        <p className="heatmap-subtitle">
          Risk intensity generated from your AI model using live Bangladesh time.
        </p>

        <div className="district-buttons">
          {DISTRICTS.map((district) => (
            <button
              key={district}
              className={
                selectedDistrict === district
                  ? "district-button active"
                  : "district-button"
              }
              onClick={() => setSelectedDistrict(district)}
            >
              {district === "all" ? "All BD" : district}
            </button>
          ))}
        </div>

        <button
          className="refresh-button"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh Heatmap"}
        </button>

        {errorMessage && <div className="error-box">{errorMessage}</div>}

        <div className="stats-card">
          <h3>Zone Summary</h3>
          <div className="stat-row">
            <span>Total zones</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="stat-row critical">
            <span>Critical</span>
            <strong>{stats.critical}</strong>
          </div>
          <div className="stat-row high">
            <span>High</span>
            <strong>{stats.high}</strong>
          </div>
          <div className="stat-row medium">
            <span>Medium</span>
            <strong>{stats.medium}</strong>
          </div>
          <div className="stat-row low">
            <span>Low</span>
            <strong>{stats.low}</strong>
          </div>
        </div>

        {lastUpdated && (
          <p className="updated-text">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        )}

        <div className="legend">
          <h3>Legend</h3>
          <div>
            <span className="legend-dot critical-dot" /> Critical
          </div>
          <div>
            <span className="legend-dot high-dot" /> High
          </div>
          <div>
            <span className="legend-dot medium-dot" /> Medium
          </div>
          <div>
            <span className="legend-dot low-dot" /> Low
          </div>
        </div>
      </div>

      <div className="heatmap-map-wrapper">
        <MapContainer
          center={BANGLADESH_CENTER}
          zoom={7}
          minZoom={7}
          maxZoom={15}
          maxBounds={BANGLADESH_BOUNDS}
          maxBoundsViscosity={1.0}
          scrollWheelZoom={true}
          className="heatmap-map"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {heatmap.map((point) => {
            const color = getCircleColor(point.risk_level);

            return (
              <Circle
                key={point.id}
                center={[Number(point.latitude), Number(point.longitude)]}
                radius={getCircleRadius(point.risk_score)}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: getCircleOpacity(point.risk_level),
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="popup-content">
                    <h3>{point.zone_name}</h3>
                    <p><strong>District:</strong> {point.district}</p>
                    <p><strong>Risk:</strong> {point.risk_level}</p>
                    <p><strong>Risk score:</strong> {Number(point.risk_score).toFixed(2)}</p>
                  </div>
                </Popup>
              </Circle>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}