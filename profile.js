const token = localStorage.getItem("authToken");
if (!token) { window.location.href = "/login.html"; }

// ── 로그아웃 ─────────────────────────────────────────
document.getElementById("logoutBtn").addEventListener("click", () => {
  ["authToken", "authUsername", "authName"].forEach((k) => localStorage.removeItem(k));
  window.location.href = "/";
});

// ── 탭 전환 ──────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.panel).classList.add("active");
  });
});

// ── 헬퍼 ─────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  return { ok: res.ok, data: await res.json() };
}

function showMsg(errorId, successId, ok, msg) {
  const err = document.getElementById(errorId);
  const suc = document.getElementById(successId);
  err.classList.remove("show"); suc.classList.remove("show");
  if (ok) { suc.textContent = msg; suc.classList.add("show"); }
  else { err.textContent = msg; err.classList.add("show"); }
}

function setBtn(id, loading, label) {
  const btn = document.getElementById(id);
  btn.disabled = loading;
  btn.textContent = loading ? "처리 중..." : label;
}

function validatePassword(p) {
  if (!p || p.length < 8) return "8자 이상이어야 합니다";
  if (!/[a-zA-Z]/.test(p)) return "영문자를 포함해야 합니다";
  if (!/[0-9]/.test(p)) return "숫자를 포함해야 합니다";
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return "특수문자를 포함해야 합니다";
  return null;
}

// ── 프로필 로드 ──────────────────────────────────────
async function loadProfile() {
  const { ok, data } = await api("GET", "/api/user/profile");
  if (!ok) { window.location.href = "/login.html"; return; }

  const { username, name, phone } = data.user;
  const initial = (name || username || "U").charAt(0).toUpperCase();

  document.getElementById("heroAvatar").textContent = initial;
  document.getElementById("heroName").textContent = name || username;
  document.getElementById("heroId").textContent = "@" + username;
  document.getElementById("infoUsername").textContent = username;
  document.getElementById("infoPhone").textContent = phone || "—";
  document.getElementById("editName").value = name || "";
}

// ── 이름 변경 ────────────────────────────────────────
document.getElementById("nameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("editName").value.trim();
  if (!name) return showMsg("nameError", "nameSuccess", false, "이름을 입력해주세요");

  setBtn("nameSaveBtn", true, "저장");
  const { ok, data } = await api("PUT", "/api/user/profile", { name });
  showMsg("nameError", "nameSuccess", ok, ok ? "이름이 변경되었습니다" : data.message);
  if (ok) {
    localStorage.setItem("authName", name);
    document.getElementById("heroName").textContent = name;
    document.getElementById("heroAvatar").textContent = name.charAt(0).toUpperCase();
  }
  setBtn("nameSaveBtn", false, "저장");
});

// ── 비밀번호 변경 ────────────────────────────────────
document.getElementById("pwForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const currentPw = document.getElementById("currentPw").value.trim();
  const newPw = document.getElementById("newPw").value.trim();
  const confirm = document.getElementById("newPwConfirm").value.trim();

  const err = validatePassword(newPw);
  if (err) return showMsg("pwError", "pwSuccess", false, "새 비밀번호: " + err);
  if (newPw !== confirm) return showMsg("pwError", "pwSuccess", false, "비밀번호가 일치하지 않습니다");

  setBtn("pwSaveBtn", true, "비밀번호 변경");
  const { ok, data } = await api("PUT", "/api/user/password", { currentPassword: currentPw, newPassword: newPw });
  showMsg("pwError", "pwSuccess", ok, ok ? "비밀번호가 변경되었습니다" : data.message);
  if (ok) document.getElementById("pwForm").reset();
  setBtn("pwSaveBtn", false, "비밀번호 변경");
});

// ── 모달 ─────────────────────────────────────────────
let modalTarget = null; // { type: "playlist"|"like", id, name, tracks }

