/*
 * MUWAJEH — Hadhramaut University Page
 *
 * API:
 *   GET    /api/universities
 *   GET    /api/universities/:id/faculties
 *   GET    /api/faculties/:id/majors
 *
 * Wishlist:
 *   GET    /api/wishlist
 *   POST   /api/wishlist/:majorId
 *   DELETE /api/wishlist/:majorId
 */

const API_URL = window.MUWAJEH_API_URL || "http://localhost:3000/api";

let university = null;
let faculties = [];
let allMajors = [];
let wishlist = new Map();
let isLoggedIn = false;

/* =========================================================
   DOM
   ========================================================= */

const facultiesContainer = document.getElementById("facultiesContainer");

const wishlistSection = document.getElementById("wishlistSection");

const wishlistGrid = document.getElementById("wishlistGrid");

const wishlistCount = document.getElementById("wishlistCount");

const searchInput = document.getElementById("majorSearch");

const searchButton = document.getElementById("searchButton");

const searchHint = document.getElementById("searchHint");

const searchSection = document.querySelector(".search-section");

const profileButton = document.getElementById("profileButton");

const accountOverlay = document.getElementById("accountOverlay");

const accountClose = document.getElementById("accountClose");

const logoutButton = document.getElementById("logoutButton");

/* =========================================================
   AUTHENTICATION
   ========================================================= */

/*
 * Get the JWT used by the Muwajeh login system.
 *
 * We check both storages because some pages may keep
 * the token in localStorage while others may use
 * sessionStorage.
 */
function getAuthToken() {
  return (
    localStorage.getItem("muwajeh_token") ||
    sessionStorage.getItem("muwajeh_token")
  );
}

function setLoggedInState() {
  isLoggedIn = Boolean(getAuthToken());
}

function authHeaders(extra = {}) {
  const token = getAuthToken();

  if (!token) {
    return extra;
  }

  return {
    ...extra,
    Authorization: `Bearer ${token}`,
  };
}

/* =========================================================
   TOAST NOTIFICATIONS
   ========================================================= */

function showToast(message, type = "success") {
  let toast = document.getElementById("wishlistToast");

  if (!toast) {
    toast = document.createElement("div");

    toast.id = "wishlistToast";

    toast.className = "wishlist-toast";

    document.body.appendChild(toast);
  }

  const icon = type === "success" ? "fa-circle-check" : "fa-circle-exclamation";

  toast.className = `wishlist-toast ${type}`;

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
  }, 2500);
}

/* =========================================================
   LOGIN REQUIRED
   ========================================================= */

function requireLoginForWishlist() {
  const token = getAuthToken();

  if (token) {
    return true;
  }

  showToast("يرجى تسجيل الدخول لإضافة التخصص إلى المفضلة", "error");

  setTimeout(() => {
    window.location.href = "login.html";
  }, 1200);

  return false;
}

/* =========================================================
   API GET
   ========================================================= */

