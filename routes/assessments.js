const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");


// =========================================================
// GET /api/assessments/questions
// =========================================================
// Public endpoint.
// Returns all active questions from the database.

router.get("/questions", async (req, res) => {
    try {

        const result = await pool.query(`
            SELECT
                q.id,
                q.question_number,
                q.question_text_ar,
                q.holland_type_id,
                h.code AS holland_code
            FROM questions q
            JOIN holland_types h
                ON h.id = q.holland_type_id
            WHERE q.is_active = true
            ORDER BY q.question_number
        `);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {

        console.error(
            "Error fetching assessment questions:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to fetch assessment questions"
        });
    }
});


// =========================================================
// POST /api/assessments/recommendations
// =========================================================
// TEMPORARY LOCAL VERSION.
//
// This endpoint:
// - does NOT require login
// - does NOT create an assessment_attempt
// - does NOT save answers
// - does NOT save results
//
// It only calculates the top 6 majors from the answers
// stored in localStorage on the frontend.
//
// Later, after login is implemented, this calculation will
// be moved into the authenticated submit endpoint.

router.post("/recommendations", async (req, res) => {

    const { answers } = req.body;

    if (
        !answers ||
        typeof answers !== "object" ||
        Array.isArray(answers)
    ) {

        return res.status(400).json({
            success: false,
            message: "answers must be an object keyed by question ID"
        });
    }


    try {

        // -------------------------------------------------
        // 1. Get active questions
        // -------------------------------------------------

        const questionsResult = await pool.query(`
            SELECT
                q.id,
                q.holland_type_id
            FROM questions q
            WHERE q.is_active = true
            ORDER BY q.question_number
        `);


        // -------------------------------------------------
        // 2. Get active majors
        // -------------------------------------------------

        const majorsResult = await pool.query(`
            SELECT
                m.id AS major_id,
                m.name_ar
            FROM majors m
            JOIN faculties f
                ON f.id = m.faculty_id
            JOIN universities u
                ON u.id = f.university_id
            WHERE m.is_active = true
              AND f.is_active = true
              AND u.is_active = true
        `);


        // -------------------------------------------------
        // 3. Get Holland profile of every major
        // -------------------------------------------------

        const majorScoresResult = await pool.query(`
            SELECT
                major_id,
                holland_type_id,
                score
            FROM major_holland_scores
            ORDER BY major_id, holland_type_id
        `);


        // -------------------------------------------------
        // 4. Calculate user's Holland totals
        // -------------------------------------------------

        const userTotals = {};
        const userCounts = {};


        for (const question of questionsResult.rows) {

            const answer = Number(
                answers[String(question.id)]
            );


            // Only accept answers from 1 to 5.
            if (
                !Number.isInteger(answer) ||
                answer < 1 ||
                answer > 5
            ) {
                continue;
            }


            const hollandTypeId =
                question.holland_type_id;


            userTotals[hollandTypeId] =
                (userTotals[hollandTypeId] || 0) +
                answer;


            userCounts[hollandTypeId] =
                (userCounts[hollandTypeId] || 0) +
                1;
        }


        // -------------------------------------------------
        // 5. Convert user's 1–5 average to 0–100
        // -------------------------------------------------
        //
        // Example:
        //
        // User average = 4.5 / 5
        //
        // 4.5 / 5 × 100 = 90
        //
        // This puts the user score on the same scale as
        // major_holland_scores.score.
        //
        // -------------------------------------------------

        const userScores = {};


        for (const typeId of Object.keys(userTotals)) {

            const average =
                userTotals[typeId] /
                userCounts[typeId];


            userScores[typeId] =
                (average / 5) * 100;
        }


        // -------------------------------------------------
        // 6. Organize major Holland profiles
        // -------------------------------------------------

        const majorProfiles = {};


        for (const row of majorScoresResult.rows) {

            if (!majorProfiles[row.major_id]) {

                majorProfiles[row.major_id] = {};
            }


            majorProfiles[row.major_id][
                row.holland_type_id
            ] = Number(row.score);
        }


        // -------------------------------------------------
        // 7. Calculate compatibility for every major
        // -------------------------------------------------

        const results =
            majorsResult.rows.map((major) => {

                const profile =
                    majorProfiles[major.major_id] || {};


                let totalDifference = 0;
                let typeCount = 0;


                // Holland types 1–6
                for (let typeId = 1; typeId <= 6; typeId++) {

                    const userScore =
                        userScores[typeId];

                    const majorScore =
                        profile[typeId];


                    // If either side doesn't have data,
                    // don't include this type.
                    if (
                        userScore === undefined ||
                        majorScore === undefined
                    ) {
                        continue;
                    }


                    totalDifference +=
                        Math.abs(
                            userScore - majorScore
                        );


                    typeCount++;
                }


                let compatibility = 0;


                if (typeCount > 0) {

                    /*
                     * Both scores are now 0–100.
                     *
                     * Maximum possible difference
                     * for one Holland type = 100.
                     *
                     * Therefore:
                     *
                     * compatibility =
                     * 100 - average difference
                     */

                    const averageDifference =
                        totalDifference / typeCount;


                    compatibility =
                        100 - averageDifference;
                }


                // Keep the result between 0 and 100.
                compatibility =
                    Math.max(
                        0,
                        Math.min(
                            100,
                            compatibility
                        )
                    );


                return {

                    majorId:
                        major.major_id,

                    nameAr:
                        major.name_ar,

                    compatibilityScore:
                        Number(
                            compatibility.toFixed(2)
                        )
                };
            });


        // -------------------------------------------------
        // 8. Sort highest compatibility first
        // -------------------------------------------------

        results.sort(
            (a, b) =>
                b.compatibilityScore -
                a.compatibilityScore
        );


        // -------------------------------------------------
        // 9. Return TOP 6
        // -------------------------------------------------

        const topSix =
            results.slice(0, 6);


        // IMPORTANT:
        // This was missing from your uploaded code.
        // Without this, the browser never receives the result.

        return res.json({

            success: true,

            data: {

                results: topSix
            }
        });


    } catch (error) {

        console.error(
            "Error calculating recommendations:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to calculate recommendations"
        });
    }
});


