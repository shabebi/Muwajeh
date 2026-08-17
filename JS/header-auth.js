document.addEventListener("DOMContentLoaded", function () {
  const loginButton = document.getElementById("loginButton");
  const profileButton = document.getElementById("profileButton");

  const accountOverlay = document.getElementById("accountOverlay");
  const accountClose = document.getElementById("accountClose");
  const logoutButton = document.getElementById("logoutButton");

  const accountName = document.getElementById("accountName");
  const accountEmail = document.getElementById("accountEmail");

  if (!loginButton || !profileButton) {
    return;
  }

  function updateHeader() {
    const token =
      localStorage.getItem("muwajeh_token") ||
      sessionStorage.getItem("muwajeh_token");

    const savedUser =
      localStorage.getItem("muwajeh_user") ||
      sessionStorage.getItem("muwajeh_user");

    if (token) {
      loginButton.hidden = true;
      profileButton.hidden = false;

      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);

          accountName.textContent = user.name || "---";

          accountEmail.textContent = user.email || "---";
        } catch (error) {
          console.error("Could not read saved user:", error);
        }
      }
    } else {
      loginButton.hidden = false;
      profileButton.hidden = true;
    }
  }

  /* =========================
       OPEN PROFILE POPUP
       ========================= */

  profileButton.addEventListener("click", function () {
    const token =
      localStorage.getItem("muwajeh_token") ||
      sessionStorage.getItem("muwajeh_token");

    if (!token) {
      return;
    }

    accountOverlay.hidden = false;
  });

  /* =========================
       CLOSE POPUP
       ========================= */

  accountClose.addEventListener("click", function () {
    accountOverlay.hidden = true;
  });

  accountOverlay.addEventListener("click", function (event) {
    if (event.target === accountOverlay) {
      accountOverlay.hidden = true;
    }
  });

  /* =========================
       LOGOUT
       ========================= */

  logoutButton.addEventListener("click", function () {
    localStorage.removeItem("muwajeh_token");
    localStorage.removeItem("muwajeh_user");

    sessionStorage.removeItem("muwajeh_token");
    sessionStorage.removeItem("muwajeh_user");

    accountOverlay.hidden = true;

    updateHeader();
  });

  /* =========================
       INITIAL STATE
       ========================= */

  updateHeader();
});
