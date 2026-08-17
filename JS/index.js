const API_URL = "http://localhost:3000/api";

async function loadMajorsCount() {
    const majorsCountElement = document.getElementById("majors-count");

    try {
        const response = await fetch(`${API_URL}/majors`);

        if (!response.ok) {
            throw new Error("Failed to fetch majors");
        }

        const result = await response.json();

        const majors = result.data;

        majorsCountElement.textContent = `+${majors.length} تخصص جامعي`;

    } catch (error) {
        console.error("Error loading majors count:", error);

        // Fallback if the API is unavailable
        majorsCountElement.textContent = "التخصصات الجامعية";
    }
}

loadMajorsCount();

document
    .getElementById("startExamButton")
    .addEventListener("click", function () {

        const token =
            localStorage.getItem("muwajeh_token");

        if (!token) {

            // Not logged in
            window.location.href = "login.html";

            return;
        }

        // Logged in
        window.location.href = "test.html";
    });