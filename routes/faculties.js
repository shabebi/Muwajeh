const express = require("express");
const router = express.Router();

const pool = require("../config/db");

// =========================================================
// GET all active faculties
// GET /api/faculties
// =========================================================

router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                university_id,
                name_ar,
                description_ar,
                is_active
            FROM faculties
            WHERE is_active = true
            ORDER BY name_ar
        `);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error("Error fetching faculties:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch faculties"
        });
    }
});


// =========================================================
// GET faculties belonging to a specific university
// GET /api/faculties/university/:universityId
// =========================================================

router.get("/university/:universityId", async (req, res) => {
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

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error("Error fetching university faculties:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch faculties"
        });
    }
});


// =========================================================
// GET faculties belonging to a university
// GET /api/universities/:universityId/faculties
//
// This is the endpoint used by the university page.
// =========================================================

router.get("/universities/:universityId/faculties", async (req, res) => {
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

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error("Error fetching university faculties:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch faculties"
        });
    }
});


// =========================================================
// GET majors belonging to a specific faculty
// GET /api/faculties/:facultyId/majors
// =========================================================

router.get("/:facultyId/majors", async (req, res) => {
    try {
        const facultyId = Number(req.params.facultyId);

        if (!Number.isInteger(facultyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid faculty ID"
            });
        }

        const result = await pool.query(`
            SELECT
                id,
                faculty_id,
                name_ar,
                description_ar,
                duration_years,
                tuition_fee,
                is_active
            FROM majors
            WHERE faculty_id = $1
              AND is_active = true
            ORDER BY name_ar
        `, [facultyId]);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error("Error fetching faculty majors:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch majors"
        });
    }
});


module.exports = router;