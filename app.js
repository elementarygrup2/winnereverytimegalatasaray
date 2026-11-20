import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase,
  get,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  update
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const appRoot = $("#app");
const SESSION_KEY = "gr2-live-student-profile";

const state = {
  firebaseUser: null,
  admin: null,
  currentPage: "landing",
  activeEvent: null,
  activeEventId: null,
  adminTab: "lobby",
  adminEvents: {},
  createDraft: makeDraft(),
  selectedAnalysisId: null,
  selectedParticipantId: null,
  analysisView: "student",
  participant: readStoredParticipant(),
  clockHandle: null,
  serverTimeOffset: 0,
  unsubscribers: [],
  studentEventUnsubscribers: []
};

function makeDraft() {
  return {
    title: "",
    questionCount: 10,
    optionCount: 4,
    timeLimit: 20,
    questions: Array.from({ length: 10 }, () => ({ text: "", options: ["", "", "", ""], correct: 0 }))
  };
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortName(name = "") {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "GR";
}

function now() { return Date.now() + state.serverTimeOffset; }
function formatDate(value) {
  if (!value || typeof value !== "number") return "Tarih bekleniyor";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function toast(message, type = "") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  $("#toast-region").append(item);
  setTimeout(() => item.remove(), 4700);
}

function firebaseError(error) {
  console.error(error);
  const messages = {
    "auth/operation-not-allowed": "Firebase Authentication içinde Anonymous ve E-posta/Şifre yöntemlerini etkinleştirin.",
    "auth/admin-restricted-operation": "Öğrenci katılımı Firebase tarafından engellenmiş. Authentication → Settings → User actions bölümünde hesap oluşturmayı etkinleştirin.",
    "auth/invalid-credential": "Kullanıcı adı veya şifre hatalı.",
    "auth/user-not-found": "Kullanıcı adı veya şifre hatalı.",
    "auth/wrong-password": "Kullanıcı adı veya şifre hatalı.",
    "auth/network-request-failed": "Ağ bağlantısı kurulamadı. Bağlantınızı kontrol edin.",
    "permission-denied": "Bu işlem için Firebase Database kuralı izin vermiyor. README.md içindeki kuralları uygulayın."
  };
  return messages[error?.code] || error?.message || "Beklenmeyen bir hata oluştu.";
}

function readStoredParticipant() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function storeParticipant(profile) {
  state.participant = profile;
  localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
}

function clearListeners() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  state.unsubscribers = [];
  clearStudentEventListeners();
}

function clearStudentEventListeners() {
  state.studentEventUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
  state.studentEventUnsubscribers = [];
}

function listen(path, callback) {
  const unsubscribe = onValue(ref(db, path), (snapshot) => callback(snapshot.val()), (error) => toast(firebaseError(error), "error"));
  state.unsubscribers.push(unsubscribe);
  return unsubscribe;
}

function render() {
  clearInterval(state.clockHandle);
  state.clockHandle = null;
  if (state.currentPage === "admin") renderAdmin();
  else if (state.currentPage === "student") renderStudent();
  else renderLanding();
}

function topbar() {
  return `
    <header class="topbar">
      <div class="site-identity">
        ${nationalRibbon()}
        <a href="#" class="brand" data-action="home" aria-label="GR2 Live ana sayfa">
          ${universityLogo()}<span><small>Lefke Avrupa Üniversitesi</small><span>GR2 <em>Live</em></span></span>
        </a>
      </div>
      <div class="nav-actions">
        <button class="neon-btn pink" data-action="show-admin-login">Yönetici girişi</button>
      </div>
    </header>`;
}

function nationalRibbon() {
  return `<div class="national-ribbon" aria-label="Türkiye, Atatürk ve Kuzey Kıbrıs Türk Cumhuriyeti">
    <img src="./assets/turkiye-bayragi.svg" alt="Türkiye bayrağı" />
    <span class="ataturk-frame" title="Atatürk görseli"><img src="./assets/ataturk.jpeg" alt="Atatürk" onerror="this.onerror=null;this.src='https://upload.wikimedia.org/wikipedia/commons/c/c5/Atat%C3%BCrk_portre.png'" /></span>
    <img src="./assets/kktc-bayragi.svg" alt="Kuzey Kıbrıs Türk Cumhuriyeti bayrağı" />
  </div>`;
}

function universityLogo() {
  return `<span class="university-logo"><img src="https://basvuru.eul.edu.tr/basvuru/images/logouni.jpg" alt="Lefke Avrupa Üniversitesi logosu" referrerpolicy="no-referrer" /></span>`;
}

function renderLanding() {
  appRoot.innerHTML = `
    <div class="splash" aria-hidden="true"><div class="hello">Hello</div></div>
    <main class="app-shell">
      ${topbar()}
      <section class="hero">
        <div class="hero-inner">
          <span class="eyebrow">Canlı İngilizce Etkinliği</span>
          <h1>Hazırlık sınıfı için<br><span class="gradient-text">oyunun ritmi burada.</span></h1>
          <p class="hero-copy">Kahoot heyecanı, GR2'nin kendi neon sahnesi. Etkinliğe katıl, hazır olduğunu bildir ve sorular başladığında hızını konuştur.</p>
          <div class="action-row">
            <button class="neon-btn pink" data-action="show-join">Etkinliğe katıl <span aria-hidden="true">→</span></button>
            <button class="ghost-btn" data-action="show-qr">QR kodu göster</button>
          </div>
          <div class="notice-card glass">
            <div class="icon-bubble">✦</div>
            <div><strong>İsmin seni temsil eder.</strong><p>Katılırken gerçek adını ve soyadını kullanman zorunludur. Bu isim etkinlik ve analiz ekranlarında görünür.</p></div>
          </div>
        </div>
      </section>
    </main>`;
}

function openModal(content) {
  const dialog = document.createElement("div");
  dialog.className = "modal-backdrop";
  dialog.dataset.modal = "true";
  dialog.innerHTML = `<section class="modal" role="dialog" aria-modal="true">${content}</section>`;
  document.body.append(dialog);
  const autofocus = $("[autofocus]", dialog);
  autofocus?.focus();
}

function closeModal() { $("[data-modal]")?.remove(); }

function joinModal() {
  const eventName = state.activeEvent?.meta?.title;
  openModal(`
    <div class="modal-head"><div><h2>Etkinliğe katıl</h2><p class="subcopy">${eventName ? `Sıradaki etkinlik: <b>${esc(eventName)}</b>` : "İsminle katıl; etkinlik hazır olduğunda burada ol."}</p></div><button class="close" data-action="close-modal" aria-label="Kapat">×</button></div>
    <form id="join-form" class="form-grid">
      <div class="field"><label for="full-name">Gerçek adın ve soyadın</label><input id="full-name" name="fullName" autocomplete="name" placeholder="Örnek: Ada Yılmaz" required autofocus value="${esc(state.participant?.fullName || "")}" /><small>Etkinlik, lobi ve analiz ekranlarında bu isim görünür.</small></div>
      <p class="identity-note">Gerçek ad ve soyad kullanmak zorunludur. Katılım verilerin yalnızca öğretim amaçlı etkinlik analizi için kullanılır.</p>
      <div class="modal-actions"><button class="ghost-btn" type="button" data-action="close-modal">Vazgeç</button><button class="neon-btn pink" type="submit">Katıl ve hazır ol</button></div>
    </form>`);
}

