import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore, updateDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

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
const stageLabels = { ruleNotes: "Конспект темы", exerciseNotes: "Конспект заданий", board: "Доска", interactive: "Интерактив", homework: "ДЗ" };
const scores = { "План": 0, "В работе": 50, "Готово": 100 };
const elementIds = ["authLoading","loginView","workspace","loginForm","email","password","loginButton","loginError","logoutButton","workspaceError","search","sectionFilter","progressFilter","addTopicButton","rows","empty","count","topicModal","topicForm","topicModalTitle","topicModalIntro","topicSection","newSectionButton","newSectionField","newSectionName","topicRule","topicGrade","topicError","cancelTopicButton","saveTopicButton","deleteModal","deleteQuestion","deleteError","cancelDeleteButton","confirmDeleteButton","toast","focusPanel","focusTopic","focusMaterial","focusTimer","crystalScene","finishFocusButton","cancelFocusButton","focusStartModal","focusStartTopic","focusMaterials","cancelFocusStartButton","focusFinishModal","focusFinishForm","focusDuration","focusResult","focusFinishError","continueFocusButton","saveFocusButton","focusParticles"];
const els = Object.fromEntries(elementIds.map(id => [id, document.getElementById(id)]));
let materials = [];
let sections = [];
let currentUser = null;
let loadSequence = 0;
let editingDocumentId = null;
let deletingDocumentId = null;
let toastTimer = null;
const rowNumberOffset = 0;
const focusStorageKey = "materialsTrackerFocusSession";
let activeFocus = null;
let pendingFocusItem = null;
let focusTimerId = null;

const authLoadingTimer = window.setTimeout(() => {
  els.authLoading.hidden = false;
}, 400);

function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[char]); }
function normalizeStatus(value) { return value === "Запланировано" || value === "План" ? "План" : value === "В работе" ? "В работе" : value === "Готово" ? "Готово" : "План"; }
function statusClass(value) { return value === "Готово" ? "done" : value === "В работе" ? "work" : "plan"; }
function progressOf(item) { return Math.round(stageFields.reduce((sum, field) => sum + scores[normalizeStatus(item[field])], 0) / stageFields.length); }
function sortMaterials() {
  materials.sort((a,b) => {
    const first = Number(a.id);
    const second = Number(b.id);
    if (Number.isFinite(first) && Number.isFinite(second)) return first - second;
    if (Number.isFinite(first)) return -1;
    if (Number.isFinite(second)) return 1;
    return String(a.id).localeCompare(String(b.id), "ru", { numeric: true });
  });
}
function loginErrorMessage(error) {
  if (error?.code === "auth/invalid-email") return "Введите корректный адрес электронной почты.";
  if (["auth/invalid-credential","auth/user-not-found","auth/wrong-password"].includes(error?.code)) return "Неверный логин или пароль.";
  if (error?.code === "auth/too-many-requests") return "Слишком много попыток входа. Попробуйте немного позже.";
  if (error?.code === "auth/network-request-failed") return "Не удалось подключиться к сервису входа. Проверьте интернет-соединение.";
  return "Не удалось выполнить вход. Попробуйте ещё раз.";
}
function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;
  toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, 2200);
}
function statusOptions(selected) { return Object.keys(scores).map(status => `<option value="${status}" ${status === selected ? "selected" : ""}>${status}</option>`).join(""); }
function sectionOptions(selected = "") { return sections.map(value => `<option value="${escapeHTML(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(value)}</option>`).join(""); }

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
  els.rows.innerHTML = filtered.map((item,index) => {
    const progress = progressOf(item);
    const statuses = stageFields.map(field => {
      const value = normalizeStatus(item[field]);
      return `<td><select class="status-select ${statusClass(value)}" data-document="${escapeHTML(item.documentId)}" data-field="${field}" aria-label="${escapeHTML(stageLabels[field])} для ${escapeHTML(item.rule)}">${statusOptions(value)}</select></td>`;
    }).join("");
    const focused = activeFocus?.documentId === item.documentId ? " focus-active" : "";
    return `<tr class="${focused}" style="animation-delay:${Math.min(index * 30,240)}ms" data-document="${escapeHTML(item.documentId)}"><td class="row-number">${rowNumberOffset + index + 1}</td><td class="rule">${escapeHTML(item.rule)}</td><td>${escapeHTML(item.grade)}</td>${statuses}<td><div class="row-progress ${progress === 100 ? "complete" : ""}" style="--progress:${progress}%"><span class="bar"><i></i></span><span class="percent">${progress}%</span></div><div class="save-state" aria-live="polite"></div></td><td class="actions"><span class="action-buttons"><button class="icon-button focus-button start-focus" type="button" title="Начать работу" aria-label="Начать работу">▶</button><button class="icon-button edit-topic" type="button" title="Редактировать" aria-label="Редактировать тему ${escapeHTML(item.rule)}"><span class="pencil-icon">✎</span></button><button class="icon-button delete-topic" type="button" title="Удалить" aria-label="Удалить тему ${escapeHTML(item.rule)}">×</button></span></td></tr>`;
  }).join("");
  els.empty.style.display = filtered.length ? "none" : "block";
  els.count.textContent = `Показано ${filtered.length} из ${materials.length} тем`;
}