function openModal(type, id, name, tracks) {
  modalTarget = { type, id, name, tracks };
  document.getElementById("modalTitle").textContent = name;
  document.getElementById("modalTracks").innerHTML = tracks.length === 0
    ? '<p style="color:#bbb; text-align:center; padding:20px;">곡 정보가 없습니다</p>'
    : tracks.map((t, i) => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #f5f5f5;">
          <span style="color:#ccc; font-size:12px; width:22px;">${i + 1}</span>
          ${t.coverUrl ? `<img src="${t.coverUrl}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;" alt="" />` : `<div style="width:36px;height:36px;border-radius:4px;background:#eee;"></div>`}
          <div>
            <div style="font-size:13px; font-weight:600; color:#222;">${t.title}</div>
            <div style="font-size:11px; color:#999;">${t.artist}</div>
          </div>
        </div>`).join("");
  const modal = document.getElementById("trackModal");
  modal.style.display = "flex";
}

document.getElementById("modalClose").addEventListener("click", () => {
  document.getElementById("trackModal").style.display = "none";
  modalTarget = null;
});

document.getElementById("trackModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.style.display = "none";
    modalTarget = null;
  }
});

document.getElementById("modalDeleteBtn").addEventListener("click", async () => {
  if (!modalTarget) return;
  if (!confirm(`"${modalTarget.name}"을(를) 삭제하시겠습니까?`)) return;

  const method = "DELETE";
  const url = modalTarget.type === "playlist" ? "/api/user/playlists" : "/api/user/likes";
  const { ok } = await api(method, url, { id: modalTarget.id });

  if (ok) {
    document.getElementById("trackModal").style.display = "none";
    modalTarget = null;
    if (modalTarget?.type === "playlist") loadPlaylists();
    else { loadPlaylists(); loadLikes(); }
    // 타입별 재로드
    loadPlaylists();
    loadLikes();
  } else {
    alert("삭제 중 오류가 발생했습니다");
  }
});

// ── 내 플레이리스트 ──────────────────────────────────
async function loadPlaylists() {
  const { ok, data } = await api("GET", "/api/user/playlists");
  document.getElementById("plLoading").style.display = "none";

  const grid = document.getElementById("plGrid");
  if (!ok || !data.playlists || data.playlists.length === 0) {
    document.getElementById("plEmpty").style.display = "block";
    grid.style.display = "none";
    return;
  }

  document.getElementById("plEmpty").style.display = "none";
  grid.style.display = "grid";
  grid.innerHTML = data.playlists.map((pl) => {
    const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    const thumb = tracks[0]?.coverUrl ? `<img src="${tracks[0].coverUrl}" alt="" loading="lazy" />` : "🎵";
    const date = pl.created_at ? new Date(pl.created_at).toLocaleDateString("ko-KR") : "";
    return `
      <div class="pl-card" data-id="${pl.id}" data-type="playlist" style="cursor:pointer;">
        <div class="pl-thumb">${thumb}</div>
        <div class="pl-info">
          <div class="pl-name">${pl.name}</div>
          <div class="pl-meta">${tracks.length}곡 · ${date}</div>
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll(".pl-card").forEach((card) => {
    card.addEventListener("click", () => {
      const pl = data.playlists.find((p) => p.id === card.dataset.id);
      if (pl) openModal("playlist", pl.id, pl.name, Array.isArray(pl.tracks) ? pl.tracks : []);
    });
  });
}

// ── 좋아요한 플레이리스트 ────────────────────────────
async function loadLikes() {
  const { ok, data } = await api("GET", "/api/user/likes");
  document.getElementById("likeLoading").style.display = "none";

  const grid = document.getElementById("likeGrid");
  if (!ok || !data.likes || data.likes.length === 0) {
    document.getElementById("likeEmpty").style.display = "block";
    grid.style.display = "none";
    return;
  }

  document.getElementById("likeEmpty").style.display = "none";
  grid.style.display = "grid";
  grid.innerHTML = data.likes.map((like) => {
    const pd = like.playlist_data || {};
    const tracks = Array.isArray(pd.tracks) ? pd.tracks : [];
    const thumb = tracks[0]?.coverUrl ? `<img src="${tracks[0].coverUrl}" alt="" loading="lazy" />` : "💜";
    const date = like.created_at ? new Date(like.created_at).toLocaleDateString("ko-KR") : "";
    return `
      <div class="pl-card" data-id="${like.id}" data-type="like" style="cursor:pointer;">
        <div class="pl-thumb">${thumb}</div>
        <div class="pl-info">
          <div class="pl-name">${like.playlist_name || "플레이리스트"}</div>
          <div class="pl-meta">${tracks.length}곡 · ${date}</div>
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll(".pl-card").forEach((card) => {
    card.addEventListener("click", () => {
      const like = data.likes.find((l) => l.id === card.dataset.id);
      if (like) {
        const pd = like.playlist_data || {};
        openModal("like", like.id, like.playlist_name || "플레이리스트", Array.isArray(pd.tracks) ? pd.tracks : []);
      }
    });
  });
}

// ── 초기 실행 ────────────────────────────────────────
loadProfile();
loadPlaylists();
loadLikes();
