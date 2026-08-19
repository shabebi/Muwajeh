const express = require("express");
const router = express.Router();

const pool = require("../config/db");

// =========================================================
// GET all active universities
// GET /api/universities
// =========================================================

router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                name_ar,
                description_ar,
                location_ar,
                website_url,
                logo_url
            FROM universities
            WHERE is_active = true
            ORDER BY name_ar
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


// =========================================================
// GET faculties belonging to a university
// GET /api/universities/:universityId/faculties
// =========================================================

router.get("/:universityId/faculties", async (req, res) => {
    try {
        const universityId = Number(req.params.universityId);

        if (!Number.isInteger(universityId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid university ID"
            });
        }

        const result = await pool.query(`
            SELECT
                id,
                university_id,
                name_ar,
                description_ar,
                is_active
            FROM faculties
            WHERE university_id = $1
              AND is_active = true
            ORDER BY name_ar
        `, [universityId]);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching university faculties:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch faculties"
        });
    }
});


module.exports = router;