function qrModal() {
  const url = `${location.origin}${location.pathname}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=${encodeURIComponent(url)}`;
  openModal(`
    <div class="modal-head"><div><h2>Katılım QR kodu</h2><p class="subcopy">Öğrenciler kameralarıyla okutabilir veya aşağıdaki adresi açabilir.</p></div><button class="close" data-action="close-modal" aria-label="Kapat">×</button></div>
    <div class="qr-wrap"><img class="qr-image" src="${qrUrl}" alt="GR2 Live katılım QR kodu" /><div class="join-code">${esc(location.host || "GR2-LIVE")}</div><p class="subcopy" style="margin-top:15px">${esc(url)}</p></div>
    <div class="modal-actions"><button class="neon-btn" data-action="copy-link">Bağlantıyı kopyala</button></div>`);
}

function adminLoginModal() {
  openModal(`
    <div class="modal-head"><div><h2>Yönetici girişi</h2><p class="subcopy">Lefke Avrupa Üniversitesi Hazırlık Sınıfı Grup 2 yönetici giriş sistemine hoş geldin.</p></div><button class="close" data-action="close-modal" aria-label="Kapat">×</button></div>
    <form id="admin-login-form" class="form-grid">
      <div class="field"><label for="admin-username">Kullanıcı adı</label><input id="admin-username" name="username" autocomplete="username" placeholder="Kullanıcı adın" required autofocus /></div>
      <div class="field"><label for="admin-password">Şifre</label><input id="admin-password" name="password" type="password" autocomplete="current-password" placeholder="Şifren" required /></div>
      <p class="identity-note">Yönetici yetkisi, girişten sonra Firebase üzerinde doğrulanır. Şifreler bu sitede saklanmaz.</p>
      <div class="modal-actions"><button class="ghost-btn" type="button" data-action="close-modal">Vazgeç</button><button class="neon-btn pink" type="submit">Güvenle giriş yap</button></div>
    </form>`);
}

async function submitAdminLogin(form) {
  const data = new FormData(form);
  const username = String(data.get("username") || "").trim().toLowerCase();
  const password = String(data.get("password") || "");
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return toast("Geçerli bir kullanıcı adı yazın.", "error");
  try {
    const credential = await signInWithEmailAndPassword(auth, `${username}@eulgr2.local`, password);
    const roleSnapshot = await get(ref(db, `roles/${credential.user.uid}`));
    const profile = roleSnapshot.val();
    if (!profile?.admin) {
      await signOut(auth);
      throw new Error("Bu hesapta yönetici yetkisi tanımlı değil. Firebase'de roles/UID kaydını oluşturun.");
    }
    state.admin = { ...profile, uid: credential.user.uid, username };
    state.currentPage = "admin";
    closeModal();
    setupAdminListeners();
    render();
    toast(`Hoş geldin, ${profile.displayName || username}.`, "success");
  } catch (error) {
    toast(firebaseError(error), "error");
  }
}

async function submitJoin(form) {
  const data = new FormData(form);
  const fullName = String(data.get("fullName") || "").trim().replace(/\s+/g, " ");
  if (fullName.split(" ").filter(Boolean).length < 2 || fullName.length < 5) return toast("Lütfen gerçek adını ve soyadını birlikte yaz.", "error");
  try {
    if (!auth.currentUser || !auth.currentUser.isAnonymous) await signInAnonymously(auth);
    storeParticipant({ fullName });
    closeModal();
    state.currentPage = "student";
    setupStudentListeners();
    render();
  } catch (error) {
    toast(firebaseError(error), "error");
  }
}

function setupStudentListeners() {
  clearListeners();
  listen("activeEvent", (active) => {
    state.activeEventId = active?.eventId || null;
    clearStudentEventListeners();
    if (!state.activeEventId) {
      state.activeEvent = null;
      render();
      return;
    }
    state.activeEvent = {};
    const loadSlice = (key) => onValue(ref(db, `events/${state.activeEventId}/${key}`), (snapshot) => {
      if (key.startsWith("participants/")) {
        state.activeEvent = { ...state.activeEvent, participants: { [auth.currentUser.uid]: snapshot.val() } };
      } else if (key.startsWith("kicked/")) {
        state.activeEvent = { ...state.activeEvent, kicked: { [auth.currentUser.uid]: snapshot.val() } };
      } else {
        state.activeEvent = { ...state.activeEvent, [key]: snapshot.val() };
      }
      if (key === "meta" && state.participant && auth.currentUser && snapshot.val()?.status !== "finished") ensureParticipant();
      render();
    }, (error) => toast(firebaseError(error), "error"));
    ["meta", "public", "leaderboard", "roundResults", "celebration", `participants/${auth.currentUser.uid}`, `kicked/${auth.currentUser.uid}`].forEach((key) => {
      const unsubscribe = loadSlice(key);
      state.studentEventUnsubscribers.push(unsubscribe);
    });
  });
}

async function ensureParticipant() {
  const user = auth.currentUser;
  if (!user || !state.activeEventId || !state.participant) return;
  const profilePath = `events/${state.activeEventId}/participants/${user.uid}`;
  try {
    const kickedSnapshot = await get(ref(db, `events/${state.activeEventId}/kicked/${user.uid}`));
    if (kickedSnapshot.exists()) return;
    const snapshot = await get(ref(db, profilePath));
    if (!snapshot.exists()) {
      await set(ref(db, profilePath), {
        fullName: state.participant.fullName,
        nickname: state.participant.fullName,
        joinedAt: now(),
        ready: false,
        score: 0
      });
    }
  } catch (error) { toast(firebaseError(error), "error"); }
}

function renderStudent() {
  const event = state.activeEvent;
  const participant = event?.participants?.[auth.currentUser?.uid];
  appRoot.innerHTML = `
    <main class="student-shell">
      <header class="student-top">
        <div class="site-identity">
          ${nationalRibbon()}
          <a href="#" class="brand" data-action="home">${universityLogo()}<span><small>Lefke Avrupa Üniversitesi</small><span>GR2 <em>Live</em></span></span></a>
        </div>
        <div class="participant-pill"><span class="avatar">${esc(shortName(state.participant?.fullName))}</span><span><b>${esc(state.participant?.fullName || "Misafir")}</b><br>Öğrenci modu</span></div>
      </header>
      ${studentBody(event, participant)}
    </main>`;
  if (event?.meta?.status === "live" && event?.meta?.phase === "question") startClock();
}

