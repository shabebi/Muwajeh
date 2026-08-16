/*
 * Muwajeh - Exam Logic (LOCAL RESULTS VERSION)
 *
 * Questions come from:
 *   GET /api/assessments/questions
 *
 * Answers are stored locally in:
 *   localStorage["muwajeh_exam_answers"]
 *
 * When the user finishes, the answers are kept locally and the user
 * is sent directly to results.html.
 *
 * results.html then sends the answers to:
 *   POST /api/assessments/recommendations
 *
 * Nothing is written to assessment_attempts / assessment_answers /
 * assessment_results yet. Login will be connected later.
 */

const API_URL = "http://localhost:3000/api";
const DRAFT_STORAGE_KEY = "muwajeh_exam_answers";

let questions = [];
let currentQuestion = 0;
let answers = {};

const questionText = document.getElementById("questionText");
const categoryPill = document.querySelector(".category-pill span");
const answerOptions = document.querySelectorAll(".answer-option");
const previousButton = document.getElementById("previousButton");
const nextButton = document.getElementById("nextButton");
const questionNumber = document.getElementById("questionNumber");
const progressPercentage = document.getElementById("progressPercentage");
const progressFill = document.getElementById("progressFill");

function loadDraftAnswers() {
    try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (!saved) return;

        const parsed = JSON.parse(saved);

        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            answers = parsed;
        }
    } catch (error) {
        console.error("Could not load saved answers:", error);
        answers = {};
    }
}

function saveDraftAnswers() {
    localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify(answers)
    );
}

async function loadQuestions() {
    try {
        questionText.textContent = "جاري تحميل السؤال...";

        const response = await fetch(`${API_URL}/assessments/questions`);

        if (!response.ok) {
            throw new Error(`Questions request failed: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success || !Array.isArray(result.data)) {
            throw new Error("Invalid questions response");
        }

        questions = result.data;

        questions.sort(
            (a, b) => a.question_number - b.question_number
        );

        if (questions.length === 0) {
            throw new Error("No active questions found");
        }

        renderQuestion();

    } catch (error) {
        console.error("Error loading questions:", error);

        questionText.textContent =
            "تعذر تحميل الأسئلة. يرجى التأكد من تشغيل الخادم والمحاولة مرة أخرى.";

        nextButton.disabled = true;
        previousButton.disabled = true;
    }
}

function renderQuestion() {
    if (!questions.length) return;

    const question = questions[currentQuestion];

    questionText.textContent =
        question.question_text_ar || question.question_text_en;

    categoryPill.textContent = "الأسئلة";

    const savedAnswer = answers[String(question.id)];

    answerOptions.forEach((button) => {
        const value = Number(button.dataset.value);

        button.classList.toggle(
            "selected",
            Number(savedAnswer) === value
        );
    });

    previousButton.disabled = currentQuestion === 0;

    const progress = Math.round(
        ((currentQuestion + 1) / questions.length) * 100
    );

    questionNumber.textContent =
        `السؤال ${currentQuestion + 1} من ${questions.length}`;

    progressPercentage.textContent =
        `${progress}% مكتمل`;

    progressFill.style.width = `${progress}%`;

    nextButton.querySelector("span").textContent =
        currentQuestion === questions.length - 1
            ? "إنهاء"
            : "التالي";
}

answerOptions.forEach((button) => {
    button.addEventListener("click", () => {
        if (!questions.length) return;

        const question = questions[currentQuestion];
        const value = Number(button.dataset.value);

        // Store by the real database question ID.
        answers[String(question.id)] = value;

        saveDraftAnswers();

        answerOptions.forEach((option) => {
            option.classList.remove("selected");
        });

        button.classList.add("selected");
    });
});

nextButton.addEventListener("click", () => {
    if (!questions.length) return;

    const question = questions[currentQuestion];
    const selectedAnswer = answers[String(question.id)];

    if (selectedAnswer === undefined) {
        alert("يرجى اختيار إجابة قبل الانتقال إلى السؤال التالي.");
        return;
    }

    if (currentQuestion < questions.length - 1) {
        currentQuestion++;
        renderQuestion();

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

        return;
    }

    finishExam();
});

previousButton.addEventListener("click", () => {
    if (currentQuestion === 0) return;

    currentQuestion--;

    renderQuestion();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
});

function areAllQuestionsAnswered() {
    return questions.every((question) => {
        return answers[String(question.id)] !== undefined;
    });
}

function finishExam() {
    if (!areAllQuestionsAnswered()) {
        alert("يرجى الإجابة عن جميع الأسئلة قبل إنهاء الاختبار.");
        return;
    }

    saveDraftAnswers();

    // Local mode: go directly to the dynamic results page.
    window.location.href = "results.html";
}

async function initializeExam() {
    loadDraftAnswers();
    await loadQuestions();

    if (questions.length) {
        renderQuestion();
    }
}

initializeExam();
