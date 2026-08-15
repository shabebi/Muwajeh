const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require("./routes/auth");
const universitiesRoutes = require("./routes/universities");
const facultiesRoutes = require("./routes/faculties");
const majorsRoutes = require("./routes/majors");
const questionsRoutes = require("./routes/questions");
const assessmentsRoutes = require("./routes/assessments");

app.use("/api/auth", authRoutes);
app.use("/api/universities", universitiesRoutes);
app.use("/api/faculties", facultiesRoutes);
app.use("/api/majors", majorsRoutes);
app.use("/api/questions", questionsRoutes);
app.use("/api/assessments", assessmentsRoutes);

// Basic health check
app.get("/api/test", (req, res) => {
    res.json({
        success: true,
        message: "Muwajeh backend is working!"
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Endpoint not found"
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error("Unhandled server error:", err);

    res.status(500).json({
        success: false,
        message: "Internal server error"
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