function studentBody(event, participant) {
  if (!event?.meta) return `
    <section class="student-state"><article class="student-card glass"><div class="pulse-orb"></div><span class="eyebrow">Sahne hazırlanıyor</span><h1>Pembe Hoca henüz etkinlik hazırlamadı.</h1><p>Yeni etkinlik açıldığında bu sayfa kendiliğinden güncellenir. Hazır ol; ilk soru her an ekrana gelebilir.</p><button class="ghost-btn" data-action="back-landing">Ana sayfaya dön</button></article></section>`;
  if (event.kicked?.[auth.currentUser?.uid]) return `
    <section class="student-state"><article class="student-card glass"><div class="pulse-orb"></div><span class="eyebrow">Lobi bildirimi</span><h1>Katılımın sonlandırıldı.</h1><p>Lobi yöneticisi bu etkinlikteki katılımını sonlandırdı. Yeni bir etkinlik açıldığında tekrar katılabilirsin.</p><button class="ghost-btn" data-action="back-landing">Ana sayfaya dön</button></article></section>`;
  if (event.meta.status === "waiting") return `
    <section class="student-state"><article class="student-card glass"><div class="pulse-orb"></div><span class="status ready">Etkinlik hazır</span><h1>${esc(event.meta.title)}</h1><p>Pembe Hoca etkinliği hazırladı; ancak henüz başlatmadı. ${participant?.ready ? "Hazır olduğunu bildirdin. Sadece başlangıç işaretini bekle." : "Katılmaya hazır olduğunda aşağıdaki düğmeye dokun."}</p>${participant?.ready ? `<div class="ready-check">✓</div><p><b>Hazırsın!</b> Başlangıç işaretini bekle.</p>` : `<button class="neon-btn pink" data-action="mark-ready">Hazırım</button>`}</article></section>`;
  if (event.meta.status === "finished") return renderCelebration(event, participant);
  if (event.meta.phase === "leaderboard") return renderLeaderboardPause(event, participant);
  return renderLiveQuestion(event, participant);
}

function renderLiveQuestion(event, participant) {
  const index = event.meta.currentQuestionIndex || 0;
  const question = event.public?.questions?.[index];
  if (!question) return `<section class="student-state"><article class="student-card glass"><h1>Sorular yükleniyor…</h1><p>Bağlantı kontrol ediliyor.</p></article></section>`;
  const answer = participant?.answers?.[index];
  const total = event.meta.questionCount;
  return `
    <section>
      <div class="live-header"><div class="progress-track"><div id="progress-fill" class="progress-fill"></div></div><strong id="countdown" class="timer">--</strong></div>
      <article class="live-question glass">
        <div class="question-number">Soru ${index + 1} / ${total}</div>
        <h1>${esc(question.text)}</h1>
        <div class="choice-list">${question.options.map((option, optionIndex) => `
          <button class="choice ${answer?.option === optionIndex ? "selected" : ""}" ${answer ? "disabled" : ""} data-action="answer" data-option="${optionIndex}"><span class="choice-key">${String.fromCharCode(65 + optionIndex)}</span><span>${esc(option)}</span></button>`).join("")}</div>
        ${answer ? `<p class="answer-wait">Cevabın kaydedildi. Sonuçlar için diğer katılımcıları bekliyorsun. ✦</p>` : ""}
      </article>
      ${renderSmallLeaderboard(event, participant)}
    </section>`;
}

function renderSmallLeaderboard(event) {
  const leaders = Object.values(event.leaderboard || {}).sort((a, b) => b.score - a.score).slice(0, 5);
  if (!leaders.length) return "";
  return `<article class="scoreboard glass"><h2>Canlı ilk 5</h2>${leaders.map((leader, index) => `<div class="leader-row"><b class="leader-rank">#${index + 1}</b><span>${esc(leader.fullName || leader.nickname)}</span><span class="leader-points">${leader.score} puan</span></div>`).join("")}</article>`;
}

function renderLeaderboardPause(event, participant) {
  const index = event.meta.currentQuestionIndex || 0;
  const result = event.roundResults?.[index];
  const leaders = Object.values(event.leaderboard || {}).sort((a, b) => b.score - a.score).slice(0, 10);
  return `<section class="student-state"><article class="student-card glass"><span class="eyebrow">Soru ${index + 1} tamamlandı</span><h1><span class="gradient-text">İlk 10</span> sahnede!</h1><p>${result ? `${result.correct} doğru, ${result.wrong} yanlış cevap geldi.` : "Sonuçlar hesaplanıyor."}</p>${leaders.length ? `<div class="scoreboard">${leaders.map((leader, position) => `<div class="leader-row"><b class="leader-rank">#${position + 1}</b><span>${esc(leader.fullName || leader.nickname)}</span><span class="leader-points">${leader.score} puan</span></div>`).join("")}</div>` : ""}<p>Bir sonraki soru için Pembe Hoca'nın işaretini bekle.</p></article></section>`;
}

function renderCelebration(event, participant) {
  const winners = Object.values(event.leaderboard || {}).sort((a, b) => b.score - a.score).slice(0, 3);
  const ownPlace = Object.values(event.leaderboard || {}).sort((a, b) => b.score - a.score).findIndex((x) => x.uid === auth.currentUser?.uid) + 1;
  return `<section class="student-state"><article class="student-card glass"><div class="pulse-orb"></div><span class="eyebrow">Etkinlik tamamlandı</span><h1><span class="gradient-text">Bravo, GR2!</span></h1><p>${participant ? `${esc(participant.fullName)}, etkinliği ${ownPlace ? `#${ownPlace} sırada` : "tamamlayarak"} bitirdin.` : "Katıldığın için teşekkürler."}</p>${winners.length ? `<div class="scoreboard"><h2>Neon podyum</h2>${winners.map((winner, index) => `<div class="leader-row"><b class="leader-rank">${["🥇", "🥈", "🥉"][index]}</b><span>${esc(winner.fullName || winner.nickname)}</span><span class="leader-points">${winner.score} puan</span></div>`).join("")}</div>` : ""}<p>${event.celebration?.fastestName ? `⚡ En hızlı cevaplayan: <b>${esc(event.celebration.fastestName)}</b><br>🕊️ En sakin cevaplayan: <b>${esc(event.celebration.slowestName)}</b>` : "Sonuçlar etkinlik analizi için kaydedildi."}</p></article></section>`;
}

