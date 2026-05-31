// 저장된 테마를 즉시 적용 (깜빡임 방지)
(function () {
  const saved = localStorage.getItem("audiya-theme") || "light"; // 메인앱과 동일 키
  document.documentElement.setAttribute("data-theme", saved);
  document.body && document.body.setAttribute("data-theme", saved);
  // DOMContentLoaded 이후에도 body에 적용
  document.addEventListener("DOMContentLoaded", function () {
    document.body.setAttribute("data-theme", saved);
  });
})();
