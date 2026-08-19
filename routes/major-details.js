const express = require("express");
const router = express.Router();
const pool = require("../config/db");

router.get("/:id", async (req, res) => {
    const majorId = Number(req.params.id);

    if (!Number.isInteger(majorId) || majorId <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid major ID"
        });
    }

    try {
        const majorResult = await pool.query(`
            SELECT
                m.id,
                m.faculty_id,
                m.name_ar,
                m.description_ar,
                m.duration_years,
                m.tuition_fee,
                f.name_ar AS faculty_name_ar,
                f.university_id,
                u.name_ar AS university_name_ar
            FROM majors m
            JOIN faculties f
                ON f.id = m.faculty_id
            JOIN universities u
                ON u.id = f.university_id
            WHERE m.id = $1
              AND m.is_active = true
              AND f.is_active = true
              AND u.is_active = true
            LIMIT 1
        `, [majorId]);

        if (majorResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Major not found"
            });
        }

        const coursesResult = await pool.query(`
            SELECT
                id,
                major_id,
                course_code,
                name_ar,
                description_ar,
                credit_hours,
                semester,
                year_number,
                is_required
            FROM major_courses
            WHERE major_id = $1
              AND is_active = true
            ORDER BY year_number, semester, id
        `, [majorId]);

        const admissionResult = await pool.query(`
            SELECT
                id,
                major_id,
                name_ar,
                description_ar,
                minimum_percentage,
                tuition_fee
            FROM major_admission_options
            WHERE major_id = $1
              AND is_active = true
            ORDER BY id
        `, [majorId]);

        res.json({
            success: true,
            data: {
                ...majorResult.rows[0],
                courses: coursesResult.rows,
                admission_options: admissionResult.rows
            }
        });

    } catch (error) {
        console.error("Error fetching major details:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch major details"
        });
    }
});

module.exports = router;
