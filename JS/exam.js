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


/* =========================================================
   AUTH
========================================================= */

function getToken() {
    return (
        localStorage.getItem("muwajeh_token") ||
        sessionStorage.getItem("muwajeh_token")
    );
}


/* =========================================================
   CHECK LOGIN + EXISTING EXAM
========================================================= */

async function checkExistingExam() {

    const token = getToken();


    /*
     * NEVER allow the exam page to work
     * without authentication.
     */

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
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );


        /*
         * Token expired / invalid.
         */

        if (response.status === 401) {

            localStorage.removeItem(
                "muwajeh_token"
            );

            localStorage.removeItem(
                "muwajeh_user"
            );

            window.location.replace(
                "login.html"
            );

            return false;
        }


        if (!response.ok) {

            throw new Error(
                `Assessment status failed: ${response.status}`
            );
        }


        const result =
            await response.json();


        if (!result.success) {

            throw new Error(
                result.message ||
                "Could not check assessment"
            );
        }


        /*
         * USER ALREADY COMPLETED THE TEST
         */

        if (result.status === "completed") {

            /*
             * Save the database result temporarily
             * for results.js.
             */

            sessionStorage.setItem(
                "muwajeh_local_results",
                JSON.stringify({
                    attemptId:
                        result.data.attempt.id,

                    results:
                        result.data.results
                })
            );


            /*
             * Do NOT start the test again.
             */

            window.location.replace(
                "results.html"
            );

            return false;
        }


        /*
         * USER HAS AN UNFINISHED TEST
         *
         * Resume it.
         */

        if (result.status === "in_progress") {

            attemptId =
                Number(result.data.attempt.id);


            localStorage.setItem(
                ATTEMPT_STORAGE_KEY,
                String(attemptId)
            );

            return true;
        }


        /*
         * NO PREVIOUS TEST
         */

        if (result.status === "no_attempt") {

            return await startNewAttempt();
        }


        return false;


    } catch (error) {

        console.error(
            "Error checking existing exam:",
            error
        );

        alert(
            "تعذر التحقق من حالة الاختبار. تأكد من تشغيل الخادم."
        );

        return false;
    }
}


/* =========================================================
   START NEW ATTEMPT
========================================================= */

async function startNewAttempt() {

    const token = getToken();


    if (!token) {

        window.location.replace(
            "login.html"
        );

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

            localStorage.removeItem(
                "muwajeh_token"
            );

            localStorage.removeItem(
                "muwajeh_user"
            );

            window.location.replace(
                "login.html"
            );

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

        alert(
            "تعذر بدء الاختبار."
        );

        return false;
    }
}


/* =========================================================
   LOAD LOCAL DRAFT
========================================================= */

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


/* =========================================================
   LOAD QUESTIONS
========================================================= */

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


/* =========================================================
   RENDER QUESTION
========================================================= */

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


/* =========================================================
   SAVE ANSWER
========================================================= */

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


/* =========================================================
   ANSWER BUTTONS
========================================================= */

answerOptions.forEach(button => {

    button.addEventListener(
        "click",
        async () => {

            if (!questions.length) return;


            const question =
                questions[currentQuestion];


            const value =
                Number(button.dataset.value);


            /*
             * Update UI immediately.
             */

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


            /*
             * Save to database.
             */

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

                alert(
                    "تعذر حفظ الإجابة. يرجى المحاولة مرة أخرى."
                );
            }
        }
    );
});


/* =========================================================
   NEXT
========================================================= */

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

            alert(
                "يرجى اختيار إجابة قبل الانتقال إلى السؤال التالي."
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


/* =========================================================
   PREVIOUS
========================================================= */

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


/* =========================================================
   CHECK ANSWERS
========================================================= */

function areAllQuestionsAnswered() {

    return questions.every(
        question =>
            answers[String(question.id)] !==
            undefined
    );
}


/* =========================================================
   FINISH
========================================================= */

async function finishExam() {

    if (!areAllQuestionsAnswered()) {

        alert(
            "يرجى الإجابة عن جميع الأسئلة قبل إنهاء الاختبار."
        );

        return;
    }


    if (!attemptId) {

        alert(
            "لم يتم العثور على محاولة الاختبار."
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


        /*
         * Save returned database results
         * temporarily for results.js.
         */

        sessionStorage.setItem(
            "muwajeh_local_results",
            JSON.stringify(result.data)
        );


        /*
         * Remove the temporary exam draft.
         */

        localStorage.removeItem(
            DRAFT_STORAGE_KEY
        );


        localStorage.removeItem(
            ATTEMPT_STORAGE_KEY
        );


        /*
         * Go to results.
         */

        window.location.replace(
            "results.html"
        );


    } catch (error) {

        console.error(
            "Error finishing assessment:",
            error
        );


        alert(
            error.message ||
            "تعذر حفظ نتيجة الاختبار."
        );


        nextButton.disabled = false;


        nextButton
            .querySelector("span")
            .textContent =
                "إنهاء";
    }
}


/* =========================================================
   INITIALIZE
========================================================= */

async function initializeExam() {

    /*
     * FIRST:
     * Check login and database status.
     */

    const canStart =
        await checkExistingExam();


    /*
     * If false:
     * - user was redirected to login
     * - OR user was redirected to results
     */

    if (!canStart) {
        return;
    }


    /*
     * Load any local draft.
     */

    loadDraftAnswers();


    /*
     * Load questions.
     */

    await loadQuestions();


    if (questions.length) {
        renderQuestion();
    }
}


initializeExam();