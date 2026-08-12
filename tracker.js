import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { collection, doc, getDocs, getFirestore, updateDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBu3pE0y6T_HE1n7NdU41RgEmRDy4T0Xes",
  authDomain: "materials-tracker-rus.firebaseapp.com",
  projectId: "materials-tracker-rus",
  storageBucket: "materials-tracker-rus.firebasestorage.app",
  messagingSenderId: "629436061135",
  appId: "1:629436061135:web:6cefa2a375803abfb3aeba"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const stageFields = ["ruleNotes", "exerciseNotes", "board", "interactive", "homework"];
const stageLabels = { ruleNotes: "Конспект правила", exerciseNotes: "Конспект заданий", board: "Доска", interactive: "Интерактив", homework: "ДЗ" };
const scores = { "План": 0, "В работе": 50, "Готово": 100 };
const els = Object.fromEntries(["authCheck","loginView","workspace","loginForm","email","password","loginButton","loginError","userLogin","logoutButton","workspaceError","search","sectionFilter","progressFilter","refresh","rows","empty","count"].map(id => [id, document.getElementById(id)]));
let materials = [];
let currentUser = null;
let loadSequence = 0;

function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[char]); }
function normalizeStatus(value) { return value === "Запланировано" || value === "План" ? "План" : value === "В работе" ? "В работе" : value === "Готово" ? "Готово" : "План"; }
function statusClass(value) { return value === "Готово" ? "done" : value === "В работе" ? "work" : "plan"; }
function progressOf(item) { return Math.round(stageFields.reduce((sum, field) => sum + scores[normalizeStatus(item[field])], 0) / stageFields.length); }
function loginErrorMessage(error) {
  if (error?.code === "auth/invalid-email") return "Введите корректный адрес электронной почты.";
  if (["auth/invalid-credential","auth/user-not-found","auth/wrong-password"].includes(error?.code)) return "Неверный логин или пароль.";
  if (error?.code === "auth/too-many-requests") return "Слишком много попыток входа. Попробуйте немного позже.";
  if (error?.code === "auth/network-request-failed") return "Не удалось подключиться к сервису входа. Проверьте интернет-соединение.";
  return "Не удалось выполнить вход. Попробуйте ещё раз.";
}

function statusOptions(selected) {
  return Object.keys(scores).map(status => `<option value="${status}" ${status === selected ? "selected" : ""}>${status}</option>`).join("");
}

function render() {
  const query = els.search.value.trim().toLocaleLowerCase("ru");
  const section = els.sectionFilter.value;
  const filter = els.progressFilter.value;
  const filtered = materials.filter(item => {
    const progress = progressOf(item);
    return (!query || `${item.section} ${item.rule}`.toLocaleLowerCase("ru").includes(query))
      && (!section || item.section === section)
      && (!filter || (filter === "ready" && progress === 100) || (filter === "work" && progress > 0 && progress < 100) || (filter === "planned" && progress === 0));
  });

  els.rows.innerHTML = filtered.map((item, index) => {
    const progress = progressOf(item);
    const statuses = stageFields.map(field => {
      const value = normalizeStatus(item[field]);
      return `<td><select class="status-select ${statusClass(value)}" data-document="${escapeHTML(item.documentId)}" data-field="${field}" aria-label="${escapeHTML(stageLabels[field])} для ${escapeHTML(item.rule)}">${statusOptions(value)}</select></td>`;
    }).join("");
    return `<tr style="animation-delay:${Math.min(index * 30,240)}ms" data-document="${escapeHTML(item.documentId)}"><td class="rule">${escapeHTML(item.rule)}</td><td>${escapeHTML(item.grade)}</td>${statuses}<td><div class="row-progress ${progress === 100 ? "complete" : ""}" style="--progress:${progress}%"><span class="bar"><i></i></span><span class="percent">${progress}%</span></div><div class="save-state" aria-live="polite"></div></td></tr>`;
  }).join("");
  els.empty.style.display = filtered.length ? "none" : "block";
  els.count.textContent = `Показано ${filtered.length} из ${materials.length} тем`;
}

function updateSections() {
  const selected = els.sectionFilter.value;
  const sections = [...new Set(materials.map(item => item.section).filter(Boolean))].sort((a,b) => a.localeCompare(b,"ru"));
  els.sectionFilter.innerHTML = '<option value="">Все разделы</option>' + sections.map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join("");
  if (sections.includes(selected)) els.sectionFilter.value = selected;
}

