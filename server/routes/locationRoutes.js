import express from "express";

import {
  updateDeviceLocation,
  checkCurrentLocationRisk,
} from "../controllers/locationController.js";

import { attachDevice } from "../middleware/deviceMiddleware.js";

const router = express.Router();

router.post("/update", attachDevice, updateDeviceLocation);
router.post("/risk-check", attachDevice, checkCurrentLocationRisk);

export default router;