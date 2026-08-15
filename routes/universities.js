const express = require("express");
const router = express.Router();

const pool = require("../config/db");

// GET all active universities
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                name_en,
                name_ar,
                description_en,
                description_ar,
                location_en,
                location_ar,
                website_url,
                logo_url
            FROM universities
            WHERE is_active = true
            ORDER BY name_en
        `);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching universities:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch universities"
        });
    }
});

module.exports = router;