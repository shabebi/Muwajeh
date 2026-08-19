const API_URL = "http://localhost:3000/api";

const loading = document.getElementById("pageLoading");
const errorBox = document.getElementById("pageError");
const errorText = document.getElementById("pageErrorText");
const content = document.getElementById("majorContent");

const majorName = document.getElementById("majorName");
const overviewName = document.getElementById("overviewName");
const description = document.getElementById("description");
const duration = document.getElementById("duration");

const facultyBreadcrumb = document.getElementById("facultyBreadcrumb");
const universityBreadcrumb = document.getElementById("universityBreadcrumb");

const yearTabs = document.getElementById("yearTabs");
const coursesContainer = document.getElementById("coursesContainer");
const admissionContainer = document.getElementById("admissionContainer");

let major = null;
let selectedYear = null;

function getToken() {
  return (
    localStorage.getItem("muwajeh_token") ||
    sessionStorage.getItem("muwajeh_token")
  );
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet(url) {
  const response = await fetch(url, {
    headers: authHeaders(),
  });

  let data = null;

  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    const error = new Error(
      data?.message || `Request failed: ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

function getMajorId() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get("id"));
}

function showError(message) {
  loading.hidden = true;
  content.hidden = true;
  errorText.textContent = message;
  errorBox.hidden = false;
}

function showContent() {
  loading.hidden = true;
  errorBox.hidden = true;
  content.hidden = false;
}

function setText(element, value, fallback = "غير متوفر حاليًا") {
  element.textContent = value || fallback;
}

function renderMajor(data) {
  major = data;

  const name = major.name_ar || "التخصص";

  document.title = `${name} | موّجه`;

  setText(majorName, name);
  setText(overviewName, name);
  setText(facultyBreadcrumb, major.faculty_name_ar);
  setText(universityBreadcrumb, major.university_name_ar);
  setText(description, major.description_ar);

  if (major.duration_years) {
    duration.textContent = major.duration_years;
  } else {
    duration.textContent = "—";
  }

  if (major.university_id) {
    universityBreadcrumb.href = `hadhramaut_university.html?id=${encodeURIComponent(major.university_id)}`;
  }

  renderCourses(Array.isArray(major.courses) ? major.courses : []);

  renderAdmissions(
    Array.isArray(major.admission_options) ? major.admission_options : [],
  );
}

function groupCoursesByYear(courses) {
  const years = new Map();

  courses.forEach((course) => {
    const year = Number(course.year_number) || 1;
    const semester = Number(course.semester) || 1;

    if (!years.has(year)) {
      years.set(year, new Map());
    }

    if (!years.get(year).has(semester)) {
      years.get(year).set(semester, []);
    }

    years.get(year).get(semester).push(course);
  });

  return years;
}

function renderCourses(courses) {
  yearTabs.innerHTML = "";
  coursesContainer.innerHTML = "";

  if (!courses.length) {
    coursesContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-book-open"></i>
                <span>لا توجد خطة دراسية مضافة لهذا التخصص حاليًا.</span>
            </div>
        `;
    return;
  }

  const years = groupCoursesByYear(courses);
  const sortedYears = [...years.keys()].sort((a, b) => a - b);

  selectedYear = sortedYears[0];

  sortedYears.forEach((year) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "year-tab";
    button.dataset.year = String(year);
    button.textContent = `المستوى ${year}`;

    button.addEventListener("click", () => {
      selectedYear = year;
      updateYearTabs();
      renderSelectedYear(years);
    });

    yearTabs.appendChild(button);
  });

  updateYearTabs();
  renderSelectedYear(years);
}

function updateYearTabs() {
  document.querySelectorAll(".year-tab").forEach((button) => {
    button.classList.toggle(
      "active",
      Number(button.dataset.year) === selectedYear,
    );
  });
}

