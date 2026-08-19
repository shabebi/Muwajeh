const express = require("express");
const router = express.Router();
const pool = require("../config/db");

/*
|--------------------------------------------------------------------------
| GET /api/majors
|--------------------------------------------------------------------------
| Returns all active majors with their faculty and university information.
| Used by the main Majors page.
*/
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                m.id,
                m.faculty_id,
                m.name_ar,
                m.description_ar,
                m.duration_years,
                m.tuition_fee,
                m.is_active,

                f.name_ar AS faculty_name_ar,

                u.id AS university_id,
                u.name_ar AS university_name_ar

            FROM majors m

            INNER JOIN faculties f
                ON f.id = m.faculty_id

            INNER JOIN universities u
                ON u.id = f.university_id

            WHERE m.is_active = true
              AND f.is_active = true
              AND u.is_active = true

            ORDER BY m.name_ar ASC
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


/*
|--------------------------------------------------------------------------
| GET /api/majors/faculty/:facultyId
|--------------------------------------------------------------------------
| Returns all active majors belonging to one faculty.
*/
router.get("/faculty/:facultyId", async (req, res) => {
    const facultyId = Number(req.params.facultyId);

    if (!Number.isInteger(facultyId) || facultyId <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid faculty ID"
        });
    }

    try {
        const result = await pool.query(`
            SELECT
                m.id,
                m.faculty_id,
                m.name_ar,
                m.description_ar,
                m.duration_years,
                m.tuition_fee,
                m.is_active,

                f.name_ar AS faculty_name_ar,

                u.id AS university_id,
                u.name_ar AS university_name_ar

            FROM majors m

            INNER JOIN faculties f
                ON f.id = m.faculty_id

            INNER JOIN universities u
                ON u.id = f.university_id

            WHERE m.faculty_id = $1
              AND m.is_active = true
              AND f.is_active = true
              AND u.is_active = true

            ORDER BY m.name_ar ASC
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


/*
|--------------------------------------------------------------------------
| GET /api/majors/:id
|--------------------------------------------------------------------------
| Returns one major.
*/
router.get("/:id", async (req, res) => {
    const majorId = Number(req.params.id);

    if (!Number.isInteger(majorId) || majorId <= 0) {
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
                m.name_ar,
                m.description_ar,
                m.duration_years,
                m.tuition_fee,
                m.is_active,

                f.name_ar AS faculty_name_ar,

                u.id AS university_id,
                u.name_ar AS university_name_ar

            FROM majors m

            INNER JOIN faculties f
                ON f.id = m.faculty_id

            INNER JOIN universities u
                ON u.id = f.university_id

            WHERE m.id = $1
              AND m.is_active = true
              AND f.is_active = true
              AND u.is_active = true

            LIMIT 1
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