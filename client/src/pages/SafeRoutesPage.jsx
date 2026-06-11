/*import { useEffect, useMemo, useRef, useState } from "react";
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
      const geometry = route.geometry || [];

      geometry.forEach(([longitude, latitude]) => {
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
  const panelRef = useRef(null);

  const [destination, setDestination] = useState("");
  const [district, setDistrict] = useState("Dhaka");

  const [currentLocation, setCurrentLocation] = useState(null);
  const [destinationLocation, setDestinationLocation] = useState(null);

  const [routes, setRoutes] = useState([]);
  const [selectedRouteRank, setSelectedRouteRank] = useState(1);

  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [error, setError] = useState("");

  const [panelCollapsed, setPanelCollapsed] = useState(false);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    panelRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });

    getCurrentLocation();
  }, []);

  const togglePanel = () => {
    setPanelCollapsed((prev) => !prev);
  };

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

      // On mobile, expand sheet after results are found.
      setPanelCollapsed(false);
    } catch (err) {
      setError(err.message || "Failed to generate safe routes.");
      setPanelCollapsed(false);
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
        <aside
          className={
            panelCollapsed
              ? "safe-routes-panel collapsed"
              : "safe-routes-panel"
          }
          ref={panelRef}
        >
          <div className="mobile-sheet-toggle" onClick={togglePanel}>
            <div className="mobile-sheet-handle" />
            <span>
              {panelCollapsed ? "▲ tap to expand" : "▼ tap to collapse"}
            </span>
          </div>

          <div className="safe-routes-panel-content">
            <button className="back-button" onClick={() => navigate("/sos")}>
              ‹ Back
            </button>

            <div className="brand-row">
              <div className="brand-icon">N</div>

              <div>
                <h1>Safe Routes</h1>
                <p>Enter a destination and get safer route options.</p>
              </div>

              <div className="brand-spacer" />
            </div>

            <div className="form-card">
              <label>Your destination</label>
              <input
                value={destination}
                onChange={(event) => {
                  setDestination(event.target.value);
                  setRoutes([]);
                  setDestinationLocation(null);
                }}
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
                  Routes are ranked by safety.
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
          </div>
        </aside>

        <section className="safe-routes-map-panel">
          <div className="mobile-map-header">
            <button
              className="mobile-back-button"
              onClick={() => navigate("/sos")}
            >
              ‹
            </button>

            <strong>Safe Routes</strong>

            <span className="mobile-header-spacer" />
          </div>

          <MapContainer center={mapCenter} zoom={13} className="safe-routes-map">
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
                positions={convertRouteGeometry(route.geometry || [])}
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
  */
 import { useEffect, useMemo, useRef, useState } from "react";
 import { useNavigate } from "react-router-dom";
 import { ChevronLeft, ChevronUp, ChevronDown } from "lucide-react";
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
 
 // Green = where you are, red = where you're going (visual only)
 const startIcon = new L.Icon({
   iconUrl:
     "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
   shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
   iconSize: [25, 41],
   iconAnchor: [12, 41],
   popupAnchor: [1, -34],
   shadowSize: [41, 41],
 });
 
 const destinationIcon = new L.Icon({
   iconUrl:
     "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
   shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
   iconSize: [25, 41],
   iconAnchor: [12, 41],
   popupAnchor: [1, -34],
   shadowSize: [41, 41],
 });
 
 function FitMapToRoutes({ start, destination, routes }) {
   const map = useMap();
 
   useEffect(() => {
     if (!start || !destination || !routes.length) return;
 
     const points = [];
 
     points.push([start.latitude, start.longitude]);
     points.push([destination.latitude, destination.longitude]);
 
     routes.forEach((route) => {
       const geometry = route.geometry || [];
 
       geometry.forEach(([longitude, latitude]) => {
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
   const panelRef = useRef(null);
 
   const [destination, setDestination] = useState("");
   const [district, setDistrict] = useState("Dhaka");
 
   const [currentLocation, setCurrentLocation] = useState(null);
   const [destinationLocation, setDestinationLocation] = useState(null);
 
   const [routes, setRoutes] = useState([]);
   const [selectedRouteRank, setSelectedRouteRank] = useState(1);
 
   const [loadingLocation, setLoadingLocation] = useState(false);
   const [loadingRoutes, setLoadingRoutes] = useState(false);
   const [error, setError] = useState("");
 
   const [panelCollapsed, setPanelCollapsed] = useState(false);
 
   useEffect(() => {
     window.scrollTo({
       top: 0,
       left: 0,
       behavior: "instant",
     });
 
     document.documentElement.scrollTop = 0;
     document.body.scrollTop = 0;
 
     panelRef.current?.scrollTo({
       top: 0,
       left: 0,
       behavior: "instant",
     });
 
     getCurrentLocation();
   }, []);
 
   const togglePanel = () => {
     setPanelCollapsed((prev) => !prev);
   };
 
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
     if (rank === 1) return "#2a9d6e"; // safest — same green as "safe" everywhere
     if (rank === 2) return "#e08700"; // same amber as warnings
     return "#97707f"; // muted rose-grey
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
 
       // On mobile, expand sheet after results are found.
       setPanelCollapsed(false);
     } catch (err) {
       setError(err.message || "Failed to generate safe routes.");
       setPanelCollapsed(false);
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
         <aside
           className={
             panelCollapsed
               ? "safe-routes-panel collapsed"
               : "safe-routes-panel"
           }
           ref={panelRef}
         >
           <div className="mobile-sheet-toggle" onClick={togglePanel}>
             <div className="mobile-sheet-handle" />
             <span>
               {panelCollapsed ? (
                 <>
                   <ChevronUp size={14} strokeWidth={2.4} /> tap to expand
                 </>
               ) : (
                 <>
                   <ChevronDown size={14} strokeWidth={2.4} /> tap to collapse
                 </>
               )}
             </span>
           </div>
 
           <div className="safe-routes-panel-content">
             <button className="back-button" onClick={() => navigate("/sos")}>
               <ChevronLeft size={16} strokeWidth={2.4} /> Back
             </button>
 
             <div className="brand-row">
               <div className="brand-icon">N</div>
 
               <div>
                 <h1>Safe Routes</h1>
                 <p>Enter a destination and get safer route options.</p>
               </div>
 
               <div className="brand-spacer" />
             </div>
 
             <div className="form-card">
               <label>Your destination</label>
               <input
                 value={destination}
                 onChange={(event) => {
                   setDestination(event.target.value);
                   setRoutes([]);
                   setDestinationLocation(null);
                 }}
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
                   Routes are ranked by safety.
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
           </div>
         </aside>
 
         <section className="safe-routes-map-panel">
           <div className="mobile-map-header">
             <button
               className="mobile-back-button"
               onClick={() => navigate("/sos")}
               aria-label="Back to SOS page"
             >
               <ChevronLeft size={20} strokeWidth={2.4} />
             </button>
 
             <strong>Safe Routes</strong>
 
             <span className="mobile-header-spacer" />
           </div>
 
           <MapContainer center={mapCenter} zoom={13} className="safe-routes-map">
             <TileLayer
               attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
               url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
               updateWhenIdle={true}
               keepBuffer={4}
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
                 positions={convertRouteGeometry(route.geometry || [])}
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