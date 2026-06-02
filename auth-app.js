const authLink = document.getElementById("authLink");
const profileLink = document.getElementById("profileLink");
const profileAvatar = document.getElementById("profileAvatar");
const savePlBtn = document.getElementById("savePlBtn");

authLink?.addEventListener("click", () => { window.location.href = "/login.html"; });

savePlBtn?.addEventListener("click", async () => {
  const token = localStorage.getItem("authToken");
  if (!token) { window.location.href = "/login.html"; return; }

  const tracks = typeof currentRecommendations !== "undefined" ? currentRecommendations : [];
  if (tracks.length === 0) { alert("저장할 추천 곡이 없습니다. 먼저 추천을 받아보세요."); return; }

  const name = prompt("플레이리스트 이름을 입력하세요:", "내 플레이리스트");
  if (name === null) return;

  savePlBtn.disabled = true;
  savePlBtn.textContent = "저장 중...";
  try {
    const res = await fetch("/api/user/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: name.trim() || "내 플레이리스트", tracks }),
    });
    const data = await res.json();
    alert(res.ok ? `"${name}" 플레이리스트가 저장되었습니다!` : "저장 실패: " + (data.message || "오류"));
  } catch (err) {
    alert("저장 중 오류: " + err.message);
  } finally {
    savePlBtn.disabled = false;
    savePlBtn.textContent = "내 플레이리스트에 저장 💾";
  }
});

function updateAuthUi() {
  const token = localStorage.getItem("authToken");
  const name = localStorage.getItem("authName") || localStorage.getItem("authUsername");
  if (token && name) {
    if (authLink) authLink.style.display = "none";
    if (profileLink) profileLink.style.display = "inline-flex";
    if (profileAvatar) {
      const avatarUrl = localStorage.getItem("authAvatarUrl");
      if (avatarUrl) {
        profileAvatar.innerHTML = `<img src="${avatarUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      } else {
        profileAvatar.textContent = name.charAt(0).toUpperCase();
      }
    }
    if (savePlBtn) savePlBtn.style.display = "";
  } else {
    if (authLink) authLink.style.display = "";
    if (profileLink) profileLink.style.display = "none";
    if (savePlBtn) savePlBtn.style.display = "none";
  }
}

updateAuthUi();

// 로그인 상태면 프로필 API에서 avatar_url 가져와 반영
(async () => {
  const token = localStorage.getItem("authToken");
  if (!token) return;
  try {
    const res = await fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    const avatarUrl = data?.user?.avatar_url || null;
    if (avatarUrl) {
      localStorage.setItem("authAvatarUrl", avatarUrl);
    } else {
      localStorage.removeItem("authAvatarUrl");
    }
    updateAuthUi();
  } catch (_e) {}
})();
