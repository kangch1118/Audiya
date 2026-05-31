// ── Supabase 클라이언트 (소셜 로그인용) ──────────────
const SUPABASE_URL = "https://aihosblngsyezeqcmspg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Yygl54Kw3jLnReThtJdfCA_NZDmxSXD";
const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 뷰 전환 ──────────────────────────────────────────
const views = ["viewLogin", "viewSignup", "viewReset1", "viewReset2"];

function showView(id) {
  views.forEach((v) => document.getElementById(v)?.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  clearAlerts();
}

// ── 알림 ─────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById("alertError");
  el.textContent = msg;
  el.classList.add("show");
  document.getElementById("alertSuccess").classList.remove("show");
}

function showSuccess(msg) {
  const el = document.getElementById("alertSuccess");
  el.textContent = msg;
  el.classList.add("show");
  document.getElementById("alertError").classList.remove("show");
}

function clearAlerts() {
  document.getElementById("alertError").classList.remove("show");
  document.getElementById("alertSuccess").classList.remove("show");
}

// ── 유효성 검사 ───────────────────────────────────────
function validateUsername(u) {
  if (!u) return "아이디를 입력해주세요";
  if (!/^[a-zA-Z0-9]{4,20}$/.test(u)) return "아이디는 영문자+숫자 4~20자여야 합니다";
  return null;
}

function validatePassword(p) {
  if (!p) return "비밀번호를 입력해주세요";
  if (p.length < 8) return "비밀번호는 8자 이상이어야 합니다";
  if (!/[a-zA-Z]/.test(p)) return "영문자를 포함해야 합니다";
  if (!/[0-9]/.test(p)) return "숫자를 포함해야 합니다";
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return "특수문자(!@#$ 등)를 포함해야 합니다";
  return null;
}

// ── API 헬퍼 ─────────────────────────────────────────
async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.textContent = loading ? "처리 중..." : label;
}

// ── 로그인 ────────────────────────────────────────────
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  if (!username || !password) return showError("아이디와 비밀번호를 입력해주세요");

  const btn = document.getElementById("loginBtn");
  setLoading(btn, true, "로그인");
  try {
    const { ok, data } = await post("/api/auth/login", { username, password });
    if (!ok) {
      showError(data.message || "로그인 실패");
      if (data.code === "WRONG_PASSWORD") {
        document.getElementById("resetUsername").value = username;
      }
      return;
    }
    localStorage.setItem("authToken", data.token);
    localStorage.setItem("authUsername", data.username);
    localStorage.setItem("authName", data.name || data.username);
    showSuccess("로그인 성공! 이동합니다...");
    setTimeout(() => { window.location.href = "/"; }, 1000);
  } catch (err) {
    showError("오류: " + err.message);
  } finally {
    setLoading(btn, false, "로그인");
  }
});

// ── 회원가입 ──────────────────────────────────────────
document.getElementById("signupForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("signupUsername").value.trim();
  const password = document.getElementById("signupPassword").value.trim();
  const confirm  = document.getElementById("signupPasswordConfirm").value.trim();
  const name     = document.getElementById("signupName").value.trim();
  const phone    = document.getElementById("signupPhone").value.trim().replace(/\D/g, "");

  const uErr = validateUsername(username);
  if (uErr) return showError(uErr);
  const pErr = validatePassword(password);
  if (pErr) return showError(pErr);
  if (password !== confirm) return showError("비밀번호가 일치하지 않습니다");
  if (!name) return showError("이름(닉네임)을 입력해주세요");
  if (phone.length < 10) return showError("올바른 전화번호를 입력해주세요");

  const btn = document.getElementById("signupBtn");
  setLoading(btn, true, "가입하기");
  try {
    const { ok, data } = await post("/api/auth/signup", { username, password, name, phone });
    if (!ok) return showError(data.message || "회원가입 실패");
    showSuccess("가입 완료! 로그인해주세요");
    document.getElementById("signupForm").reset();
    setTimeout(() => {
      showView("viewLogin");
      document.getElementById("loginUsername").value = username;
    }, 1500);
  } catch (err) {
    showError("오류: " + err.message);
  } finally {
    setLoading(btn, false, "가입하기");
  }
});

// ── 비밀번호 찾기 1단계 ───────────────────────────────
document.getElementById("resetVerifyForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("resetUsername").value.trim();
  const phone    = document.getElementById("resetPhone").value.trim().replace(/\D/g, "");
  if (!username || !phone) return showError("아이디와 전화번호를 입력해주세요");

  const btn = document.getElementById("resetVerifyBtn");
  setLoading(btn, true, "본인 확인");
  try {
    const { ok, data } = await post("/api/auth/verify-phone", { username, phone });
    if (!ok) return showError(data.message || "본인 확인 실패");
    document.getElementById("resetToken").value = data.resetToken;
    showView("viewReset2");
  } catch (err) {
    showError("오류: " + err.message);
  } finally {
    setLoading(btn, false, "본인 확인");
  }
});

// ── 비밀번호 찾기 2단계 ───────────────────────────────
document.getElementById("resetPasswordForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const resetToken = document.getElementById("resetToken").value;
  const newPassword = document.getElementById("newPassword").value.trim();
  const confirm     = document.getElementById("newPasswordConfirm").value.trim();

  const pErr = validatePassword(newPassword);
  if (pErr) return showError(pErr);
  if (newPassword !== confirm) return showError("비밀번호가 일치하지 않습니다");

  const btn = document.getElementById("resetPasswordBtn");
  setLoading(btn, true, "비밀번호 변경");
  try {
    const { ok, data } = await post("/api/auth/reset-password", { resetToken, newPassword });
    if (!ok) return showError(data.message || "변경 실패");
    showSuccess("비밀번호가 변경되었습니다! 다시 로그인해주세요");
    setTimeout(() => showView("viewLogin"), 2000);
  } catch (err) {
    showError("오류: " + err.message);
  } finally {
    setLoading(btn, false, "비밀번호 변경");
  }
});

// ── 버튼 이벤트 ───────────────────────────────────────
document.getElementById("goSignupBtn")?.addEventListener("click", () => showView("viewSignup"));
document.getElementById("goLoginBtn")?.addEventListener("click", () => showView("viewLogin"));
document.getElementById("showResetBtn")?.addEventListener("click", () => showView("viewReset1"));
document.getElementById("backToLoginBtn")?.addEventListener("click", () => showView("viewLogin"));

// ── 소셜 로그인 ───────────────────────────────────────
async function signInWithProvider(provider) {
  if (!sb) { alert("Supabase 초기화 실패. 페이지를 새로고침해주세요."); return; }
  const { error } = await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + "/callback.html" },
  });
  if (error) alert("소셜 로그인 실패: " + error.message);
}

document.getElementById("googleBtn")?.addEventListener("click", () => signInWithProvider("google"));
document.getElementById("githubBtn")?.addEventListener("click", () => signInWithProvider("github"));
document.getElementById("naverBtn")?.addEventListener("click", () => {
  window.location.href = "/api/auth/naver";
});

// ── 이미 로그인 상태면 메인으로 ───────────────────────
if (localStorage.getItem("authToken")) window.location.href = "/";
