const API_URL = "http://localhost:3000/api";

const signupTab = document.getElementById("signupTab");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const messageBox = document.getElementById("messageBox");

const verificationModal = document.getElementById("verificationModal");
const verificationDescription = document.getElementById(
  "verificationDescription",
);
const verificationMessage = document.getElementById("verificationMessage");
const verifyCodeButton = document.getElementById("verifyCodeButton");
const resendCodeButton = document.getElementById("resendCodeButton");

const resetModal = document.getElementById("resetModal");
const resetEmailStep = document.getElementById("resetEmailStep");
const resetCodeStep = document.getElementById("resetCodeStep");
const resetEmail = document.getElementById("resetEmail");
const resetMessage = document.getElementById("resetMessage");

let pendingVerificationEmail = "";
let pendingVerificationType = "signup";
let resetEmailValue = "";

function showMessage(element, message, type) {
  element.textContent = message;
  element.className =
    element.id === "messageBox"
      ? `message-box ${type}`
      : `modal-message ${type}`;
  element.hidden = false;
}

function hideMessage(element) {
  element.hidden = true;
  element.textContent = "";
}

function setLoading(button, loading, loadingText, originalText) {
  button.disabled = loading;
  button.textContent = loading ? loadingText : originalText;
}

function switchMode(mode) {
  const signup = mode === "signup";

  loginForm.hidden = signup;
  signupForm.hidden = !signup;

  document.getElementById("authCard").classList.toggle("signup-mode", signup);

  authTitle.textContent = signup ? "إنشاء حساب جديد" : "تسجيل الدخول";
  authSubtitle.textContent = signup
    ? "مرحباً بك! أنشئ حسابك وابدأ رحلتك نحو التخصص الأنسب"
    : "مرحباً بك مجدداً! أدخل بياناتك لمتابعة رحلتك";

  document.getElementById("brandingTitle").textContent = signup
    ? "لديك حساب بالفعل؟ 👋"
    : "أول مرة تنضم إلينا؟ 🚀";

  document.getElementById("brandingDescription").textContent = signup
    ? "سجّل دخولك للعودة إلى حسابك ومتابعة رحلتك نحو التخصص الأنسب."
    : "أنشئ حسابك الجديد الآن وابدأ في استكشاف مسارك الأكاديمي الأنسب معنا.";

  signupTab.textContent = signup ? "تسجيل الدخول" : "إنشاء حساب جديد";

  hideMessage(messageBox);
}

signupTab.addEventListener("click", () => {
  const isSignupMode = !signupForm.hidden;
  switchMode(isSignupMode ? "login" : "signup");
});

document.querySelectorAll(".password-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.target);
    const isPassword = input.type === "password";

    input.type = isPassword ? "text" : "password";
    button.textContent = isPassword ? "إخفاء" : "إظهار";
  });
});

function getCodeInputs(container) {
  return [...container.querySelectorAll("input")];
}

function getCode(container) {
  return getCodeInputs(container)
    .map((input) => input.value)
    .join("");
}

function setupCodeInputs(container) {
  const inputs = getCodeInputs(container);

  inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 1);

      if (input.value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    input.addEventListener("paste", (event) => {
      const pasted = event.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, inputs.length);

      if (!pasted) return;

      event.preventDefault();

      pasted.split("").forEach((digit, i) => {
        if (inputs[i]) inputs[i].value = digit;
      });

      inputs[Math.min(pasted.length, inputs.length) - 1].focus();
    });
  });
}

function clearCodeInputs(container) {
  getCodeInputs(container).forEach((input) => {
    input.value = "";
  });
}

setupCodeInputs(verificationModal);
setupCodeInputs(document.getElementById("resetCodeInputs"));

function openModal(modal) {
  modal.hidden = false;
}

function closeModal(modal) {
  modal.hidden = true;
}

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    closeModal(button.closest(".modal-overlay"));
  });
});

[verificationModal, resetModal].forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal(modal);
    }
  });
});

