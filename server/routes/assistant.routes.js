// server/routes/assistant.routes.js
import { Router } from "express";
import { askSafetyAssistant } from "../controllers/assistantController.js";

const router = Router();

// POST /api/assistant/ask
router.post("/ask", askSafetyAssistant);

export default router;