// =========================================================
// POST /api/assessments/start
// =========================================================
// FINAL VERSION FOR WHEN LOGIN IS USED.

router.post("/start", requireAuth, async (req, res) => {

    try {

        const result = await pool.query(`
            INSERT INTO assessment_attempts
                (user_id, status, started_at)
            VALUES
                ($1, 'in_progress', NOW())
            RETURNING
                id,
                user_id,
                status,
                started_at
        `, [
            req.user.userId
        ]);


        res.status(201).json({

            success: true,

            data: result.rows[0]
        });


    } catch (error) {

        console.error(
            "Error starting assessment:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Failed to start assessment"
        });
    }
});


// =========================================================
// GET /api/assessments/:attemptId
// =========================================================

router.get("/:attemptId", requireAuth, async (req, res) => {

    const attemptId =
        Number(req.params.attemptId);


    if (!Number.isInteger(attemptId)) {

        return res.status(400).json({

            success: false,

            message:
                "Invalid attempt ID"
        });
    }


    try {

        const attempt =
            await pool.query(`

                SELECT
                    id,
                    user_id,
                    status,
                    started_at,
                    completed_at

                FROM assessment_attempts

                WHERE id = $1
                  AND user_id = $2

            `, [
                attemptId,
                req.user.userId
            ]);


        if (attempt.rows.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "Assessment attempt not found"
            });
        }


        const answers =
            await pool.query(`

                SELECT
                    aa.id,
                    aa.question_id,
                    aa.answer_value

                FROM assessment_answers aa

                JOIN assessment_attempts at
                    ON at.id = aa.attempt_id

                WHERE aa.attempt_id = $1
                  AND at.user_id = $2

                ORDER BY aa.question_id

            `, [
                attemptId,
                req.user.userId
            ]);


        res.json({

            success: true,

            data: {

                attempt:
                    attempt.rows[0],

                answers:
                    answers.rows
            }
        });


    } catch (error) {

        console.error(
            "Error fetching assessment:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Failed to fetch assessment"
        });
    }
});


