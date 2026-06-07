import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import SetupPage from "./pages/SetupPage";
import SosPage from "./pages/SosPage";
import TrackingPage from "./pages/TrackingPage";  
import SafeRoutesPage from "./pages/SafeRoutesPage";

import { isSetupComplete } from "./services/localProfileService";

function SetupGuard({ children }) {
  if (!isSetupComplete()) {
    return <Navigate to="/setup" replace />;
  }

  return children;
}

function RootRedirect() {
  if (isSetupComplete()) {
    return <Navigate to="/sos" replace />;
  }

  return <Navigate to="/setup" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        <Route path="/setup" element={<SetupPage />} />

        <Route
          path="/sos"
          element={
            <SetupGuard>
              <SosPage />
            </SetupGuard>
          }
        />

        <Route
          path="/safe-routes"
          element={
            <SetupGuard>
              <SafeRoutesPage />
            </SetupGuard>
          }
        />

        <Route path="/track/:publicToken" element={<TrackingPage />} />
      </Routes>
    </BrowserRouter>
  );
}