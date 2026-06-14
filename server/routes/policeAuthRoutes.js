import express from "express";
import {
  signupPoliceStation,
  loginPoliceStation,
  getPoliceProfile,
  logoutPoliceStation
} from "../controllers/policeAuthController.js";
import { protectPolice } from "../middleware/policeAuthMiddleware.js";

const router = express.Router();

router.post("/signup", signupPoliceStation);
router.post("/login", loginPoliceStation);
router.get("/me", protectPolice, getPoliceProfile);
router.post("/logout", logoutPoliceStation);

export default router;