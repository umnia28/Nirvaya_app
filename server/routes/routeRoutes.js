import express from "express";
import { getSafeAlternativeRoutes } from "../controllers/routeController.js";
import { attachDevice } from "../middleware/deviceMiddleware.js";

const router = express.Router();

router.post("/safe-alternatives", attachDevice, getSafeAlternativeRoutes);

export default router;