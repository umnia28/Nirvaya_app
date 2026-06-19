import express from "express";
import { getLiveRiskHeatmap } from "../controllers/heatMapController.js";

const router = express.Router();

router.get("/live", getLiveRiskHeatmap);

export default router;