const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const router = express.Router();

const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const CODE_EXPIRATION_MINUTES = 10;
const CODE_EXPIRATION_MS = CODE_EXPIRATION_MINUTES * 60 * 1000;
const RESEND_COOLDOWN_SECONDS = 60;

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateCode() {
    return crypto.randomInt(100000, 1000000).toString();
}

function hashCode(code) {
    return crypto
        .createHash("sha256")
        .update(String(code))
        .digest("hex");
}

function createTransporter() {
    if (
        !process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS
    ) {
        throw new Error(
            "SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env"
        );
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_PORT || "587") === "465",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

async function sendVerificationEmail(email, code, purpose) {
    const transporter = createTransporter();

    const isSignup = purpose === "signup";

    const subject = isSignup
        ? "رمز تأكيد حسابك في مواجهة"
        : "رمز استعادة كلمة المرور في مواجهة";

    const title = isSignup
        ? "تأكيد البريد الإلكتروني"
        : "استعادة كلمة المرور";

    await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject,
        text:
            `${title}\n\n` +
            `رمز التحقق الخاص بك هو: ${code}\n\n` +
            `هذا الرمز صالح لمدة ${CODE_EXPIRATION_MINUTES} دقائق.`,

        html: `
            <div dir="rtl" style="
                font-family: Arial, sans-serif;
                max-width: 520px;
                margin: 0 auto;
                padding: 30px;
                color: #0A1D38;
            ">
                <h2>${title}</h2>
                <p>رمز التحقق الخاص بك هو:</p>

                <div style="
                    display: inline-block;
                    padding: 14px 22px;
                    margin: 10px 0 18px;
                    background: #F8FAFC;
                    border: 1px solid #D1D5DB;
                    border-radius: 12px;
                    color: #0A1D38;
                    font-size: 32px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    direction: ltr;
                ">
                    ${code}
                </div>

                <p>
                    هذا الرمز صالح لمدة ${CODE_EXPIRATION_MINUTES} دقائق فقط.
                </p>
            </div>
        `
    });
}

async function createVerificationCode(client, email, purpose) {
    const now = new Date();
    const expiresAt = new Date(Date.now() + CODE_EXPIRATION_MS);
    const code = generateCode();
    const codeHash = hashCode(code);

    await client.query(
        `
        UPDATE auth_verification_codes
        SET used_at = NOW()
        WHERE email = $1
          AND purpose = $2
          AND used_at IS NULL
        `,
        [email, purpose]
    );

    await client.query(
        `
        INSERT INTO auth_verification_codes
            (email, purpose, code_hash, expires_at, created_at)
        VALUES
            ($1, $2, $3, $4, $5)
        `,
        [email, purpose, codeHash, expiresAt, now]
    );

    return code;
}

async function getLatestCode(client, email, purpose) {
    const result = await client.query(
        `
        SELECT
            id,
            code_hash,
            expires_at,
            created_at,
            used_at
        FROM auth_verification_codes
        WHERE email = $1
          AND purpose = $2
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [email, purpose]
    );

    return result.rows[0] || null;
}

async function checkResendCooldown(client, email, purpose) {
    const result = await client.query(
        `
        SELECT created_at
        FROM auth_verification_codes
        WHERE email = $1
          AND purpose = $2
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [email, purpose]
    );

    if (result.rows.length === 0) {
        return false;
    }

    const createdAt = new Date(result.rows[0].created_at).getTime();
    const secondsSinceLastCode =
        (Date.now() - createdAt) / 1000;

    return secondsSinceLastCode < RESEND_COOLDOWN_SECONDS;
}

async function verifyCode(client, email, purpose, code) {
    const record = await getLatestCode(client, email, purpose);

    if (!record) {
        return {
            ok: false,
            message: "رمز التحقق غير موجود أو تم استخدامه"
        };
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
        return {
            ok: false,
            message: "رمز التحقق منتهي الصلاحية"
        };
    }

    if (hashCode(code) !== record.code_hash) {
        return {
            ok: false,
            message: "رمز التحقق غير صحيح"
        };
    }

    await client.query(
        `
        UPDATE auth_verification_codes
        SET used_at = NOW()
        WHERE id = $1
        `,
        [record.id]
    );

    return {
        ok: true
    };
}

/* =========================================================
   POST /api/auth/register-request
   Create an unverified account and send a 6-digit code.
   ========================================================= */