async function apiGet(url, options = {}) {
  const response = await fetch(url, {
    ...options,

    headers: authHeaders(options.headers || {}),
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Empty response.
  }

  if (!response.ok) {
    const error = new Error(
      data?.message || `Request failed: ${response.status}`,
    );

    error.status = response.status;

    throw error;
  }

  return data;
}

/* =========================================================
   LOAD UNIVERSITY
   ========================================================= */

async function loadUniversity() {
  const result = await apiGet(`${API_URL}/universities`);

  const universities = Array.isArray(result)
    ? result
    : Array.isArray(result.data)
      ? result.data
      : Array.isArray(result.universities)
        ? result.universities
        : [];

  if (!universities.length) {
    throw new Error("لم يتم العثور على جامعات فعالة.");
  }

  university =
    universities.find((item) => {
      const ar = String(item.name_ar || "").trim();

      const en = String(item.name_en || "")
        .trim()
        .toLowerCase();

      return (
        ar.includes("حضرموت") ||
        ar.includes("حضر") ||
        en.includes("hadhramaut") ||
        en.includes("hadramout")
      );
    }) || universities[0];

  if (!university.id) {
    throw new Error("University response does not contain an id.");
  }
}

/* =========================================================
   LOAD FACULTIES + MAJORS
   ========================================================= */

async function loadFacultiesAndMajors() {
  const facultyResult = await apiGet(
    `${API_URL}/universities/${university.id}/faculties`,
  );

  faculties = Array.isArray(facultyResult)
    ? facultyResult
    : Array.isArray(facultyResult.data)
      ? facultyResult.data
      : Array.isArray(facultyResult.faculties)
        ? facultyResult.faculties
        : [];

  if (!faculties.length) {
    throw new Error("لم يتم العثور على كليات لهذه الجامعة.");
  }

  /*
   * Load every faculty's majors.
   */
  const facultyResults = await Promise.all(
    faculties.map(async (faculty) => {
      const result = await apiGet(`${API_URL}/faculties/${faculty.id}/majors`);

      const majors = Array.isArray(result)
        ? result
        : Array.isArray(result.data)
          ? result.data
          : Array.isArray(result.majors)
            ? result.majors
            : [];

      return {
        faculty,
        majors,
      };
    }),
  );

  allMajors = [];

  facultyResults.forEach(({ faculty, majors }) => {
    majors.forEach((major) => {
      allMajors.push({
        ...major,

        faculty_id: major.faculty_id ?? faculty.id,

        faculty_name_ar:
          major.faculty_name_ar ||
          major.facultyNameAr ||
          faculty.name_ar ||
          faculty.name ||
          "",

        faculty_name_en:
          major.faculty_name_en || major.facultyNameEn || faculty.name_en || "",
      });
    });
  });
}

/* =========================================================
   LOAD WISHLIST FROM DATABASE
   ========================================================= */

async function loadWishlist() {
  wishlist = new Map();

  const token = getAuthToken();

  if (!token) {
    renderWishlist();
    updateAllFavoriteButtons();
    return;
  }

  try {
    const result = await apiGet(`${API_URL}/wishlist`);

    const items = Array.isArray(result)
      ? result
      : Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.majors)
          ? result.majors
          : [];

    items.forEach((item) => {
      const majorId = Number(item.major_id ?? item.majorId);

      if (!Number.isInteger(majorId)) {
        return;
      }

      const majorFromDatabase = allMajors.find(
        (major) => Number(major.id) === majorId,
      );

      const wishlistMajor = {
        ...(majorFromDatabase || {}),
        ...item,

        id: majorId,

        faculty_id: item.faculty_id ?? majorFromDatabase?.faculty_id,

        faculty_name_ar:
          item.faculty_name_ar ?? majorFromDatabase?.faculty_name_ar,

        university_id: item.university_id ?? majorFromDatabase?.university_id,

        university_name_ar:
          item.university_name_ar ?? majorFromDatabase?.university_name_ar,
      };

      wishlist.set(majorId, wishlistMajor);
    });

    renderWishlist();
    updateAllFavoriteButtons();
  } catch (error) {
    console.error("Error loading wishlist:", error);

    if (error.status === 401 || error.status === 403) {
      localStorage.removeItem("muwajeh_token");

      sessionStorage.removeItem("muwajeh_token");

      isLoggedIn = false;

      renderWishlist();
      updateAllFavoriteButtons();

      return;
    }

    showToast("تعذر تحميل المفضلة", "error");

    renderWishlist();
    updateAllFavoriteButtons();
  }
}

/* =========================================================
   TOGGLE WISHLIST
   ========================================================= */

async function toggleWishlist(majorId, button) {
  /*
   * Must be logged in.
   */
  if (!requireLoginForWishlist()) {
    return;
  }

  const numericId = Number(majorId);

  if (!Number.isInteger(numericId)) {
    return;
  }

  const currentlySaved = wishlist.has(numericId);

  button.classList.add("is-loading");

  try {
    const response = await fetch(`${API_URL}/wishlist/${numericId}`, {
      method: currentlySaved ? "DELETE" : "POST",

      headers: authHeaders({
        "Content-Type": "application/json",
      }),
    });

    let data = null;

    try {
      data = await response.json();
    } catch {
      // Empty response.
    }

    /*
     * Authentication failed.
     */
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("muwajeh_token");

      sessionStorage.removeItem("muwajeh_token");

      isLoggedIn = false;

      showToast("انتهت جلسة تسجيل الدخول", "error");

      setTimeout(() => {
        window.location.href = "login.html";
      }, 1200);

      return;
    }

    /*
     * Wishlist endpoint missing.
     */
    if (response.status === 404 || response.status === 405) {
      showToast("خدمة المفضلة غير متاحة حاليًا", "error");

      return;
    }

    /*
     * Any other server error.
     */
    if (!response.ok) {
      throw new Error(data?.message || "تعذر تحديث المفضلة");
    }

    /*
     * Database request succeeded.
     */
    if (currentlySaved) {
      wishlist.delete(numericId);

      showToast("تمت إزالة التخصص من المفضلة", "success");
    } else {
      const major = allMajors.find((item) => Number(item.id) === numericId);

      if (major) {
        wishlist.set(numericId, major);
      }

      showToast("تمت إضافة التخصص إلى المفضلة", "success");
    }

    /*
     * Update every star for this major.
     * This includes both the wishlist card
     * and the original faculty card.
     */
    updateAllFavoriteButtons(numericId);

    renderWishlist();

    runSearch();
  } catch (error) {
    console.error("Wishlist error:", error);

    showToast(error.message || "تعذر تحديث المفضلة", "error");
  } finally {
    button.classList.remove("is-loading");
  }
}

