const express = require("express");
const router = express.Router();

const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");


/*
 * GET /api/wishlist
 * Return the logged-in user's saved majors,
 * including faculty and university information.
 */
router.get("/", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                sm.id,
                sm.major_id,
                sm.created_at,

                m.name_ar,
                m.description_ar,
                m.duration_years,
                m.tuition_fee,

                f.id AS faculty_id,
                f.name_ar AS faculty_name_ar,

                u.id AS university_id,
                u.name_ar AS university_name_ar

            FROM saved_majors sm

            JOIN majors m
                ON m.id = sm.major_id

            JOIN faculties f
                ON f.id = m.faculty_id

            JOIN universities u
                ON u.id = f.university_id

            WHERE sm.user_id = $1
              AND m.is_active = true
              AND f.is_active = true
              AND u.is_active = true

            ORDER BY sm.created_at DESC
        `, [req.user.userId]);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error(
            "Error fetching wishlist:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to fetch wishlist"
        });
    }
});


/*
 * POST /api/wishlist/:majorId
 * Save one major for the logged-in user.
 */
router.post("/:majorId", requireAuth, async (req, res) => {
    const majorId =
        Number(req.params.majorId);

    if (!Number.isInteger(majorId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid major ID"
        });
    }

    try {
        const major =
            await pool.query(`
                SELECT
                    m.id,
                    m.name_ar,
                    m.description_ar,
                    m.duration_years,
                    m.tuition_fee,

                    f.id AS faculty_id,
                    f.name_ar AS faculty_name_ar,

                    u.id AS university_id,
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

        if (major.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Major not found"
            });
        }

        const result =
            await pool.query(`
                INSERT INTO saved_majors
                    (user_id, major_id)

                VALUES
                    ($1, $2)

                ON CONFLICT (
                    user_id,
                    major_id
                )
                DO NOTHING

                RETURNING
                    id,
                    user_id,
                    major_id,
                    created_at
            `, [
                req.user.userId,
                majorId
            ]);

        res.status(201).json({
            success: true,
            data: {
                saved: true,
                major: major.rows[0],
                wishlistItem:
                    result.rows[0] || null
            }
        });

    } catch (error) {
        console.error(
            "Error saving wishlist major:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to save major"
        });
    }
});


/*
 * DELETE /api/wishlist/:majorId
 * Remove one major from the logged-in user's wishlist.
 */
router.delete("/:majorId", requireAuth, async (req, res) => {
    const majorId =
        Number(req.params.majorId);

    if (!Number.isInteger(majorId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid major ID"
        });
    }

    try {
        await pool.query(`
            DELETE FROM saved_majors

            WHERE user_id = $1
              AND major_id = $2
        `, [
            req.user.userId,
            majorId
        ]);

        res.json({
            success: true,
            data: {
                saved: false,
                majorId
            }
        });

    } catch (error) {
        console.error(
            "Error removing wishlist major:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Failed to remove major"
        });
    }
});


module.exports = router;