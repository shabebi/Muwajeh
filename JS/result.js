const RESULT_KEY = "muwajeh_local_results";

const majorsGrid = document.getElementById("majorsGrid");
const downloadPdfButton = document.getElementById("downloadPdfButton");
const retakeButton = document.getElementById("retakeButton");

const API_URL = "http://localhost:3000/api";
// =========================================================
// LOAD SAVED RESULTS
// =========================================================

async function loadResults() {

    const token =
        localStorage.getItem("muwajeh_token");


    if (!token) {

        window.location.replace(
            "login.html"
        );

        return null;
    }


    try {

        const response =
            await fetch(
                `${API_URL}/assessments/current`,
                {
                    method: "GET",

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

            return null;
        }


        if (!response.ok) {

            throw new Error(
                `Results request failed: ${response.status}`
            );
        }


        const result =
            await response.json();


        if (!result.success) {

            throw new Error(
                result.message ||
                "Failed to load results"
            );
        }


        /*
         * No completed test.
         */

        if (
            result.status !== "completed"
        ) {

            window.location.replace(
                "test.html"
            );

            return null;
        }


        /*
         * Save temporarily too.
         */

        const data = {
            attemptId:
                result.data.attempt.id,

            results:
                result.data.results
        };


        sessionStorage.setItem(
            "muwajeh_local_results",
            JSON.stringify(data)
        );


        return data;


    } catch (error) {

        console.error(
            "Error loading results:",
            error
        );

        showError(
            "تعذر تحميل نتيجة الاختبار."
        );

        return null;
    }
}


// =========================================================
// RENDER RESULTS
// =========================================================

function renderResults(results) {

    if (
        !Array.isArray(results) ||
        results.length === 0
    ) {
        showError("لم يتم العثور على تخصصات مناسبة.");
        return;
    }

    majorsGrid.innerHTML = "";

    results.slice(0, 6).forEach(function (result, index) {

        const score = Number(
            result.compatibilityScore
        );

        // =========================
        // CARD
        // =========================

        const card = document.createElement("article");

        card.className =
            index === 0
                ? "major-card top-card"
                : "major-card";


        // =========================
        // RANK
        // =========================

        const rank = document.createElement("span");

        rank.className = "rank-number";
        rank.textContent = index + 1;


        // =========================
        // CONTENT
        // =========================

        const content = document.createElement("div");

        content.className = "major-content";


        // =========================
        // SCORE RING
        // =========================

        const scoreRing = document.createElement("div");

        scoreRing.className =
            `score-ring score-${Math.round(score)}`;

        scoreRing.innerHTML =
            `<span>${Math.round(score)}%</span>`;


        // =========================
        // MAJOR INFORMATION
        // =========================

        const info = document.createElement("div");

        info.className = "major-info";


        const title = document.createElement("h2");

        title.textContent =
            result.nameAr || "تخصص غير معروف";


        // =========================
        // FIRST RESULT
        // =========================

        if (index === 0) {

            const label = document.createElement("span");

            label.className =
                "score-label highlight";

            label.innerHTML =
                `<i class="fa-solid fa-star"></i> توافق ممتاز`;

            info.appendChild(title);
            info.appendChild(label);

        }


        // =========================
        // OTHER RESULTS
        // =========================

        else {

            const track = document.createElement("div");

            track.className = "score-track";


            const fill = document.createElement("div");

            fill.style.width = `${score}%`;


            track.appendChild(fill);


            const scoreText = document.createElement("span");

            scoreText.className = "score-text";

            scoreText.textContent =
                `${Math.round(score)}% - ${getScoreLabel(score)}`;


            info.appendChild(title);
            info.appendChild(track);
            info.appendChild(scoreText);
        }


        // =========================
        // BUILD CARD
        // =========================

        content.appendChild(scoreRing);
        content.appendChild(info);

        card.appendChild(rank);
        card.appendChild(content);

        majorsGrid.appendChild(card);
    });
}


// =========================================================
// SCORE LABEL
// =========================================================

function getScoreLabel(score) {

    if (score >= 90) {
        return "توافق ممتاز";
    }

    if (score >= 80) {
        return "توافق جيد جداً";
    }

    if (score >= 70) {
        return "توافق جيد";
    }

    return "توافق متوسط";
}


// =========================================================
// ERROR DISPLAY
// =========================================================

function showError(message) {

    majorsGrid.innerHTML = `
        <article class="major-card">
            <div class="major-content">
                <div class="major-info">
                    <h2>${message}</h2>
                </div>
            </div>
        </article>
    `;
}


// =========================================================
// RETAKE
// =========================================================

// =========================================================
// RETAKE EXAM
// =========================================================

retakeButton.addEventListener(
    "click",
    async function () {

        const token =
            localStorage.getItem("muwajeh_token");


        if (!token) {

            window.location.href =
                "login.html";

            return;
        }


        const confirmed =
            confirm(
                "هل أنت متأكد أنك تريد إعادة الاختبار؟ سيتم حذف نتيجتك الحالية."
            );


        if (!confirmed) {
            return;
        }


        retakeButton.disabled = true;

        retakeButton.textContent =
            "جاري تجهيز الاختبار...";


        try {

            const response =
                await fetch(
                    `${API_URL}/assessments/current`,
                    {
                        method: "DELETE",

                        headers: {
                            Authorization:
                                `Bearer ${token}`
                        }
                    }
                );


            const result =
                await response.json();


            if (
                response.status === 401
            ) {

                localStorage.removeItem(
                    "muwajeh_token"
                );

                localStorage.removeItem(
                    "muwajeh_user"
                );

                window.location.href =
                    "login.html";

                return;
            }


            if (
                !response.ok ||
                !result.success
            ) {

                throw new Error(
                    result.message ||
                    "Failed to delete previous exam"
                );
            }


            /*
             * Remove local data too.
             */

            localStorage.removeItem(
                "muwajeh_exam_answers"
            );

            localStorage.removeItem(
                "muwajeh_attempt_id"
            );

            sessionStorage.removeItem(
                "muwajeh_local_results"
            );


            /*
             * Start fresh exam.
             */

            window.location.href =
                "test.html";


        } catch (error) {

            console.error(
                "Error resetting exam:",
                error
            );


            alert(
                "تعذر إعادة الاختبار. حاول مرة أخرى."
            );


            retakeButton.disabled = false;

            retakeButton.textContent =
                "إعادة الاختبار";
        }
    }
);

// =========================================================
// DOWNLOAD RESULTS AS PDF
// =========================================================

async function downloadResultsPDF() {

    const token =
        localStorage.getItem("muwajeh_token");


    if (!token) {

        window.location.href =
            "login.html";

        return;
    }


    downloadPdfButton.disabled = true;


    const originalHTML =
        downloadPdfButton.innerHTML;


    downloadPdfButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>جاري إنشاء ملف PDF...</span>
    `;


    try {

        const response =
            await fetch(
                `${API_URL}/assessments/results/pdf`,
                {
                    method: "GET",

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

            window.location.href =
                "login.html";

            return;
        }


        if (!response.ok) {

            let message =
                "تعذر إنشاء ملف PDF.";

            try {

                const error =
                    await response.json();

                message =
                    error.message ||
                    message;

            } catch (_) {}

            throw new Error(message);
        }


        const blob =
            await response.blob();


        const url =
            window.URL.createObjectURL(
                blob
            );


        const link =
            document.createElement("a");


        link.href = url;

        link.download =
            "نتيجة-اختبار-موّجه.pdf";


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();


        window.URL.revokeObjectURL(
            url
        );


    } catch (error) {

        console.error(
            "PDF download error:",
            error
        );


        alert(
            error.message ||
            "حدث خطأ أثناء تحميل ملف PDF."
        );


    } finally {

        downloadPdfButton.disabled =
            false;

        downloadPdfButton.innerHTML =
            originalHTML;
    }
}

// =========================================================
// PDF BUTTON
// =========================================================

downloadPdfButton.addEventListener(
    "click",
    downloadResultsPDF
);


// =========================================================
// START
// =========================================================

async function initializeResults() {

    const data =
        await loadResults();

    if (!data) {
        return;
    }

    renderResults(
        data.results
    );
}

initializeResults();