router.post("/register-request", async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            success: false,
            message: "يرجى تعبئة جميع الحقول"
        });
    }

    const cleanName = String(name).trim();
    const normalizedEmail = normalizeEmail(email);
    const cleanPassword = String(password);

    if (cleanName.length < 2) {
        return res.status(400).json({
            success: false,
            message: "يرجى إدخال اسم صحيح"
        });
    }

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
            success: false,
            message: "البريد الإلكتروني غير صحيح"
        });
    }

    if (cleanPassword.length < 6) {
        return res.status(400).json({
            success: false,
            message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const existing = await client.query(
            `
            SELECT id, email_verified
            FROM users
            WHERE LOWER(email) = $1
            `,
            [normalizedEmail]
        );

        if (
            existing.rows.length > 0 &&
            existing.rows[0].email_verified === true
        ) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                message: "هذا البريد الإلكتروني مسجل بالفعل"
            });
        }

        const passwordHash = await bcrypt.hash(cleanPassword, 12);

        let userId;

        if (existing.rows.length > 0) {
            const updated = await client.query(
                `
                UPDATE users
                SET
                    name = $1,
                    password_hash = $2,
                    email_verified = false
                WHERE id = $3
                RETURNING id
                `,
                [cleanName, passwordHash, existing.rows[0].id]
            );

            userId = updated.rows[0].id;
        } else {
            const inserted = await client.query(
                `
                INSERT INTO users
                    (name, email, password_hash, email_verified)
                VALUES
                    ($1, $2, $3, false)
                RETURNING id
                `,
                [cleanName, normalizedEmail, passwordHash]
            );

            userId = inserted.rows[0].id;
        }

        const code = await createVerificationCode(
            client,
            normalizedEmail,
            "signup"
        );

        await client.query("COMMIT");

        try {
            await sendVerificationEmail(
                normalizedEmail,
                code,
                "signup"
            );
        } catch (emailError) {
            console.error("Signup email error:", emailError);

            // The account/code was created, but the email was not sent.
            // The user can use resend after SMTP is fixed.
            return res.status(500).json({
                success: false,
                message: "تعذر إرسال رمز التحقق. تأكد من إعداد البريد الإلكتروني في الخادم.",
                userId
            });
        }

        console.log(
            `[AUTH] Signup verification code generated for ${normalizedEmail}`
        );

        return res.status(200).json({
            success: true,
            message: "تم إرسال رمز التحقق إلى بريدك الإلكتروني"
        });

    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}

        console.error("Register request error:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر إنشاء الحساب"
        });
    } finally {
        client.release();
    }
});

/* =========================================================
   POST /api/auth/verify-signup
   Verify the email and activate the account.
   ========================================================= */

router.post("/verify-signup", async (req, res) => {
    const { email, code } = req.body;

    const normalizedEmail = normalizeEmail(email);
    const cleanCode = String(code || "").trim();

    if (
        !isValidEmail(normalizedEmail) ||
        !/^\d{6}$/.test(cleanCode)
    ) {
        return res.status(400).json({
            success: false,
            message: "البريد الإلكتروني أو رمز التحقق غير صحيح"
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const user = await client.query(
            `
            SELECT id, name, email, email_verified, created_at
            FROM users
            WHERE LOWER(email) = $1
            FOR UPDATE
            `,
            [normalizedEmail]
        );

        if (user.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "الحساب غير موجود"
            });
        }

        if (user.rows[0].email_verified === true) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                message: "البريد الإلكتروني مؤكد بالفعل"
            });
        }

        const verification = await verifyCode(
            client,
            normalizedEmail,
            "signup",
            cleanCode
        );

        if (!verification.ok) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: verification.message
            });
        }

        const updated = await client.query(
            `
            UPDATE users
            SET email_verified = true
            WHERE id = $1
            RETURNING id, name, email, created_at
            `,
            [user.rows[0].id]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            message: "تم تأكيد البريد الإلكتروني وإنشاء الحساب بنجاح",
            user: updated.rows[0]
        });

    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}

        console.error("Verify signup error:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تأكيد الحساب"
        });
    } finally {
        client.release();
    }
});

/* =========================================================
   POST /api/auth/resend-signup-code
   ========================================================= */

router.post("/resend-signup-code", async (req, res) => {
    const normalizedEmail = normalizeEmail(req.body.email);

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
            success: false,
            message: "البريد الإلكتروني غير صحيح"
        });
    }

    const client = await pool.connect();

    try {
        const user = await client.query(
            `
            SELECT email_verified
            FROM users
            WHERE LOWER(email) = $1
            `,
            [normalizedEmail]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "الحساب غير موجود"
            });
        }

        if (user.rows[0].email_verified === true) {
            return res.status(409).json({
                success: false,
                message: "البريد الإلكتروني مؤكد بالفعل"
            });
        }

        if (
            await checkResendCooldown(
                client,
                normalizedEmail,
                "signup"
            )
        ) {
            return res.status(429).json({
                success: false,
                message: "انتظر قليلاً قبل إعادة إرسال الرمز"
            });
        }

        const code = await createVerificationCode(
            client,
            normalizedEmail,
            "signup"
        );

        await sendVerificationEmail(
            normalizedEmail,
            code,
            "signup"
        );

        return res.json({
            success: true,
            message: "تم إرسال رمز جديد"
        });

    } catch (error) {
        console.error("Resend signup code error:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر إعادة إرسال رمز التحقق"
        });
    } finally {
        client.release();
    }
});