// =========================================================
// POST /api/assessments/:attemptId/answers
// =========================================================

router.post(
    "/:attemptId/answers",
    requireAuth,
    async (req, res) => {

        const attemptId =
            Number(req.params.attemptId);

        const {
            questionId,
            answerValue
        } = req.body;


        if (
            !Number.isInteger(attemptId) ||
            !Number.isInteger(Number(questionId))
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid attempt ID or question ID"
            });
        }


        const numericQuestionId =
            Number(questionId);

        const numericAnswerValue =
            Number(answerValue);


        if (
            !Number.isInteger(numericAnswerValue) ||
            numericAnswerValue < 1 ||
            numericAnswerValue > 5
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "answerValue must be an integer from 1 to 5"
            });
        }


        const client =
            await pool.connect();


        try {

            await client.query("BEGIN");


            const attempt =
                await client.query(`

                    SELECT
                        id,
                        status

                    FROM assessment_attempts

                    WHERE id = $1
                      AND user_id = $2

                    FOR UPDATE

                `, [
                    attemptId,
                    req.user.userId
                ]);


            if (attempt.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({

                    success: false,

                    message:
                        "Assessment attempt not found"
                });
            }


            if (
                attempt.rows[0].status !==
                "in_progress"
            ) {

                await client.query("ROLLBACK");

                return res.status(409).json({

                    success: false,

                    message:
                        "This assessment is no longer in progress"
                });
            }


            const question =
                await client.query(`

                    SELECT id

                    FROM questions

                    WHERE id = $1
                      AND is_active = true

                `, [
                    numericQuestionId
                ]);


            if (question.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({

                    success: false,

                    message:
                        "Question not found"
                });
            }


            const result =
                await client.query(`

                    INSERT INTO assessment_answers
                        (
                            attempt_id,
                            question_id,
                            answer_value
                        )

                    VALUES
                        ($1, $2, $3)

                    ON CONFLICT
                        (
                            attempt_id,
                            question_id
                        )

                    DO UPDATE SET
                        answer_value =
                            EXCLUDED.answer_value

                    RETURNING
                        id,
                        attempt_id,
                        question_id,
                        answer_value

                `, [
                    attemptId,
                    numericQuestionId,
                    numericAnswerValue
                ]);


            await client.query("COMMIT");


            res.status(200).json({

                success: true,

                data:
                    result.rows[0]
            });


        } catch (error) {

            await client.query("ROLLBACK");


            console.error(
                "Error saving assessment answer:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Failed to save answer"
            });


        } finally {

            client.release();
        }
    }
);


// =========================================================
// POST /api/assessments/:attemptId/submit
// =========================================================
// FINAL authenticated version.
// This will be used after login is implemented.