/* =========================================================
   CARD HELPERS
   ========================================================= */

function getMajorName(major) {
  return major.name_ar || major.name || major.name_en || "تخصص غير معروف";
}

function getFacultyName(major) {
  return (
    major.faculty_name_ar ||
    major.facultyNameAr ||
    major.faculty_name ||
    major.facultyName ||
    "الكلية غير محددة"
  );
}

function createFavoriteButton(majorId) {
  const button = document.createElement("button");

  button.type = "button";

  button.className = "favorite-button";

  button.dataset.majorId = String(majorId);

  button.setAttribute("aria-label", "إضافة إلى المفضلة");

  button.innerHTML = `<i class="fa-regular fa-star"></i>`;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    toggleWishlist(majorId, button);
  });

  return button;
}

function createMajorCard(major, options = {}) {
  const { featured = false } = options;

  const article = document.createElement("article");

  article.className = featured ? "major-card featured-card" : "major-card";

  article.dataset.majorId = String(major.id);

  article.dataset.search = getMajorName(major).toLowerCase();

  const top = document.createElement("div");

  top.className = "major-card-top";

  top.appendChild(createFavoriteButton(major.id));

  const content = document.createElement("div");

  content.className = "major-card-content";

  if (featured) {
    const type = document.createElement("span");

    type.className = "major-type";

    type.textContent = getFacultyName(major);

    content.appendChild(type);
  }
  const title = document.createElement("h3");

  title.textContent = getMajorName(major);

  content.appendChild(title);

  /*
   * Faculty name.
   */
  const facultyName = document.createElement("span");

  facultyName.className = "major-faculty-name";

  facultyName.textContent = getFacultyName(major);

  content.appendChild(facultyName);

  const details = document.createElement("a");

  details.className = "details-link";

  details.href =
    `major_details.html?id=${encodeURIComponent(major.id)}`;

  details.innerHTML = `عرض التفاصيل <i class="fa-solid fa-arrow-left"></i>`;

  content.appendChild(details);

  article.appendChild(top);

  article.appendChild(content);

  return article;
}

/* =========================================================
   RENDER WISHLIST
   ========================================================= */

