/*
 * MUWAJEH — Dynamic Majors Directory
 *
 * API:
 *   GET /api/majors
 *
 * The backend returns the active majors together with:
 *   faculty_id
 *   faculty_name_ar
 *   university_id
 *   university_name_ar
 *
 * The page never hard-codes major or faculty data.
 */

document.addEventListener("DOMContentLoaded", () => {
    const API_URL =
        window.MUWAJEH_API_URL ||
        "http://localhost:3000/api";

    const searchInput =
        document.getElementById("majorSearch");

    const searchButton =
        document.getElementById("searchButton");

    const facultyFilters =
        document.getElementById("facultyFilters");

    const majorsGrid =
        document.getElementById("majorsGrid");

    const resultsCount =
        document.getElementById("resultsCount");

    const noResults =
        document.getElementById("noResults");

    const pageLoading =
        document.getElementById("pageLoading");

    const pageError =
        document.getElementById("pageError");

    const pageErrorText =
        document.getElementById("pageErrorText");

    const retryButton =
        document.getElementById("retryButton");

    let allMajors = [];
    let activeFaculty = "all";

    function normalizeText(value) {
        return String(value || "")
            .toLowerCase()
            .trim()
            .replace(/[ًٌٍَُِّْـ]/g, "")
            .replace(/[إأآ]/g, "ا")
            .replace(/ة/g, "ه")
            .replace(/ى/g, "ي");
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function getMajorName(major) {
        return (
            major.name_ar ||
            major.name ||
            major.name_en ||
            "تخصص غير محدد"
        );
    }

    function getFacultyName(major) {
        return (
            major.faculty_name_ar ||
            major.facultyNameAr ||
            major.faculty_name ||
            major.faculty ||
            "كلية غير محددة"
        );
    }

    function getUniversityName(major) {
        return (
            major.university_name_ar ||
            major.universityNameAr ||
            major.university_name ||
            major.university ||
            "جامعة غير محددة"
        );
    }

    function getFacultyId(major) {
        const id = Number(
            major.faculty_id ??
            major.facultyId
        );

        return Number.isInteger(id) ? id : null;
    }

    function showLoading() {
        pageLoading.hidden = false;
        pageError.hidden = true;
        noResults.hidden = true;
        majorsGrid.innerHTML = "";
    }

    function showError(message) {
        pageLoading.hidden = true;
        pageError.hidden = false;
        noResults.hidden = true;
        majorsGrid.innerHTML = "";

        pageErrorText.textContent =
            message ||
            "حدث خطأ أثناء الاتصال بالخادم. حاول تحديث الصفحة.";

        resultsCount.textContent = "—";
    }

    function hideLoading() {
        pageLoading.hidden = true;
    }

    function createMajorCard(major) {
        const majorId = Number(major.id);

        const name = getMajorName(major);
        const facultyName = getFacultyName(major);
        const universityName = getUniversityName(major);

        const article =
            document.createElement("article");

        article.className = "major-card";

        article.dataset.facultyId =
            String(getFacultyId(major) ?? "");

        article.dataset.search =
            normalizeText([
                name,
                facultyName,
                universityName,
                major.description_ar || "",
                major.name_en || ""
            ].join(" "));

        article.innerHTML = `

            <div class="major-card-content">

                <span
                    class="major-type"
                    title="${escapeHtml(facultyName)}"
                >
                    ${escapeHtml(facultyName)}
                </span>

                <h3>
                    ${escapeHtml(name)}
                </h3>

                <div class="major-university">
                    <i class="fa-solid fa-building-columns"></i>
                    <span>
                        ${escapeHtml(universityName)}
                    </span>
                </div>

                <a
                    href="major_details.html?id=${encodeURIComponent(majorId)}"
                    class="details-link"
                >
                    عرض التفاصيل
                    <i class="fa-solid fa-arrow-left"></i>
                </a>

            </div>
        `;

        return article;
    }

    function buildFacultyFilters() {
        const currentAllButton =
            facultyFilters.querySelector('[data-filter="all"]');

        facultyFilters.innerHTML = "";

        const allButton =
            currentAllButton ||
            document.createElement("button");

        allButton.className = "filter-button active";
        allButton.type = "button";
        allButton.dataset.filter = "all";
        allButton.textContent = "جميع الكليات";

        facultyFilters.appendChild(allButton);

        const faculties = new Map();

        allMajors.forEach((major) => {
            const facultyId = getFacultyId(major);

            if (facultyId === null) {
                return;
            }

            const facultyName =
                getFacultyName(major);

            if (!faculties.has(facultyId)) {
                faculties.set(facultyId, facultyName);
            }
        });

        [...faculties.entries()]
            .sort((a, b) =>
                a[1].localeCompare(
                    b[1],
                    "ar"
                )
            )
            .forEach(([facultyId, facultyName]) => {
                const button =
                    document.createElement("button");

                button.className = "filter-button";
                button.type = "button";
                button.dataset.filter =
                    String(facultyId);

                button.textContent =
                    facultyName;

                facultyFilters.appendChild(button);
            });
    }

    function setActiveFilter(button) {
        facultyFilters
            .querySelectorAll(".filter-button")
            .forEach((item) => {
                item.classList.toggle(
                    "active",
                    item === button
                );
            });

        activeFaculty =
            button.dataset.filter || "all";

        updateResults();
    }

    function updateResults() {
        const query =
            normalizeText(searchInput.value);

        let visibleCount = 0;

        majorsGrid
            .querySelectorAll(".major-card")
            .forEach((card) => {
                const cardText =
                    normalizeText(
                        card.dataset.search ||
                        card.textContent
                    );

                const facultyId =
                    card.dataset.facultyId || "";

                const matchesSearch =
                    query === "" ||
                    cardText.includes(query);

                const matchesFaculty =
                    activeFaculty === "all" ||
                    facultyId === activeFaculty;

                const visible =
                    matchesSearch &&
                    matchesFaculty;

                card.hidden = !visible;

                if (visible) {
                    visibleCount++;
                }
            });

        resultsCount.textContent =
            `${visibleCount.toLocaleString("ar-YE")} تخصص`;

        noResults.hidden =
            visibleCount !== 0;
    }

    function renderMajors() {
        majorsGrid.innerHTML = "";

        if (!allMajors.length) {
            resultsCount.textContent = "0 تخصص";
            noResults.hidden = false;
            return;
        }

        const fragment =
            document.createDocumentFragment();

        allMajors.forEach((major) => {
            fragment.appendChild(
                createMajorCard(major)
            );
        });

        majorsGrid.appendChild(fragment);

        updateResults();
    }

    function extractRows(result) {
        if (Array.isArray(result)) {
            return result;
        }

        if (Array.isArray(result?.data)) {
            return result.data;
        }

        if (Array.isArray(result?.majors)) {
            return result.majors;
        }

        return [];
    }

    async function loadMajors() {
        showLoading();

        try {
            const response =
                await fetch(
                    `${API_URL}/majors`
                );

            let result = null;

            try {
                result = await response.json();
            } catch {
                // handled below
            }

            if (!response.ok) {
                throw new Error(
                    result?.message ||
                    `فشل طلب التخصصات (${response.status})`
                );
            }

            const majors =
                extractRows(result);

            allMajors =
                majors.filter(
                    (major) =>
                        major &&
                        major.is_active !== false
                );

            activeFaculty = "all";

            buildFacultyFilters();
            renderMajors();
            hideLoading();

        } catch (error) {
            console.error(
                "Majors API error:",
                error
            );

            showError(
                error.message ||
                "تعذر تحميل التخصصات من الخادم."
            );
        }
    }

    function getLocalFavorites() {
        try {
            const stored =
                JSON.parse(
                    localStorage.getItem(
                        "muwajeh_favorite_majors"
                    ) || "[]"
                );

            return new Set(
                Array.isArray(stored)
                    ? stored
                        .map(Number)
                        .filter(Number.isInteger)
                    : []
            );
        } catch {
            return new Set();
        }
    }

    function saveLocalFavorites(ids) {
        localStorage.setItem(
            "muwajeh_favorite_majors",
            JSON.stringify([...ids])
        );
    }

    function applyFavoriteState() {
        const favorites =
            getLocalFavorites();

        majorsGrid
            .querySelectorAll(".favorite-button")
            .forEach((button) => {
                const id =
                    Number(button.dataset.majorId);

                const icon =
                    button.querySelector("i");

                const selected =
                    favorites.has(id);

                button.classList.toggle(
                    "selected",
                    selected
                );

                icon.classList.toggle(
                    "fa-solid",
                    selected
                );

                icon.classList.toggle(
                    "fa-regular",
                    !selected
                );
            });
    }

    facultyFilters.addEventListener(
        "click",
        (event) => {
            const button =
                event.target.closest(
                    ".filter-button"
                );

            if (!button) {
                return;
            }

            setActiveFilter(button);
        }
    );

    searchInput.addEventListener(
        "input",
        updateResults
    );

    searchButton.addEventListener(
        "click",
        () => {
            updateResults();
            searchInput.focus();
        }
    );

    searchInput.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                updateResults();
            }
        }
    );

    majorsGrid.addEventListener(
        "click",
        (event) => {
            const button =
                event.target.closest(
                    ".favorite-button"
                );

            if (!button) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const id =
                Number(button.dataset.majorId);

            if (!Number.isInteger(id)) {
                return;
            }

            const favorites =
                getLocalFavorites();

            if (favorites.has(id)) {
                favorites.delete(id);
            } else {
                favorites.add(id);
            }

            saveLocalFavorites(favorites);
            applyFavoriteState();
        }
    );

    retryButton.addEventListener(
        "click",
        loadMajors
    );

    loadMajors().then(() => {
        applyFavoriteState();
    });
});
