import { formatMoney as formatAmount } from "/pricing.js?v=20261109-byn";

const elements = {
  loginScreen: document.querySelector("#login-screen"),
  loginForm: document.querySelector("#login-form"),
  loginStatus: document.querySelector("#login-status"),
  password: document.querySelector("#admin-password"),
  passwordToggle: document.querySelector(".password-toggle"),
  app: document.querySelector("#admin-app"),
  sidebar: document.querySelector("#sidebar"),
  menuButton: document.querySelector("#admin-menu-button"),
  sidebarClose: document.querySelector(".sidebar-close"),
  logout: document.querySelector("#logout-button"),
  adminEmail: document.querySelector("#admin-email"),
  setupNotice: document.querySelector("#setup-notice"),
  databaseState: document.querySelector("#database-state"),
  leadsBody: document.querySelector("#leads-body"),
  loading: document.querySelector("#loading-state"),
  empty: document.querySelector("#empty-state"),
  search: document.querySelector("#search-input"),
  refresh: document.querySelector("#refresh-button"),
  export: document.querySelector("#export-button"),
  listTitle: document.querySelector("#list-title"),
  listCount: document.querySelector("#list-count"),
  pagination: document.querySelector("#pagination"),
  pageLabel: document.querySelector("#page-label"),
  prevPage: document.querySelector("#prev-page"),
  nextPage: document.querySelector("#next-page"),
  drawer: document.querySelector("#lead-drawer"),
  drawerBackdrop: document.querySelector("#drawer-backdrop"),
  drawerClose: document.querySelector("#drawer-close"),
  drawerId: document.querySelector("#drawer-id"),
  drawerAvatar: document.querySelector("#drawer-avatar"),
  drawerName: document.querySelector("#drawer-name"),
  drawerContact: document.querySelector("#drawer-contact"),
  copyContact: document.querySelector("#copy-contact"),
  drawerCreated: document.querySelector("#drawer-created"),
  drawerEstimate: document.querySelector("#drawer-estimate"),
  drawerSource: document.querySelector("#drawer-source"),
  drawerCountry: document.querySelector("#drawer-country"),
  drawerTask: document.querySelector("#drawer-task"),
  drawerTags: document.querySelector("#drawer-tags"),
  drawerStatus: document.querySelector("#drawer-status"),
  drawerNotes: document.querySelector("#drawer-notes"),
  updatedNote: document.querySelector("#updated-note"),
  save: document.querySelector("#save-button"),
  delete: document.querySelector("#delete-button"),
  toast: document.querySelector("#admin-toast")
};

const state = {
  status: "all",
  query: "",
  page: 1,
  pages: 1,
  total: 0,
  leads: [],
  current: null,
  databaseReady: false,
  loading: false
};

const statusLabels = {
  all: "Все заявки",
  new: "Новая",
  in_progress: "В работе",
  won: "Успешная",
  closed: "Закрыта"
};

const projectLabels = {
  start: "Сайт / AI",
  landing: "Лендинг",
  ai: "AI-ассистент",
  business: "Сайт + автоматизация",
  rag: "RAG / база знаний",
  voice: "Голосовой бот",
  bot: "Telegram-бот",
  custom: "Индивидуальный проект"
};

let toastTimer;
let searchTimer;

function showToast(message, icon = "✓") {
  elements.toast.querySelector("i").textContent = icon;
  elements.toast.querySelector("span").textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3500);
}

function formatMoney(value, currency = "USD") {
  const amount = formatAmount(value, currency);
  return amount === null ? "По смете" : `от ${amount}`;
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(date).replace(" г.", "");
}

function relativeDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff >= 0 && diff < 60_000) return "только что";
  if (diff >= 0 && diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} мин назад`;
  if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  return formatDate(value, true);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.method && options.method !== "GET" ? { "x-tkeep-admin": "1" } : {}),
      ...(options.headers || {})
    }
  });
  let result = {};
  try { result = await response.json(); } catch { result = { message: "Неожиданный ответ сервера" }; }
  if (!response.ok) {
    const error = new Error(result.message || "Ошибка запроса");
    error.status = response.status;
    error.code = result.code;
    throw error;
  }
  return result;
}

function showLogin(message = "") {
  elements.app.hidden = true;
  elements.loginScreen.hidden = false;
  elements.loginScreen.classList.remove("exit");
  elements.loginStatus.textContent = message;
  setTimeout(() => elements.password.focus(), 80);
}

function showApp() {
  elements.app.hidden = false;
  elements.loginScreen.classList.add("exit");
  setTimeout(() => { elements.loginScreen.hidden = true; }, 530);
}

async function checkSession() {
  try {
    const result = await api("/api/admin/session");
    elements.adminEmail.textContent = result.admin?.email || "admin@tkeep.ru";
    state.databaseReady = Boolean(result.database);
    elements.setupNotice.hidden = state.databaseReady;
    elements.databaseState.textContent = state.databaseReady ? "D1 подключена" : "D1 не подключена";
    showApp();
    if (state.databaseReady) await loadLeads();
    else showDatabasePlaceholder();
  } catch (error) {
    if (error.code === "password_not_configured") showLogin("Сначала добавьте секрет ADMIN_PASSWORD в Worker");
    else showLogin();
  }
}

elements.passwordToggle.addEventListener("click", () => {
  const visible = elements.password.type === "text";
  elements.password.type = visible ? "password" : "text";
  elements.passwordToggle.setAttribute("aria-label", visible ? "Показать пароль" : "Скрыть пароль");
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = elements.loginForm.querySelector(".login-submit");
  button.disabled = true;
  button.querySelector("span").textContent = "Проверяем…";
  elements.loginStatus.textContent = "";
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: elements.password.value })
    });
    elements.password.value = "";
    await checkSession();
  } catch (error) {
    elements.loginStatus.textContent = error.message;
    elements.password.select();
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Войти";
  }
});

elements.logout.addEventListener("click", async () => {
  try { await api("/api/admin/logout", { method: "POST" }); } catch { /* cookie is still cleared on normal path */ }
  state.leads = [];
  state.current = null;
  showLogin("Вы вышли из админки");
});

function showDatabasePlaceholder() {
  elements.loading.hidden = true;
  elements.empty.hidden = false;
  elements.empty.querySelector("h3").textContent = "Подключите D1";
  elements.empty.querySelector("p").textContent = "После подключения базы заявки начнут сохраняться автоматически.";
  elements.leadsBody.innerHTML = "";
  elements.pagination.hidden = true;
  elements.export.setAttribute("aria-disabled", "true");
  elements.export.addEventListener("click", preventDisabledExport);
}

function preventDisabledExport(event) {
  if (!state.databaseReady) {
    event.preventDefault();
    showToast("Сначала подключите D1", "!");
  }
}

function setLoading(loading) {
  state.loading = loading;
  elements.loading.hidden = !loading;
  if (loading) {
    elements.empty.hidden = true;
    elements.leadsBody.innerHTML = "";
  }
  elements.refresh.disabled = loading;
  elements.refresh.querySelector("svg").style.animation = loading ? "spin .8s linear infinite" : "";
}

async function loadLeads() {
  if (!state.databaseReady || state.loading) return;
  setLoading(true);
  const params = new URLSearchParams({ page: String(state.page), limit: "50" });
  if (state.status !== "all") params.set("status", state.status);
  if (state.query) params.set("q", state.query);

  try {
    const result = await api(`/api/admin/leads?${params}`);
    state.leads = result.leads || [];
    state.total = result.pagination?.total || 0;
    state.pages = result.pagination?.pages || 1;
    renderStats(result.stats || {});
    renderLeads();
    renderPagination();
  } catch (error) {
    if (error.status === 401) {
      showLogin("Сессия истекла — войдите снова");
      return;
    }
    if (error.code === "database_not_configured" || error.code === "database_not_migrated") {
      state.databaseReady = false;
      elements.setupNotice.hidden = false;
      elements.setupNotice.querySelector("p").textContent = error.message;
      showDatabasePlaceholder();
      return;
    }
    showToast(error.message, "!");
    elements.empty.hidden = false;
    elements.empty.querySelector("h3").textContent = "Не удалось загрузить";
    elements.empty.querySelector("p").textContent = "Попробуйте обновить страницу.";
  } finally {
    setLoading(false);
  }
}

function renderStats(stats) {
  const values = {
    "stat-total": stats.total || 0,
    "stat-new": stats.new || 0,
    "stat-progress": stats.in_progress || 0,
    "stat-today": stats.today || 0,
    "nav-total": stats.total || 0,
    "nav-new": stats.new || 0,
    "nav-progress": stats.in_progress || 0,
    "nav-won": stats.won || 0,
    "nav-closed": stats.closed || 0
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element && element.textContent !== String(value)) {
      element.textContent = value;
      element.animate([{ transform: "translateY(4px)", opacity: .4 }, { transform: "none", opacity: 1 }], { duration: 260 });
    }
  });
}

function renderLeads() {
  elements.loading.hidden = true;
  elements.empty.hidden = state.leads.length > 0;
  elements.listTitle.textContent = statusLabels[state.status];
  elements.listCount.textContent = `${state.total} ${pluralize(state.total, "запись", "записи", "записей")}`;

  elements.leadsBody.innerHTML = state.leads.map((lead) => {
    const type = projectLabels[lead.projectType] || lead.projectType || "Не указано";
    const task = lead.task || "Описание не добавлено";
    return `<tr data-id="${escapeHtml(lead.id)}" tabindex="0">
      <td><div class="client-cell"><span class="table-avatar">${escapeHtml((lead.name || "?").charAt(0))}</span><div><strong>${escapeHtml(lead.name)}</strong><small>${escapeHtml(lead.contact)}</small></div></div></td>
      <td><div class="task-cell"><strong>${escapeHtml(type)}</strong><small>${escapeHtml(task)}</small></div></td>
      <td class="budget-cell">${escapeHtml(formatMoney(lead.estimate, lead.currency))}</td>
      <td class="date-cell">${escapeHtml(relativeDate(lead.createdAt))}</td>
      <td><span class="status-badge ${escapeHtml(lead.status)}">${escapeHtml(statusLabels[lead.status] || lead.status)}</span></td>
      <td><span class="row-arrow">→</span></td>
    </tr>`;
  }).join("");

  elements.leadsBody.querySelectorAll("tr").forEach((row) => {
    const open = () => openDrawer(state.leads.find((lead) => lead.id === row.dataset.id));
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
  });
}

function pluralize(number, one, few, many) {
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function renderPagination() {
  elements.pagination.hidden = state.total <= 50;
  elements.pageLabel.textContent = `Страница ${state.page} из ${state.pages}`;
  elements.prevPage.disabled = state.page <= 1;
  elements.nextPage.disabled = state.page >= state.pages;
}

document.querySelectorAll("[data-status]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-status]").forEach((item) => item.classList.toggle("active", item === button));
    state.status = button.dataset.status;
    state.page = 1;
    elements.sidebar.classList.remove("open");
    loadLeads();
  });
});

elements.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = elements.search.value.trim();
    state.page = 1;
    loadLeads();
  }, 320);
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !elements.app.hidden) {
    event.preventDefault();
    elements.search.focus();
  }
  if (event.key === "Escape") {
    closeDrawer();
    elements.sidebar.classList.remove("open");
  }
});

elements.refresh.addEventListener("click", () => loadLeads());
elements.prevPage.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; loadLeads(); } });
elements.nextPage.addEventListener("click", () => { if (state.page < state.pages) { state.page += 1; loadLeads(); } });
elements.menuButton.addEventListener("click", () => elements.sidebar.classList.add("open"));
elements.sidebarClose.addEventListener("click", () => elements.sidebar.classList.remove("open"));

function openDrawer(lead) {
  if (!lead) return;
  state.current = { ...lead };
  elements.drawerId.textContent = lead.id;
  elements.drawerAvatar.textContent = (lead.name || "?").charAt(0);
  elements.drawerName.textContent = lead.name;
  elements.drawerContact.textContent = lead.contact;
  elements.drawerCreated.textContent = formatDate(lead.createdAt, true);
  elements.drawerEstimate.textContent = formatMoney(lead.estimate, lead.currency);
  elements.drawerSource.textContent = lead.source || "—";
  elements.drawerCountry.textContent = lead.country || "—";
  elements.drawerTask.textContent = lead.task || "Описание задачи не добавлено.";
  elements.drawerStatus.value = lead.status;
  elements.drawerNotes.value = lead.notes || "";
  elements.updatedNote.textContent = lead.updatedBy ? `Последнее изменение: ${lead.updatedBy}, ${formatDate(lead.updatedAt, true)}` : "";

  const tags = [projectLabels[lead.projectType] || lead.projectType, ...(lead.extras || []).map(extraLabel)].filter(Boolean);
  elements.drawerTags.innerHTML = tags.length ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") : "<span>Без категории</span>";
  elements.drawer.classList.add("open");
  elements.drawer.setAttribute("aria-hidden", "false");
  elements.drawerBackdrop.classList.add("show");
  document.body.classList.add("drawer-open");
}

function extraLabel(value) {
  return { crm: "CRM и интеграции", support: "Поддержка 3 месяца", urgent: "Срочный запуск" }[value] || value;
}

function closeDrawer() {
  elements.drawer.classList.remove("open");
  elements.drawer.setAttribute("aria-hidden", "true");
  elements.drawerBackdrop.classList.remove("show");
  document.body.classList.remove("drawer-open");
}

elements.drawerClose.addEventListener("click", closeDrawer);
elements.drawerBackdrop.addEventListener("click", closeDrawer);
elements.copyContact.addEventListener("click", async () => {
  if (!state.current) return;
  try {
    await navigator.clipboard.writeText(state.current.contact);
    showToast("Контакт скопирован");
  } catch {
    showToast("Не удалось скопировать", "!");
  }
});

elements.save.addEventListener("click", async () => {
  if (!state.current) return;
  elements.save.disabled = true;
  elements.save.querySelector("span").textContent = "Сохраняем…";
  try {
    const result = await api(`/api/admin/leads/${encodeURIComponent(state.current.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: elements.drawerStatus.value, notes: elements.drawerNotes.value })
    });
    state.current = result.lead;
    showToast("Изменения сохранены");
    await loadLeads();
    const refreshed = state.leads.find((lead) => lead.id === state.current.id);
    if (refreshed) openDrawer(refreshed);
    else closeDrawer();
  } catch (error) {
    if (error.status === 401) showLogin("Сессия истекла — войдите снова");
    else showToast(error.message, "!");
  } finally {
    elements.save.disabled = false;
    elements.save.querySelector("span").textContent = "Сохранить";
  }
});

elements.delete.addEventListener("click", async () => {
  if (!state.current) return;
  const confirmed = window.confirm(`Удалить заявку от ${state.current.name}? Это действие нельзя отменить.`);
  if (!confirmed) return;
  elements.delete.disabled = true;
  try {
    await api(`/api/admin/leads/${encodeURIComponent(state.current.id)}`, { method: "DELETE" });
    closeDrawer();
    showToast("Заявка удалена");
    await loadLeads();
  } catch (error) {
    showToast(error.message, "!");
  } finally {
    elements.delete.disabled = false;
  }
});

checkSession();
