const express = require("express");
const router = express.Router();
const puppeteer = require("puppeteer");
const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");

/*
=========================================================
GET /api/assessments/questions

Public endpoint.
Returns the active Arabic questions.
=========================================================
*/

router.get("/questions", async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT
                q.id,
                q.question_number,
                q.question_text_ar,
                q.holland_type_id,
                h.code AS holland_code,
                h.name_ar AS holland_name_ar
            FROM questions q
            JOIN holland_types h
                ON h.id = q.holland_type_id
            WHERE q.is_active = true
            ORDER BY q.question_number
        `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching assessment questions:", error);

    res.status(500).json({
      success: false,
      message: "تعذر تحميل الأسئلة",
    });
  }
});

/*
=========================================================
POST /api/assessments/attempts

Creates a new assessment attempt for the logged-in user.
=========================================================
*/

router.post("/attempts", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
            INSERT INTO assessment_attempts
                (user_id, status)
            VALUES
                ($1, 'in_progress')
            RETURNING
                id,
                user_id,
                status,
                started_at
        `,
      [req.user.userId],
    );

    res.status(201).json({
      success: true,
      message: "تم بدء الاختبار",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating assessment attempt:", error);

    res.status(500).json({
      success: false,
      message: "تعذر بدء الاختبار",
    });
  }
});

/*
=========================================================
POST /api/assessments/attempts/:attemptId/answers

Saves ONE answer.

This means the answer is saved immediately rather than
waiting until the user finishes the entire exam.
=========================================================
*/

router.post("/attempts/:attemptId/answers", requireAuth, async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const questionId = Number(req.body.questionId);
  const answerValue = Number(req.body.answerValue);

  if (!Number.isInteger(attemptId)) {
    return res.status(400).json({
      success: false,
      message: "معرّف المحاولة غير صحيح",
    });
  }

  if (!Number.isInteger(questionId)) {
    return res.status(400).json({
      success: false,
      message: "معرّف السؤال غير صحيح",
    });
  }

  if (!Number.isInteger(answerValue) || answerValue < 1 || answerValue > 5) {
    return res.status(400).json({
      success: false,
      message: "قيمة الإجابة يجب أن تكون بين 1 و5",
    });
  }

  try {
    /*
     * Make sure this attempt belongs to the logged-in user.
     */

    const attempt = await pool.query(
      `
                SELECT id, status
                FROM assessment_attempts
                WHERE id = $1
                  AND user_id = $2
            `,
      [attemptId, req.user.userId],
    );

    if (attempt.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المحاولة غير موجودة",
      });
    }

    if (attempt.rows[0].status !== "in_progress") {
      return res.status(400).json({
        success: false,
        message: "هذه المحاولة انتهت بالفعل",
      });
    }

    /*
     * Make sure the question exists.
     */

    const question = await pool.query(
      `
                SELECT id
                FROM questions
                WHERE id = $1
                  AND is_active = true
            `,
      [questionId],
    );

    if (question.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "السؤال غير موجود",
      });
    }

    /*
     * INSERT or UPDATE.
     */

    const result = await pool.query(
      `
                INSERT INTO assessment_answers
                    (
                        attempt_id,
                        question_id,
                        answer_value
                    )
                VALUES
                    ($1, $2, $3)
                ON CONFLICT (attempt_id, question_id)
                DO UPDATE SET
                    answer_value = EXCLUDED.answer_value
                RETURNING
                    id,
                    attempt_id,
                    question_id,
                    answer_value
            `,
      [attemptId, questionId, answerValue],
    );

    res.json({
      success: true,
      message: "تم حفظ الإجابة",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error saving assessment answer:", error);

    res.status(500).json({
      success: false,
      message: "تعذر حفظ الإجابة",
    });
  }
});

/*
=========================================================
POST /api/assessments/attempts/:attemptId/finish

Finishes the attempt and calculates recommendations.

This is the important endpoint.

It:
1. Checks the attempt belongs to the user.
2. Checks every question was answered.
3. Calculates Holland scores.
4. Calculates major compatibility.
5. Saves assessment_results.
6. Marks the attempt completed.
=========================================================
*/