/* =========================================================
   SIGN UP
   ========================================================= */

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  hideMessage(messageBox);

  const name = document.getElementById("signupName").value.trim();
  const email = document
    .getElementById("signupEmail")
    .value.trim()
    .toLowerCase();
  const password = document.getElementById("signupPassword").value;
  const confirmPassword = document.getElementById(
    "signupConfirmPassword",
  ).value;
  const button = document.getElementById("signupSubmit");

  if (!name || !email || !password || !confirmPassword) {
    showMessage(messageBox, "يرجى تعبئة جميع الحقول.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage(
      messageBox,
      "يجب أن تكون كلمة المرور 6 أحرف على الأقل.",
      "error",
    );
    return;
  }

  if (password !== confirmPassword) {
    showMessage(messageBox, "كلمتا المرور غير متطابقتين.", "error");
    return;
  }

  try {
    setLoading(button, true, "جاري إنشاء الحساب...", "إنشاء الحساب");

    const response = await fetch(`${API_URL}/auth/register-request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "تعذر إنشاء الحساب.");
    }

    pendingVerificationEmail = email;
    pendingVerificationType = "signup";

    verificationDescription.textContent = `أرسلنا رمزاً مكوناً من 6 أرقام إلى ${email}.`;

    clearCodeInputs(verificationModal);
    hideMessage(verificationMessage);
    openModal(verificationModal);
  } catch (error) {
    console.error("Signup error:", error);
    showMessage(
      messageBox,
      error.message || "حدث خطأ أثناء إنشاء الحساب.",
      "error",
    );
  } finally {
    setLoading(button, false, "", "إنشاء الحساب");
  }
});

/* =========================================================
   VERIFY SIGN UP
   ========================================================= */

verifyCodeButton.addEventListener("click", async () => {
  const code = getCode(verificationModal);
  const button = verifyCodeButton;

  if (code.length !== 6) {
    showMessage(
      verificationMessage,
      "يرجى إدخال الرمز المكون من 6 أرقام.",
      "error",
    );
    return;
  }

  try {
    setLoading(button, true, "جاري التأكيد...", "تأكيد الرمز");

    const response = await fetch(`${API_URL}/auth/verify-signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: pendingVerificationEmail,
        code,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "رمز التحقق غير صحيح.");
    }

    closeModal(verificationModal);

    showMessage(
      messageBox,
      "تم إنشاء حسابك بنجاح. يمكنك الآن تسجيل الدخول.",
      "success",
    );

    switchMode("login");
    document.getElementById("loginEmail").value = pendingVerificationEmail;
  } catch (error) {
    console.error("Verification error:", error);
    showMessage(
      verificationMessage,
      error.message || "تعذر تأكيد الرمز.",
      "error",
    );
  } finally {
    setLoading(button, false, "", "تأكيد الرمز");
  }
});

/* =========================================================
   RESEND SIGNUP CODE
   ========================================================= */