function startClock() {
  clearInterval(state.clockHandle);
  const tick = () => {
    const event = state.activeEvent;
    const start = event?.rounds?.[event?.meta?.currentQuestionIndex]?.startedAt || event?.meta?.questionStartedAt;
    const limit = (event?.meta?.timeLimit || 20) * 1000;
    if (!start) return;
    const remaining = Math.max(0, limit - (now() - start));
    const percent = Math.max(0, Math.min(100, (remaining / limit) * 100));
    const seconds = Math.ceil(remaining / 1000);
    const countdown = $("#countdown");
    const progress = $("#progress-fill");
    if (countdown) countdown.textContent = `00:${String(seconds).padStart(2, "0")}`;
    if (progress) progress.style.width = `${percent}%`;
  };
  tick();
  state.clockHandle = setInterval(tick, 180);
}

async function markReady() {
  try {
    await update(ref(db, `events/${state.activeEventId}/participants/${auth.currentUser.uid}`), { ready: true, readyAt: serverTimestamp() });
  } catch (error) { toast(firebaseError(error), "error"); }
}

async function answerQuestion(option) {
  const event = state.activeEvent;
  if (!event || event.meta.status !== "live" || event.meta.phase !== "question") return;
  const index = event.meta.currentQuestionIndex || 0;
  const start = event.rounds?.[index]?.startedAt || event.meta.questionStartedAt;
  if (now() - start > event.meta.timeLimit * 1000) return toast("Bu sorunun süresi doldu.", "error");
  const answerPath = `events/${state.activeEventId}/participants/${auth.currentUser.uid}/answers/${index}`;
  try {
    const prior = await get(ref(db, answerPath));
    if (prior.exists()) return;
    await set(ref(db, answerPath), { option, answeredAt: serverTimestamp() });
  } catch (error) { toast(firebaseError(error), "error"); }
}

function setupAdminListeners() {
  clearListeners();
  listen("activeEvent", (active) => {
    state.activeEventId = active?.eventId || null;
    render();
  });
  listen("events", (events) => {
    state.adminEvents = events || {};
    if (!state.selectedAnalysisId) {
      const done = Object.entries(state.adminEvents).find(([, event]) => event?.meta?.status === "finished");
      state.selectedAnalysisId = done?.[0] || null;
    }
    render();
  });
}

function renderAdmin() {
  const profile = state.admin;
  if (!profile) return renderLanding();
  appRoot.innerHTML = `
    <main class="admin-shell">
      <header class="admin-top">
        <div class="site-identity">
          ${nationalRibbon()}
          <a href="#" class="brand" data-action="admin-home">${universityLogo()}<span><small>Lefke Avrupa Üniversitesi</small><span>GR2 <em>Admin</em></span></span></a>
        </div>
        <div class="nav-actions"><span class="status ${profile.canAuthor ? "live" : "ready"}">${profile.canAuthor ? "Soru editörü" : "Yönetici"}</span><button class="ghost-btn" data-action="sign-out">Çıkış yap</button></div>
      </header>
      <nav class="admin-tabs" aria-label="Yönetici menüsü">
        ${adminTabButton("lobby", "Lobi")}
        ${adminTabButton("create", "Yeni etkinlik oluştur")}
        ${adminTabButton("analysis", "Detaylı analiz")}
      </nav>
      <section class="admin-main">${state.adminTab === "create" ? renderCreateTab() : state.adminTab === "analysis" ? renderAnalysisTab() : renderLobbyTab()}</section>
    </main>`;
}

function adminTabButton(id, text) { return `<button class="${state.adminTab === id ? "active" : ""}" data-action="admin-tab" data-tab="${id}">${text}</button>`; }
function getEventsArray() { return Object.entries(state.adminEvents).map(([id, event]) => ({ id, ...event })).filter((event) => event.meta); }

function renderHistoryTab() {
  const events = getEventsArray().sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
  const active = events.find((event) => event.id === state.activeEventId && event.meta.status !== "finished");
  const past = events.filter((event) => event.meta.status === "finished");
  return `
    <div class="section-title"><div><h1>Geçmiş etkinlikler</h1><p>Yayınlanan etkinliklerin durumunu, katılımı ve özetini buradan izle.</p></div><button class="neon-btn pink" data-action="go-create">＋ Yeni etkinlik</button></div>
    <div class="dash-grid">
      <article class="panel glass">
        <h2>Etkinlik merkezi</h2>
        ${active ? renderActiveManager(active) : `<div class="empty"><div><div class="empty-symbol">◌</div><h3>Şu an açık etkinlik yok.</h3><p>Yeni bir etkinlik hazırladığında öğrenciler bu sayfada beklemeye başlar.</p><button class="neon-btn" data-action="go-create">Yeni etkinlik oluştur</button></div></div>`}
      </article>
      <article class="panel glass"><h2>Geçmiş kayıtlar</h2>${past.length ? `<div class="event-list">${past.slice(0, 7).map(renderEventRow).join("")}</div>` : `<div class="empty"><div><div class="empty-symbol">✦</div><h3>Henüz geçmiş etkinliğin yok.</h3><p>İlk etkinliğin bittiğinde performans kaydı burada görünecek.</p></div></div>`}</article>
    </div>`;
}

function renderLobbyTab() {
  const events = getEventsArray().sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
  const active = events.find((event) => event.id === state.activeEventId && event.meta.status !== "finished");
  const past = events.filter((event) => event.meta.status === "finished");
  return `
    <div class="section-title"><div><h1>Canlı lobi</h1><p>Katılımcılar tüm cihazlarda anlık güncellenir. Gerektiğinde bir katılımcının etkinlik erişimini buradan sonlandırabilirsin.</p></div><button class="neon-btn pink" data-action="go-create">＋ Yeni etkinlik</button></div>
    <div class="dash-grid">
      <article class="panel glass">
        <h2>Etkinlik merkezi</h2>
        ${active ? renderActiveManager(active) : `<div class="empty"><div><div class="empty-symbol">◌</div><h3>Şu an açık etkinlik yok.</h3><p>Yeni bir etkinlik hazırladığında öğrenciler bu sayfada lobide görünür.</p><button class="neon-btn" data-action="go-create">Yeni etkinlik oluştur</button></div></div>`}
      </article>
      <article class="panel glass">
        <h2>${active ? `Lobidekiler · ${Object.keys(active.participants || {}).length}` : "Lobi boş"}</h2>
        ${active ? renderLobbyParticipants(active) : `<div class="empty"><div><div class="empty-symbol">✦</div><h3>Katılımcı bekleniyor.</h3><p>Etkinlik açıldığında öğrenciler burada isimleriyle görünür.</p></div></div>`}
      </article>
    </div>
    ${past.length ? `<article class="panel glass lobby-history"><h2>Son tamamlanan etkinlikler</h2><div class="event-list">${past.slice(0, 5).map(renderEventRow).join("")}</div></article>` : ""}`;
}

