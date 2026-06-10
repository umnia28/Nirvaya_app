import cron from "node-cron";
import pool from "../config/db.js";

export const startLocationCleanupJob = () => {
  
  cron.schedule("0 0 * * *", async () => {
    try {
      const result = await pool.query(
        "SELECT delete_old_user_location_updates() AS deleted_count"
      );

      const deletedCount = result.rows[0]?.deleted_count ?? 0;

      console.log(
        `Location cleanup completed. Deleted ${deletedCount} old rows.`
      );
    } catch (error) {
      console.error("Location cleanup failed:", error);
    }
  });

  console.log("Location cleanup cron job started.");
};