function updateSectionControls(preferred = "") {
  const currentFilter = els.sectionFilter.value;
  const materialSections = materials.map(item => item.section).filter(Boolean);
  sections = [...new Set([...sections,...materialSections])].sort((a,b) => a.localeCompare(b,"ru"));
  els.sectionFilter.innerHTML = '<option value="">Все разделы</option>' + sectionOptions(currentFilter);
  if (sections.includes(currentFilter)) els.sectionFilter.value = currentFilter;
  const formValue = preferred || els.topicSection.value;
  els.topicSection.innerHTML = sectionOptions(formValue);
  if (sections.includes(formValue)) els.topicSection.value = formValue;
}

async function loadWorkspaceData() {
  if (!currentUser) return;
  const sequence = ++loadSequence;
  els.workspaceError.textContent = "";
  els.count.textContent = "Загрузка данных из Firestore…";
  try {
    const [materialsSnapshot,sectionsSnapshot] = await Promise.all([getDocs(collection(db,"materials")),getDocs(collection(db,"sections"))]);
    if (!currentUser || sequence !== loadSequence) return;
    materials = materialsSnapshot.docs.map(snapshotDoc => {
      const value = snapshotDoc.data();
      return { documentId: snapshotDoc.id, id: value.id ?? "", section: value.section ?? "", rule: value.rule ?? "", grade: value.grade ?? "", ...Object.fromEntries(stageFields.map(field => [field,normalizeStatus(value[field])])) };
    });
    sections = sectionsSnapshot.docs.map(snapshotDoc => String(snapshotDoc.data().name ?? "").trim()).filter(Boolean);
    sortMaterials();
    updateSectionControls();
    restoreFocusSession();
    render();
  } catch (error) {
    console.error("Не удалось загрузить рабочее пространство:",error);
    if (currentUser && sequence === loadSequence) { materials = []; sections = []; updateSectionControls(); render(); els.workspaceError.textContent = "Не удалось загрузить данные. Проверьте подключение и права доступа и перезагрузите страницу."; }
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
  updateRowProgress(row,item);
  select.disabled = true;
  state.className = "save-state";
  state.textContent = "Сохраняю…";
  try {
    await updateDoc(doc(db,"materials",item.documentId), { [field]: next });
    state.className = "save-state saved";
    state.textContent = "Сохранено";
    window.setTimeout(() => { if (state.textContent === "Сохранено") state.textContent = ""; },1800);
  } catch (error) {
    console.error("Не удалось сохранить статус:",error);
    item[field] = previous;
    select.value = previous;
    select.className = `status-select ${statusClass(previous)}`;
    updateRowProgress(row,item);
    state.className = "save-state error";
    state.textContent = "Не удалось сохранить. Изменение отменено.";
  } finally { select.disabled = false; }
}

function updateRowProgress(row,item) {
  const progress = progressOf(item);
  const element = row.querySelector(".row-progress");
  element.style.setProperty("--progress",`${progress}%`);
  element.classList.toggle("complete",progress === 100);
  element.querySelector(".percent").textContent = `${progress}%`;
}

function openTopicModal(item = null) {
  if (!currentUser) return;
  editingDocumentId = item?.documentId ?? null;
  els.topicForm.reset();
  els.topicModalTitle.textContent = item ? "Редактировать тему" : "Добавить тему";
  els.topicModalIntro.textContent = item ? "Измените основные сведения о теме." : "Заполните основные сведения о новой теме.";
  els.saveTopicButton.textContent = item ? "Сохранить" : "Добавить";
  els.topicError.textContent = "";
  els.newSectionField.hidden = true;
  els.newSectionName.required = false;
  els.newSectionButton.textContent = "+ Новый раздел";
  updateSectionControls(item?.section ?? "");
  els.topicRule.value = item?.rule ?? "";
  els.topicGrade.value = item?.grade ?? "";
  els.topicModal.hidden = false;
  (sections.length ? els.topicSection : els.newSectionButton).focus();
  if (!sections.length) toggleNewSection(true);
}

function toggleNewSection(show = els.newSectionField.hidden) {
  els.newSectionField.hidden = !show;
  els.newSectionName.required = show;
  els.newSectionButton.textContent = show ? "Выбрать раздел" : "+ Новый раздел";
  els.topicSection.disabled = show;
  if (show) els.newSectionName.focus();
}

function setTopicPending(pending) {
  els.saveTopicButton.disabled = pending;
  els.cancelTopicButton.disabled = pending;
  els.newSectionButton.disabled = pending;
  els.saveTopicButton.textContent = pending ? "Сохраняю…" : editingDocumentId ? "Сохранить" : "Добавить";
}

async function saveTopic(event) {
  event.preventDefault();
  if (!currentUser || els.saveTopicButton.disabled) return;
  els.topicError.textContent = "";
  const rule = els.topicRule.value.trim();
  const grade = Number(els.topicGrade.value);
  let section = els.topicSection.value;
  if (!rule) { els.topicError.textContent = "Введите название темы."; return; }
  if (!Number.isInteger(grade) || grade < 1) { els.topicError.textContent = "Введите корректный номер класса."; return; }
  setTopicPending(true);
  try {
    if (!els.newSectionField.hidden) {
      const newName = els.newSectionName.value.trim();
      if (!newName) throw new Error("section-name-required");
      if (!sections.includes(newName)) await addDoc(collection(db,"sections"),{ name:newName });
      section = newName;
      sections.push(newName);
      sections = [...new Set(sections)].sort((a,b) => a.localeCompare(b,"ru"));
      updateSectionControls(newName);
      toggleNewSection(false);
    }
    if (!section) throw new Error("section-required");
    if (editingDocumentId) {
      await updateDoc(doc(db,"materials",editingDocumentId),{ section,rule,grade });
      const item = materials.find(value => value.documentId === editingDocumentId);
      if (item) Object.assign(item,{ section,rule,grade });
      if (activeFocus?.documentId === editingDocumentId) {
        activeFocus.topicName = rule;
        localStorage.setItem(focusStorageKey,JSON.stringify(activeFocus));
        els.focusTopic.textContent = rule;
      }
      updateSectionControls(section);
      render();
      closeTopicModal(true);
      showToast("Изменения сохранены");
    } else {
      const latestSnapshot = await getDocs(collection(db,"materials"));
      const maxId = latestSnapshot.docs.reduce((maximum,snapshotDoc) => {
        const id = Number(snapshotDoc.data().id);
        return Number.isFinite(id) ? Math.max(maximum,id) : maximum;
      },0);
      const value = { id:maxId + 1,section,rule,grade,ruleNotes:"План",exerciseNotes:"План",board:"План",interactive:"План",homework:"План" };
      const created = await addDoc(collection(db,"materials"),value);
      materials.push({ documentId:created.id,...value });
      sortMaterials();
      updateSectionControls(section);
      els.search.value = "";
      els.sectionFilter.value = "";
      els.progressFilter.value = "";
      render();
      closeTopicModal(true);
      showToast("Тема добавлена");
    }
  } catch (error) {
    console.error("Не удалось сохранить тему:",error);
    if (error.message === "section-name-required") els.topicError.textContent = "Введите название нового раздела.";
    else if (error.message === "section-required") els.topicError.textContent = "Выберите раздел.";
    else els.topicError.textContent = "Не удалось сохранить тему. Проверьте подключение и попробуйте ещё раз.";
  } finally { setTopicPending(false); }
}

function closeTopicModal(force = false) {
  if (els.saveTopicButton.disabled && !force) return;
  els.topicModal.hidden = true;
  editingDocumentId = null;
}

function openDeleteModal(item) {
  if (!currentUser) return;
  deletingDocumentId = item.documentId;
  els.deleteQuestion.textContent = `Удалить тему “${item.rule}”? Восстановить её будет нельзя`;
  els.deleteError.textContent = "";
  els.deleteModal.hidden = false;
  els.cancelDeleteButton.focus();
}

function closeDeleteModal() {
  if (els.confirmDeleteButton.disabled) return;
  els.deleteModal.hidden = true;
  deletingDocumentId = null;
}

function formatDuration(milliseconds) {
  const total = Math.max(0,Math.floor(milliseconds / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2,"0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2,"0");
  const seconds = String(total % 60).padStart(2,"0");
  return `${hours}:${minutes}:${seconds}`;
}

function crystalStage(elapsed) {
  const minutes = elapsed / 60000;
  if (minutes >= 30) return 5;
  if (minutes >= 20) return 4;
  if (minutes >= 10) return 3;
  if (minutes >= 5) return 2;
  return 1;
}

function updateFocusDisplay() {
  if (!activeFocus) return;
  const elapsed = Date.now() - activeFocus.startedAt;
  els.focusTimer.textContent = formatDuration(elapsed);
  els.crystalScene.className = `crystal-scene stage-${crystalStage(elapsed)}`;
}

function startFocusClock() {
  window.clearInterval(focusTimerId);
  updateFocusDisplay();
  focusTimerId = window.setInterval(updateFocusDisplay,1000);
}

function applyFocusMode() {
  const enabled = Boolean(activeFocus);
  document.body.classList.toggle("focus-mode",enabled);
  els.focusPanel.hidden = !enabled;
  els.focusParticles.hidden = !enabled;
  if (enabled) {
    els.focusTopic.textContent = activeFocus.topicName;
    els.focusMaterial.textContent = activeFocus.materialName;
    startFocusClock();
  } else {
    window.clearInterval(focusTimerId);
    focusTimerId = null;
  }
  render();
}

function restoreFocusSession() {
  if (activeFocus) { applyFocusMode(); return; }
  try {
    const saved = JSON.parse(localStorage.getItem(focusStorageKey));
    if (!saved?.documentId || !stageFields.includes(saved.materialField) || !Number.isFinite(saved.startedAt)) return;
    activeFocus = saved;
    applyFocusMode();
  } catch (error) {
    console.warn("Не удалось восстановить фокус-сессию:",error);
    localStorage.removeItem(focusStorageKey);
  }
}

function openFocusStart(item) {
  if (activeFocus) { showToast("Сначала завершите текущую сессию"); return; }
  pendingFocusItem = item;
  els.focusStartTopic.textContent = item.rule;
  els.focusMaterials.innerHTML = stageFields.map(field => `<button class="material-choice" type="button" data-field="${field}">▶ <span>${escapeHTML(stageLabels[field] === "Конспект темы" ? "Конспект правила" : stageLabels[field])}</span></button>`).join("");
  els.focusStartModal.hidden = false;
}

function beginFocus(field) {
  if (!pendingFocusItem || !stageFields.includes(field)) return;
  const materialName = stageLabels[field] === "Конспект темы" ? "Конспект правила" : stageLabels[field];
  activeFocus = { documentId:pendingFocusItem.documentId,topicName:pendingFocusItem.rule,materialField:field,materialName,startedAt:Date.now() };
  localStorage.setItem(focusStorageKey,JSON.stringify(activeFocus));
  pendingFocusItem = null;
  els.focusStartModal.hidden = true;
  els.search.value = "";
  els.sectionFilter.value = "";
  els.progressFilter.value = "";
  applyFocusMode();
}

function cancelFocus() {
  if (!activeFocus || !window.confirm("Отменить текущую фокус-сессию? Статус материала не изменится.")) return;
  window.clearInterval(focusTimerId);
  focusTimerId = null;
  els.crystalScene.style.opacity = "0";
  localStorage.removeItem(focusStorageKey);
  window.setTimeout(() => {
    activeFocus = null;
    els.crystalScene.style.opacity = "";
    applyFocusMode();
  },350);
}

function openFocusFinish() {
  if (!activeFocus) return;
  window.clearInterval(focusTimerId);
  focusTimerId = null;
  els.focusDuration.textContent = `Продолжительность работы: ${formatDuration(Date.now() - activeFocus.startedAt)}`;
  els.focusResult.value = "keep";
  els.focusFinishError.textContent = "";
  els.focusFinishModal.hidden = false;
}

function continueFocus() {
  els.focusFinishModal.hidden = true;
  startFocusClock();
}

async function saveFocusResult(event) {
  event.preventDefault();
  if (!activeFocus || els.saveFocusButton.disabled) return;
  const result = els.focusResult.value;
  const item = materials.find(value => value.documentId === activeFocus.documentId);
  els.focusFinishError.textContent = "";
  els.saveFocusButton.disabled = true;
  els.continueFocusButton.disabled = true;
  els.saveFocusButton.textContent = "Сохраняю…";
  try {
    if (result !== "keep") {
      if (!item) throw new Error("material-not-found");
      await updateDoc(doc(db,"materials",activeFocus.documentId),{ [activeFocus.materialField]:result });
      item[activeFocus.materialField] = result;
    }
    localStorage.removeItem(focusStorageKey);
    els.crystalScene.classList.add("celebrate");
    document.body.classList.add("focus-celebrate");
    els.focusFinishModal.hidden = true;
    window.clearInterval(focusTimerId);
    focusTimerId = null;
    window.setTimeout(() => {
      activeFocus = null;
      els.crystalScene.classList.remove("celebrate");
      document.body.classList.remove("focus-celebrate");
      applyFocusMode();
      showToast("Сессия завершена");
    },650);
  } catch (error) {
    console.error("Не удалось завершить фокус-сессию:",error);
    els.focusFinishError.textContent = "Не удалось сохранить результат. Сессия остаётся активной — проверьте подключение и попробуйте ещё раз.";
  } finally {
    els.saveFocusButton.disabled = false;
    els.continueFocusButton.disabled = false;
    els.saveFocusButton.textContent = "Сохранить результат";
  }
}

async function confirmDelete() {
  if (!currentUser || !deletingDocumentId || els.confirmDeleteButton.disabled) return;
  els.confirmDeleteButton.disabled = true;
  els.cancelDeleteButton.disabled = true;
  els.confirmDeleteButton.textContent = "Удаляю…";
  els.deleteError.textContent = "";
  try {
    await deleteDoc(doc(db,"materials",deletingDocumentId));
    if (activeFocus?.documentId === deletingDocumentId) {
      localStorage.removeItem(focusStorageKey);
      activeFocus = null;
      applyFocusMode();
    }
    materials = materials.filter(item => item.documentId !== deletingDocumentId);
    render();
    els.deleteModal.hidden = true;
    deletingDocumentId = null;
    showToast("Тема удалена");
  } catch (error) {
    console.error("Не удалось удалить тему:",error);
    els.deleteError.textContent = "Не удалось удалить тему. Проверьте подключение и попробуйте ещё раз.";
  } finally {
    els.confirmDeleteButton.disabled = false;
    els.cancelDeleteButton.disabled = false;
    els.confirmDeleteButton.textContent = "Удалить";
  }
}

onAuthStateChanged(auth,user => {
  window.clearTimeout(authLoadingTimer);
  els.authLoading.hidden = true;
  currentUser = user;
  els.loginView.hidden = Boolean(user);
  els.workspace.hidden = !user;
  els.loginError.textContent = "";
  if (user) loadWorkspaceData();
  else { loadSequence++; materials = []; sections = []; els.rows.innerHTML = ""; els.topicModal.hidden = true; els.deleteModal.hidden = true; els.focusStartModal.hidden = true; els.focusFinishModal.hidden = true; document.body.classList.remove("focus-mode"); els.focusPanel.hidden = true; els.focusParticles.hidden = true; window.clearInterval(focusTimerId); }
});

els.loginForm.addEventListener("submit",async event => { event.preventDefault(); els.loginError.textContent = ""; els.loginButton.disabled = true; els.loginButton.textContent = "Вхожу…"; try { await signInWithEmailAndPassword(auth,els.email.value.trim(),els.password.value); els.loginForm.reset(); } catch (error) { els.loginError.textContent = loginErrorMessage(error); } finally { els.loginButton.disabled = false; els.loginButton.textContent = "Войти"; } });
els.logoutButton.addEventListener("click",async () => { els.logoutButton.disabled = true; try { await signOut(auth); } catch (error) { els.workspaceError.textContent = "Не удалось выйти. Попробуйте ещё раз."; } finally { els.logoutButton.disabled = false; } });
[els.search,els.sectionFilter,els.progressFilter].forEach(control => control.addEventListener("input",render));
els.addTopicButton.addEventListener("click",() => openTopicModal());
els.newSectionButton.addEventListener("click",() => toggleNewSection());
els.topicForm.addEventListener("submit",saveTopic);
els.cancelTopicButton.addEventListener("click",closeTopicModal);
els.cancelDeleteButton.addEventListener("click",closeDeleteModal);
els.confirmDeleteButton.addEventListener("click",confirmDelete);
els.cancelFocusStartButton.addEventListener("click",() => { els.focusStartModal.hidden = true; pendingFocusItem = null; });
els.focusMaterials.addEventListener("click",event => { const choice = event.target.closest("[data-field]"); if (choice) beginFocus(choice.dataset.field); });
els.finishFocusButton.addEventListener("click",openFocusFinish);
els.cancelFocusButton.addEventListener("click",cancelFocus);
els.continueFocusButton.addEventListener("click",continueFocus);
els.focusFinishForm.addEventListener("submit",saveFocusResult);
els.rows.addEventListener("change",event => { if (event.target.matches(".status-select")) changeStatus(event.target); });
els.rows.addEventListener("click",event => {
  const row = event.target.closest("tr");
  const item = row && materials.find(value => value.documentId === row.dataset.document);
  if (!item) return;
  if (event.target.closest(".start-focus")) openFocusStart(item);
  if (event.target.closest(".edit-topic")) openTopicModal(item);
  if (event.target.closest(".delete-topic")) openDeleteModal(item);
});
document.addEventListener("keydown",event => { if (event.key === "Escape") { if (!els.focusFinishModal.hidden) continueFocus(); else if (!els.focusStartModal.hidden) { els.focusStartModal.hidden = true; pendingFocusItem = null; } else if (!els.topicModal.hidden) closeTopicModal(); else if (!els.deleteModal.hidden) closeDeleteModal(); } });
