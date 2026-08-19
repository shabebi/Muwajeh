const API_URL = "http://localhost:3000/api";

const DRAFT_STORAGE_KEY = "muwajeh_exam_answers";
const ATTEMPT_STORAGE_KEY = "muwajeh_attempt_id";

let questions = [];
let currentQuestion = 0;
let answers = {};
let attemptId = null;

const questionText =
    document.getElementById("questionText");

const categoryPill =
    document.querySelector(".category-pill span");

const answerOptions =
    document.querySelectorAll(".answer-option");

const previousButton =
    document.getElementById("previousButton");

const nextButton =
    document.getElementById("nextButton");

const questionNumber =
    document.getElementById("questionNumber");

const progressPercentage =
    document.getElementById("progressPercentage");

const progressFill =
    document.getElementById("progressFill");

function showToast(message, type = "error") {
    let toast = document.getElementById("muwajehToast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "muwajehToast";
        toast.className = "muwajeh-toast";
        document.body.appendChild(toast);
    }

    const icon =
        type === "success"
            ? "fa-circle-check"
            : "fa-circle-exclamation";

    toast.className = `muwajeh-toast ${type}`;

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

function getToken() {
    return (
        localStorage.getItem("muwajeh_token") ||
        sessionStorage.getItem("muwajeh_token")
    );
}

async function checkExistingExam() {
    const token = getToken();

    if (!token) {
        window.location.replace("login.html");
        return false;
    }

    try {
        const response = await fetch(
            `${API_URL}/assessments/current`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (response.status === 401) {
            localStorage.removeItem("muwajeh_token");
            localStorage.removeItem("muwajeh_user");
            sessionStorage.removeItem("muwajeh_token");

            window.location.replace("login.html");
            return false;
        }

        if (!response.ok) {
            throw new Error(
                `Assessment status failed: ${response.status}`
            );
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(
                result.message ||
                "Could not check assessment"
            );
        }

        if (result.status === "completed") {
            sessionStorage.setItem(
                "muwajeh_local_results",
                JSON.stringify({
                    attemptId:
                        result.data.attempt.id,
                    results:
                        result.data.results
                })
            );

            window.location.replace("results.html");
            return false;
        }

        if (result.status === "in_progress") {
            attemptId =
                Number(result.data.attempt.id);

            localStorage.setItem(
                ATTEMPT_STORAGE_KEY,
                String(attemptId)
            );

            return true;
        }

        if (result.status === "no_attempt") {
            return await startNewAttempt();
        }

        return false;

    } catch (error) {
        console.error(
            "Error checking existing exam:",
            error
        );

        showToast(
            "تعذر التحقق من حالة الاختبار. تأكد من تشغيل الخادم.",
            "error"
        );

        return false;
    }
}

async function startNewAttempt() {
    const token = getToken();

    if (!token) {
        window.location.replace("login.html");
        return false;
    }

    try {
        const response = await fetch(
            `${API_URL}/assessments/attempts`,
            {
                method: "POST",
                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );

        if (response.status === 401) {
            localStorage.removeItem("muwajeh_token");
            localStorage.removeItem("muwajeh_user");
            sessionStorage.removeItem("muwajeh_token");

            window.location.replace("login.html");
            return false;
        }

        if (!response.ok) {
            throw new Error(
                `Attempt creation failed: ${response.status}`
            );
        }

        const result =
            await response.json();

        if (
            !result.success ||
            !result.data ||
            !result.data.id
        ) {
            throw new Error(
                result.message ||
                "Invalid attempt response"
            );
        }

        attemptId =
            Number(result.data.id);

        localStorage.setItem(
            ATTEMPT_STORAGE_KEY,
            String(attemptId)
        );

        return true;

    } catch (error) {
        console.error(
            "Error starting new attempt:",
            error
        );

        showToast(
            "تعذر بدء الاختبار.",
            "error"
        );

        return false;
    }
}

function loadDraftAnswers() {
    try {
        const saved =
            localStorage.getItem(
                DRAFT_STORAGE_KEY
            );

        if (!saved) return;

        const parsed =
            JSON.parse(saved);

        if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
        ) {
            answers = parsed;
        }

    } catch (error) {
        console.error(
            "Could not load saved answers:",
            error
        );

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
        questionText.textContent =
            "جاري تحميل السؤال...";

        const response =
            await fetch(
                `${API_URL}/assessments/questions`
            );

        if (!response.ok) {
            throw new Error(
                `Questions request failed: ${response.status}`
            );
        }

        const result =
            await response.json();

        if (
            !result.success ||
            !Array.isArray(result.data)
        ) {
            throw new Error(
                "Invalid questions response"
            );
        }

        questions =
            result.data;

        questions.sort(
            (a, b) =>
                a.question_number -
                b.question_number
        );

        if (questions.length === 0) {
            throw new Error(
                "No active questions found"
            );
        }

        renderQuestion();

    } catch (error) {
        console.error(
            "Error loading questions:",
            error
        );

        questionText.textContent =
            "تعذر تحميل الأسئلة. يرجى التأكد من تشغيل الخادم والمحاولة مرة أخرى.";

        nextButton.disabled = true;
        previousButton.disabled = true;
    }
}

function renderQuestion() {
    if (!questions.length) return;

    const question =
        questions[currentQuestion];

    questionText.textContent =
        question.question_text_ar;

    categoryPill.textContent =
        "الأسئلة";

    const savedAnswer =
        answers[String(question.id)];

    answerOptions.forEach(button => {
        const value =
            Number(button.dataset.value);

        button.classList.toggle(
            "selected",
            Number(savedAnswer) === value
        );
    });

    previousButton.disabled =
        currentQuestion === 0;

    const answeredCount =
        Object.keys(answers).length;

    const progress =
        Math.round(
            (answeredCount /
                questions.length) *
            100
        );

    questionNumber.textContent =
        `السؤال ${currentQuestion + 1} من ${questions.length}`;

    progressPercentage.textContent =
        `${progress}% مكتمل`;

    progressFill.style.width =
        `${progress}%`;

    nextButton
        .querySelector("span")
        .textContent =
            currentQuestion ===
            questions.length - 1
                ? "إنهاء"
                : "التالي";
}

async function saveAnswerToDatabase(
    questionId,
    answerValue
) {
    const token =
        getToken();

    const response =
        await fetch(
            `${API_URL}/assessments/attempts/${attemptId}/answers`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    Authorization:
                        `Bearer ${token}`
                },

                body: JSON.stringify({
                    questionId,
                    answerValue
                })
            }
        );

    if (!response.ok) {
        const result =
            await response.json()
                .catch(() => null);

        throw new Error(
            result?.message ||
            `Answer save failed: ${response.status}`
        );
    }

    const result =
        await response.json();

    if (!result.success) {
        throw new Error(
            result.message ||
            "Failed to save answer"
        );
    }

    return result;
}