router.post("/attempts/:attemptId/finish", requireAuth, async (req, res) => {
  const attemptId = Number(req.params.attemptId);

  if (!Number.isInteger(attemptId)) {
    return res.status(400).json({
      success: false,
      message: "معرّف المحاولة غير صحيح",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Verify ownership.
     */

    const attempt = await client.query(
      `
                SELECT
                    id,
                    user_id,
                    status,
                    started_at,
                    completed_at
                FROM assessment_attempts
                WHERE id = $1
                  AND user_id = $2
                FOR UPDATE
            `,
      [attemptId, req.user.userId],
    );

    if (attempt.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "المحاولة غير موجودة",
      });
    }

    if (attempt.rows[0].status === "completed") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "هذه المحاولة مكتملة بالفعل",
      });
    }

    /*
     * Get all active questions.
     */

    const questions = await client.query(`
                SELECT
                    id,
                    question_number,
                    holland_type_id
                FROM questions
                WHERE is_active = true
                ORDER BY question_number
            `);

    /*
     * Get answers.
     */

    const answers = await client.query(
      `
                SELECT
                    question_id,
                    answer_value
                FROM assessment_answers
                WHERE attempt_id = $1
            `,
      [attemptId],
    );

    /*
     * Make sure every question has an answer.
     */

    const answerMap = new Map();

    answers.rows.forEach((answer) => {
      answerMap.set(Number(answer.question_id), Number(answer.answer_value));
    });

    const unansweredQuestions = questions.rows.filter(
      (question) => !answerMap.has(Number(question.id)),
    );

    if (unansweredQuestions.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "يرجى الإجابة عن جميع الأسئلة قبل إنهاء الاختبار",
        unansweredCount: unansweredQuestions.length,
      });
    }

    /*
     * Calculate Holland scores.
     *
     * For each Holland type:
     *
     * average answer / 5 * 100
     */

    const hollandTotals = {};
    const hollandCounts = {};

    questions.rows.forEach((question) => {
      const answer = answerMap.get(Number(question.id));

      const typeId = Number(question.holland_type_id);

      if (!hollandTotals[typeId]) {
        hollandTotals[typeId] = 0;
        hollandCounts[typeId] = 0;
      }

      hollandTotals[typeId] += answer;
      hollandCounts[typeId]++;
    });

    const hollandScores = {};

    Object.keys(hollandTotals).forEach((typeId) => {
      hollandScores[typeId] =
        (hollandTotals[typeId] / hollandCounts[typeId]) * 20;
    });

    /*
     * Get major Holland scores.
     */

    const majorScores = await client.query(`
                SELECT
                    m.id AS major_id,
                    m.name_ar,
                    m.description_ar,
                    m.duration_years,
                    m.tuition_fee,

                    hs.holland_type_id,
                    hs.score

                FROM majors m

                JOIN faculties f
                    ON f.id = m.faculty_id

                JOIN universities u
                    ON u.id = f.university_id

                JOIN major_holland_scores hs
                    ON hs.major_id = m.id

                WHERE m.is_active = true
                  AND f.is_active = true
                  AND u.is_active = true
            `);

    /*
     * Group Holland scores by major.
     */

    const majors = {};

    majorScores.rows.forEach((row) => {
      const majorId = Number(row.major_id);

      if (!majors[majorId]) {
        majors[majorId] = {
          id: majorId,
          name_ar: row.name_ar,
          description_ar: row.description_ar,
          duration_years: row.duration_years,
          tuition_fee: row.tuition_fee,
          holland_scores: {},
        };
      }

      majors[majorId].holland_scores[Number(row.holland_type_id)] = Number(
        row.score,
      );
    });

    /*
     * Calculate compatibility.
     *
     * For each Holland type:
     *
     * user score = 0-100
     * major score = 0-100
     *
     * difference is converted into compatibility.
     */

    const calculatedResults = Object.values(majors).map((major) => {
      const typeIds = new Set([
        ...Object.keys(hollandScores).map(Number),
        ...Object.keys(major.holland_scores).map(Number),
      ]);

      let totalDifference = 0;
      let typeCount = 0;

      typeIds.forEach((typeId) => {
        const userScore = hollandScores[typeId] ?? 0;

        const majorScore = major.holland_scores[typeId] ?? 0;

        totalDifference += Math.abs(userScore - majorScore);

        typeCount++;
      });

      const averageDifference =
        typeCount > 0 ? totalDifference / typeCount : 100;

      const compatibility = Math.max(0, Math.min(100, 100 - averageDifference));

      return {
        majorId: major.id,
        nameAr: major.name_ar,
        descriptionAr: major.description_ar,
        durationYears: major.duration_years,
        tuitionFee: major.tuition_fee,
        compatibilityScore: Number(compatibility.toFixed(2)),
      };
    });

    /*
     * Highest compatibility first.
     */

    calculatedResults.sort(
      (a, b) => b.compatibilityScore - a.compatibilityScore,
    );

    /*
     * Keep top 6.
     */

    const topResults = calculatedResults.slice(0, 6);

    /*
     * Save results.
     */

    for (let index = 0; index < topResults.length; index++) {
      const result = topResults[index];

      await client.query(
        `
                    INSERT INTO assessment_results
                        (
                            attempt_id,
                            major_id,
                            compatibility_score,
                            rank
                        )
                    VALUES
                        ($1, $2, $3, $4)
                    ON CONFLICT (attempt_id, major_id)
                    DO UPDATE SET
                        compatibility_score =
                            EXCLUDED.compatibility_score,
                        rank =
                            EXCLUDED.rank
                `,
        [attemptId, result.majorId, result.compatibilityScore, index + 1],
      );
    }

    /*
     * Mark attempt completed.
     */

    await client.query(
      `
                UPDATE assessment_attempts
                SET
                    status = 'completed',
                    completed_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `,
      [attemptId],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "تم إنهاء الاختبار وحفظ النتائج",
      data: {
        attemptId,
        results: topResults,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("Error finishing assessment:", error);

    res.status(500).json({
      success: false,
      message: "تعذر إنهاء الاختبار",
    });
  } finally {
    client.release();
  }
});

