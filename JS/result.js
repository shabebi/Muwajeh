const API_URL = "http://localhost:3000/api";

const ANSWERS_KEY = "muwajeh_exam_answers";

const majorsGrid = document.getElementById("majorsGrid");
const downloadPdfButton = document.getElementById("downloadPdfButton");
const retakeButton = document.getElementById("retakeButton");


// =========================================================
// LOAD ANSWERS FROM LOCAL STORAGE
// =========================================================

function loadAnswers() {
    try {
        const saved = localStorage.getItem(ANSWERS_KEY);

        if (!saved) {
            return null;
        }

        const answers = JSON.parse(saved);

        if (!answers || typeof answers !== "object") {
            return null;
        }

        return answers;

    } catch (error) {
        console.error("Could not read exam answers:", error);
        return null;
    }
}


// =========================================================
// SEND ANSWERS TO BACKEND FOR LOCAL CALCULATION
// =========================================================

async function calculateResults() {

    const answers = loadAnswers();

    if (!answers || Object.keys(answers).length === 0) {
        showError("لم يتم العثور على إجابات الاختبار.");
        return;
    }

    try {

        const response = await fetch(
            `${API_URL}/assessments/recommendations`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    answers
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                `Recommendation request failed: ${response.status}`
            );
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(
                result.message || "Failed to calculate recommendations"
            );
        }

        renderResults(result.data.results);

        /*
         * Save the calculated result locally so the page can be
         * refreshed without losing the displayed result.
         */
        sessionStorage.setItem(
            "muwajeh_local_results",
            JSON.stringify(result.data)
        );

    } catch (error) {

        console.error("Error calculating results:", error);

        showError(
            "حدث خطأ أثناء تحليل إجاباتك. تأكد من أن الخادم يعمل ثم حاول مرة أخرى."
        );
    }
}


// =========================================================
// RENDER SIX MAJORS
// =========================================================

function renderResults(results) {

    if (!Array.isArray(results) || results.length === 0) {
        showError("لم يتم العثور على تخصصات مناسبة.");
        return;
    }

    majorsGrid.innerHTML = "";

    results.slice(0, 6).forEach(function (result, index) {

        const score = Number(result.compatibilityScore);

        const card = document.createElement("article");

        card.className =
            index === 0
                ? "major-card top-card"
                : "major-card";


        const rank = document.createElement("span");

        rank.className = "rank-number";
        rank.textContent = index + 1;


        const content = document.createElement("div");

        content.className = "major-content";


        // Score ring
        const scoreRing = document.createElement("div");

        scoreRing.className =
            `score-ring score-${Math.round(score)}`;

        scoreRing.innerHTML =
            `<span>${Math.round(score)}%</span>`;


        // Major information
        const info = document.createElement("div");

        info.className = "major-info";


        const title = document.createElement("h2");

        title.textContent =
            result.nameAr || result.nameEn || "تخصص غير معروف";


        if (index === 0) {

            const label = document.createElement("span");

            label.className = "score-label highlight";

            label.innerHTML =
                `<i class="fa-solid fa-star"></i> توافق ممتاز`;

            info.appendChild(title);
            info.appendChild(label);

        } else {

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

retakeButton.addEventListener("click", function () {

    localStorage.removeItem(ANSWERS_KEY);
    sessionStorage.removeItem("muwajeh_local_results");
});


// =========================================================
// PDF - TEMPORARY
// =========================================================

downloadPdfButton.addEventListener("click", function () {
    alert("سيتم ربط تحميل ملف PDF لاحقاً.");
});


// =========================================================
// START
// =========================================================

calculateResults();
