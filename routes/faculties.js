const express = require("express");
const router = express.Router();

const pool = require("../config/db");

// GET all active faculties
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                university_id,
                name_en,
                name_ar,
                description_en,
                description_ar,
                is_active
            FROM faculties
            WHERE is_active = true
            ORDER BY name_en
        `);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching faculties:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch faculties"
        });
    }
});


// GET faculties belonging to a specific university
router.get("/university/:universityId", async (req, res) => {
    try {
        const { universityId } = req.params;

        const result = await pool.query(`
            SELECT
                id,
                university_id,
                name_en,
                name_ar,
                description_en,
                description_ar,
                is_active
            FROM faculties
            WHERE university_id = $1
              AND is_active = true
            ORDER BY name_en
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