/*
=========================================================
GET /api/assessments/attempts/:attemptId

Get a completed attempt and its saved results.
=========================================================
*/

router.get("/attempts/:attemptId", requireAuth, async (req, res) => {
  const attemptId = Number(req.params.attemptId);

  if (!Number.isInteger(attemptId)) {
    return res.status(400).json({
      success: false,
      message: "معرّف المحاولة غير صحيح",
    });
  }

  try {
    const attempt = await pool.query(
      `
                SELECT
                    id,
                    user_id,
                    status,
                    started_at,
                    completed_at
                FROM assessment_attempts
                WHERE id = $1
                  AND user_id = $2
            `,
      [attemptId, req.user.userId],
    );

    if (attempt.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المحاولة غير موجودة",
      });
    }

    const answers = await pool.query(
      `
                SELECT
                    aa.question_id,
                    aa.answer_value
                FROM assessment_answers aa
                WHERE aa.attempt_id = $1
                ORDER BY aa.question_id
            `,
      [attemptId],
    );

    const results = await pool.query(
      `
                SELECT
                    ar.major_id,
                    ar.compatibility_score,
                    ar.rank,

                    m.name_ar,
                    m.description_ar,
                    m.duration_years,
                    m.tuition_fee

                FROM assessment_results ar

                JOIN majors m
                    ON m.id = ar.major_id

                WHERE ar.attempt_id = $1
                ORDER BY ar.rank
            `,
      [attemptId],
    );

    res.json({
      success: true,
      data: {
        attempt: attempt.rows[0],
        answers: answers.rows,
        results: results.rows,
      },
    });
  } catch (error) {
    console.error("Error fetching assessment attempt:", error);

    res.status(500).json({
      success: false,
      message: "تعذر تحميل نتيجة الاختبار",
    });
  }
});

/*
=========================================================
GET /api/assessments/current

Checks the logged-in user's latest assessment.

Returns:
- completed + results
- in_progress + attempt
- no_attempt
=========================================================
*/

router.get("/current", requireAuth, async (req, res) => {
  try {
    const attemptResult = await pool.query(
      `
            SELECT
                id,
                user_id,
                status,
                started_at,
                completed_at
            FROM assessment_attempts
            WHERE user_id = $1
            ORDER BY started_at DESC
            LIMIT 1
        `,
      [req.user.userId],
    );

    if (attemptResult.rows.length === 0) {
      return res.json({
        success: true,
        status: "no_attempt",
        data: null,
      });
    }

    const attempt = attemptResult.rows[0];

    /*
     * If the latest attempt is completed,
     * get its saved results.
     */

    if (attempt.status === "completed") {
      const results = await pool.query(
        `
    SELECT
        ar.major_id AS "majorId",
        ar.compatibility_score AS "compatibilityScore",
        ar.rank,

        m.name_ar AS "nameAr",
        m.description_ar AS "descriptionAr",
        m.duration_years AS "durationYears",
        m.tuition_fee AS "tuitionFee"

    FROM assessment_results ar

    JOIN majors m
        ON m.id = ar.major_id

    WHERE ar.attempt_id = $1

    ORDER BY ar.rank
`,
        [attempt.id],
      );

      return res.json({
        success: true,
        status: "completed",

        data: {
          attempt: attempt,
          results: results.rows,
        },
      });
    }

    /*
     * If the user started but did not finish,
     * return the existing attempt.
     */

    if (attempt.status === "in_progress") {
      return res.json({
        success: true,
        status: "in_progress",

        data: {
          attempt: attempt,
        },
      });
    }

    res.json({
      success: true,
      status: "no_attempt",
      data: null,
    });
  } catch (error) {
    console.error("Error checking current assessment:", error);

    res.status(500).json({
      success: false,
      message: "تعذر التحقق من حالة الاختبار",
    });
  }
});