function renderLobbyParticipants(event) {
  const participants = Object.entries(event.participants || {}).sort(([, a], [, b]) => (a.joinedAt || 0) - (b.joinedAt || 0));
  if (!participants.length) return `<div class="empty compact-empty"><div><div class="empty-symbol">◌</div><h3>Henüz kimse katılmadı.</h3><p>QR kodla veya bağlantıyla katılan öğrenciler burada görünür.</p></div></div>`;
  return `<div class="lobby-list">${participants.map(([uid, participant]) => `<div class="lobby-person"><span class="avatar">${esc(shortName(participant.fullName || participant.nickname))}</span><span class="lobby-person-copy"><b>${esc(participant.fullName || participant.nickname)}</b><span>${participant.ready ? "Hazır" : "Bekliyor"}</span></span><button class="danger-btn" data-action="kick-participant" data-event-id="${event.id}" data-uid="${uid}">Lobiden çıkar</button></div>`).join("")}</div>`;
}

function renderEventRow(event) {
  const count = Object.keys(event.participants || {}).length;
  return `<div class="event-row"><div><h3>${esc(event.meta.title)}</h3><p>${formatDate(event.meta.endedAt || event.meta.createdAt)} · ${count} katılımcı · ${event.meta.questionCount} soru</p></div><div class="event-actions"><button class="ghost-btn" data-action="open-analysis" data-event-id="${event.id}">Analizi aç</button></div></div>`;
}

function renderActiveManager(event) {
  const ready = Object.values(event.participants || {}).filter((p) => p.ready).length;
  const joined = Object.keys(event.participants || {}).length;
  const statusClass = event.meta.status === "live" ? "live" : "ready";
  let control = "";
  if (event.meta.status === "waiting") {
    control = `<button class="neon-btn pink" data-action="start-event" data-event-id="${event.id}">Etkinliği başlat</button><p>${ready} kişi hazır. Etkinliği istediğin anda başlatabilirsin.</p>`;
  } else if (event.meta.phase === "question") {
    control = `${renderRoundCounts(event)}<button class="neon-btn pink" data-action="show-results" data-event-id="${event.id}">Sonuçları göster ve ilk 10'u aç</button>`;
  } else if (event.meta.phase === "leaderboard") {
    const finalQuestion = (event.meta.currentQuestionIndex || 0) + 1 >= event.meta.questionCount;
    const result = event.roundResults?.[event.meta.currentQuestionIndex || 0] || {};
    control = `<div class="answer-counts"><span class="answer-count good">${result.correct || 0} doğru</span><span class="answer-count bad">${result.wrong || 0} yanlış</span><span class="answer-count pending">${result.unanswered || 0} boş</span></div><button class="neon-btn pink" data-action="advance-event" data-event-id="${event.id}">${finalQuestion ? "Ödül ekranını aç ve bitir" : "Sonraki soruyu başlat"}</button>`;
  }
  return `<div class="activity-card"><span class="status ${statusClass}">${event.meta.status === "waiting" ? "Katılım açık" : event.meta.phase === "leaderboard" ? "İlk 10 ekranda" : "Canlı soru"}</span><h3>${esc(event.meta.title)}</h3><p>${event.meta.questionCount} soru · soru başına ${event.meta.timeLimit} saniye · ${event.meta.optionCount} seçenek</p><div class="mini-stat-grid"><div class="mini-stat"><strong>${joined}</strong><span>Katılan öğrenci</span></div><div class="mini-stat"><strong>${ready}</strong><span>Hazır öğrenci</span></div></div><div class="host-controls"><h3>Öğretmen kumandası</h3><p>Öğrenci ekranı canlı olarak güncellenir. Süre bittiğinde sonuç panelini açabilirsin.</p>${control}</div></div>`;
}

function renderRoundCounts(event) {
  const index = event.meta.currentQuestionIndex || 0;
  const answers = Object.values(event.participants || {}).map((participant) => participant.answers?.[index]).filter(Boolean);
  const total = Object.keys(event.participants || {}).length;
  return `<div class="answer-counts"><span class="answer-count pending">${answers.length}/${total} cevap</span><span class="answer-count good">Canlı takip</span></div>`;
}

function renderCreateTab() {
  if (!state.admin.canAuthor) return `
    <div class="section-title"><div><h1>Yeni etkinlik oluştur</h1><p>Etkinlik düzenleme yetkisi yalnızca Pembe Hoca hesabında açıktır.</p></div></div>
    <div class="create-layout"><article class="creation-step glass"><h2>Yetki durumu</h2><p>Etkinlik başlatma ve analiz ekranlarını kullanabilirsin. Soru yazma bölümü, içerik bütünlüğü için öğretmen yetkisiyle korunur.</p></article><article class="question-builder glass locked"><h2>Soru editörü</h2><div class="empty"><p>Pembe Hoca tarafından düzenlenebilir.</p></div></article></div>`;
  const draft = state.createDraft;
  return `
    <div class="section-title"><div><h1>Yeni etkinlik oluştur</h1><p>Önce çerçeveyi belirle; sonra sorularını ve doğru yanıtlarını ekle.</p></div><span class="status live">Pembe Hoca yetkisi</span></div>
    <div class="create-layout">
      <aside class="creation-step glass"><h2>Etkinlik akışı</h2><p>Sorular, öğrenciler başladıktan sonra değiştirilemez. Kontrol edip ardından yayına al.</p><div class="step-list"><div class="step-item"><b>1</b>Etkinlik ayarları</div><div class="step-item"><b>2</b>Sorular ve seçenekler</div><div class="step-item"><b>3</b>Doğru yanıtlar</div><div class="step-item"><b>4</b>Öğrenci katılımı</div></div></aside>
      <article class="question-builder glass">
        <h2>Soru editörü</h2><p>Her soruda ${draft.optionCount} seçenek var. Yeşil işaretli seçenek doğru yanıt olarak değerlendirilir.</p>
        <div class="builder-config">
          <div class="field"><label for="draft-title">Etkinlik başlığı</label><input id="draft-title" value="${esc(draft.title)}" maxlength="80" placeholder="Örnek: Unit 3 — Vocabulary Challenge" /></div>
          <div class="field"><label for="draft-count">Soru sayısı</label><input id="draft-count" type="number" min="2" max="50" step="2" inputmode="numeric" value="${draft.questionCount}" /><small>2–50 arası çift sayı</small></div>
          <div class="field"><label for="draft-options">Seçenek sayısı</label><select id="draft-options">${[4, 5].map((n) => `<option value="${n}" ${n === draft.optionCount ? "selected" : ""}>${n} seçenek</option>`).join("")}</select></div>
          <div class="field"><label for="draft-time">Soru süresi</label><input id="draft-time" type="number" min="2" max="120" step="2" inputmode="numeric" value="${draft.timeLimit}" /><small>2–120 sn, çift sayı</small></div>
        </div>
        <button class="ghost-btn" data-action="apply-builder">Ayarları uygula</button>
        <div id="question-stack" class="question-stack" style="margin-top:18px">${draft.questions.map((question, index) => questionEditor(question, index)).join("")}</div>
        <div class="builder-footer"><button class="ghost-btn" data-action="save-draft">Taslağı doğrula</button><button class="neon-btn pink" data-action="publish-activity">Etkinliği katılıma aç</button></div>
      </article>
    </div>`;
}