router.post(
    "/:attemptId/submit",
    requireAuth,
    async (req, res) => {

        const attemptId =
            Number(req.params.attemptId);


        if (!Number.isInteger(attemptId)) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid attempt ID"
            });
        }


        const client =
            await pool.connect();


        try {

            await client.query("BEGIN");


            // -------------------------------------------------
            // Check attempt
            // -------------------------------------------------

            const attempt =
                await client.query(`

                    SELECT
                        id,
                        status

                    FROM assessment_attempts

                    WHERE id = $1
                      AND user_id = $2

                    FOR UPDATE

                `, [
                    attemptId,
                    req.user.userId
                ]);


            if (attempt.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({

                    success: false,

                    message:
                        "Assessment attempt not found"
                });
            }


            if (
                attempt.rows[0].status !==
                "in_progress"
            ) {

                await client.query("ROLLBACK");

                return res.status(409).json({

                    success: false,

                    message:
                        "This assessment has already been submitted"
                });
            }


            // -------------------------------------------------
            // Get user's answers grouped by Holland type
            // -------------------------------------------------

            const hollandScores =
                await client.query(`

                    SELECT
                        h.id AS holland_type_id,
                        h.code,

                        COALESCE(
                            SUM(aa.answer_value),
                            0
                        ) AS total_score

                    FROM holland_types h

                    LEFT JOIN questions q
                        ON q.holland_type_id = h.id
                       AND q.is_active = true

                    LEFT JOIN assessment_answers aa
                        ON aa.question_id = q.id
                       AND aa.attempt_id = $1

                    GROUP BY
                        h.id,
                        h.code

                    ORDER BY h.id

                `, [
                    attemptId
                ]);


            // -------------------------------------------------
            // Get active majors
            // -------------------------------------------------

            const majors =
                await client.query(`

                    SELECT
                        m.id AS major_id,
                        m.name_ar

                    FROM majors m

                    JOIN faculties f
                        ON f.id = m.faculty_id

                    JOIN universities u
                        ON u.id = f.university_id

                    WHERE m.is_active = true
                      AND f.is_active = true
                      AND u.is_active = true

                    ORDER BY m.id

                `);


            if (majors.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(500).json({

                    success: false,

                    message:
                        "No active majors are available for assessment results"
                });
            }


            // -------------------------------------------------
            // User Holland scores
            // -------------------------------------------------

            const userScores = {};


            for (const row of hollandScores.rows) {

                userScores[
                    row.holland_type_id
                ] = Number(
                    row.total_score
                );
            }


            // -------------------------------------------------
            // Major Holland profiles
            // -------------------------------------------------

            const majorScores =
                await client.query(`

                    SELECT
                        major_id,
                        holland_type_id,
                        score

                    FROM major_holland_scores

                    ORDER BY
                        major_id,
                        holland_type_id

                `);


            const scoresByMajor = {};


            for (const row of majorScores.rows) {

                if (
                    !scoresByMajor[row.major_id]
                ) {

                    scoresByMajor[row.major_id] = {};
                }


                scoresByMajor[
                    row.major_id
                ][
                    row.holland_type_id
                ] = Number(row.score);
            }


            // -------------------------------------------------
            // Number of questions per Holland type
            // -------------------------------------------------

            const questionCounts =
                await client.query(`

                    SELECT
                        holland_type_id,
                        COUNT(*) AS question_count

                    FROM questions

                    WHERE is_active = true

                    GROUP BY holland_type_id

                `);


            const countsByType = {};


            for (const row of questionCounts.rows) {

                countsByType[
                    row.holland_type_id
                ] = Number(
                    row.question_count
                );
            }


            // -------------------------------------------------
            // Calculate compatibility
            // -------------------------------------------------

            const calculatedResults =
                majors.rows.map((major) => {

                    const profile =
                        scoresByMajor[
                            major.major_id
                        ] || {};


                    let totalDifference = 0;
                    let typeCount = 0;


                    for (
                        let typeId = 1;
                        typeId <= 6;
                        typeId++
                    ) {

                        const count =
                            countsByType[typeId];


                        if (!count) {
                            continue;
                        }


                        // User total is 1–5 per question.
                        // Convert average to 0–100.
                        const userTotal =
                            userScores[typeId] || 0;


                        const userAverage =
                            userTotal / count;


                        const userScore =
                            (userAverage / 5) * 100;


                        const majorScore =
                            profile[typeId];


                        if (
                            majorScore === undefined
                        ) {
                            continue;
                        }


                        totalDifference +=
                            Math.abs(
                                userScore -
                                majorScore
                            );


                        typeCount++;
                    }


                    let compatibilityScore = 0;


                    if (typeCount > 0) {

                        const averageDifference =
                            totalDifference /
                            typeCount;


                        compatibilityScore =
                            100 -
                            averageDifference;
                    }


                    compatibilityScore =
                        Math.max(
                            0,
                            Math.min(
                                100,
                                compatibilityScore
                            )
                        );


                    return {

                        major_id:
                            major.major_id,

                        name_ar:
                            major.name_ar,

                        compatibility_score:
                            Number(
                                compatibilityScore
                                    .toFixed(2)
                            )
                    };
                });


            // -------------------------------------------------
            // Highest compatibility first
            // -------------------------------------------------

            calculatedResults.sort(
                (a, b) =>
                    b.compatibility_score -
                    a.compatibility_score
            );


            // Top 10 for database storage.
            const topResults =
                calculatedResults.slice(0, 10);


            // -------------------------------------------------
            // Complete the attempt
            // -------------------------------------------------

            await client.query(`

                UPDATE assessment_attempts

                SET
                    status = 'completed',
                    completed_at = NOW()

                WHERE id = $1

            `, [
                attemptId
            ]);


            // -------------------------------------------------
            // Save results
            // -------------------------------------------------

            for (
                let i = 0;
                i < topResults.length;
                i++
            ) {

                const result =
                    topResults[i];


                await client.query(`

                    INSERT INTO assessment_results
                        (
                            attempt_id,
                            major_id,
                            compatibility_score,
                            rank,
                            created_at
                        )

                    VALUES
                        (
                            $1,
                            $2,
                            $3,
                            $4,
                            NOW()
                        )

                `, [
                    attemptId,
                    result.major_id,
                    result.compatibility_score,
                    i + 1
                ]);
            }


            await client.query("COMMIT");


            res.json({

                success: true,

                data: {

                    attemptId,

                    results:
                        topResults.map(
                            (result, index) => ({

                                rank:
                                    index + 1,

                                majorId:
                                    result.major_id,

                                nameAr:
                                    result.name_ar,

                                compatibilityScore:
                                    result.compatibility_score
                            })
                        )
                }
            });


        } catch (error) {

            await client.query("ROLLBACK");


            console.error(
                "Error submitting assessment:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Failed to submit assessment"
            });


        } finally {

            client.release();
        }
    }
);


