/*import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  [20.55, 88.0], // south-west
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

const RISK_META = {
  critical: { color: "#b3001b", label: "Critical", opacity: 0.55 },
  high: { color: "#e85d04", label: "High", opacity: 0.45 },
  medium: { color: "#f4a900", label: "Medium", opacity: 0.35 },
  low: { color: "#2f9e62", label: "Low", opacity: 0.25 },
};

const riskOf = (level) => RISK_META[level] || RISK_META.low;

const getCircleRadius = (riskScore) => {
  const score = Number(riskScore || 0);
  if (score >= 80) return 1200;
  if (score >= 60) return 900;
  if (score >= 35) return 650;
  return 400;
};

function ChangeMapView({ district, points }) {
  const map = useMap();

  useEffect(() => {
    if (district === "all") {
      map.flyTo(BANGLADESH_CENTER, 7, { duration: 0.8 });
      return;
    }
    if (!points.length) return;

    const avgLat =
      points.reduce((sum, p) => sum + Number(p.latitude), 0) / points.length;
    const avgLng =
      points.reduce((sum, p) => sum + Number(p.longitude), 0) / points.length;

    map.flyTo([avgLat, avgLng], 12, { duration: 0.8 });
  }, [district, points, map]);

  return null;
}

export default function HeatmapPage() {
  const [heatmap, setHeatmap] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState("all");
  const [fetching, setFetching] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const abortRef = useRef(null);

  const fetchHeatmap = useCallback(async (district) => {
    // Cancel any in-flight request so a slow response for a previous
    // district can't overwrite the current one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetching(true);
    setErrorMessage("");

    try {
      let url = `${API_BASE_URL}/heatmap/live`;
      if (district && district !== "all") {
        url += `?district=${encodeURIComponent(district)}`;
      }

      const response = await fetch(url, { signal: controller.signal });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to fetch heatmap");
      }

      setHeatmap(data.heatmap || []);
      setLastUpdated(new Date());
      setHasLoadedOnce(true);
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Heatmap fetch error:", error);
      setErrorMessage(error.message);
    } finally {
      if (abortRef.current === controller) setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchHeatmap(selectedDistrict);
    const interval = setInterval(
      () => fetchHeatmap(selectedDistrict),
      5 * 60 * 1000
    );
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [selectedDistrict, fetchHeatmap]);

  const stats = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const p of heatmap) {
      if (counts[p.risk_level] !== undefined) counts[p.risk_level] += 1;
      else counts.low += 1;
    }
    return { total: heatmap.length, ...counts };
  }, [heatmap]);

  return (
    <div className="heatmap-page">
      <aside className="heatmap-sidebar">
        <header className="sidebar-header">
          <div className="live-badge">
            <span className="live-dot" aria-hidden="true" />
            Live
          </div>
          <h2>AI Safety Heatmap</h2>
          <p className="heatmap-subtitle">
            Risk intensity across Bangladesh, scored by the AI model in real
            time.
          </p>
        </header>

        <div className="sidebar-section">
          <span className="section-label">District</span>
          <div className="district-buttons" role="tablist">
            {DISTRICTS.map((district) => (
              <button
                key={district}
                role="tab"
                aria-selected={selectedDistrict === district}
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
        </div>

        {errorMessage && (
          <div className="error-box" role="alert">
            <strong>Couldn't update the map.</strong> {errorMessage}
            <button
              className="error-retry"
              onClick={() => fetchHeatmap(selectedDistrict)}
            >
              Try again
            </button>
          </div>
        )}

        <div className="sidebar-section">
          <span className="section-label">
            Zone summary
            <em className="zone-total">{stats.total} zones</em>
          </span>

          
          <div
            className="risk-bar"
            aria-hidden={stats.total === 0}
            title="Share of zones by risk level"
          >
            {["critical", "high", "medium", "low"].map((level) =>
              stats[level] > 0 ? (
                <span
                  key={level}
                  className="risk-bar-segment"
                  style={{
                    width: `${(stats[level] / stats.total) * 100}%`,
                    background: RISK_META[level].color,
                  }}
                />
              ) : null
            )}
          </div>

          <ul className="stat-list">
            {["critical", "high", "medium", "low"].map((level) => (
              <li className="stat-row" key={level}>
                <span
                  className="legend-dot"
                  style={{ background: RISK_META[level].color }}
                />
                <span className="stat-name">{RISK_META[level].label}</span>
                <strong>{stats[level]}</strong>
              </li>
            ))}
          </ul>
        </div>

        <footer className="sidebar-footer">
          <button
            className="refresh-button"
            onClick={() => fetchHeatmap(selectedDistrict)}
            disabled={fetching}
          >
            {fetching ? "Updating…" : "Refresh now"}
          </button>
          {lastUpdated && (
            <p className="updated-text">
              Updated {lastUpdated.toLocaleTimeString()} · auto-refreshes every
              5 min
            </p>
          )}
        </footer>
      </aside>

      <div className="heatmap-map-wrapper">
        <MapContainer
          center={BANGLADESH_CENTER}
          zoom={7}
          minZoom={7}
          maxZoom={15}
          maxBounds={BANGLADESH_BOUNDS}
          maxBoundsViscosity={1.0}
          scrollWheelZoom={true}
          preferCanvas={true}
          className="heatmap-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            updateWhenIdle={true}
            keepBuffer={4}
          />

          <ChangeMapView district={selectedDistrict} points={heatmap} />

          {heatmap.map((point) => {
            const meta = riskOf(point.risk_level);
            return (
              <Circle
                key={point.id}
                center={[Number(point.latitude), Number(point.longitude)]}
                radius={getCircleRadius(point.risk_score)}
                pathOptions={{
                  color: meta.color,
                  fillColor: meta.color,
                  fillOpacity: meta.opacity,
                  weight: 1.5,
                }}
              >
                <Popup>
                  <div className="popup-content">
                    <span
                      className="popup-risk-tag"
                      style={{ background: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <h3>{point.zone_name}</h3>
                    <dl>
                      <div>
                        <dt>District</dt>
                        <dd>{point.district}</dd>
                      </div>
                      <div>
                        <dt>Risk score</dt>
                        <dd>{Number(point.risk_score).toFixed(2)} / 100</dd>
                      </div>
                    </dl>
                  </div>
                </Popup>
              </Circle>
            );
          })}
        </MapContainer>

        
        {!hasLoadedOnce && fetching && (
          <div className="map-overlay">
            <div className="loader" />
            <p>Scoring zones…</p>
          </div>
        )}
        {hasLoadedOnce && fetching && (
          <div className="map-toast">Updating zones…</div>
        )}
      </div>
    </div>
  );
}
  */

  import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    [20.55, 88.0], // south-west
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
  
  const RISK_META = {
    critical: { color: "#881337", label: "Critical", opacity: 0.55 },
    high: { color: "#e11d48", label: "High", opacity: 0.45 },
    medium: { color: "#e08700", label: "Medium", opacity: 0.35 },
    low: { color: "#2a9d6e", label: "Low", opacity: 0.25 },
  };
  
  const riskOf = (level) => RISK_META[level] || RISK_META.low;
  
  const getCircleRadius = (riskScore) => {
    const score = Number(riskScore || 0);
    if (score >= 80) return 1200;
    if (score >= 60) return 900;
    if (score >= 35) return 650;
    return 400;
  };
  
  function ChangeMapView({ district, points }) {
    const map = useMap();
  
    useEffect(() => {
      if (district === "all") {
        map.flyTo(BANGLADESH_CENTER, 7, { duration: 0.8 });
        return;
      }
      if (!points.length) return;
  
      const avgLat =
        points.reduce((sum, p) => sum + Number(p.latitude), 0) / points.length;
      const avgLng =
        points.reduce((sum, p) => sum + Number(p.longitude), 0) / points.length;
  
      map.flyTo([avgLat, avgLng], 12, { duration: 0.8 });
    }, [district, points, map]);
  
    return null;
  }
  
  export default function HeatmapPage() {
    const [heatmap, setHeatmap] = useState([]);
    const [selectedDistrict, setSelectedDistrict] = useState("all");
    const [fetching, setFetching] = useState(true);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [lastUpdated, setLastUpdated] = useState(null);
  
    const abortRef = useRef(null);
  
    const fetchHeatmap = useCallback(async (district) => {
      // Cancel any in-flight request so a slow response for a previous
      // district can't overwrite the current one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
  
      setFetching(true);
      setErrorMessage("");
  
      try {
        let url = `${API_BASE_URL}/heatmap/live`;
        if (district && district !== "all") {
          url += `?district=${encodeURIComponent(district)}`;
        }
  
        const response = await fetch(url, { signal: controller.signal });
        const data = await response.json();
  
        if (!response.ok || !data.success) {
          throw new Error(data.message || "Failed to fetch heatmap");
        }
  
        setHeatmap(data.heatmap || []);
        setLastUpdated(new Date());
        setHasLoadedOnce(true);
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Heatmap fetch error:", error);
        setErrorMessage(error.message);
      } finally {
        if (abortRef.current === controller) setFetching(false);
      }
    }, []);
  
    useEffect(() => {
      fetchHeatmap(selectedDistrict);
      const interval = setInterval(
        () => fetchHeatmap(selectedDistrict),
        5 * 60 * 1000
      );
      return () => {
        clearInterval(interval);
        abortRef.current?.abort();
      };
    }, [selectedDistrict, fetchHeatmap]);
  
    const stats = useMemo(() => {
      const counts = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const p of heatmap) {
        if (counts[p.risk_level] !== undefined) counts[p.risk_level] += 1;
        else counts.low += 1;
      }
      return { total: heatmap.length, ...counts };
    }, [heatmap]);
  
    return (
      <div className="heatmap-page">
        <aside className="heatmap-sidebar">
          <header className="sidebar-header">
            <div className="live-badge">
              <span className="live-dot" aria-hidden="true" />
              Live
            </div>
            <h2>AI Safety Heatmap</h2>
            <p className="heatmap-subtitle">
              Risk intensity across Bangladesh, scored by the AI model in real
              time.
            </p>
          </header>
  
          <div className="sidebar-section">
            <span className="section-label">District</span>
            <div className="district-buttons" role="tablist">
              {DISTRICTS.map((district) => (
                <button
                  key={district}
                  role="tab"
                  aria-selected={selectedDistrict === district}
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
          </div>
  
          {errorMessage && (
            <div className="error-box" role="alert">
              <strong>Couldn't update the map.</strong> {errorMessage}
              <button
                className="error-retry"
                onClick={() => fetchHeatmap(selectedDistrict)}
              >
                Try again
              </button>
            </div>
          )}
  
          <div className="sidebar-section">
            <span className="section-label">
              Zone summary
              <em className="zone-total">{stats.total} zones</em>
            </span>
  
            {/* Distribution bar: each segment's width = its share of zones */}
            <div
              className="risk-bar"
              aria-hidden={stats.total === 0}
              title="Share of zones by risk level"
            >
              {["critical", "high", "medium", "low"].map((level) =>
                stats[level] > 0 ? (
                  <span
                    key={level}
                    className="risk-bar-segment"
                    style={{
                      width: `${(stats[level] / stats.total) * 100}%`,
                      background: RISK_META[level].color,
                    }}
                  />
                ) : null
              )}
            </div>
  
            <ul className="stat-list">
              {["critical", "high", "medium", "low"].map((level) => (
                <li className="stat-row" key={level}>
                  <span
                    className="legend-dot"
                    style={{ background: RISK_META[level].color }}
                  />
                  <span className="stat-name">{RISK_META[level].label}</span>
                  <strong>{stats[level]}</strong>
                </li>
              ))}
            </ul>
          </div>
  
          <footer className="sidebar-footer">
            <button
              className="refresh-button"
              onClick={() => fetchHeatmap(selectedDistrict)}
              disabled={fetching}
            >
              {fetching ? "Updating…" : "Refresh now"}
            </button>
            {lastUpdated && (
              <p className="updated-text">
                Updated {lastUpdated.toLocaleTimeString()} · auto-refreshes every
                5 min
              </p>
            )}
          </footer>
        </aside>
  
        <div className="heatmap-map-wrapper">
          <MapContainer
            center={BANGLADESH_CENTER}
            zoom={7}
            minZoom={7}
            maxZoom={15}
            maxBounds={BANGLADESH_BOUNDS}
            maxBoundsViscosity={1.0}
            scrollWheelZoom={true}
            preferCanvas={true}
            className="heatmap-map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              updateWhenIdle={true}
              keepBuffer={4}
            />
  
            <ChangeMapView district={selectedDistrict} points={heatmap} />
  
            {heatmap.map((point) => {
              const meta = riskOf(point.risk_level);
              return (
                <Circle
                  key={point.id}
                  center={[Number(point.latitude), Number(point.longitude)]}
                  radius={getCircleRadius(point.risk_score)}
                  pathOptions={{
                    color: meta.color,
                    fillColor: meta.color,
                    fillOpacity: meta.opacity,
                    weight: 1.5,
                  }}
                >
                  <Popup>
                    <div className="popup-content">
                      <span
                        className="popup-risk-tag"
                        style={{ background: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <h3>{point.zone_name}</h3>
                      <dl>
                        <div>
                          <dt>District</dt>
                          <dd>{point.district}</dd>
                        </div>
                        <div>
                          <dt>Risk score</dt>
                          <dd>{Number(point.risk_score).toFixed(2)} / 100</dd>
                        </div>
                      </dl>
                    </div>
                  </Popup>
                </Circle>
              );
            })}
          </MapContainer>
  
          {/* Non-blocking loading states: the map mounts immediately */}
          {!hasLoadedOnce && fetching && (
            <div className="map-overlay">
              <div className="loader" />
              <p>Scoring zones…</p>
            </div>
          )}
          {hasLoadedOnce && fetching && (
            <div className="map-toast">Updating zones…</div>
          )}
        </div>
      </div>
    );
  }
  