function renderSelectedYear(years) {
  coursesContainer.innerHTML = "";

  const semesters = years.get(selectedYear);

  if (!semesters) {
    return;
  }

  const semesterGrid = document.createElement("div");
  semesterGrid.className = "semester-grid";

  [1, 2].forEach((semesterNumber) => {
    const section = document.createElement("section");
    section.className = "semester";

    const title = document.createElement("h3");
    title.className = "semester-title";
    title.textContent = `الفصل الدراسي ${semesterNumber}`;

    const list = document.createElement("div");
    list.className = "course-list";

    const items = semesters.get(semesterNumber) || [];

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "semester-empty";
      empty.textContent = "لا توجد مواد مضافة";
      list.appendChild(empty);
    } else {
      items.forEach((course) => {
        const row = document.createElement("div");
        row.className = "course-row";

        const name = document.createElement("span");
        name.className = "course-name";
        name.textContent = course.name_ar || "مقرر";

        row.appendChild(name);
        list.appendChild(row);
      });
    }

    section.appendChild(title);
    section.appendChild(list);
    semesterGrid.appendChild(section);
  });

  coursesContainer.appendChild(semesterGrid);
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === "") {
        return "لا يوجد";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "لا يوجد";
    }

    if (number === 0) {
        return "مجاني";
    }

    return `${number.toLocaleString("ar-YE")} ريال`;
}

function renderAdmissions(options) {
    admissionContainer.innerHTML = "";

    if (!options.length) {
        admissionContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-file-signature"></i>
                <span>لا توجد بيانات رسوم مضافة لهذا التخصص حاليًا.</span>
            </div>
        `;
        return;
    }

    options.forEach(option => {
        const card = document.createElement("article");
        card.className = "admission-card";

        /* Card header */
        const header = document.createElement("div");
        header.className = "admission-card-header";

        const title = document.createElement("h3");
        title.textContent = option.name_ar || "نظام القبول";

        /* Small badge */
        const badge = document.createElement("span");
        badge.className = "admission-type";

        const admissionName = option.name_ar || "";

        if (
            admissionName.includes("عام") ||
            admissionName.includes("العام")
        ) {
            badge.textContent = "عام";
            badge.classList.add("general");
        } else if (
            admissionName.includes("موازي")
        ) {
            badge.textContent = "موازي";
            badge.classList.add("parallel");
        } else if (
            admissionName.includes("نفقة") ||
            admissionName.includes("خاصة")
        ) {
            badge.textContent = "نفقة خاصة";
            badge.classList.add("private");
        } else {
            badge.textContent = "قبول";
        }

        header.appendChild(title);
        header.appendChild(badge);

        /* Fee */
        const feeBox = document.createElement("div");
        feeBox.className = "fee-box";

        const feeLabel = document.createElement("span");
        feeLabel.className = "fee-label";
        feeLabel.textContent = "الرسوم الدراسية";

        const fee = document.createElement("strong");
        fee.className = "fee-value";
        fee.textContent = formatCurrency(option.tuition_fee);

        feeBox.appendChild(feeLabel);
        feeBox.appendChild(fee);

        card.appendChild(header);
        card.appendChild(feeBox);

        admissionContainer.appendChild(card);
    });
}

function setupTabs() {
  const tabs = document.querySelectorAll(".detail-tab");

  const panels = {
    overview: document.getElementById("overviewPanel"),
    courses: document.getElementById("coursesPanel"),
    admission: document.getElementById("admissionPanel"),
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;

      tabs.forEach((item) => {
        item.classList.toggle("active", item === tab);
      });

      Object.entries(panels).forEach(([key, panel]) => {
        panel.classList.toggle("active", key === target);
      });
    });
  });
}

async function initialize() {
  const id = getMajorId();

  if (!Number.isInteger(id) || id <= 0) {
    showError("رابط التخصص غير صحيح.");
    return;
  }

  try {
    const result = await apiGet(`${API_URL}/major-details/${id}`);

    if (!result?.success || !result.data) {
      throw new Error(result?.message || "لم يتم العثور على التخصص.");
    }

    renderMajor(result.data);
    showContent();
  } catch (error) {
    console.error("Major details error:", error);

    showError(
      error.status === 404
        ? "لم يتم العثور على هذا التخصص."
        : "تعذر تحميل معلومات التخصص.",
    );
  }
}

setupTabs();
initialize();