function questionEditor(question, index) {
  return `<article class="question-box" data-question-index="${index}"><header><strong>${index + 1}. soru</strong><span class="status ready">Doğru şıkkı işaretle</span></header><div class="field"><label for="q-${index}">Soru metni</label><textarea id="q-${index}" class="draft-question" placeholder="Sorunu İngilizce olarak yaz…">${esc(question.text)}</textarea></div><div class="answer-grid">${question.options.map((option, optionIndex) => `<label class="answer-option"><input type="radio" name="correct-${index}" value="${optionIndex}" ${question.correct === optionIndex ? "checked" : ""} aria-label="${index + 1}. soru doğru seçenek ${optionIndex + 1}" /><b>${String.fromCharCode(65 + optionIndex)}</b><input class="draft-option" type="text" value="${esc(option)}" placeholder="Seçenek ${String.fromCharCode(65 + optionIndex)}" /></label>`).join("")}</div></article>`;
}

function readDraftFromScreen() {
  const title = $("#draft-title")?.value.trim();
  if (title !== undefined) state.createDraft.title = title;
  state.createDraft.questionCount = Number($("#draft-count")?.value || state.createDraft.questionCount);
  state.createDraft.optionCount = Number($("#draft-options")?.value || state.createDraft.optionCount);
  state.createDraft.timeLimit = Number($("#draft-time")?.value || state.createDraft.timeLimit);
  const boxes = $$("[data-question-index]");
  if (boxes.length) state.createDraft.questions = boxes.map((box) => ({
    text: $(".draft-question", box).value.trim(),
    options: $$(".draft-option", box).map((input) => input.value.trim()),
    correct: Number($("input[type=radio]:checked", box)?.value || 0)
  }));
  return true;
}

function applyBuilder() {
  const previous = state.createDraft;
  readDraftFromScreen();
  const { questionCount, optionCount } = state.createDraft;
  if (!isEvenNumberInRange(questionCount, 2, 50)) return toast("Soru sayısı 2 ile 50 arasında çift sayı olmalı.", "error");
  if (!isEvenNumberInRange(state.createDraft.timeLimit, 2, 120)) return toast("Soru süresi 2 ile 120 saniye arasında çift sayı olmalı.", "error");
  state.createDraft.questions = Array.from({ length: questionCount }, (_, index) => {
    const old = previous.questions[index] || state.createDraft.questions[index];
    return { text: old?.text || "", correct: Math.min(old?.correct || 0, optionCount - 1), options: Array.from({ length: optionCount }, (__, optionIndex) => old?.options?.[optionIndex] || "") };
  });
  render();
}

function isEvenNumberInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum && value % 2 === 0;
}

function validateDraft() {
  readDraftFromScreen();
  const draft = state.createDraft;
  if (!draft.title) return "Etkinlik için bir başlık yazmalısın.";
  if (!isEvenNumberInRange(draft.questionCount, 2, 50)) return "Soru sayısı 2 ile 50 arasında çift sayı olmalı.";
  if (!isEvenNumberInRange(draft.timeLimit, 2, 120)) return "Soru süresi 2 ile 120 saniye arasında çift sayı olmalı.";
  if (draft.questions.length !== draft.questionCount) return "Soru sayısını uygulamak için “Ayarları uygula” düğmesine bas.";
  for (let index = 0; index < draft.questions.length; index += 1) {
    const question = draft.questions[index];
    if (question.text.length < 4) return `${index + 1}. sorunun metnini yaz.`;
    if (question.options.some((option) => option.length < 1)) return `${index + 1}. sorunun bütün seçeneklerini doldur.`;
    if (new Set(question.options.map((option) => option.toLocaleLowerCase("tr"))).size !== question.options.length) return `${index + 1}. soruda aynı seçenek iki kez yazılmış.`;
  }
  return null;
}

async function publishActivity() {
  const validation = validateDraft();
  if (validation) return toast(validation, "error");
  const draft = state.createDraft;
  const eventId = push(ref(db, "events")).key;
  const createdAt = serverTimestamp();
  const publicQuestions = {};
  const privateQuestions = {};
  draft.questions.forEach((question, index) => {
    publicQuestions[index] = { id: `q-${index + 1}`, text: question.text, options: question.options };
    privateQuestions[index] = { correct: question.correct };
  });
  const event = {
    meta: { title: draft.title, questionCount: draft.questionCount, optionCount: draft.optionCount, timeLimit: draft.timeLimit, status: "waiting", phase: "lobby", currentQuestionIndex: 0, createdAt, createdBy: state.admin.uid },
    public: { questions: publicQuestions },
    private: { questions: privateQuestions },
    participants: {},
    leaderboard: {}
  };
  try {
    await update(ref(db), { [`events/${eventId}`]: event, activeEvent: { eventId, status: "waiting", updatedAt: createdAt } });
    state.createDraft = makeDraft();
    state.adminTab = "history";
    toast("Etkinlik katılıma açıldı. Öğrenciler artık hazır olabilir.", "success");
  } catch (error) { toast(firebaseError(error), "error"); }
}

async function startEvent(eventId) {
  const event = state.adminEvents[eventId];
  if (!event) return toast("Etkinlik bulunamadı.", "error");
  const startedAt = serverTimestamp();
  try {
    await update(ref(db), {
      [`events/${eventId}/meta/status`]: "live",
      [`events/${eventId}/meta/phase`]: "question",
      [`events/${eventId}/meta/currentQuestionIndex`]: 0,
      [`events/${eventId}/meta/questionStartedAt`]: startedAt,
      [`events/${eventId}/rounds/0/startedAt`]: startedAt,
      activeEvent: { eventId, status: "live", updatedAt: startedAt }
    });
  } catch (error) { toast(firebaseError(error), "error"); }
}

function currentAdminEvent(eventId) { return state.adminEvents[eventId]; }