/*
=========================================================
DELETE /api/assessments/current

Deletes the logged-in user's latest completed attempt.

Because the database foreign keys use ON DELETE CASCADE,
this also deletes:

assessment_answers
assessment_results
=========================================================
*/

router.delete("/current", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
            DELETE FROM assessment_attempts
            WHERE id = (
                SELECT id
                FROM assessment_attempts
                WHERE user_id = $1
                ORDER BY started_at DESC
                LIMIT 1
            )
            RETURNING id
        `,
      [req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "لا توجد محاولة اختبار لحذفها",
      });
    }

    res.json({
      success: true,
      message: "تم حذف نتيجة الاختبار ويمكنك إعادة الاختبار",
      deletedAttemptId: result.rows[0].id,
    });
  } catch (error) {
    console.error("Error deleting assessment:", error);

    res.status(500).json({
      success: false,
      message: "تعذر حذف الاختبار السابق",
    });
  }
});

// =========================================================
// DOWNLOAD RESULTS AS PDF
// =========================================================

router.get("/results/pdf", requireAuth, async (req, res) => {

    let browser;

    try {

        // Get user's completed attempt
        const attemptResult = await pool.query(`
            SELECT id, completed_at
            FROM assessment_attempts
            WHERE user_id = $1
              AND status = 'completed'
            ORDER BY completed_at DESC NULLS LAST, id DESC
            LIMIT 1
        `, [req.user.userId]);


        if (attemptResult.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: "No completed assessment found"
            });
        }


        const attempt =
            attemptResult.rows[0];


        // Get user
        const userResult = await pool.query(`
            SELECT
                name,
                email
            FROM users
            WHERE id = $1
        `, [req.user.userId]);


        if (userResult.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }


        const user =
            userResult.rows[0];


        // Get results
        const resultsResult = await pool.query(`
            SELECT
                ar.major_id AS "majorId",
                ar.compatibility_score AS "compatibilityScore",
                ar.rank,

                m.name_ar AS "nameAr",
                m.description_ar AS "descriptionAr",
                m.duration_years AS "durationYears",
                m.tuition_fee AS "tuitionFee"

            FROM assessment_results ar

            JOIN majors m
                ON m.id = ar.major_id

            WHERE ar.attempt_id = $1

            ORDER BY ar.rank
        `, [attempt.id]);


        const results =
            resultsResult.rows;


        if (results.length === 0) {

            return res.status(404).json({
                success: false,
                message: "No assessment results found"
            });
        }


        // =====================================================
        // BUILD HTML
        // =====================================================

        const resultCards =
            results
                .slice(0, 6)
                .map((result, index) => {

                    const score =
                        Math.round(
                            Number(
                                result.compatibilityScore
                            )
                        );


                    let label =
                        "توافق متوسط";


                    if (score >= 90) {
                        label = "توافق ممتاز";
                    } else if (score >= 80) {
                        label = "توافق جيد جداً";
                    } else if (score >= 70) {
                        label = "توافق جيد";
                    }


                    return `
                        <div class="result-card">

                            <div class="rank">
                                ${index + 1}
                            </div>

                            <div class="result-info">

                                <h2>
                                    ${escapeHtml(
                                        result.nameAr ||
                                        "تخصص غير معروف"
                                    )}
                                </h2>

                                <div class="score">
                                    ${score}%
                                </div>

                                <div class="label">
                                    ${label}
                                </div>

                            </div>

                        </div>
                    `;
                })
                .join("");


        const completedDate =
            attempt.completed_at
                ? new Date(
                    attempt.completed_at
                ).toLocaleDateString(
                    "ar-SA"
                )
                : "";


        const html = `
            <!DOCTYPE html>

            <html lang="ar" dir="rtl">

            <head>

                <meta charset="UTF-8">

                <style>

                    * {
                        box-sizing: border-box;
                    }

                    body {

                        margin: 0;

                        padding: 40px;

                        font-family:
                            Arial,
                            "Tahoma",
                            sans-serif;

                        direction: rtl;

                        background: white;

                        color: #0b1f3a;
                    }

                    .header {

                        text-align: center;

                        margin-bottom: 35px;

                        border-bottom:
                            2px solid #eeeeee;

                        padding-bottom: 25px;
                    }

                    .logo {

                        font-size: 34px;

                        font-weight: bold;

                        margin-bottom: 10px;
                    }

                    .title {

                        font-size: 27px;

                        font-weight: bold;

                        margin: 0 0 8px;
                    }

                    .subtitle {

                        font-size: 15px;

                        color: #777;

                        margin: 0;
                    }

                    .user-info {

                        background: #f7f8fa;

                        border-radius: 12px;

                        padding: 18px 22px;

                        margin-bottom: 25px;

                        font-size: 15px;

                        line-height: 2;
                    }

                    .user-info strong {

                        color: #0b1f3a;
                    }

                    .section-title {

                        font-size: 21px;

                        margin-bottom: 15px;
                    }

                    .result-card {

                        display: flex;

                        align-items: center;

                        gap: 20px;

                        width: 100%;

                        min-height: 105px;

                        border: 1px solid #dddddd;

                        border-radius: 14px;

                        padding: 20px;

                        margin-bottom: 14px;

                        page-break-inside: avoid;
                    }

                    .rank {

                        width: 45px;

                        height: 45px;

                        border-radius: 50%;

                        background: #f1f3f6;

                        display: flex;

                        align-items: center;

                        justify-content: center;

                        font-size: 20px;

                        font-weight: bold;
                    }

                    .result-info {

                        flex: 1;
                    }

                    .result-info h2 {

                        margin: 0 0 8px;

                        font-size: 19px;
                    }

                    .score {

                        font-size: 22px;

                        font-weight: bold;
                    }

                    .label {

                        color: #777;

                        font-size: 13px;

                        margin-top: 3px;
                    }

                    .footer {

                        text-align: center;

                        color: #888;

                        font-size: 11px;

                        margin-top: 35px;
                    }

                </style>

            </head>

            <body>

                <div class="header">

                    <div class="logo">
                        موّجه
                    </div>

                    <h1 class="title">
                        نتيجة اختبار التوجيه
                    </h1>

                    <p class="subtitle">
                        منصة موّجه للإرشاد الأكاديمي
                    </p>

                </div>


                <div class="user-info">

                    <div>
                        <strong>الاسم:</strong>
                        ${escapeHtml(user.name)}
                    </div>

                    <div>
                        <strong>البريد الإلكتروني:</strong>
                        ${escapeHtml(user.email)}
                    </div>

                    <div>
                        <strong>تاريخ الاختبار:</strong>
                        ${completedDate}
                    </div>

                </div>


                <h2 class="section-title">
                    التخصصات الأنسب لك
                </h2>


                ${resultCards}


                <div class="footer">
                    تم إنشاء هذه النتيجة بواسطة منصة موّجه
                </div>

            </body>

            </html>
        `;


        // =====================================================
        // PUPPETEER
        // =====================================================

        browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox"
            ]
        });


        const page =
            await browser.newPage();


        await page.setContent(
            html,
            {
                waitUntil: "networkidle0"
            }
        );


        const pdf =
            await page.pdf({

                format: "A4",

                printBackground: true,

                margin: {
                    top: "12mm",
                    right: "12mm",
                    bottom: "12mm",
                    left: "12mm"
                }
            });


        await browser.close();

        browser = null;


        res.setHeader(
            "Content-Type",
            "application/pdf"
        );

        res.setHeader(
            "Content-Disposition",
            'attachment; filename="muwajeh-results.pdf"'
        );


        res.send(pdf);


    } catch (error) {

        console.error(
            "PDF generation error:",
            error
        );


        if (browser) {
            await browser.close();
        }


        res.status(500).json({
            success: false,
            message: "Failed to generate PDF"
        });
    }
});


// =========================================================
// ESCAPE HTML
// =========================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

module.exports = router;
