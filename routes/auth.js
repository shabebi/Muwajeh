const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();

const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");

// POST /api/auth/register
router.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            success: false,
            message: "Name, email and password are required"
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: "Password must be at least 6 characters"
        });
    }

    try {
        const existingUser = await pool.query(
            "SELECT id FROM users WHERE LOWER(email) = $1",
            [normalizedEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email is already registered"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(`
            INSERT INTO users (name, email, password_hash)
            VALUES ($1, $2, $3)
            RETURNING id, name, email, created_at
        `, [name.trim(), normalizedEmail, passwordHash]);

        const user = result.rows[0];

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            success: true,
            message: "Account created successfully",
            token,
            user
        });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create account"
        });
    }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required"
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
        const result = await pool.query(`
            SELECT id, name, email, password_hash, created_at
            FROM users
            WHERE LOWER(email) = $1
        `, [normalizedEmail]);

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        delete user.password_hash;

        res.json({
            success: true,
            message: "Login successful",
            token,
            user
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to log in"
        });
    }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, email, created_at
            FROM users
            WHERE id = $1
        `, [req.user.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (error) {
        console.error("Auth user error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch user"
        });
    }
});

module.exports = router;