async function showResults(eventId) {
  const event = currentAdminEvent(eventId);
  const index = event?.meta?.currentQuestionIndex || 0;
  if (!event) return;
  const correct = event.private?.questions?.[index]?.correct;
  if (!Number.isInteger(correct)) return toast("Doğru cevap bilgisi bulunamadı.", "error");
  const start = event.rounds?.[index]?.startedAt || event.meta.questionStartedAt;
  const updates = {};
  const ranking = [];
  let right = 0;
  let wrong = 0;
  let fastest = null;
  let slowest = null;
  Object.entries(event.participants || {}).forEach(([uid, participant]) => {
    const answer = participant.answers?.[index];
    const oldScore = Number(participant.score || 0);
    let added = 0;
    if (answer) {
      const elapsed = Math.max(0, answer.answeredAt - start);
      if (answer.option === correct) {
        right += 1;
        added = 1000 + Math.max(0, Math.round((event.meta.timeLimit * 1000 - elapsed) / 12));
      } else wrong += 1;
      const speedEntry = { uid, fullName: participant.fullName || participant.nickname, elapsed };
      if (!fastest || elapsed < fastest.elapsed) fastest = speedEntry;
      if (!slowest || elapsed > slowest.elapsed) slowest = speedEntry;
    }
    const score = oldScore + added;
    updates[`events/${eventId}/participants/${uid}/score`] = score;
    updates[`events/${eventId}/participants/${uid}/results/${index}`] = { correct: Boolean(answer && answer.option === correct), elapsed: answer ? Math.max(0, answer.answeredAt - start) : null, points: added };
    ranking.push({ uid, fullName: participant.fullName || participant.nickname, score });
  });
  ranking.sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName, "tr"));
  ranking.forEach((row, rank) => { updates[`events/${eventId}/leaderboard/${row.uid}`] = { ...row, rank: rank + 1 }; });
  updates[`events/${eventId}/roundResults/${index}`] = { correct: right, wrong, unanswered: Object.keys(event.participants || {}).length - right - wrong, fastest: fastest ? { fullName: fastest.fullName, elapsed: fastest.elapsed } : null, slowest: slowest ? { fullName: slowest.fullName, elapsed: slowest.elapsed } : null, closedAt: serverTimestamp() };
  updates[`events/${eventId}/meta/phase`] = "leaderboard";
  try { await update(ref(db), updates); } catch (error) { toast(firebaseError(error), "error"); }
}

async function advanceEvent(eventId) {
  const event = currentAdminEvent(eventId);
  if (!event) return;
  const index = event.meta.currentQuestionIndex || 0;
  const next = index + 1;
  try {
    if (next >= event.meta.questionCount) {
      const roundResults = Object.values(event.roundResults || {});
      const speeds = roundResults.flatMap((result) => [
        result.fastest ? { ...result.fastest, kind: "fastest" } : null,
        result.slowest ? { ...result.slowest, kind: "slowest" } : null
      ]).filter(Boolean);
      const fastest = speeds.filter((entry) => entry.kind === "fastest").sort((a, b) => a.elapsed - b.elapsed)[0];
      const slowest = speeds.filter((entry) => entry.kind === "slowest").sort((a, b) => b.elapsed - a.elapsed)[0];
      await update(ref(db), {
        [`events/${eventId}/meta/status`]: "finished",
        [`events/${eventId}/meta/phase`]: "finished",
        [`events/${eventId}/meta/endedAt`]: serverTimestamp(),
        [`events/${eventId}/celebration`]: { fastestName: fastest?.fullName || fastest?.nickname || null, slowestName: slowest?.fullName || slowest?.nickname || null },
        activeEvent: { eventId, status: "finished", updatedAt: serverTimestamp() }
      });
      toast("Etkinlik tamamlandı. Ödül ekranı öğrencilerde açık.", "success");
    } else {
      const startedAt = serverTimestamp();
      await update(ref(db), {
        [`events/${eventId}/meta/phase`]: "question",
        [`events/${eventId}/meta/currentQuestionIndex`]: next,
        [`events/${eventId}/meta/questionStartedAt`]: startedAt,
        [`events/${eventId}/rounds/${next}/startedAt`]: startedAt
      });
    }
  } catch (error) { toast(firebaseError(error), "error"); }
}

function completedEvents() { return getEventsArray().filter((event) => event.meta.status === "finished").sort((a, b) => (b.meta.endedAt || 0) - (a.meta.endedAt || 0)); }

function renderAnalysisTab() {
  const events = completedEvents();
  const selected = state.adminEvents[state.selectedAnalysisId] || events[0];
  if (!selected) return `<div class="section-title"><div><h1>Detaylı analiz</h1><p>Etkinlik tamamlandığında öğrenci ve soru analizi burada oluşur.</p></div></div><article class="panel glass empty"><div><div class="empty-symbol">⌁</div><h3>Analiz için tamamlanmış etkinlik yok.</h3><p>İlk etkinliğin sona erdiğinde gerçek zamanlı veriler burada görünür.</p></div></article>`;
  if (state.selectedAnalysisId !== selected.id) state.selectedAnalysisId = selected.id;
  const participantIds = Object.keys(selected.participants || {});
  if (!state.selectedParticipantId || !selected.participants?.[state.selectedParticipantId]) state.selectedParticipantId = participantIds[0] || null;
  return `
    <div class="section-title"><div><h1>Detaylı analiz</h1><p>${esc(selected.meta.title)} · ${participantIds.length} katılımcı · ${selected.meta.questionCount} soru</p></div><select id="analysis-event" class="ghost-btn" data-action="change-analysis-event">${events.map((event) => `<option value="${event.id}" ${event.id === selected.id ? "selected" : ""}>${esc(event.meta.title)}</option>`).join("")}</select></div>
    <div class="admin-tabs" style="width:min(460px,100%);margin:0 0 18px"><button class="${state.analysisView === "student" ? "active" : ""}" data-action="analysis-view" data-view="student">Öğrenci analizi</button><button class="${state.analysisView === "question" ? "active" : ""}" data-action="analysis-view" data-view="question">Soru analizi</button></div>
    ${state.analysisView === "question" ? renderQuestionAnalysis(selected) : renderStudentAnalysis(selected)}`;
}

function renderStudentAnalysis(event) {
  const people = Object.entries(event.participants || {});
  const student = event.participants?.[state.selectedParticipantId];
  return `<div class="analysis-grid"><article class="analysis-list glass"><h2>Katılımcılar</h2>${people.length ? people.map(([uid, person]) => `<button class="analysis-person ${uid === state.selectedParticipantId ? "active" : ""}" data-action="select-participant" data-uid="${uid}"><span class="avatar">${esc(shortName(person.fullName || person.nickname))}</span><span><b>${esc(person.fullName || person.nickname)}</b><span>${person.score || 0} puan</span></span></button>`).join("") : `<p>Katılımcı verisi yok.</p>`}</article><article class="analysis-details glass">${student ? renderStudentDetails(event, student) : `<p>Bir öğrenci seç.</p>`}</article></div>`;
}

