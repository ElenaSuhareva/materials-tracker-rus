import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  collection,
  getDocs,
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBu3pE0y6T_HE1n7NdU41RgEmRDy4T0Xes",
  authDomain: "materials-tracker-rus.firebaseapp.com",
  projectId: "materials-tracker-rus",
  storageBucket: "materials-tracker-rus.firebasestorage.app",
  messagingSenderId: "629436061135",
  appId: "1:629436061135:web:6cefa2a375803abfb3aeba"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const fields = [
  "id",
  "section",
  "rule",
  "grade",
  "ruleNotes",
  "exerciseNotes",
  "board",
  "interactive",
  "homework"
];
const stageFields = fields.slice(4);
const stageLabels = {
  ruleNotes: "Конспект правила",
  exerciseNotes: "Конспект заданий",
  board: "Доска",
  interactive: "Интерактив",
  homework: "ДЗ"
};
const statusScores = {
  "запланировано": 0,
  "в работе": 50,
  "готово": 100
};
const els = Object.fromEntries(
  ["rows", "search", "sectionFilter", "progressFilter", "refresh", "empty", "count"]
    .map(id => [id, document.getElementById(id)])
);
let data = [];
let loadError = "";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function normalizedStatus(value) {
  return String(value ?? "").trim().toLocaleLowerCase("ru");
}

function progressOf(item) {
  const total = stageFields.reduce(
    (sum, field) => sum + (statusScores[normalizedStatus(item[field])] ?? 0),
    0
  );
  return Math.round(total / stageFields.length);
}

function statusClass(value) {
  const normalized = normalizedStatus(value);
  if (normalized === "готово") return "done";
  if (normalized === "в работе") return "work";
  if (normalized === "запланировано") return "plan";
  return "";
}

function render() {
  const query = els.search.value.trim().toLocaleLowerCase("ru");
  const section = els.sectionFilter.value;
  const progress = els.progressFilter.value;
  const filtered = data.filter(item => {
    const itemProgress = progressOf(item);
    const searchable = `${item.section} ${item.rule}`.toLocaleLowerCase("ru");
    const matchesText = !query || searchable.includes(query);
    const matchesSection = !section || item.section === section;
    const matchesProgress = !progress
      || (progress === "ready" && itemProgress === 100)
      || (progress === "work" && itemProgress > 0 && itemProgress < 100)
      || (progress === "planned" && itemProgress === 0);
    return matchesText && matchesSection && matchesProgress;
  });

  els.rows.innerHTML = filtered.map((item, index) => {
    const progressValue = progressOf(item);
    const stages = stageFields.map(field => (
      `<td data-label="${escapeHTML(stageLabels[field])}"><span class="status ${statusClass(item[field])}">${escapeHTML(item[field] || "—")}</span></td>`
    )).join("");
    return `<tr style="animation-delay:${Math.min(index * 35, 280)}ms"><td>${escapeHTML(item.id)}</td><td class="section">${escapeHTML(item.section)}</td><td class="rule">${escapeHTML(item.rule)}</td><td>${escapeHTML(item.grade)}</td>${stages}<td><div class="row-progress ${progressValue === 100 ? "complete" : ""}" style="--progress:${progressValue}%" aria-label="Готовность ${progressValue}%"><span class="bar"><i></i></span><span class="percent">${progressValue}%</span></div></td></tr>`;
  }).join("");

  if (loadError) {
    els.empty.textContent = loadError;
    els.empty.style.display = "block";
    els.count.textContent = loadError;
    return;
  }

  els.empty.textContent = "По вашему запросу ничего не найдено.";
  els.empty.style.display = filtered.length ? "none" : "block";
  els.count.textContent = `Показано ${filtered.length} из ${data.length} тем`;
}

function updateSections() {
  const selected = els.sectionFilter.value;
  const sections = [...new Set(data.map(item => item.section).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru"));
  els.sectionFilter.innerHTML = '<option value="">Все разделы</option>'
    + sections.map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join("");
  if (sections.includes(selected)) els.sectionFilter.value = selected;
}

async function loadData() {
  els.refresh.disabled = true;
  els.refresh.textContent = "Обновляю…";
  els.count.textContent = "Загрузка данных из Firestore…";
  loadError = "";

  try {
    const snapshot = await getDocs(collection(db, "materials"));
    data = snapshot.docs.map(documentSnapshot => {
      const source = documentSnapshot.data();
      return Object.fromEntries(fields.map(field => [field, source[field] ?? ""]));
    }).sort((a, b) => {
      const first = Number(a.id);
      const second = Number(b.id);
      if (Number.isFinite(first) && Number.isFinite(second)) return first - second;
      if (Number.isFinite(first)) return -1;
      if (Number.isFinite(second)) return 1;
      return String(a.id).localeCompare(String(b.id), "ru", { numeric: true });
    });

    updateSections();
  } catch (error) {
    console.error("Не удалось загрузить коллекцию materials из Firestore:", error);
    data = [];
    updateSections();
    loadError = "Не удалось загрузить данные из Firestore. Проверьте подключение и права доступа, затем нажмите «Обновить».";
  } finally {
    render();
    els.refresh.disabled = false;
    els.refresh.textContent = "Обновить";
  }
}

[els.search, els.sectionFilter, els.progressFilter]
  .forEach(control => control.addEventListener("input", render));
els.refresh.addEventListener("click", loadData);
loadData();