function renderWishlist() {
  if (!wishlistGrid) {
    return;
  }

  wishlistGrid.innerHTML = "";

  if (wishlistCount) {
    wishlistCount.textContent = String(wishlist.size);
  }

  if (wishlist.size === 0) {
    wishlistGrid.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-star"></i>

                <strong>
                    لم تضف أي تخصص إلى المفضلة بعد
                </strong>

                <span>
                    اضغط على النجمة في أي تخصص ليظهر هنا.
                </span>
            </div>
        `;

    return;
  }

  const fragment = document.createDocumentFragment();

  wishlist.forEach((major) => {
    fragment.appendChild(
      createMajorCard(major, {
        featured: true,
      }),
    );
  });

  wishlistGrid.appendChild(fragment);

  updateAllFavoriteButtons();
}

/* =========================================================
   RENDER FACULTIES
   ========================================================= */

function renderFaculties() {
  if (!facultiesContainer) {
    return;
  }

  facultiesContainer.innerHTML = "";

  const majorsByFaculty = new Map();

  allMajors.forEach((major) => {
    const facultyId = Number(major.faculty_id);

    if (!majorsByFaculty.has(facultyId)) {
      majorsByFaculty.set(facultyId, []);
    }

    majorsByFaculty.get(facultyId).push(major);
  });

  const fragment = document.createDocumentFragment();

  faculties.forEach((faculty) => {
    const facultyId = Number(faculty.id);

    const majors = majorsByFaculty.get(facultyId) || [];

    const section = document.createElement("section");

    section.className = "faculty-section";

    section.dataset.facultyId = String(facultyId);

    const header = document.createElement("div");

    header.className = "faculty-header";

    const title = document.createElement("h2");

    title.textContent =
      faculty.name_ar || faculty.name || faculty.name_en || "كلية";

    const count = document.createElement("span");

    count.textContent = `${majors.length} تخصصات متاحة`;

    header.appendChild(title);

    header.appendChild(count);

    const grid = document.createElement("div");

    grid.className = "faculty-majors";

    if (!majors.length) {
      const empty = document.createElement("div");

      empty.className = "empty-state";

      empty.textContent = "لا توجد تخصصات متاحة حاليًا.";

      grid.appendChild(empty);
    } else {
      majors.forEach((major) => {
        grid.appendChild(createMajorCard(major));
      });
    }

    section.appendChild(header);

    section.appendChild(grid);

    fragment.appendChild(section);
  });

  facultiesContainer.appendChild(fragment);

  updateAllFavoriteButtons();
}

/* =========================================================
   FAVORITE VISUAL STATE
   ========================================================= */

function updateFavoriteButton(button, majorId) {
  const saved = wishlist.has(Number(majorId));

  button.classList.toggle("is-favorite", saved);

  button.setAttribute(
    "aria-label",
    saved ? "إزالة من المفضلة" : "إضافة إلى المفضلة",
  );

  const icon = button.querySelector("i");

  if (!icon) {
    return;
  }

  icon.classList.toggle("fa-solid", saved);

  icon.classList.toggle("fa-regular", !saved);
}

function updateAllFavoriteButtons(specificMajorId = null) {
  document
    .querySelectorAll(".favorite-button[data-major-id]")
    .forEach((button) => {
      const majorId = Number(button.dataset.majorId);

      if (specificMajorId !== null && majorId !== Number(specificMajorId)) {
        return;
      }

      updateFavoriteButton(button, majorId);
    });
}

/* =========================================================
   SEARCH
   ========================================================= */

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getMajorCountText(count) {
  if (count === 0) {
    return "لا توجد تخصصات";
  }

  if (count === 1) {
    return "تخصص واحد متاح";
  }

  if (count === 2) {
    return "تخصصان متاحان";
  }

  if (count >= 3 && count <= 10) {
    return `${count} تخصصات متاحة`;
  }

  return `${count} تخصصًا متاحًا`;
}

function runSearch() {
  if (!searchInput) {
    return;
  }

  const query = normalizeSearch(searchInput.value);

  let totalVisibleMajors = 0;

  document.querySelectorAll(".faculty-section").forEach((section) => {
    const cards = section.querySelectorAll(
      ".faculty-majors .major-card[data-major-id]"
    );

    let visibleCount = 0;

    cards.forEach((card) => {
      const majorName = normalizeSearch(card.dataset.search);

      const matches =
        !query ||
        majorName.includes(query);

      card.classList.toggle(
        "is-hidden",
        !matches
      );

      if (matches) {
        visibleCount++;
        totalVisibleMajors++;
      }
    });

    const countElement =
      section.querySelector(
        ".faculty-header span"
      );

    if (countElement) {
      countElement.textContent =
        getMajorCountText(visibleCount);
    }

    section.classList.toggle(
      "is-hidden",
      visibleCount === 0
    );
  });

  if (searchHint) {
    searchHint.textContent = query
      ? `تم العثور على ${totalVisibleMajors} تخصص.`
      : "💡 يمكنك الكتابة للوصول المباشر...";
  }

  if (searchSection) {
    searchSection.classList.toggle(
      "is-searching",
      Boolean(query)
    );
  }
}

/* =========================================================
   SEARCH EVENTS
   ========================================================= */

if (searchButton) {
  searchButton.addEventListener("click", () => {
    runSearch();

    if (searchInput) {
      searchInput.focus();
    }
  });
}

if (searchInput) {
  searchInput.addEventListener("input", runSearch);

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }

    if (event.key === "Escape") {
      searchInput.value = "";

      runSearch();
    }
  });
}

/* =========================================================
   ACCOUNT POPUP
   ========================================================= */

function closeAccountPopup() {
  if (accountOverlay) {
    accountOverlay.hidden = true;
  }
}

if (profileButton) {
  profileButton.addEventListener("click", () => {
    if (accountOverlay) {
      accountOverlay.hidden = false;
    }
  });
}

if (accountClose) {
  accountClose.addEventListener("click", closeAccountPopup);
}

if (accountOverlay) {
  accountOverlay.addEventListener("click", (event) => {
    if (event.target === accountOverlay) {
      closeAccountPopup();
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("muwajeh_token");

    sessionStorage.removeItem("muwajeh_token");

    window.location.href = "index.html";
  });
}

/* =========================================================
   INITIALIZE
   ========================================================= */

async function initializeUniversityPage() {
  try {
    setLoggedInState();

    await loadUniversity();

    await loadFacultiesAndMajors();

    await loadWishlist();

    renderFaculties();

    runSearch();
  } catch (error) {
    console.error("Failed to load Hadhramaut University page:", error);

    if (facultiesContainer) {
      facultiesContainer.innerHTML = `
                <div class="error-state">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <span>
                        تعذر تحميل بيانات الجامعة والتخصصات.
                        يرجى المحاولة مرة أخرى.
                    </span>
                </div>
            `;
    }

    if (wishlistGrid) {
      wishlistGrid.innerHTML = `
                <div class="error-state">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <span>
                        تعذر تحميل المفضلة.
                    </span>
                </div>
            `;
    }
  }
}

initializeUniversityPage();
