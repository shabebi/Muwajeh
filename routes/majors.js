const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// GET /api/majors
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                m.id,
                m.faculty_id,
                m.name_en,
                m.name_ar,
                m.description_en,
                m.description_ar,
                m.duration_years,
                m.requirements_en,
                m.requirements_ar,
                m.skills_en,
                m.skills_ar,
                m.career_opportunities_en,
                m.career_opportunities_ar,
                m.tuition_fee,
                m.is_active
            FROM majors m
            JOIN faculties f ON f.id = m.faculty_id
            JOIN universities u ON u.id = f.university_id
            WHERE m.is_active = true
              AND f.is_active = true
              AND u.is_active = true
            ORDER BY m.name_en
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error("Error fetching majors:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch majors"
        });
    }
});

// GET /api/majors/faculty/:facultyId
router.get("/faculty/:facultyId", async (req, res) => {
    const facultyId = Number(req.params.facultyId);

    if (!Number.isInteger(facultyId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid faculty ID"
        });
    }

    try {
        const result = await pool.query(`
            SELECT
                id,
                faculty_id,
                name_en,
                name_ar,
                description_en,
                description_ar,
                duration_years,
                requirements_en,
                requirements_ar,
                skills_en,
                skills_ar,
                career_opportunities_en,
                career_opportunities_ar,
                tuition_fee,
                is_active
            FROM majors
            WHERE faculty_id = $1
              AND is_active = true
            ORDER BY name_en
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

// GET /api/majors/:id
router.get("/:id", async (req, res) => {
    const majorId = Number(req.params.id);

    if (!Number.isInteger(majorId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid major ID"
        });
    }

    try {
        const result = await pool.query(`
            SELECT
                m.id,
                m.faculty_id,
                m.name_en,
                m.name_ar,
                m.description_en,
                m.description_ar,
                m.duration_years,
                m.requirements_en,
                m.requirements_ar,
                m.skills_en,
                m.skills_ar,
                m.career_opportunities_en,
                m.career_opportunities_ar,
                m.tuition_fee,
                m.is_active,
                f.name_en AS faculty_name_en,
                f.name_ar AS faculty_name_ar,
                u.id AS university_id,
                u.name_en AS university_name_en,
                u.name_ar AS university_name_ar
            FROM majors m
            JOIN faculties f ON f.id = m.faculty_id
            JOIN universities u ON u.id = f.university_id
            WHERE m.id = $1
              AND m.is_active = true
              AND f.is_active = true
              AND u.is_active = true
        `, [majorId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Major not found"
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error("Error fetching major:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch major"
        });
    }
});

module.exports = router;