function renderStudentDetails(event, student) {
  const results = Object.values(student.results || {});
  const correct = results.filter((result) => result.correct).length;
  const timed = results.filter((result) => Number.isFinite(result.elapsed));
  const average = timed.length ? Math.round(timed.reduce((sum, result) => sum + result.elapsed, 0) / timed.length / 100) / 10 : 0;
  const questionAnalysis = Object.entries(event.roundResults || {}).map(([index, result]) => ({ index: Number(index), rate: result.correct / Math.max(1, result.correct + result.wrong) })).sort((a, b) => a.rate - b.rate);
  const fiveHard = questionAnalysis.slice(0, 5).map((x) => x.index);
  const fiveEasy = questionAnalysis.slice(-5).map((x) => x.index);
  const hardCorrect = fiveHard.filter((index) => student.results?.[index]?.correct).length;
  const easyCorrect = fiveEasy.filter((index) => student.results?.[index]?.correct).length;
  return `<h2>${esc(student.fullName || student.nickname)}</h2><p>Bireysel performans özeti.</p><div class="metric-row"><div class="metric"><strong>${correct}/${event.meta.questionCount}</strong><span>Doğru yanıt</span></div><div class="metric"><strong>${average}s</strong><span>Ortalama çözüm</span></div><div class="metric"><strong>${student.score || 0}</strong><span>Toplam puan</span></div></div><p><b>Zorlayıcı 5 soruda:</b> ${hardCorrect}/${fiveHard.length || 0} doğru · <b>En kolay 5 soruda:</b> ${easyCorrect}/${fiveEasy.length || 0} doğru</p><div class="question-result-list">${Array.from({ length: event.meta.questionCount }, (_, index) => { const result = student.results?.[index]; return `<div class="question-result ${result?.correct ? "correct" : "wrong"}"><span>${index + 1}. soru</span><span>${result ? result.correct ? "Doğru" : "Yanlış" : "Boş"}</span><span>${Number.isFinite(result?.elapsed) ? `${(result.elapsed / 1000).toFixed(1)} sn` : "—"}</span></div>`; }).join("")}</div>`;
}

function renderQuestionAnalysis(event) {
  const rows = Array.from({ length: event.meta.questionCount }, (_, index) => {
    const result = event.roundResults?.[index] || {};
    const answered = (result.correct || 0) + (result.wrong || 0);
    const fastest = result.fastest;
    const slowest = result.slowest;
    return `<article class="panel glass" style="margin-bottom:12px"><h2>${index + 1}. soru</h2><p>${esc(event.public?.questions?.[index]?.text || "Soru metni bulunamadı.")}</p><div class="metric-row"><div class="metric"><strong>${result.correct || 0}</strong><span>Doğru / ${answered} cevap</span></div><div class="metric"><strong>${averageQuestionSeconds(event, index)}s</strong><span>Ortalama çözüm</span></div><div class="metric"><strong>${result.unanswered || 0}</strong><span>Boş bırakıldı</span></div></div><p>⚡ İlk çözen: <b>${fastest ? `${esc(fastest.fullName || fastest.nickname)} (${(fastest.elapsed / 1000).toFixed(1)} sn)` : "—"}</b><br>🕊️ Son çözen: <b>${slowest ? `${esc(slowest.fullName || slowest.nickname)} (${(slowest.elapsed / 1000).toFixed(1)} sn)` : "—"}</b></p></article>`;
  }).join("");
  return `<section>${rows}</section>`;
}

function averageQuestionSeconds(event, index) {
  const seconds = Object.values(event.participants || {}).map((person) => person.results?.[index]?.elapsed).filter(Number.isFinite);
  if (!seconds.length) return "—";
  return (seconds.reduce((sum, duration) => sum + duration, 0) / seconds.length / 1000).toFixed(1);
}

async function kickParticipant(eventId, uid) {
  const participant = state.adminEvents[eventId]?.participants?.[uid];
  if (!participant) return toast("Bu katılımcı artık lobide değil.", "error");
  const approved = window.confirm(`${participant.fullName} adlı katılımcıyı lobiden çıkarmak istediğine emin misin?`);
  if (!approved) return;
  try {
    await update(ref(db), {
      [`events/${eventId}/kicked/${uid}`]: { kickedAt: serverTimestamp(), kickedBy: state.admin.uid },
      [`events/${eventId}/participants/${uid}`]: null,
      [`events/${eventId}/leaderboard/${uid}`]: null
    });
    toast(`${participant.fullName || participant.nickname} lobiden çıkarıldı.`, "success");
  } catch (error) { toast(firebaseError(error), "error"); }
}

async function signOutAdmin() {
  try {
    clearListeners();
    await signOut(auth);
    state.admin = null;
    state.currentPage = "landing";
    render();
  } catch (error) { toast(firebaseError(error), "error"); }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action } = target.dataset;
  if (action === "home" || action === "back-landing") { event.preventDefault(); clearListeners(); state.currentPage = "landing"; render(); }
  if (action === "admin-home") { event.preventDefault(); state.adminTab = "lobby"; render(); }
  if (action === "show-join") joinModal();
  if (action === "show-qr") qrModal();
  if (action === "show-admin-login") adminLoginModal();
  if (action === "close-modal") closeModal();
  if (action === "copy-link") { await navigator.clipboard.writeText(`${location.origin}${location.pathname}`); toast("Katılım bağlantısı kopyalandı.", "success"); }
  if (action === "admin-tab") { state.adminTab = target.dataset.tab; render(); }
  if (action === "go-create") { state.adminTab = "create"; render(); }
  if (action === "apply-builder") applyBuilder();
  if (action === "save-draft") { const issue = validateDraft(); toast(issue || "Taslak tamam; katılıma açmaya hazır.", issue ? "error" : "success"); }
  if (action === "publish-activity") publishActivity();
  if (action === "mark-ready") markReady();
  if (action === "answer") answerQuestion(Number(target.dataset.option));
  if (action === "start-event") startEvent(target.dataset.eventId);
  if (action === "show-results") showResults(target.dataset.eventId);
  if (action === "advance-event") advanceEvent(target.dataset.eventId);
  if (action === "open-analysis") { state.selectedAnalysisId = target.dataset.eventId; state.adminTab = "analysis"; render(); }
  if (action === "analysis-view") { state.analysisView = target.dataset.view; render(); }
  if (action === "select-participant") { state.selectedParticipantId = target.dataset.uid; render(); }
  if (action === "kick-participant") kickParticipant(target.dataset.eventId, target.dataset.uid);
  if (action === "sign-out") signOutAdmin();
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "join-form") { event.preventDefault(); submitJoin(event.target); }
  if (event.target.id === "admin-login-form") { event.preventDefault(); submitAdminLogin(event.target); }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "analysis-event") { state.selectedAnalysisId = event.target.value; state.selectedParticipantId = null; render(); }
});

onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
  state.serverTimeOffset = Number(snapshot.val() || 0);
});
onAuthStateChanged(auth, (user) => { state.firebaseUser = user; });
renderLanding();
