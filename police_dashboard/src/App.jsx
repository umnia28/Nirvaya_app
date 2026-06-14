import { Navigate, Route, Routes } from "react-router-dom";
import PoliceAuthPage from "./pages/PoliceAuthPage";
import PoliceDashboardPage from "./pages/PoliceDashboardPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth" replace />} />
      <Route path="/auth" element={<PoliceAuthPage />} />
      <Route path="/dashboard" element={<PoliceDashboardPage/>} />
    </Routes>
  );
}