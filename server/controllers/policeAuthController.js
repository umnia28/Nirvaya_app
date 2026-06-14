import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { geocodePoliceStationWithORS } from "../utils/orsGeocode.js";

const generatePoliceToken = (policeStation) => {
  return jwt.sign(
    {
      policeStationId: policeStation.id,
      role: "police",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );
};

const setPoliceCookie = (res, token) => {
  res.cookie("police_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
};

const clearPoliceCookie = (res) => {
  res.clearCookie("police_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
};

const sanitizePoliceStation = (station) => {
  if (!station) return null;

  const { password_hash, ...safeStation } = station;
  return safeStation;
};

export const signupPoliceStation = async (req, res) => {
  try {
    let {
      name,
      district,
      thana,
      address,
      phone,
      password,
      latitude,
      longitude,
    } = req.body;

    if (!name || !district || !thana || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "name, district, thana, phone, and password are required",
      });
    }

    phone = String(phone).trim();

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingResult = await pool.query(
      `
      SELECT id
      FROM police_stations
      WHERE phone = $1
      `,
      [phone]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Police station account already exists with this phone",
      });
    }

    let finalLatitude = latitude ? Number(latitude) : null;
    let finalLongitude = longitude ? Number(longitude) : null;
    let geocodedByORS = false;

    if (!finalLatitude || !finalLongitude) {
      try {
        const geocodeResult = await geocodePoliceStationWithORS({
          name,
          district,
          thana,
          address,
        });

        if (geocodeResult) {
          finalLatitude = Number(geocodeResult.latitude);
          finalLongitude = Number(geocodeResult.longitude);
          geocodedByORS = true;
        }
      } catch (error) {
        console.log("ORS geocoding failed:", error.message);
      }
    }

    if (!finalLatitude || !finalLongitude) {
      return res.status(400).json({
        success: false,
        message:
          "Could not find location using ORS. Please enter latitude and longitude manually.",
        requires_manual_coordinates: true,
      });
    }

    if (
      finalLatitude < -90 ||
      finalLatitude > 90 ||
      finalLongitude < -180 ||
      finalLongitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO police_stations (
        name,
        district,
        thana,
        address,
        latitude,
        longitude,
        phone,
        password_hash,
        is_verified
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      RETURNING
        id,
        name,
        district,
        thana,
        address,
        latitude,
        longitude,
        phone,
        is_verified,
        created_at
      `,
      [
        name,
        district,
        thana,
        address || null,
        finalLatitude,
        finalLongitude,
        phone,
        passwordHash,
      ]
    );

    const policeStation = result.rows[0];
    const token = generatePoliceToken(policeStation);

    setPoliceCookie(res, token);

    return res.status(201).json({
      success: true,
      message: "Police station account created successfully",
      policeStation,
      geocodedByORS,
    });
  } catch (error) {
    console.error("Police signup error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create police station account",
      error: error.message,
    });
  }
};

export const loginPoliceStation = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone and password are required",
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM police_stations
      WHERE phone = $1
      `,
      [String(phone).trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or password",
      });
    }

    const policeStation = result.rows[0];

    if (!policeStation.password_hash) {
      return res.status(401).json({
        success: false,
        message:
          "This police station account has no password. Please sign up again.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      policeStation.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or password",
      });
    }

    if (!policeStation.is_verified) {
      return res.status(403).json({
        success: false,
        message: "Police station account is not verified yet",
      });
    }

    const token = generatePoliceToken(policeStation);

    setPoliceCookie(res, token);

    return res.status(200).json({
      success: true,
      message: "Police login successful",
      policeStation: sanitizePoliceStation(policeStation),
    });
  } catch (error) {
    console.error("Police login error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to login police station",
      error: error.message,
    });
  }
};

export const getPoliceProfile = async (req, res) => {
  return res.status(200).json({
    success: true,
    policeStation: req.policeStation,
  });
};

export const logoutPoliceStation = async (req, res) => {
  clearPoliceCookie(res);

  return res.status(200).json({
    success: true,
    message: "Police logged out successfully",
  });
};