import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, increment, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

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
const eventTypeLabels = { material_ready:"Материал готов", "material ready":"Материал готов", quick_progress:"Быстрый результат", "quick progress":"Быстрый результат", focus_time:"Фокус-сессия завершена", focus_session:"Фокус-сессия завершена", "focus session":"Фокус-сессия завершена", task_completed:"Задача выполнена", "task completed":"Задача выполнена", topic_ready:"Тема полностью готова", topic_completed:"Тема полностью готова", "topic completed":"Тема полностью готова" };
const scores = { "План": 0, "В работе": 50, "Готово": 100 };
const elementIds = ["authLoading","loginView","workspace","loginForm","email","password","loginButton","loginError","logoutButton","workspaceError","search","sectionFilter","progressFilter","addTopicButton","rows","empty","count","topicModal","topicForm","topicModalTitle","topicModalIntro","topicSection","newSectionButton","newSectionField","newSectionName","topicRule","topicGrade","topicError","cancelTopicButton","saveTopicButton","deleteModal","deleteQuestion","deleteError","cancelDeleteButton","confirmDeleteButton","toast","focusPanel","focusTopic","focusMaterial","focusTimer","crystalScene","finishFocusButton","cancelFocusButton","focusStartModal","focusStartTopic","focusMaterials","cancelFocusStartButton","focusFinishModal","focusFinishForm","focusDuration","focusResult","focusFinishError","continueFocusButton","saveFocusButton","focusParticles","profileButton","profileInitial","profileAvatar","profileLargeInitial","profileLargeAvatar","profileName","coinBalance","headerCoinBalance","profileCoinBalance","efficiencyRing","efficiencyValue","efficiencyNote","dailyTasks","todayModal","todayTopic","todayMaterials","cancelTodayButton","profileModal","profileSubtitle","profileCoins","profileMinutes","profileSessions","historyList","closeProfileButton"];
elementIds.push("crystalImage");
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
let profile = { displayName:"",coins:0,totalFocusMinutes:0,focusSessionsCount:0,completedTasksCount:0 };
let dailyTasks = [];
let rewardHistory = [];
let focusSessionHistory = new Map();
let pendingTodayItem = null;
const encouragements = ["Отличная работа — ещё один шаг сделан.","Хороший темп. Продолжайте в своём ритме.","Маленький шаг тоже меняет общую картину.","Спокойно, последовательно, результативно.","Сегодняшний прогресс уже заметен.","Работа движется — это главное.","Прекрасно. Можно выбрать следующий шаг."];

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
function showRewardToast(message,coins) {
  window.clearTimeout(toastTimer);
  els.toast.innerHTML=`<span class="reward-toast"><img class="coin-icon reward" src="./assets/ui/coin.png" alt=""><span>${escapeHTML(message)} <strong>+${coins}</strong></span></span>`;
  els.toast.hidden=false;
  toastTimer=window.setTimeout(()=>{ els.toast.hidden=true; },2200);
}
function localDate() { const now=new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; }
function safeKey(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g,"_"); }
function userPath(name) { return collection(db,"userProfiles",currentUser.uid,name); }
function updateProfileUI() {
  const name=profile.displayName || currentUser?.displayName || "Профиль";
  const initial=name.slice(0,1).toLocaleUpperCase("ru"); const avatarPath=profile.role==="owner"?"./assets/ui/avatar.png":profile.role==="guest"?"./assets/ui/guest-avatar.png":"";
  els.profileName.textContent=name; els.profileInitial.textContent=initial; els.profileLargeInitial.textContent=initial;
  [[els.profileAvatar,els.profileInitial],[els.profileLargeAvatar,els.profileLargeInitial]].forEach(([image,fallback])=>{ image.onerror=()=>{ image.hidden=true; fallback.hidden=false; }; if(avatarPath){ image.hidden=false; fallback.hidden=true; image.src=avatarPath; }else{ image.removeAttribute("src"); image.hidden=true; fallback.hidden=false; } });
  const coins=profile.coins||0; els.coinBalance.textContent=coins; els.profileCoins.textContent=coins; els.profileButton.setAttribute("aria-label",`Открыть профиль ${name}. Баланс: ${coins} монет`); els.headerCoinBalance.setAttribute("aria-label",`Баланс: ${coins} монет`); els.profileCoinBalance.setAttribute("aria-label",`Баланс: ${coins} монет`); els.profileMinutes.textContent=profile.totalFocusMinutes||0; els.profileSessions.textContent=profile.focusSessionsCount||0; els.profileSubtitle.textContent=name;
}
function renderDailyTasks() {
  if (!dailyTasks.length) { els.dailyTasks.innerHTML='<p class="intro">План свободен — добавьте материал из действий темы.</p>'; return; }
  els.dailyTasks.innerHTML=dailyTasks.map(task=>`<div class="daily-task ${task.completed?"done":""}" data-id="${escapeHTML(task.id)}"><button class="task-check" type="button" role="checkbox" aria-checked="${task.completed}" title="${task.completed?"Вернуть в работу":"Отметить выполненной"}" aria-label="${task.completed?"Вернуть задачу в работу":"Отметить задачу выполненной"}">${task.completed?"✓":""}</button><div><b>${escapeHTML(task.topicTitle)}</b><small>${escapeHTML(task.materialLabel)}</small></div><span><button class="tiny-action task-focus" type="button" title="Начать фокус" aria-label="Начать фокус"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6Z"/></svg></button> <button class="tiny-action task-remove" type="button" title="Убрать из плана" aria-label="Убрать из плана"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button></span></div>`).join("");
}
function renderEfficiency() { const total=dailyTasks.length; const completed=dailyTasks.filter(task=>task.completed).length; const percent=total?Math.round(completed/total*100):0; els.efficiencyRing.style.setProperty("--value",percent); els.efficiencyValue.textContent=`${percent}%`; els.efficiencyNote.textContent=total?`Выполнено ${completed} из ${total} задач на сегодня.`:"Сегодняшних задач пока нет."; }
function formatHistoryDuration(seconds) { const total=Math.max(0,Math.floor(Number(seconds)||0)); if(!total)return ""; if(total<60)return `${total} сек`; if(total<3600)return `${Math.floor(total/60)} мин`; const hours=Math.floor(total/3600); const minutes=Math.floor(total%3600/60); return minutes?`${hours} ч ${minutes} мин`:`${hours} ч`; }
function formatHistoryDate(value) { const date=value?.toDate?.()||value; if(!(date instanceof Date)||Number.isNaN(date.getTime()))return ""; return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(date).replace(" в ",", "); }
function historyDetails(event) {
  const session=event.sessionId?focusSessionHistory.get(event.sessionId):null;
  const material=materials.find(item=>item.documentId===event.materialDocumentId);
  const task=event.taskId?dailyTasks.find(item=>item.id===event.taskId):null;
  return { title:eventTypeLabels[event.eventType]||"Награда за работу", topic:event.topicTitle||session?.topicTitle||material?.rule||task?.topicTitle||"", material:stageLabels[event.materialField]||stageLabels[session?.materialField]||event.materialLabel||session?.materialLabel||"", duration:formatHistoryDuration(event.durationSeconds??session?.durationSeconds), date:formatHistoryDate(event.createdAt) };
}
function renderRewardHistory() {
  if(!rewardHistory.length){ els.historyList.innerHTML='<p class="intro">История появится после завершённой работы.</p>'; return; }
  els.historyList.innerHTML=rewardHistory.slice(0,30).map(item=>{ const details=historyDetails(item); const topic=details.topic?`<p>${escapeHTML(details.topic)}</p>`:""; const work=[details.material,details.duration].filter(Boolean).join(" · "); const workLine=work?`<p>${escapeHTML(work)}</p>`:""; const date=details.date?`<time>${escapeHTML(details.date)}</time>`:"<span></span>"; const hasCoins=Number.isFinite(Number(item.coins)); const coins=hasCoins?`<span class="coin-balance" aria-label="Начислено ${item.coins} монет"><img class="coin-icon" src="./assets/ui/coin.png" alt=""><span>+${item.coins} монет</span></span>`:""; return `<article class="history-item"><h4>${escapeHTML(details.title)}</h4>${topic}${workLine}<div class="history-meta">${date}${coins}</div></article>`; }).join("");
}
function openProfile() { renderRewardHistory(); document.body.classList.add("profile-open"); els.profileModal.hidden=false; els.closeProfileButton.focus(); }
function closeProfile() { els.profileModal.hidden=true; document.body.classList.remove("profile-open"); els.profileButton.focus(); }
async function completeDailyTasks(materialDocumentId,materialField) {
  const date=localDate();
  const related=dailyTasks.filter(task=>task.date===date&&task.materialDocumentId===materialDocumentId&&task.materialField===materialField&&!task.completed);
  if (!related.length) { renderEfficiency(); return true; }
  try {
    await Promise.all(related.map(task=>updateDoc(doc(db,"userProfiles",currentUser.uid,"dailyTasks",task.id),{completed:true,completedAt:serverTimestamp()})));
    related.forEach(task=>{ task.completed=true; task.completedAt=new Date(); });
    renderDailyTasks(); renderEfficiency();
    return true;
  } catch (error) {
    console.error("Не удалось завершить сегодняшнюю задачу:",error);
    const message="Материал сохранён как готовый, но задачу на сегодня отметить не удалось. Попробуйте ещё раз.";
    els.workspaceError.textContent=message; showToast(message);
    return false;
  }
}
async function ensureProfile() {
  const ref=doc(db,"userProfiles",currentUser.uid); const snap=await getDoc(ref);
  const defaults={displayName:currentUser.displayName||"Пользователь",coins:0,totalFocusMinutes:0,focusSessionsCount:0,completedTasksCount:0,soundEnabled:false,animationsEnabled:true};
  if (!snap.exists()) await setDoc(ref,{...defaults,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  profile={...profile,...defaults,...(snap.exists()?snap.data():{})}; updateProfileUI();
}
async function loadPersonalData() {
  await ensureProfile(); const date=localDate();
  const [tasksSnap,rewardsSnap,sessionsSnap]=await Promise.all([getDocs(query(userPath("dailyTasks"),where("date","==",date))),getDocs(userPath("rewardEvents")),getDocs(userPath("focusSessions"))]);
  dailyTasks=tasksSnap.docs.map(d=>({id:d.id,...d.data()})); rewardHistory=rewardsSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); focusSessionHistory=new Map(sessionsSnap.docs.map(d=>[d.id,{id:d.id,...d.data()}])); renderDailyTasks(); renderEfficiency(); updateProfileUI();
}
async function awardCoins(eventKey,eventType,coins,details={}) {
  if (!coins) return 0; const eventRef=doc(db,"userProfiles",currentUser.uid,"rewardEvents",safeKey(eventKey)); const profileRef=doc(db,"userProfiles",currentUser.uid);
  const awarded=await runTransaction(db,async transaction=>{ if ((await transaction.get(eventRef)).exists()) return 0; transaction.set(eventRef,{eventKey,eventType,coins,...details,createdAt:serverTimestamp()}); transaction.set(profileRef,{coins:increment(coins),updatedAt:serverTimestamp()},{merge:true}); return coins; });
  if (awarded) { profile.coins=(profile.coins||0)+awarded; updateProfileUI(); showRewardToast(encouragements[Math.floor(Math.random()*encouragements.length)],awarded); } return awarded;
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
    return `<tr class="${focused}" style="animation-delay:${Math.min(index * 30,240)}ms" data-document="${escapeHTML(item.documentId)}"><td class="row-number">${rowNumberOffset + index + 1}</td><td class="rule">${escapeHTML(item.rule)}</td><td>${escapeHTML(item.grade)}</td>${statuses}<td><div class="row-progress ${progress === 100 ? "complete" : ""}" style="--progress:${progress}%"><span class="bar"><i></i></span><span class="percent">${progress}%</span></div><div class="save-state" aria-live="polite"></div></td><td class="actions"><span class="action-buttons"><button class="icon-button add-today" type="button" title="Добавить на сегодня" aria-label="Добавить на сегодня"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v3M18 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M12 12v5M9.5 14.5h5"/></svg></button><button class="icon-button edit-topic" type="button" title="Редактировать" aria-label="Редактировать тему ${escapeHTML(item.rule)}"><span class="pencil-icon">✎</span></button><button class="icon-button delete-topic" type="button" title="Удалить" aria-label="Удалить тему ${escapeHTML(item.rule)}">×</button></span></td></tr>`;
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
    await loadPersonalData().catch(error=>{ console.error("Не удалось загрузить профиль и задачи:",error); els.workspaceError.textContent="Трекер загружен, но профиль и задачи недоступны. Проверьте правила доступа Firestore."; });
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
    const forward=scores[next]>scores[previous];
    if (next === "Готово") {
      await completeDailyTasks(item.documentId,field);
      await awardCoins(`material-ready:${item.documentId}:${field}`,"material_ready",10,{materialDocumentId:item.documentId,materialField:field,taskId:null,sessionId:null});
      if (stageFields.every(name=>name===field?next==="Готово":item[name]==="Готово")) await awardCoins(`topic-ready:${item.documentId}`,"topic_ready",25,{materialDocumentId:item.documentId,materialField:null,taskId:null,sessionId:null});
    }
    if (forward) await setDoc(doc(db,"userProfiles",currentUser.uid,"dailyStats",localDate()),{statusPoints:increment(8),materialPoints:next==="Готово"?increment(12):increment(0),topicPoints:next==="Готово"&&stageFields.every(name=>name===field||item[name]==="Готово")?increment(20):increment(0)},{merge:true});
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
  const minutes=elapsed/60000; const asset=minutes>=30?"30":minutes>=20?"20":minutes>=10?"10":"05"; els.crystalImage.src=`./assets/focus-crystals/crystal-${asset}-min.png`;
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

function openToday(item) { pendingTodayItem=item; els.todayTopic.textContent=item.rule; els.todayMaterials.innerHTML=stageFields.map(field=>`<button class="material-choice" type="button" data-today-field="${field}"><span>＋</span><span>${escapeHTML(stageLabels[field])}</span></button>`).join(""); els.todayModal.hidden=false; }
async function addToday(field) {
  if (!pendingTodayItem||!stageFields.includes(field)) return; const date=localDate(); const id=safeKey(`${date}_${pendingTodayItem.documentId}_${field}`); const ref=doc(db,"userProfiles",currentUser.uid,"dailyTasks",id);
  if ((await getDoc(ref)).exists()) { showToast("Задача уже добавлена на сегодня"); els.todayModal.hidden=true; return; }
  const value={materialDocumentId:pendingTodayItem.documentId,topicTitle:pendingTodayItem.rule,materialField:field,materialLabel:stageLabels[field],date,completed:pendingTodayItem[field]==="Готово",createdAt:serverTimestamp(),completedAt:pendingTodayItem[field]==="Готово"?serverTimestamp():null}; await setDoc(ref,value); dailyTasks.push({id,...value}); renderDailyTasks(); renderEfficiency(); els.todayModal.hidden=true; showToast("Добавлено в план на сегодня");
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
    const endedAt=Date.now(); const durationSeconds=Math.max(1,Math.floor((endedAt-activeFocus.startedAt)/1000)); const previous=item?normalizeStatus(item[activeFocus.materialField]):"План";
    if (result !== "keep") {
      if (!item) throw new Error("material-not-found");
      await updateDoc(doc(db,"materials",activeFocus.documentId),{ [activeFocus.materialField]:result });
      item[activeFocus.materialField] = result;
    }
    if (result === "Готово") await completeDailyTasks(activeFocus.documentId,activeFocus.materialField);
    const sessionId=activeFocus.sessionId||safeKey(`${activeFocus.startedAt}_${activeFocus.documentId}_${activeFocus.materialField}`); activeFocus.sessionId=sessionId; localStorage.setItem(focusStorageKey,JSON.stringify(activeFocus));
    const sessionRef=doc(db,"userProfiles",currentUser.uid,"focusSessions",sessionId); const after=result==="keep"?previous:result; const timeCoins=Math.min(6,Math.floor(durationSeconds/600)); const quickCoins=durationSeconds<600&&scores[after]>scores[previous]?3:0;
    const sessionExists=(await getDoc(sessionRef)).exists();
    await setDoc(sessionRef,{materialDocumentId:activeFocus.documentId,topicTitle:activeFocus.topicName,materialField:activeFocus.materialField,materialLabel:activeFocus.materialName,startedAt:new Date(activeFocus.startedAt),endedAt:serverTimestamp(),durationSeconds,statusBefore:previous,statusAfter:after,coinsAwarded:timeCoins+quickCoins,completed:true});
    if (!sessionExists) { await setDoc(doc(db,"userProfiles",currentUser.uid),{totalFocusMinutes:increment(Math.floor(durationSeconds/60)),focusSessionsCount:increment(1),updatedAt:serverTimestamp()},{merge:true}); profile.totalFocusMinutes=(profile.totalFocusMinutes||0)+Math.floor(durationSeconds/60); profile.focusSessionsCount=(profile.focusSessionsCount||0)+1; }
    await awardCoins(`focus-time:${sessionRef.id}`,"focus_time",timeCoins,{materialDocumentId:activeFocus.documentId,materialField:activeFocus.materialField,taskId:null,sessionId:sessionRef.id});
    if (quickCoins) await awardCoins(`quick:${activeFocus.documentId}:${activeFocus.materialField}`,"quick_progress",quickCoins,{materialDocumentId:activeFocus.documentId,materialField:activeFocus.materialField,taskId:null,sessionId:sessionRef.id});
    await setDoc(doc(db,"userProfiles",currentUser.uid,"dailyStats",localDate()),{focusPoints:increment(Math.min(24,Math.floor(durationSeconds/600)*4))},{merge:true}); updateProfileUI();
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
  document.body.classList.toggle("workspace-open",Boolean(user));
  els.loginView.hidden = Boolean(user);
  els.workspace.hidden = !user;
  els.loginError.textContent = "";
  if (user) loadWorkspaceData();
  else { loadSequence++; materials = []; sections = []; els.rows.innerHTML = ""; els.topicModal.hidden = true; els.deleteModal.hidden = true; els.focusStartModal.hidden = true; els.focusFinishModal.hidden = true; els.profileModal.hidden = true; document.body.classList.remove("focus-mode","profile-open"); els.focusPanel.hidden = true; els.focusParticles.hidden = true; window.clearInterval(focusTimerId); }
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
els.cancelTodayButton.addEventListener("click",()=>{ els.todayModal.hidden=true; pendingTodayItem=null; });
els.todayMaterials.addEventListener("click",event=>{ const button=event.target.closest("[data-today-field]"); if(button) addToday(button.dataset.todayField); });
els.profileButton.addEventListener("click",openProfile);
els.closeProfileButton.addEventListener("click",closeProfile);
els.dailyTasks.addEventListener("click",async event=>{ const card=event.target.closest(".daily-task"); const task=card&&dailyTasks.find(value=>value.id===card.dataset.id); if(!task)return; if(event.target.closest(".task-check")){ const next=!task.completed; const button=event.target.closest(".task-check"); button.disabled=true; try{ await updateDoc(doc(db,"userProfiles",currentUser.uid,"dailyTasks",task.id),{completed:next,completedAt:next?serverTimestamp():null}); task.completed=next; task.completedAt=next?new Date():null; renderDailyTasks(); renderEfficiency(); showToast(next?"Задача выполнена":"Задача возвращена в работу"); }catch(error){ console.error("Не удалось изменить задачу:",error); showToast("Не удалось изменить задачу. Попробуйте ещё раз."); button.disabled=false; } return; } if(event.target.closest(".task-remove")){ await deleteDoc(doc(db,"userProfiles",currentUser.uid,"dailyTasks",task.id)); dailyTasks=dailyTasks.filter(value=>value.id!==task.id); renderDailyTasks(); renderEfficiency(); showToast("Убрано из плана на сегодня"); } if(event.target.closest(".task-focus")){ const item=materials.find(value=>value.documentId===task.materialDocumentId); if(item){ pendingFocusItem=item; beginFocus(task.materialField); } } });
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
  if (event.target.closest(".add-today")) openToday(item);
  if (event.target.closest(".edit-topic")) openTopicModal(item);
  if (event.target.closest(".delete-topic")) openDeleteModal(item);
});
document.addEventListener("keydown",event => { if (event.key === "Escape") { if (!els.focusFinishModal.hidden) continueFocus(); else if (!els.focusStartModal.hidden) { els.focusStartModal.hidden = true; pendingFocusItem = null; } else if (!els.todayModal.hidden) els.todayModal.hidden=true; else if(!els.profileModal.hidden) closeProfile(); else if (!els.topicModal.hidden) closeTopicModal(); else if (!els.deleteModal.hidden) closeDeleteModal(); } });