async function loadMaterials() {
  if (!currentUser) return;
  const sequence = ++loadSequence;
  els.refresh.disabled = true;
  els.refresh.textContent = "Обновляю…";
  els.workspaceError.textContent = "";
  els.count.textContent = "Загрузка данных из Firestore…";
  try {
    const snapshot = await getDocs(collection(db,"materials"));
    if (!currentUser || sequence !== loadSequence) return;
    materials = snapshot.docs.map(snapshotDoc => {
      const value = snapshotDoc.data();
      return { documentId: snapshotDoc.id, id: value.id ?? "", section: value.section ?? "", rule: value.rule ?? "", grade: value.grade ?? "", ...Object.fromEntries(stageFields.map(field => [field, normalizeStatus(value[field])])) };
    }).sort((a,b) => {
      const first = Number(a.id);
      const second = Number(b.id);
      if (Number.isFinite(first) && Number.isFinite(second)) return first - second;
      if (Number.isFinite(first)) return -1;
      if (Number.isFinite(second)) return 1;
      return String(a.id).localeCompare(String(b.id), "ru", { numeric: true });
    });
    updateSections();
    render();
  } catch (error) {
    console.error("Не удалось загрузить материалы:", error);
    if (currentUser && sequence === loadSequence) { materials = []; updateSections(); render(); els.workspaceError.textContent = "Не удалось загрузить материалы. Проверьте подключение и права доступа, затем нажмите «Обновить»."; }
  } finally {
    if (currentUser && sequence === loadSequence) { els.refresh.disabled = false; els.refresh.textContent = "Обновить"; }
  }
}

async function changeStatus(select) {
  if (!currentUser || select.disabled) return;
  const item = materials.find(value => value.documentId === select.dataset.document);
  const field = select.dataset.field;
  if (!item || !stageFields.includes(field)) return;
  const previous = normalizeStatus(item[field]);
  const next = normalizeStatus(select.value);
  const row = select.closest("tr");
  const state = row.querySelector(".save-state");
  if (previous === next) return;

  item[field] = next;
  select.className = `status-select ${statusClass(next)}`;
  const progress = progressOf(item);
  const progressElement = row.querySelector(".row-progress");
  progressElement.style.setProperty("--progress", `${progress}%`);
  progressElement.classList.toggle("complete", progress === 100);
  progressElement.querySelector(".percent").textContent = `${progress}%`;
  select.disabled = true;
  state.className = "save-state";
  state.textContent = "Сохраняю…";
  try {
    await updateDoc(doc(db,"materials",item.documentId), { [field]: next });
    state.className = "save-state saved";
    state.textContent = "Сохранено";
    window.setTimeout(() => { if (state.textContent === "Сохранено") state.textContent = ""; }, 1800);
  } catch (error) {
    console.error("Не удалось сохранить статус:", error);
    item[field] = previous;
    select.value = previous;
    select.className = `status-select ${statusClass(previous)}`;
    const rollback = progressOf(item);
    progressElement.style.setProperty("--progress", `${rollback}%`);
    progressElement.classList.toggle("complete", rollback === 100);
    progressElement.querySelector(".percent").textContent = `${rollback}%`;
    state.className = "save-state error";
    state.textContent = "Не удалось сохранить. Изменение отменено.";
  } finally { select.disabled = false; }
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  els.authCheck.hidden = true;
  els.loginView.hidden = Boolean(user);
  els.workspace.hidden = !user;
  els.loginError.textContent = "";
  if (user) { els.userLogin.textContent = user.email ?? ""; loadMaterials(); }
  else { loadSequence++; materials = []; els.rows.innerHTML = ""; els.userLogin.textContent = ""; }
});

els.loginForm.addEventListener("submit", async event => {
  event.preventDefault(); els.loginError.textContent = ""; els.loginButton.disabled = true; els.loginButton.textContent = "Вхожу…";
  try { await signInWithEmailAndPassword(auth,els.email.value.trim(),els.password.value); els.loginForm.reset(); }
  catch (error) { els.loginError.textContent = loginErrorMessage(error); }
  finally { els.loginButton.disabled = false; els.loginButton.textContent = "Войти"; }
});
els.logoutButton.addEventListener("click", async () => { els.logoutButton.disabled = true; try { await signOut(auth); } catch (error) { els.workspaceError.textContent = "Не удалось выйти. Попробуйте ещё раз."; } finally { els.logoutButton.disabled = false; } });
[els.search,els.sectionFilter,els.progressFilter].forEach(control => control.addEventListener("input",render));
els.refresh.addEventListener("click",loadMaterials);
els.rows.addEventListener("change", event => { if (event.target.matches(".status-select")) changeStatus(event.target); });