/* =========================================================
   POST /api/auth/login
   ========================================================= */

router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "يرجى إدخال البريد الإلكتروني وكلمة المرور"
        });
    }

    const normalizedEmail = normalizeEmail(email);

    try {
        const result = await pool.query(
            `
            SELECT
                id,
                name,
                email,
                password_hash,
                email_verified,
                created_at
            FROM users
            WHERE LOWER(email) = $1
            `,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "البريد الإلكتروني أو كلمة المرور غير صحيحة"
            });
        }

        const user = result.rows[0];

        if (user.email_verified !== true) {
            return res.status(403).json({
                success: false,
                message: "يرجى تأكيد بريدك الإلكتروني أولاً",
                requiresVerification: true
            });
        }

        const passwordMatches = await bcrypt.compare(
            String(password),
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "البريد الإلكتروني أو كلمة المرور غير صحيحة"
            });
        }

        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        return res.json({
            success: true,
            message: "تم تسجيل الدخول بنجاح",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                created_at: user.created_at
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تسجيل الدخول"
        });
    }
});

/* =========================================================
   POST /api/auth/forgot-password
   ========================================================= */

router.post("/forgot-password", async (req, res) => {
    const normalizedEmail = normalizeEmail(req.body.email);

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
            success: false,
            message: "البريد الإلكتروني غير صحيح"
        });
    }

    const client = await pool.connect();

    try {
        const user = await client.query(
            `
            SELECT id, email_verified
            FROM users
            WHERE LOWER(email) = $1
            `,
            [normalizedEmail]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "لا يوجد حساب بهذا البريد الإلكتروني"
            });
        }

        if (user.rows[0].email_verified !== true) {
            return res.status(403).json({
                success: false,
                message: "يرجى تأكيد البريد الإلكتروني أولاً"
            });
        }

        if (
            await checkResendCooldown(
                client,
                normalizedEmail,
                "password_reset"
            )
        ) {
            return res.status(429).json({
                success: false,
                message: "انتظر قليلاً قبل طلب رمز جديد"
            });
        }

        const code = await createVerificationCode(
            client,
            normalizedEmail,
            "password_reset"
        );

        await sendVerificationEmail(
            normalizedEmail,
            code,
            "password_reset"
        );

        return res.json({
            success: true,
            message: "تم إرسال رمز استعادة كلمة المرور إلى بريدك الإلكتروني"
        });

    } catch (error) {
        console.error("Forgot password error:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر إرسال رمز استعادة كلمة المرور"
        });
    } finally {
        client.release();
    }
});

/* =========================================================
   POST /api/auth/reset-password
   ========================================================= */

router.post("/reset-password", async (req, res) => {
    const { email, code, password } = req.body;

    const normalizedEmail = normalizeEmail(email);
    const cleanCode = String(code || "").trim();
    const cleanPassword = String(password || "");

    if (
        !isValidEmail(normalizedEmail) ||
        !/^\d{6}$/.test(cleanCode)
    ) {
        return res.status(400).json({
            success: false,
            message: "البريد الإلكتروني أو رمز التحقق غير صحيح"
        });
    }

    if (cleanPassword.length < 6) {
        return res.status(400).json({
            success: false,
            message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const user = await client.query(
            `
            SELECT id, email_verified
            FROM users
            WHERE LOWER(email) = $1
            FOR UPDATE
            `,
            [normalizedEmail]
        );

        if (user.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        const verification = await verifyCode(
            client,
            normalizedEmail,
            "password_reset",
            cleanCode
        );

        if (!verification.ok) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: verification.message
            });
        }

        const passwordHash = await bcrypt.hash(
            cleanPassword,
            12
        );

        await client.query(
            `
            UPDATE users
            SET password_hash = $1
            WHERE id = $2
            `,
            [passwordHash, user.rows[0].id]
        );

        await client.query("COMMIT");

        return res.json({
            success: true,
            message: "تم تحديث كلمة المرور بنجاح"
        });

    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}

        console.error("Reset password error:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تحديث كلمة المرور"
        });
    } finally {
        client.release();
    }
});

/* =========================================================
   GET /api/auth/me
   ========================================================= */

router.get("/me", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                id,
                name,
                email,
                email_verified,
                created_at
            FROM users
            WHERE id = $1
            `,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        return res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Auth user error:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر جلب بيانات المستخدم"
        });
    }
});

module.exports = router;
