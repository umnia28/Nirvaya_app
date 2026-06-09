import express from "express";


import {
  startSos,
  updateSosLocation,
  getTrackingLocation,
  resolveSos,
  getIncidentReport,
} from "../controllers/sosController.js";
import { attachDevice } from "../middleware/deviceMiddleware.js";



const router = express.Router();

router.post("/start", attachDevice, startSos);
router.post("/:sosId/location", attachDevice, updateSosLocation);
router.get("/track/:publicToken", getTrackingLocation);
router.patch("/:sosId/resolve", attachDevice, resolveSos);
router.post("/:sosId/incident-report", attachDevice, getIncidentReport);

export default router;