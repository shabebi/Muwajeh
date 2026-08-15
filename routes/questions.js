const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// GET /api/questions
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                q.id,
                q.question_number,
                q.question_text_en,
                q.question_text_ar,
                q.holland_type_id,
                h.code AS holland_code,
                h.name_en AS holland_name_en,
                h.name_ar AS holland_name_ar
            FROM questions q
            JOIN holland_types h ON h.id = q.holland_type_id
            WHERE q.is_active = true
            ORDER BY q.question_number
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error("Error fetching questions:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch questions"
        });
    }
});

// GET /api/questions/:id
router.get("/:id", async (req, res) => {
    const questionId = Number(req.params.id);

    if (!Number.isInteger(questionId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid question ID"
        });
    }

    try {
        const result = await pool.query(`
            SELECT
                q.id,
                q.question_number,
                q.question_text_en,
                q.question_text_ar,
                q.holland_type_id,
                h.code AS holland_code,
                h.name_en AS holland_name_en,
                h.name_ar AS holland_name_ar
            FROM questions q
            JOIN holland_types h ON h.id = q.holland_type_id
            WHERE q.id = $1
              AND q.is_active = true
        `, [questionId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Question not found"
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error("Error fetching question:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch question"
        });
    }
});

module.exports = router;