// =========================================================
// GET /api/assessments/:attemptId/results
// =========================================================

router.get(
    "/:attemptId/results",
    requireAuth,
    async (req, res) => {

        const attemptId =
            Number(req.params.attemptId);


        if (!Number.isInteger(attemptId)) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid attempt ID"
            });
        }


        try {

            const result =
                await pool.query(`

                    SELECT
                        ar.id,
                        ar.attempt_id,
                        ar.major_id,
                        ar.compatibility_score,
                        ar.rank,
                        ar.created_at,

                        m.name_ar,
                        m.description_ar,
                        m.duration_years,
                        m.requirements_ar,
                        m.skills_ar,
                        m.career_opportunities_ar,
                        m.tuition_fee,

                        f.id AS faculty_id,
                        f.name_ar AS faculty_name_ar,

                        u.id AS university_id,
                        u.name_ar AS university_name_ar

                    FROM assessment_results ar

                    JOIN assessment_attempts a
                        ON a.id = ar.attempt_id

                    JOIN majors m
                        ON m.id = ar.major_id

                    JOIN faculties f
                        ON f.id = m.faculty_id

                    JOIN universities u
                        ON u.id = f.university_id

                    WHERE ar.attempt_id = $1
                      AND a.user_id = $2

                    ORDER BY ar.rank

                `, [
                    attemptId,
                    req.user.userId
                ]);


            res.json({

                success: true,

                data:
                    result.rows
            });


        } catch (error) {

            console.error(
                "Error fetching assessment results:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Failed to fetch assessment results"
            });
        }
    }
);


module.exports = router;