resendCodeButton.addEventListener("click", async () => {
  if (!pendingVerificationEmail) return;

  try {
    resendCodeButton.disabled = true;
    resendCodeButton.textContent = "جاري الإرسال...";

    const response = await fetch(`${API_URL}/auth/resend-signup-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: pendingVerificationEmail,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "تعذر إعادة إرسال الرمز.");
    }

    showMessage(
      verificationMessage,
      "تم إرسال رمز جديد إلى بريدك الإلكتروني.",
      "success",
    );
  } catch (error) {
    console.error("Resend error:", error);
    showMessage(verificationMessage, error.message, "error");
  } finally {
    resendCodeButton.disabled = false;
    resendCodeButton.textContent = "إعادة إرسال الرمز";
  }
});

/* =========================================================
   LOGIN
   ========================================================= */

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  hideMessage(messageBox);

  const email = document
    .getElementById("loginEmail")
    .value.trim()
    .toLowerCase();
  const password = document.getElementById("loginPassword").value;
  const button = document.getElementById("loginSubmit");

  if (!email || !password) {
    showMessage(
      messageBox,
      "يرجى إدخال البريد الإلكتروني وكلمة المرور.",
      "error",
    );
    return;
  }

  try {
    setLoading(button, true, "جاري تسجيل الدخول...", "تسجيل الدخول");

    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "بيانات تسجيل الدخول غير صحيحة.");
    }

    const rememberMe = document.getElementById("rememberMe").checked;

    const storage = rememberMe ? localStorage : sessionStorage;

    storage.setItem("muwajeh_token", result.token);
    storage.setItem("muwajeh_user", JSON.stringify(result.user));

    showMessage(messageBox, "تم تسجيل الدخول بنجاح.", "success");

    // Change this later to the actual destination after login.
    setTimeout(() => {
      window.location.href = "index.html";
    }, 500);
  } catch (error) {
    console.error("Login error:", error);
    showMessage(
      messageBox,
      error.message || "حدث خطأ أثناء تسجيل الدخول.",
      "error",
    );
  } finally {
    setLoading(button, false, "", "تسجيل الدخول");
  }
});

/* =========================================================
   FORGOT PASSWORD
   ========================================================= */

document
  .getElementById("forgotPasswordButton")
  .addEventListener("click", () => {
    resetEmail.value = "";
    resetEmailStep.hidden = false;
    resetCodeStep.hidden = true;
    clearCodeInputs(document.getElementById("resetCodeInputs"));
    document.getElementById("newPassword").value = "";
    document.getElementById("newPasswordConfirm").value = "";
    hideMessage(resetMessage);
    openModal(resetModal);
    resetEmail.focus();
  });

/* SEND RESET CODE */

document
  .getElementById("sendResetCodeButton")
  .addEventListener("click", async () => {
    const email = resetEmail.value.trim().toLowerCase();
    const button = document.getElementById("sendResetCodeButton");

    if (!email) {
      showMessage(resetMessage, "يرجى إدخال البريد الإلكتروني.", "error");
      return;
    }

    try {
      setLoading(button, true, "جاري الإرسال...", "إرسال الرمز");

      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "تعذر إرسال الرمز.");
      }

      resetEmailValue = email;
      resetEmailStep.hidden = true;
      resetCodeStep.hidden = false;
      hideMessage(resetMessage);

      getCodeInputs(document.getElementById("resetCodeInputs"))[0].focus();
    } catch (error) {
      console.error("Forgot password error:", error);
      showMessage(resetMessage, error.message || "تعذر إرسال الرمز.", "error");
    } finally {
      setLoading(button, false, "", "إرسال الرمز");
    }
  });

/* UPDATE PASSWORD */

document
  .getElementById("resetPasswordButton")
  .addEventListener("click", async () => {
    const code = getCode(document.getElementById("resetCodeInputs"));
    const password = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("newPasswordConfirm").value;
    const button = document.getElementById("resetPasswordButton");

    if (code.length !== 6) {
      showMessage(
        resetMessage,
        "يرجى إدخال رمز التحقق المكون من 6 أرقام.",
        "error",
      );
      return;
    }

    if (password.length < 6) {
      showMessage(
        resetMessage,
        "يجب أن تكون كلمة المرور 6 أحرف على الأقل.",
        "error",
      );
      return;
    }

    if (password !== confirmPassword) {
      showMessage(resetMessage, "كلمتا المرور غير متطابقتين.", "error");
      return;
    }

    try {
      setLoading(button, true, "جاري التحديث...", "تحديث كلمة المرور");

      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: resetEmailValue,
          code,
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "تعذر تحديث كلمة المرور.");
      }

      closeModal(resetModal);

      showMessage(
        messageBox,
        "تم تحديث كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.",
        "success",
      );

      document.getElementById("loginEmail").value = resetEmailValue;
      document.getElementById("loginPassword").focus();
    } catch (error) {
      console.error("Reset password error:", error);
      showMessage(
        resetMessage,
        error.message || "تعذر تحديث كلمة المرور.",
        "error",
      );
    } finally {
      setLoading(button, false, "", "تحديث كلمة المرور");
    }
  });

// Keep the redesigned Figma layout in login mode on first load.
switchMode("login");
