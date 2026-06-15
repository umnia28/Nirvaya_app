import express from "express";
import {
  createReport,
  getNearbyReports,
} from "../controllers/reportsController.js";

const router = express.Router();

router.post("/", createReport);
router.get("/nearby", getNearbyReports);

export default router;