answerOptions.forEach(button => {
    button.addEventListener(
        "click",
        async () => {
            if (!questions.length) return;

            const question =
                questions[currentQuestion];

            const value =
                Number(button.dataset.value);

            answers[String(question.id)] =
                value;

            saveDraftAnswers();

            answerOptions.forEach(option => {
                option.classList.remove(
                    "selected"
                );
            });

            button.classList.add(
                "selected"
            );

            try {
                await saveAnswerToDatabase(
                    question.id,
                    value
                );

            } catch (error) {
                console.error(
                    "Could not save answer:",
                    error
                );

                showToast(
                    "تعذر حفظ الإجابة. يرجى المحاولة مرة أخرى.",
                    "error"
                );
            }
        }
    );
});

nextButton.addEventListener(
    "click",
    async () => {
        if (!questions.length) return;

        const question =
            questions[currentQuestion];

        const selectedAnswer =
            answers[String(question.id)];

        if (
            selectedAnswer === undefined
        ) {
            showToast(
                "يرجى اختيار إجابة قبل الانتقال إلى السؤال التالي.",
                "error"
            );

            return;
        }

        if (
            currentQuestion <
            questions.length - 1
        ) {
            currentQuestion++;

            renderQuestion();

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

            return;
        }

        await finishExam();
    }
);

previousButton.addEventListener(
    "click",
    () => {
        if (currentQuestion === 0) return;

        currentQuestion--;

        renderQuestion();

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
);

function areAllQuestionsAnswered() {
    return questions.every(
        question =>
            answers[String(question.id)] !==
            undefined
    );
}

async function finishExam() {
    if (!areAllQuestionsAnswered()) {
        showToast(
            "يرجى الإجابة عن جميع الأسئلة قبل إنهاء الاختبار.",
            "error"
        );

        return;
    }

    if (!attemptId) {
        showToast(
            "لم يتم العثور على محاولة الاختبار.",
            "error"
        );

        return;
    }

    const token =
        getToken();

    if (!token) {
        window.location.replace(
            "login.html"
        );

        return;
    }

    nextButton.disabled = true;

    nextButton
        .querySelector("span")
        .textContent =
            "جاري الحفظ...";

    try {
        const response =
            await fetch(
                `${API_URL}/assessments/attempts/${attemptId}/finish`,
                {
                    method: "POST",

                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );

        const result =
            await response.json();

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "Failed to finish assessment"
            );
        }

        sessionStorage.setItem(
            "muwajeh_local_results",
            JSON.stringify(
                result.data
            )
        );

        localStorage.removeItem(
            DRAFT_STORAGE_KEY
        );

        localStorage.removeItem(
            ATTEMPT_STORAGE_KEY
        );

        window.location.replace(
            "results.html"
        );

    } catch (error) {
        console.error(
            "Error finishing assessment:",
            error
        );

        showToast(
            error.message ||
            "تعذر حفظ نتيجة الاختبار.",
            "error"
        );

        nextButton.disabled =
            false;

        nextButton
            .querySelector("span")
            .textContent =
                "إنهاء";
    }
}

async function initializeExam() {
    const canStart =
        await checkExistingExam();

    if (!canStart) {
        return;
    }

    loadDraftAnswers();

    await loadQuestions();

    if (questions.length) {
        renderQuestion();
    }
}

initializeExam();