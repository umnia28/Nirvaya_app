import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";

import sosRoutes from "./routes/sosRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import routeRoutes from "./routes/routeRoutes.js";
import heatmapRoutes from "./routes/heatmapRoutes.js";
import policeAuthRoutes from "./routes/policeAuthRoutes.js";
import reportsRouter from "./routes/reportsRoutes.js";


import { startLocationCleanupJob } from "./jobs/locationCleanupJob.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  process.env.CLIENT_URL,
  process.env.POLICE_CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join_tracking_room", (publicToken) => {
    if (!publicToken) return;

    socket.join(publicToken);
    console.log(`Socket ${socket.id} joined room ${publicToken}`);
  });

  socket.on("leave_tracking_room", (publicToken) => {
    if (!publicToken) return;

    socket.leave(publicToken);
    console.log(`Socket ${socket.id} left room ${publicToken}`);
  });

  socket.on("join_police_station", (policeStationId) => {
    if (!policeStationId) return;

    const roomName = `police_${policeStationId}`;
    socket.join(roomName);

    console.log(`Socket ${socket.id} joined police room ${roomName}`);
  });

  socket.on("leave_police_station", (policeStationId) => {
    if (!policeStationId) return;

    const roomName = `police_${policeStationId}`;
    socket.leave(roomName);

    console.log(`Socket ${socket.id} left police room ${roomName}`);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Nirvaya backend is running",
  });
});

app.use("/api/sos", sosRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/heatmap", heatmapRoutes);
app.use("/api/police", policeAuthRoutes);
app.use("/api/reports", reportsRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startLocationCleanupJob();
});