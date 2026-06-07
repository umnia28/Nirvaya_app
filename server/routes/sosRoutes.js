import express from "express";

import {
  startSos,
  updateSosLocation,
  getTrackingLocation,
  resolveSos,
} from "../controllers/sosController.js";

import { attachDevice } from "../middleware/deviceMiddleware.js";

const router = express.Router();

router.post("/start", attachDevice, startSos);

router.post("/:sosId/location", attachDevice, updateSosLocation);

router.patch("/:sosId/resolve", attachDevice, resolveSos);


router.get("/track/:publicToken", getTrackingLocation);

export default router;