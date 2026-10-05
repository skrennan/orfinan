const SUPABASE_URL = "https://ybozuddfavikmzogijeo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_v_1ssNGsFYZVny-XwTx6wQ_vbD8pBbS";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const CLOUD = {
  user: null,
  ready: false,
  suppressLocalSync: false,
  syncTimer: null,
  syncing: false,
  pendingSync: false,
  lastCloudUpdate: null,
  lastSyncedSignature: null,
  debounceMs: 3000,
  accountEpoch: 0,
  retryCount: 0,
  loggingOut: false,
  authEventEpoch: 0,
  conflict: false,
  remoteConflict: null,
};

function accountContext() {
  return { userId: CLOUD.user?.id || null, epoch: CLOUD.accountEpoch };
}

function isCurrentAccount(context) {
  return context.userId === (CLOUD.user?.id || null) && context.epoch === CLOUD.accountEpoch;
}

const LEGACY_KEYS = {
  settings: "orgfinan-settings-v2",
  transactions: "orgfinan-transactions-v2",
  paidFixed: "orgfinan-paid-fixed-v2",
  localModified: "orgfinan-local-modified-v4",
  lastSync: "orgfinan-last-sync-v4",
};

function accountStoragePrefix() {
  return CLOUD.user?.id ? `orgfinan:${CLOUD.user.id}` : "orgfinan:guest";
}

const KEYS = {
  get settings() { return `${accountStoragePrefix()}:settings`; },
  get transactions() { return `${accountStoragePrefix()}:transactions`; },
  get paidFixed() { return `${accountStoragePrefix()}:paidFixed`; },
  get localModified() { return `${accountStoragePrefix()}:localModified`; },
  get lastSync() { return `${accountStoragePrefix()}:lastSync`; },
  get syncDirty() { return `${accountStoragePrefix()}:syncDirty`; },
  get lastSignature() { return `${accountStoragePrefix()}:lastSignature`; },
  get profileCheckedAt() { return `${accountStoragePrefix()}:profileCheckedAt`; },
};

const state = {
  setupStep: 1,
  setupIncomes: [],
  setupFixed: [],
  deferredPrompt: null,
};

const expenseCategories = [
  ["Alimentação", "🍔"],
  ["Transporte", "🚗"],
  ["Casa", "🏠"],
  ["Contas", "🧾"],
  ["Lazer", "🎮"],
  ["Saúde", "💊"],
  ["Compras", "🛒"],
  ["Assinaturas", "📱"],
  ["Educação", "📚"],
  ["Outros", "📦"],
];

const incomeCategories = [
  ["Extra", "💵"],
  ["Venda", "🏷️"],
  ["Freelance", "💻"],
  ["Comissão", "📈"],
  ["Reembolso", "↩️"],
  ["Presente", "🎁"],
  ["Outros", "📦"],
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
$$('input[type="number"][step="0.01"]').forEach((input) => { input.max = String(Number.MAX_SAFE_INTEGER / 100); });

function loadJSON(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));

  const financialKeys = [KEYS.settings, KEYS.transactions, KEYS.paidFixed];
  if (financialKeys.includes(key) && !CLOUD.suppressLocalSync) {
    localStorage.setItem(KEYS.localModified, new Date().toISOString());
    localStorage.setItem(KEYS.syncDirty, "1");
    if (CLOUD.ready && CLOUD.user) scheduleCloudSync();
  }
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentMonth() {
  return localToday().slice(0, 7);
}

function monthLabel(yyyyMm) {
  const [year, month] = yyyyMm.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

function getSettings() {
  return loadJSON(KEYS.settings, null);
}

function getTransactions() {
  return loadJSON(KEYS.transactions, []);
}

function getPaidFixed() {
  return loadJSON(KEYS.paidFixed, {});
}

function savePaidFixed(data) {
  saveJSON(KEYS.paidFixed, data);
}

function hasCompletedSetup() {
  const settings = getSettings();
  return Boolean(
    settings &&
    settings.completed &&
    Array.isArray(settings.incomes) &&
    settings.incomes.length &&
    Array.isArray(settings.fixedExpenses) &&
    settings.fixedExpenses.length
  );
}

function showOnboarding() {
  $("#authScreen").classList.add("hidden");
  $("#onboarding").classList.remove("hidden");
  $("#dashboard").classList.add("hidden");
  $("#settingsBtn").classList.remove("hidden");
  $("#syncBtn").classList.remove("hidden");
  $("#accountBadge").classList.remove("hidden");
  renderSetupLists();
  setSetupStep(1);
}

function showDashboard() {
  $("#authScreen").classList.add("hidden");
  $("#onboarding").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  $("#settingsBtn").classList.remove("hidden");
  $("#syncBtn").classList.remove("hidden");
  $("#accountBadge").classList.remove("hidden");
  renderDashboard();
}

function setSetupStep(step) {
  state.setupStep = step;
  $$(".onboarding-step").forEach((el) => {
    el.classList.toggle("hidden", Number(el.dataset.step) !== step);
  });

  $$("[data-step-dot]").forEach((dot) => {
    const n = Number(dot.dataset.stepDot);
    dot.classList.toggle("active", n === step);
    dot.classList.toggle("done", n < step);
  });

  if (step === 3) renderSetupReview();
}

function renderMiniList(target, items, kind, removable = true, editable = false) {
  target.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = kind === "income" ? "Nenhuma receita mensal adicionada ainda." : "Nenhum gasto fixo adicionado ainda.";
    target.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const node = $("#miniItemTemplate").content.cloneNode(true);
    node.querySelector(".mini-title").textContent = item.name;
    node.querySelector(".mini-meta").textContent = kind === "income"
      ? `${item.type} • recebe dia ${item.day}`
      : `${item.category} • vence dia ${item.day}`;
    node.querySelector(".mini-value").textContent = money(item.amount);
    const actions = node.querySelector(".mini-actions");
    const del = node.querySelector(".mini-delete");
    if (editable) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "mini-edit";
      edit.textContent = "Editar";
      edit.dataset.id = item.id;
      edit.dataset.kind = kind;
      actions.insertBefore(edit, del);
    }
    if (removable) {
      del.dataset.id = item.id;
      del.dataset.kind = kind;
    } else {
      del.remove();
    }
    target.appendChild(node);
  });
}

function renderSetupLists() {
  renderMiniList($("#setupIncomeList"), state.setupIncomes, "income");
  renderMiniList($("#setupFixedList"), state.setupFixed, "fixed");
}

function renderSetupReview() {
  const income = state.setupIncomes.reduce((sum, item) => sum + item.amount, 0);
  const fixed = state.setupFixed.reduce((sum, item) => sum + item.amount, 0);
  const available = income - fixed;
  const commitment = income > 0 ? (fixed / income) * 100 : 0;

  $("#reviewIncome").textContent = money(income);
  $("#reviewFixed").textContent = money(fixed);
  $("#reviewAvailable").textContent = money(available);
  $("#reviewCommitment").textContent = `${commitment.toFixed(1).replace(".", ",")}%`;
  $("#reviewProgress").style.width = `${Math.min(commitment, 100)}%`;
}

$("#incomeSetupForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const item = {
    id: uid(),
    type: $("#setupIncomeType").value,
    name: $("#setupIncomeName").value.trim(),
    amount: Number($("#setupIncomeAmount").value),
    day: Math.min(31, Math.max(1, Number($("#setupIncomeDay").value))),
  };

  if (!item.name || item.amount <= 0) return;

  state.setupIncomes.push(item);
  $("#setupIncomeAmount").value = "";
  renderSetupLists();
  toast("Receita mensal adicionada.");
});

$("#fixedSetupForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const item = {
    id: uid(),
    name: $("#setupFixedName").value.trim(),
    amount: Number($("#setupFixedAmount").value),
    category: $("#setupFixedCategory").value,
    day: Math.min(31, Math.max(1, Number($("#setupFixedDay").value))),
  };

  if (!item.name || item.amount <= 0) return;

  state.setupFixed.push(item);
  $("#setupFixedName").value = "";
  $("#setupFixedAmount").value = "";
  renderSetupLists();
  toast("Gasto fixo adicionado.");
});

function handleSetupDelete(event) {
  const button = event.target.closest(".mini-delete");
  if (!button) return;

  const { id, kind } = button.dataset;
  if (kind === "income") {
    state.setupIncomes = state.setupIncomes.filter((item) => item.id !== id);
  } else if (kind === "fixed") {
    state.setupFixed = state.setupFixed.filter((item) => item.id !== id);
  }

  renderSetupLists();
}

$("#setupIncomeList").addEventListener("click", handleSetupDelete);
$("#setupFixedList").addEventListener("click", handleSetupDelete);

$("#goStep2").addEventListener("click", () => {
  if (!state.setupIncomes.length) {
    toast("Cadastre pelo menos uma receita mensal.");
    return;
  }
  setSetupStep(2);
});

$("#backStep1").addEventListener("click", () => setSetupStep(1));

$("#goStep3").addEventListener("click", () => {
  if (!state.setupFixed.length) {
    toast("Cadastre pelo menos um gasto fixo.");
    return;
  }
  setSetupStep(3);
});

$("#backStep2").addEventListener("click", () => setSetupStep(2));

$("#finishSetup").addEventListener("click", () => {
  if (!state.setupIncomes.length || !state.setupFixed.length) return;

  const settings = {
    completed: true,
    createdAt: Date.now(),
    incomes: state.setupIncomes,
    fixedExpenses: state.setupFixed,
  };

  saveJSON(KEYS.settings, settings);
  $("#monthFilter").value = currentMonth();
  toast("Configuração concluída.");
  showDashboard();
});

function selectedTransactionType() {
  return $('input[name="transactionType"]:checked').value;
}

function fillTransactionCategories() {
  const type = selectedTransactionType();
  const categories = type === "income" ? incomeCategories : expenseCategories;
  const select = $("#transactionCategory");
  select.innerHTML = "";

  categories.forEach(([name, icon]) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${icon} ${name}`;
    select.appendChild(option);
  });
}

$$('input[name="transactionType"]').forEach((input) => {
  input.addEventListener("change", fillTransactionCategories);
});

function categoryIcon(category, type) {
  const source = type === "income" ? incomeCategories : expenseCategories;
  const found = source.find(([name]) => name === category);
  return found ? found[1] : "•";
}

$("#transactionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!$("#transactionDescription").value.trim()) {
    $("#transactionDescription").setCustomValidity("Escreva uma descrição para o lançamento.");
    $("#transactionDescription").reportValidity();
    return;
  }

  const transaction = {
    id: uid(),
    type: selectedTransactionType(),
    description: $("#transactionDescription").value.trim(),
    amount: Number($("#transactionAmount").value),
    category: $("#transactionCategory").value,
    date: $("#transactionDate").value,
    createdAt: Date.now(),
  };

  if (!transaction.description || transaction.amount <= 0 || !transaction.date) return;

  const transactions = getTransactions();
  transactions.push(transaction);
  saveJSON(KEYS.transactions, transactions);

  $("#transactionDescription").value = "";
  $("#transactionAmount").value = "";
  closeTransactionModal();
  renderDashboard();
  toast("Lançamento salvo.");
});

$("#transactionDescription").addEventListener("input", () => $("#transactionDescription").setCustomValidity(""));

function selectedMonth() {
  return $("#monthFilter").value || currentMonth();
}

function monthTransactions() {
  return getTransactions()
    .filter((item) => item.date.startsWith(selectedMonth()))
    .sort((a, b) => {
      if (a.date === b.date) return b.createdAt - a.createdAt;
      return b.date.localeCompare(a.date);
    });
}


function normalizePaidFixedEntry(value) {
  if (value === true) return { status: "paid", paidAt: null };
  if (value === false || value == null) return { status: "pending", paidAt: null };
  if (typeof value === "object") {
    return {
      status: value.status === "paid" ? "paid" : "pending",
      paidAt: value.paidAt || null,
    };
  }
  return { status: "pending", paidAt: null };
}

function fixedPaymentKey(month, fixedExpenseId) {
  return `${month}:${fixedExpenseId}`;
}

function getFixedPaymentStatus(month, fixedExpenseId) {
  const paidFixed = getPaidFixed();
  return normalizePaidFixedEntry(paidFixed[fixedPaymentKey(month, fixedExpenseId)]);
}

function setFixedPaymentStatus(month, fixedExpenseId, status) {
  const paidFixed = getPaidFixed();
  paidFixed[fixedPaymentKey(month, fixedExpenseId)] = {
    status,
    paidAt: status === "paid" ? new Date().toISOString() : null,
  };
  saveJSON(KEYS.paidFixed, paidFixed);
}

function formatPaidAt(iso) {
  if (!iso) return "Pago";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Pago";
  return `Pago em ${d.toLocaleDateString("pt-BR")}`;
}

function getFixedStatusDataset(month = selectedMonth()) {
  const settings = getSettings();
  return (settings?.fixedExpenses || []).map((expense) => {
    const payment = getFixedPaymentStatus(month, expense.id);
    return {
      expense,
      payment,
      status: payment.status,
      amount: Number(expense.amount || 0),
    };
  });
}

function renderFixedStatus(settings) {
  const list = $("#fixedStatusList");
  if (!list) return;

  const month = selectedMonth();
  const fixedExpenses = settings?.fixedExpenses || [];
  const paidCount = fixedExpenses.filter((expense) => getFixedPaymentStatus(month, expense.id).status === "paid").length;
  $("#fixedPaymentSummary").textContent = fixedExpenses.length
    ? `${paidCount} de ${fixedExpenses.length} ${fixedExpenses.length === 1 ? "conta paga" : "contas pagas"}`
    : "Seus compromissos recorrentes aparecem aqui.";

  if (!fixedExpenses.length) {
    list.innerHTML = `<div class="payment-report-empty">Nenhuma conta fixa cadastrada.</div>`;
    return;
  }

  list.innerHTML = fixedExpenses.map((expense) => {
    const payment = getFixedPaymentStatus(month, expense.id);
    const isPaid = payment.status === "paid";

    return `
      <div class="fixed-status">
        <div>
          <strong>${escapeHTML(expense.name || "Conta fixa")}</strong>
          <small>${isPaid ? formatPaidAt(payment.paidAt) : `Vencimento: dia ${Math.min(Number(expense.day) || 1, new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate())}`} · ${escapeHTML(expense.category || "Outros")}</small>
        </div>
        <div class="fixed-status-right">
          <strong>${money(Number(expense.amount || 0))}</strong>
          ${
            isPaid
              ? `<button
                  class="status-btn paid"
                  type="button"
                  disabled
                  aria-disabled="true"
                >✓ Pago</button>`
              : `<button
                  class="status-btn pending"
                  type="button"
                  data-fixed-id="${escapeHTML(expense.id)}"
                  aria-label="Marcar ${escapeHTML(expense.name || "conta fixa")} como paga"
                  data-payment-status="pending"
                >Marcar como pago</button>`
          }
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-fixed-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!btn.dataset.fixedId || btn.dataset.paymentStatus !== "pending") return;

      setFixedPaymentStatus(month, btn.dataset.fixedId, "paid");
      renderDashboard();
      renderReports();
      toast("Conta marcada como paga.");
    });
  });
}

const transactionFilters = { type: "all", search: "" };

function renderTransactions(transactions) {
  const target = $("#transactionList");
  target.innerHTML = "";
  const normalize = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const search = normalize(transactionFilters.search.trim());
  const filtered = transactions.filter((item) =>
    (transactionFilters.type === "all" || item.type === transactionFilters.type) &&
    (!search || normalize(`${item.description} ${item.category}`).includes(search))
  );
  $("#emptyTransactions").classList.toggle("hidden", filtered.length > 0);
  $("#emptyTransactions").textContent = transactions.length
    ? "Nenhuma movimentação encontrada. Experimente outra busca ou selecione Todas."
    : "Seu histórico começa com o primeiro lançamento. Use Novo para registrar uma receita ou despesa.";
  $("#transactionResultCount").textContent = `${filtered.length} de ${transactions.length} ${transactions.length === 1 ? "lançamento" : "lançamentos"} no período`;
  const filtersActive = Boolean(search || transactionFilters.type !== "all");
  $("#filterContext").classList.toggle("hidden", !filtersActive);
  const filterLabel = transactionFilters.type === "income" ? "Receitas" : transactionFilters.type === "expense" ? "Despesas" : "Todas as movimentações";
  $("#filterDescription").textContent = `${filterLabel}${search ? ` com “${transactionFilters.search.trim()}”` : ""}`;

  filtered.forEach((item) => {
    const node = $("#transactionTemplate").content.cloneNode(true);
    node.querySelector(".transaction-icon").textContent =
      categoryIcon(item.category, item.type);
    node.querySelector(".transaction-description").textContent = item.description;

    const date = new Date(`${item.date}T12:00:00`);
    node.querySelector(".transaction-meta").textContent =
      `${item.category} • ${date.toLocaleDateString("pt-BR")}`;

    const value = node.querySelector(".transaction-value");
    value.textContent = `${item.type === "income" ? "+" : "-"} ${money(item.amount)}`;
    value.classList.add(item.type);

    node.querySelector(".delete-transaction").dataset.id = item.id;
    node.querySelector(".delete-transaction").setAttribute("aria-label", `Excluir lançamento: ${item.description}`);
    target.appendChild(node);
  });
}

$("#transactionSearch").addEventListener("input", (event) => {
  transactionFilters.search = event.target.value;
  renderTransactions(monthTransactions());
});

$("#clearTransactionFilters").addEventListener("click", () => {
  transactionFilters.type = "all";
  transactionFilters.search = "";
  $("#transactionSearch").value = "";
  $$("[data-transaction-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.transactionFilter === "all")));
  renderTransactions(monthTransactions());
  $("#transactionSearch").focus({ preventScroll: true });
});

$$("[data-transaction-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    transactionFilters.type = button.dataset.transactionFilter;
    $$("[data-transaction-filter]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    renderTransactions(monthTransactions());
  });
});

$("#transactionList").addEventListener("click", (event) => {
  const button = event.target.closest(".delete-transaction");
  if (!button) return;

  const transactions = getTransactions().filter((item) => item.id !== button.dataset.id);
  saveJSON(KEYS.transactions, transactions);
  renderDashboard();
  toast("Lançamento excluído.");
});



function updateEditorialGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia." : hour < 18 ? "Boa tarde." : "Boa noite.";
  const greetingEl = $("#editorialGreeting");
  const dateEl = $("#editorialDate");

  if (greetingEl) greetingEl.textContent = greeting;
  if (dateEl) {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long"
    }).format(now);
    dateEl.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
}

function animateNumberText(element, target, {
  prefix = "R$ ",
  suffix = "",
  decimals = 2,
  duration = 450,
  currency = true
} = {}) {
  if (!element) return;

  const start = Number(element.dataset.value || 0);
  const end = Number(target || 0);
  const startTime = performance.now();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = currency ? money(end) : `${end.toFixed(decimals).replace(".", ",")}${suffix}`;
    element.dataset.value = String(end);
    return;
  }

  function format(v) {
    if (currency) return money(v);
    return `${v.toFixed(decimals).replace(".", ",")}${suffix}`;
  }

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;
    element.textContent = format(current);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      element.dataset.value = String(end);
      element.classList.remove("balance-pulse");
      void element.offsetWidth;
      element.classList.add("balance-pulse");
    }
  }
  requestAnimationFrame(step);
}

function animatePlainPercent(element, target) {
  if (!element) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = `${Number(target || 0).toFixed(1).replace(".", ",")}%`;
    element.dataset.value = String(Number(target || 0));
    return;
  }
  const start = Number((element.dataset.value || "0").replace(",", "."));
  const end = Number(target || 0);
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min((now - startTime) / 420, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;
    element.textContent = `${current.toFixed(1).replace(".", ",")}%`;
    if (progress < 1) requestAnimationFrame(step);
    else element.dataset.value = String(end);
  }
  requestAnimationFrame(step);
}


function getPaidFixedTotalForMonth(month = selectedMonth()) {
  const dataset = getFixedStatusDataset(month);
  return dataset
    .filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function renderHeroSummary({ baseIncome, extraIncome, fixed, variable, balance }) {
  const totalIncome = baseIncome + extraIncome;

  // "Saiu" mostra somente o que realmente saiu da conta:
  // despesas variáveis + gastos fixos já marcados como pagos.
  const paidFixed = getPaidFixedTotalForMonth(selectedMonth());
  const totalExpense = paidFixed + variable;

  // "Fixos" continua representando o comprometimento previsto do mês.
  const commitment = totalIncome > 0 ? (fixed / totalIncome) * 100 : 0;

  animateNumberText($("#heroBalanceValue"), balance);
  animateNumberText($("#heroIncomeValue"), totalIncome);
  animateNumberText($("#heroExpenseValue"), totalExpense);
  animatePlainPercent($("#heroCommitmentValue"), commitment);
  $("#budgetCommitment").textContent = `${commitment.toFixed(1).replace(".", ",")}%`;
  $("#budgetMeter").style.width = `${Math.min(commitment, 100)}%`;
  $(".commitment-meter").setAttribute("aria-valuenow", String(Math.min(commitment, 100)));
  $(".commitment-meter").setAttribute("aria-valuetext", `${commitment.toFixed(1).replace(".", ",")}% da renda comprometida`);
  $(".commitment-meter").classList.toggle("commitment-high", commitment > 100);
  const pending = getFixedStatusDataset(selectedMonth()).filter((item) => item.status !== "paid");
  const pendingTotal = pending.reduce((sum, item) => sum + item.amount, 0);
  $("#budgetInsight").textContent = pending.length
    ? `${pending.length} ${pending.length === 1 ? "conta pendente" : "contas pendentes"}, somando ${money(pendingTotal)} neste mês.`
    : "Todas as contas fixas deste mês estão pagas.";

  const deltaEl = $("#heroDeltaText");
  const chip = $("#heroDeltaChip");
  if (!deltaEl || !chip) return;

  if (totalIncome === 0 && totalExpense === 0) {
    deltaEl.textContent = "Sem movimentações realizadas ainda";
    chip.querySelector(".editorial-status-dot").style.background = "var(--amber)";
    chip.style.setProperty("--status-color", "var(--amber)");
  } else if (balance >= 0) {
    deltaEl.textContent = "Seu mês está no positivo";
    chip.querySelector(".editorial-status-dot").style.background = "var(--green)";
    chip.style.setProperty("--status-color", "var(--positive)");
  } else {
    deltaEl.textContent = "Despesas acima das receitas";
    chip.querySelector(".editorial-status-dot").style.background = "var(--red)";
    chip.style.setProperty("--status-color", "var(--negative)");
  }
}


function renderDashboard() {
  updateEditorialGreeting();
  updatePeriodControls();
  const settings = getSettings();
  if (!settings) return;

  const transactions = monthTransactions();

  const baseIncome = settings.incomes.reduce((sum, item) => sum + item.amount, 0);
  const fixed = settings.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const extraIncome = transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
  const variable = transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const balance = baseIncome + extraIncome - fixed - variable;

  const dashboardValues = {
    baseIncomeTotal: baseIncome,
    extraIncomeTotal: extraIncome,
    fixedTotal: fixed,
    variableTotal: variable,
    balanceTotal: balance,
  };

  Object.entries(dashboardValues).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = money(value);
  });
  const monthTitleEl = $("#monthTitle");
  if (monthTitleEl) {
    monthTitleEl.textContent = capitalize(monthLabel(selectedMonth()));
  }
  renderHeroSummary({ baseIncome, extraIncome, fixed, variable, balance });

  const balanceHintEl = $("#balanceHint");
  if (balanceHintEl) {
    balanceHintEl.textContent =
      balance >= 0 ? "Depois de todas as despesas" : "Despesas acima das receitas";
  }

  renderFixedStatus(settings);
  renderTransactions(transactions);
  requestAnimationFrame(() => animateCurrentLists());
  renderSettingsLists();
}

$("#monthFilter").addEventListener("change", renderDashboard);

function updatePeriodControls() {
  $("#reportMonthFilter").value = selectedMonth();
  $$('[data-current-month]').forEach((button) => button.classList.toggle("hidden", selectedMonth() === currentMonth()));
}

function selectFinancialMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month) || Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12) return;
  $("#monthFilter").value = month;
  renderDashboard();
}

$$("[data-month-step]").forEach((button) => button.addEventListener("click", () => {
  const [year, month] = selectedMonth().split("-").map(Number);
  const next = new Date(year, month - 1 + Number(button.dataset.monthStep), 1);
  selectFinancialMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
}));
$$("[data-current-month]").forEach((button) => button.addEventListener("click", () => selectFinancialMonth(currentMonth())));
$("#reportMonthFilter").addEventListener("change", (event) => selectFinancialMonth(event.target.value));

$("#togglePassword").addEventListener("click", () => {
  const visible = $("#authPassword").type === "password";
  $("#authPassword").type = visible ? "text" : "password";
  $("#togglePassword").setAttribute("aria-pressed", String(visible));
  $("#togglePassword").setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
});

function renderSettingsLists() {
  const settings = getSettings();
  if (!settings) return;
  renderMiniList($("#settingsIncomeList"), settings.incomes, "income", true, true);
  renderMiniList($("#settingsFixedList"), settings.fixedExpenses, "fixed", true, true);
}


function resetIncomeSettingsForm() {
  $("#settingsIncomeEditId").value = "";
  $("#settingsIncomeType").value = "Salário";
  $("#settingsIncomeName").value = "";
  $("#settingsIncomeAmount").value = "";
  $("#settingsIncomeDay").value = "5";
  $("#cancelIncomeEdit").classList.add("hidden");
  $("#saveIncomeSetting").textContent = "+ Adicionar receita";
}
function resetFixedSettingsForm() {
  $("#settingsFixedEditId").value = "";
  $("#settingsFixedName").value = "";
  $("#settingsFixedAmount").value = "";
  $("#settingsFixedCategory").value = "Moradia";
  $("#settingsFixedDay").value = "10";
  $("#cancelFixedEdit").classList.add("hidden");
  $("#saveFixedSetting").textContent = "+ Adicionar gasto";
}
$("#settingsIncomeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const settings = getSettings();
  const editId = $("#settingsIncomeEditId").value;
  const item = {id: editId || uid(), type: $("#settingsIncomeType").value, name: $("#settingsIncomeName").value.trim(), amount: Number($("#settingsIncomeAmount").value), day: Math.min(31, Math.max(1, Number($("#settingsIncomeDay").value)))};
  if (!item.name || item.amount <= 0) return;
  if (editId) {
    settings.incomes = settings.incomes.map((old) => old.id === editId ? item : old);
    toast("Receita atualizada.");
  } else {
    settings.incomes.push(item);
    toast("Nova receita recorrente adicionada.");
  }
  saveJSON(KEYS.settings, settings);
  resetIncomeSettingsForm();
  renderDashboard();
});
$("#settingsFixedForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const settings = getSettings();
  const editId = $("#settingsFixedEditId").value;
  const item = {id: editId || uid(), name: $("#settingsFixedName").value.trim(), amount: Number($("#settingsFixedAmount").value), category: $("#settingsFixedCategory").value, day: Math.min(31, Math.max(1, Number($("#settingsFixedDay").value)))};
  if (!item.name || item.amount <= 0) return;
  if (editId) {
    settings.fixedExpenses = settings.fixedExpenses.map((old) => old.id === editId ? item : old);
    toast("Gasto fixo atualizado.");
  } else {
    settings.fixedExpenses.push(item);
    toast("Novo gasto fixo adicionado.");
  }
  saveJSON(KEYS.settings, settings);
  resetFixedSettingsForm();
  renderDashboard();
});
$("#cancelIncomeEdit").addEventListener("click", resetIncomeSettingsForm);
$("#cancelFixedEdit").addEventListener("click", resetFixedSettingsForm);

function handleSettingsEdit(event) {
  const button = event.target.closest(".mini-edit");
  if (!button) return false;
  const settings = getSettings();
  const {id, kind} = button.dataset;
  if (kind === "income") {
    const item = settings.incomes.find((x) => x.id === id);
    if (!item) return true;
    $("#settingsIncomeEditId").value = item.id;
    $("#settingsIncomeType").value = item.type;
    $("#settingsIncomeName").value = item.name;
    $("#settingsIncomeAmount").value = item.amount;
    $("#settingsIncomeDay").value = item.day;
    $("#cancelIncomeEdit").classList.remove("hidden");
    $("#saveIncomeSetting").textContent = "Salvar alterações";
  } else {
    const item = settings.fixedExpenses.find((x) => x.id === id);
    if (!item) return true;
    $("#settingsFixedEditId").value = item.id;
    $("#settingsFixedName").value = item.name;
    $("#settingsFixedAmount").value = item.amount;
    $("#settingsFixedCategory").value = item.category;
    $("#settingsFixedDay").value = item.day;
    $("#cancelFixedEdit").classList.remove("hidden");
    $("#saveFixedSetting").textContent = "Salvar alterações";
  }
  return true;
}

function handleSettingsDelete(event) {
  const button = event.target.closest(".mini-delete");
  if (!button) return;

  const settings = getSettings();
  if (!settings) return;

  const { id, kind } = button.dataset;

  if (kind === "income") {
    if (settings.incomes.length <= 1) {
      toast("Mantenha pelo menos uma receita recorrente.");
      return;
    }
    settings.incomes = settings.incomes.filter((item) => item.id !== id);
  }

  if (kind === "fixed") {
    if (settings.fixedExpenses.length <= 1) {
      toast("Mantenha pelo menos um gasto fixo.");
      return;
    }
    settings.fixedExpenses = settings.fixedExpenses.filter((item) => item.id !== id);
  }

  saveJSON(KEYS.settings, settings);
  renderDashboard();
  toast("Item removido.");
}

$("#settingsIncomeList").addEventListener("click", (event) => {
  if (handleSettingsEdit(event)) return;
  handleSettingsDelete(event);
});
$("#settingsFixedList").addEventListener("click", (event) => {
  if (handleSettingsEdit(event)) return;
  handleSettingsDelete(event);
});

$("#settingsBtn").addEventListener("click", () => {
  resetIncomeSettingsForm();
  resetFixedSettingsForm();
  renderSettingsLists();
  openSettingsDialog();
});

$("#closeSettings").addEventListener("click", closeSettingsDialog);

$("#settingsPanel").addEventListener("click", (event) => {
  if (event.target === $("#settingsPanel")) {
    closeSettingsDialog();
  }
});

$("#resetAppBtn").addEventListener("click", () => {
  const ok = confirm("Isso apagará todas as receitas, despesas e configurações salvas neste navegador. Deseja continuar?");
  if (!ok) return;

  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  state.setupIncomes = [];
  state.setupFixed = [];
  closeSettingsDialog();
  showOnboarding();
  toast("Dados apagados.");
});

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// PWA install
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredPrompt = event;
  $("#installBtn").classList.remove("hidden");
});

$("#installBtn").addEventListener("click", async () => {
  if (!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  $("#installBtn").classList.add("hidden");
});

window.addEventListener("appinstalled", () => {
  $("#installBtn").classList.add("hidden");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

// Initial field defaults are applied by initializeV4().


// ===== V3 Reports =====
const reportCharts = {
  category: null,
  fixedVariable: null,
  monthly: null,
  balance: null,
};

function monthsBack(count) {
  const result = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    result.push(`${y}-${m}`);
  }
  return result;
}

function getReportMonths() {
  const period = $("#reportPeriod").value;
  const selected = selectedMonth();

  if (period === "month") return [selected];
  if (period === "3months") return monthsBack(3);
  if (period === "6months") return monthsBack(6);

  if (period === "year") {
    const year = String(new Date().getFullYear());
    return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  }

  const transactions = getTransactions();
  const months = new Set(transactions.map((t) => t.date.slice(0, 7)));
  months.add(selectedMonth());
  return [...months].sort();
}

function monthRecurringIncome(settings) {
  return settings.incomes.reduce((sum, item) => sum + item.amount, 0);
}

function monthFixedExpense(settings) {
  return settings.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
}

function reportDataset() {
  const settings = getSettings();
  const months = getReportMonths();
  const tx = getTransactions();

  const basePerMonth = monthRecurringIncome(settings);
  const fixedPerMonth = monthFixedExpense(settings);

  const monthly = months.map((month) => {
    const items = tx.filter((t) => t.date.startsWith(month));
    const extras = items.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const variable = items.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

    return {
      month,
      label: capitalize(monthLabel(month)),
      income: basePerMonth + extras,
      expense: fixedPerMonth + variable,
      fixed: fixedPerMonth,
      variable,
      balance: basePerMonth + extras - fixedPerMonth - variable,
      items,
    };
  });

  return { settings, months, monthly };
}

function categoryData(dataset) {
  const totals = {};
  dataset.monthly.forEach((m) => {
    m.items
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        totals[t.category] = (totals[t.category] || 0) + t.amount;
      });
  });

  // Include fixed categories
  dataset.settings.fixedExpenses.forEach((item) => {
    totals[item.category] = (totals[item.category] || 0) + item.amount * dataset.months.length;
  });

  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function destroyChart(key) {
  if (reportCharts[key]) {
    reportCharts[key].destroy();
    reportCharts[key] = null;
  }
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 350 },
    plugins: {
      legend: {
        labels: {
          color: "#cbd5e1",
          usePointStyle: true,
          boxWidth: 8,
          padding: 18,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label || ctx.label}: ${money(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#aab8cc" },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: "#94a3b8",
          callback: (value) => money(value),
        },
        grid: { color: "rgba(148,163,184,.08)" },
      },
    },
  };
}

function renderReportCharts(dataset) {
  const cat = categoryData(dataset);
  const fixedTotal = dataset.monthly.reduce((s, m) => s + m.fixed, 0);
  const variableTotal = dataset.monthly.reduce((s, m) => s + m.variable, 0);
  $("#categoryChart").setAttribute("aria-label", `Despesas por categoria: ${cat.map(([name, value]) => `${name}: ${money(value)}`).join("; ") || "sem despesas no período"}.`);
  $("#fixedVariableChart").setAttribute("aria-label", `Gastos fixos: ${money(fixedTotal)}. Gastos variáveis: ${money(variableTotal)}.`);
  $("#monthlyChart").setAttribute("aria-label", dataset.monthly.map((month) => `${month.label}: receitas ${money(month.income)}, despesas ${money(month.expense)}`).join("; "));
  $("#balanceChart").setAttribute("aria-label", dataset.monthly.map((month) => `${month.label}: saldo ${money(month.balance)}`).join("; "));

  destroyChart("category");
  reportCharts.category = new Chart($("#categoryChart"), {
    type: "bar",
    data: {
      labels: cat.map(([name]) => name),
      datasets: [{
        label: "Gastos",
        data: cat.map(([, value]) => value),
        backgroundColor: cat.map((_, index) => ["#9ac7ff", "#b6a6e9", "#8ce0bd", "#f1c78a", "#ffa6ab", "#8ecedb"][index % 6]),
        borderRadius: 5,
        maxBarThickness: 36,
      }],
    },
    options: {
      ...baseChartOptions(),
      indexAxis: cat.length >= 6 ? "y" : "x",
      plugins: baseChartOptions().plugins,
      scales: cat.length >= 6
        ? { x: baseChartOptions().scales.y, y: { ...baseChartOptions().scales.x, grid: { display: false } } }
        : baseChartOptions().scales,
    },
  });

  destroyChart("fixedVariable");
  reportCharts.fixedVariable = new Chart($("#fixedVariableChart"), {
    type: "doughnut",
    data: {
      labels: ["Gastos fixos", "Gastos variáveis"],
      datasets: [{
        data: [fixedTotal, variableTotal],
        backgroundColor: ["#9ac7ff", "#b6a6e9"],
        borderWidth: 0,
        hoverOffset: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "74%",
      animation: baseChartOptions().animation,
      plugins: baseChartOptions().plugins,
    },
  });

  destroyChart("monthly");
  reportCharts.monthly = new Chart($("#monthlyChart"), {
    type: "bar",
    data: {
      labels: dataset.monthly.map((m) => m.label),
      datasets: [
        { label: "Receitas", data: dataset.monthly.map((m) => m.income), backgroundColor: "#8ce0bd", borderRadius: 5, maxBarThickness: 38 },
        { label: "Despesas", data: dataset.monthly.map((m) => m.expense), backgroundColor: "#ffa6ab", borderRadius: 5, maxBarThickness: 38 },
      ],
    },
    options: baseChartOptions(),
  });

  destroyChart("balance");
  reportCharts.balance = new Chart($("#balanceChart"), {
    type: "line",
    data: {
      labels: dataset.monthly.map((m) => m.label),
      datasets: [
        {
          label: "Saldo",
          data: dataset.monthly.map((m) => m.balance),
          tension: .32,
          fill: false,
          borderColor: "#9ac7ff",
          backgroundColor: "#9ac7ff",
          borderWidth: 2,
          pointRadius: 4,
        },
      ],
    },
    options: baseChartOptions(),
  });
}

function renderTopExpenses(dataset) {
  const items = [];

  dataset.monthly.forEach((m) => {
    m.items
      .filter((t) => t.type === "expense")
      .forEach((t) => items.push({
        name: t.description,
        category: t.category,
        amount: t.amount,
        month: m.label,
      }));

    dataset.settings.fixedExpenses.forEach((f) => {
      items.push({
        name: f.name,
        category: f.category,
        amount: f.amount,
        month: m.label,
      });
    });
  });

  items.sort((a, b) => b.amount - a.amount);
  const top = items.slice(0, 10);
  const target = $("#topExpensesList");
  target.innerHTML = "";

  if (!top.length) {
    target.innerHTML = '<div class="empty-state">Nenhum gasto encontrado no período.</div>';
    return;
  }

  top.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "rank-item";
    row.innerHTML = `
      <div class="rank-number">${index + 1}</div>
      <div class="rank-meta">
        <strong>${escapeHTML(item.name)}</strong>
        <small>${escapeHTML(item.category)} • ${escapeHTML(item.month)}</small>
      </div>
      <div class="rank-value">${money(item.amount)}</div>
    `;
    target.appendChild(row);
  });
}

function renderTextSummary(dataset) {
  const income = dataset.monthly.reduce((s, m) => s + m.income, 0);
  const expense = dataset.monthly.reduce((s, m) => s + m.expense, 0);
  const fixed = dataset.monthly.reduce((s, m) => s + m.fixed, 0);
  const variable = dataset.monthly.reduce((s, m) => s + m.variable, 0);
  const balance = income - expense;
  const category = categoryData(dataset);

  const topCategory = category.length ? category[0][0] : "—";
  const commitment = income > 0 ? (fixed / income) * 100 : 0;

  $("#reportTextSummary").innerHTML = `
    <div class="report-summary-line"><span>Período analisado</span><strong>${dataset.months.length} mês(es)</strong></div>
    <div class="report-summary-line"><span>Total de receitas</span><strong>${money(income)}</strong></div>
    <div class="report-summary-line"><span>Total de despesas</span><strong>${money(expense)}</strong></div>
    <div class="report-summary-line"><span>Gastos fixos</span><strong>${money(fixed)}</strong></div>
    <div class="report-summary-line"><span>Gastos variáveis</span><strong>${money(variable)}</strong></div>
    <div class="report-summary-line"><span>Saldo acumulado</span><strong>${money(balance)}</strong></div>
    <div class="report-summary-line"><span>Categoria com maior gasto</span><strong>${escapeHTML(topCategory)}</strong></div>
    <div class="report-summary-line"><span>Renda comprometida com fixos</span><strong>${commitment.toFixed(1).replace(".", ",")}%</strong></div>
  `;
}


function renderPaymentReports(month = selectedMonth()) {
  $("#reportAccountContext").textContent = `Contas fixas de ${monthLabel(month)}`;
  const dataset = getFixedStatusDataset(month);
  const pending = dataset.filter((item) => item.status !== "paid");
  const paid = dataset.filter((item) => item.status === "paid");

  const pendingTotal = pending.reduce((sum, item) => sum + item.amount, 0);
  const paidTotal = paid.reduce((sum, item) => sum + item.amount, 0);

  if ($("#reportPendingTotal")) $("#reportPendingTotal").textContent = money(pendingTotal);
  if ($("#reportPaidTotal")) $("#reportPaidTotal").textContent = money(paidTotal);
  if ($("#reportPendingCount")) $("#reportPendingCount").textContent =
    `${pending.length} ${pending.length === 1 ? "conta pendente" : "contas pendentes"}`;
  if ($("#reportPaidCount")) $("#reportPaidCount").textContent =
    `${paid.length} ${paid.length === 1 ? "conta paga" : "contas pagas"}`;

  const renderList = (selector, items, emptyText) => {
    const el = $(selector);
    if (!el) return;

    if (!items.length) {
      el.innerHTML = `<div class="payment-report-empty">${emptyText}</div>`;
      return;
    }

    el.innerHTML = items.map((item) => `
      <div class="payment-report-item">
        <div>
          <strong>${escapeHTML(item.expense.name || "Conta fixa")}</strong>
          <small>${item.status === "paid" ? formatPaidAt(item.payment.paidAt) : "Pendente no período"}</small>
        </div>
        <div class="value">${money(item.amount)}</div>
      </div>
    `).join("");
  };

  renderList("#reportPendingList", pending, "Nenhuma conta a pagar neste mês.");
  renderList("#reportPaidList", paid, "Nenhuma conta paga neste mês.");
}

function renderReports() {
  renderPaymentReports(selectedMonth());
  const dataset = reportDataset();
  updatePeriodControls();
  $("#reportPeriodDescription").textContent = dataset.months.length === 1
    ? capitalize(monthLabel(dataset.months[0]))
    : `${capitalize(monthLabel(dataset.months[0]))} a ${monthLabel(dataset.months[dataset.months.length - 1])}`;
  const income = dataset.monthly.reduce((s, m) => s + m.income, 0);
  const expense = dataset.monthly.reduce((s, m) => s + m.expense, 0);
  const balance = income - expense;
  const monthlyAvg = dataset.monthly.length ? expense / dataset.monthly.length : 0;

  $("#reportIncome").textContent = money(income);
  $("#reportExpense").textContent = money(expense);
  $("#reportBalance").textContent = money(balance);
  $("#reportMonthlyAvg").textContent = money(monthlyAvg);

  renderReportCharts(dataset);
  renderTopExpenses(dataset);
  renderTextSummary(dataset);
  requestAnimationFrame(() => animateCurrentLists());
}

$("#reportPeriod").addEventListener("change", renderReports);

$("#printReportBtn").addEventListener("click", () => {
  window.print();
});

function setMainView(view) {
  const dashboardView = $("#dashboardView");
  const reportsView = $("#reportsView");
  const previousView = reportsView.classList.contains("hidden") ? "dashboard" : "reports";
  viewScrollPositions[previousView] = window.scrollY;

  if (view === "reports") {
    dashboardView.classList.add("hidden");
    reportsView.classList.remove("hidden");
    retriggerViewAnimation(reportsView);
    renderReports();
  } else {
    reportsView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    retriggerViewAnimation(dashboardView);

    if (view === "add") {
      openTransactionModal();
    }
  }

  $$(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
    if (btn.dataset.view === view) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  if (view !== "add") requestAnimationFrame(() => window.scrollTo({ top: previousView === view ? 0 : viewScrollPositions[view] || 0, behavior: "instant" }));
}

const viewScrollPositions = { dashboard: 0, reports: 0 };

$$(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.view === "add") {
      openTransactionModal();
      return;
    }
    setMainView(btn.dataset.view);
  });
});

// Keep report data updated when month changes / dashboard rerenders
const originalRenderDashboardV3 = renderDashboard;
renderDashboard = function () {
  originalRenderDashboardV3();
  if (!$("#reportsView").classList.contains("hidden")) {
    renderReports();
  }
};

function isIosDevice(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function isStandaloneMode(){return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;}
function isSafariBrowser(){const ua=navigator.userAgent.toLowerCase();return ua.includes("safari")&&!ua.includes("crios")&&!ua.includes("fxios")&&!ua.includes("edgios");}
function maybeShowIosInstallHelp(){if(!isIosDevice()||!isSafariBrowser()||isStandaloneMode())return;if(localStorage.getItem("orgfinan-ios-install-dismissed"))return;$("#iosInstallBanner").classList.remove("hidden");}
$("#closeIosBanner").addEventListener("click",()=>{localStorage.setItem("orgfinan-ios-install-dismissed","1");$("#iosInstallBanner").classList.add("hidden");});
maybeShowIosInstallHelp();


// ===== V4 AUTH + CLOUD SYNC =====
let authMode = "login";

function showAuthScreen(message = "") {
  $("#authScreen").classList.remove("hidden");
  $("#onboarding").classList.add("hidden");
  $("#dashboard").classList.add("hidden");
  $("#settingsBtn").classList.add("hidden");
  $("#syncBtn").classList.add("hidden");
  $("#accountBadge").classList.add("hidden");
  setAuthMessage(message, "");
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $("#loginTab").classList.toggle("active", !signup);
  $("#signupTab").classList.toggle("active", signup);
  $("#authNameWrap").classList.toggle("hidden", !signup);
  $("#authSubmitBtn").textContent = signup ? "Criar conta" : "Entrar";
  $("#authPassword").autocomplete = signup ? "new-password" : "current-password";
  setAuthMessage("", "");
}

function setAuthMessage(text, kind = "") {
  const el = $("#authMessage");
  el.textContent = text;
  el.className = `auth-message ${kind}`.trim();
}

function friendlyAuthError(error) {
  const msg = String(error?.message || error || "");
  const lower = msg.toLowerCase();
  if (lower.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (lower.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (lower.includes("user already registered")) return "Já existe uma conta com este e-mail.";
  if (lower.includes("password")) return "Verifique a senha. Ela precisa ter pelo menos 6 caracteres.";
  return msg || "Não foi possível concluir a operação.";
}


function clearCurrentAccountLocalData() {
  localStorage.removeItem(KEYS.settings);
  localStorage.removeItem(KEYS.transactions);
  localStorage.removeItem(KEYS.paidFixed);
  localStorage.removeItem(KEYS.localModified);
  localStorage.removeItem(KEYS.lastSync);
  localStorage.removeItem(KEYS.syncDirty);
  localStorage.removeItem(KEYS.lastSignature);
  localStorage.removeItem(KEYS.profileCheckedAt);
}

function currentAccountHasLocalData() {
  return Boolean(
    localStorage.getItem(KEYS.settings) ||
    localStorage.getItem(KEYS.transactions) ||
    localStorage.getItem(KEYS.paidFixed)
  );
}

function legacyPayload() {
  let settings = null;
  let transactions = [];
  let paidFixed = {};

  try { settings = JSON.parse(localStorage.getItem(LEGACY_KEYS.settings)) || null; } catch {}
  try { transactions = JSON.parse(localStorage.getItem(LEGACY_KEYS.transactions)) || []; } catch {}
  try { paidFixed = JSON.parse(localStorage.getItem(LEGACY_KEYS.paidFixed)) || {}; } catch {}

  return {
    version: 3,
    settings,
    transactions,
    paidFixed,
    local_modified_at: localStorage.getItem(LEGACY_KEYS.localModified),
  };
}

function legacyHasMeaningfulData() {
  const data = legacyPayload();
  return Boolean(
    data.settings ||
    (Array.isArray(data.transactions) && data.transactions.length) ||
    (data.paidFixed && Object.keys(data.paidFixed).length)
  );
}

function migrateLegacyDataOnceForUser() {
  if (!CLOUD.user) return false;

  const markerKey = "orgfinan-legacy-migrated-to-user";
  const alreadyMigratedTo = localStorage.getItem(markerKey);

  if (alreadyMigratedTo || currentAccountHasLocalData() || !legacyHasMeaningfulData()) {
    return false;
  }
  if (!confirm("Há dados antigos sem conta neste aparelho. Eles são seus e você deseja vinculá-los à conta atual?")) return false;

  const data = legacyPayload();

  CLOUD.suppressLocalSync = true;
  try {
    if (data.settings) localStorage.setItem(KEYS.settings, JSON.stringify(data.settings));
    localStorage.setItem(KEYS.transactions, JSON.stringify(data.transactions || []));
    localStorage.setItem(KEYS.paidFixed, JSON.stringify(data.paidFixed || {}));
    if (data.local_modified_at) localStorage.setItem(KEYS.localModified, data.local_modified_at);
    localStorage.setItem(markerKey, CLOUD.user.id);
  } finally {
    CLOUD.suppressLocalSync = false;
  }

  return true;
}


function payloadSignature(payload) {
  const text = JSON.stringify(payload);
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function isSyncDirty() {
  return localStorage.getItem(KEYS.syncDirty) === "1";
}

function markSyncClean(signature = null) {
  const sig = signature || payloadSignature(localFinancialPayload());
  localStorage.setItem(KEYS.syncDirty, "0");
  localStorage.setItem(KEYS.lastSignature, sig);
  CLOUD.lastSyncedSignature = sig;
}

function markSyncDirty() {
  localStorage.setItem(KEYS.syncDirty, "1");
}

function lastKnownSignature() {
  return CLOUD.lastSyncedSignature || localStorage.getItem(KEYS.lastSignature);
}

function hasUnsyncedChanges() {
  if (!CLOUD.user) return false;
  if (isSyncDirty()) return true;

  const current = payloadSignature(localFinancialPayload());
  const last = lastKnownSignature();
  return Boolean(last && current !== last);
}

function isDateAfter(a, b) {
  if (!a) return false;
  if (!b) return true;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return ta > tb;
}

function localFinancialPayload() {
  return {
    version: 4,
    settings: getSettings(),
    transactions: getTransactions(),
    paidFixed: getPaidFixed(),
    local_modified_at: localStorage.getItem(KEYS.localModified),
  };
}

function hasMeaningfulLocalData(payload = localFinancialPayload()) {
  return Boolean(
    payload.settings ||
    (payload.transactions && payload.transactions.length) ||
    (payload.paidFixed && Object.keys(payload.paidFixed).length)
  );
}

function applyCloudPayload(data) {
  data = FinancialValidation.normalizeFinancialData(data);

  CLOUD.suppressLocalSync = true;
  try {
    if ("settings" in data) {
      if (data.settings) localStorage.setItem(KEYS.settings, JSON.stringify(data.settings));
      else localStorage.removeItem(KEYS.settings);
    }
    if ("transactions" in data) {
      localStorage.setItem(KEYS.transactions, JSON.stringify(Array.isArray(data.transactions) ? data.transactions : []));
    }
    if ("paidFixed" in data) {
      localStorage.setItem(KEYS.paidFixed, JSON.stringify(data.paidFixed || {}));
    }
    localStorage.setItem(KEYS.localModified, data.local_modified_at || new Date().toISOString());
    const signature = payloadSignature({
      version: 4,
      settings: "settings" in data ? data.settings : getSettings(),
      transactions: "transactions" in data ? (Array.isArray(data.transactions) ? data.transactions : []) : getTransactions(),
      paidFixed: "paidFixed" in data ? (data.paidFixed || {}) : getPaidFixed(),
      local_modified_at: data.local_modified_at || localStorage.getItem(KEYS.localModified),
    });
    localStorage.setItem(KEYS.syncDirty, "0");
    localStorage.setItem(KEYS.lastSignature, signature);
    CLOUD.lastSyncedSignature = signature;
  } finally {
    CLOUD.suppressLocalSync = false;
  }
}

function updateSyncUI(text, kind = "") {
  const status = $("#syncStatusText");
  if (status) {
    status.textContent = text;
    status.className = `muted ${kind}`.trim();
  }
  const btn = $("#syncBtn");
  if (btn) {
    btn.title = text;
    btn.setAttribute("aria-label", `${text}. Sincronizar agora`);
    btn.dataset.syncState = kind;
    $("#headerSyncLabel").textContent = kind === "sync-error" ? "Ver conexão" : kind === "sync-warn" ? "Salvo no aparelho" : "Sincronizado";
  }
}

async function ensureProfile(user, context = accountContext()) {
  if (!user || !navigator.onLine) return;

  const lastChecked = Number(localStorage.getItem(KEYS.profileCheckedAt) || 0);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  if (lastChecked && Date.now() - lastChecked < sevenDays) return;

  const name = user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário";
  const { error } = await supabaseClient
    .from("profiles")
    .upsert({ id: user.id, email: user.email, name }, { onConflict: "id" });
  if (!isCurrentAccount(context)) return;

  if (error) {
    console.warn("Profile:", error.message);
    return;
  }

  localStorage.setItem(KEYS.profileCheckedAt, String(Date.now()));
}

async function fetchCloudFinancialData(context = accountContext()) {
  if (!context.userId) return null;
  const { data, error } = await supabaseClient
    .from("financial_data")
    .select("data, updated_at")
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function uploadLocalToCloud({ silent = false, force = false } = {}) {
  if (!CLOUD.user) return;
  if (CLOUD.conflict && !force) {
    updateSyncUI("Há alterações diferentes nos aparelhos — escolha quais dados manter", "sync-warn");
    return false;
  }
  const context = accountContext();
  let failed = false;
  let retryable = true;

  if (!navigator.onLine) {
    markSyncDirty();
    updateSyncUI("Offline — alterações salvas neste aparelho", "sync-warn");
    return;
  }

  if (CLOUD.syncing) {
    CLOUD.pendingSync = true;
    return;
  }

  const payload = localFinancialPayload();
  const signature = payloadSignature(payload);
  const lastSignature = lastKnownSignature();

  // No write request if nothing changed.
  if (!force && !isSyncDirty() && lastSignature && signature === lastSignature) {
    const lastSync = localStorage.getItem(KEYS.lastSync);
    updateSyncUI(
      lastSync
        ? `Tudo sincronizado • ${new Date(lastSync).toLocaleString("pt-BR")}`
        : "Tudo sincronizado",
      "sync-ok"
    );
    return;
  }

  CLOUD.syncing = true;
  CLOUD.pendingSync = false;
  if (!silent) updateSyncUI("Sincronizando...", "sync-warn");

  const now = new Date().toISOString();

  try {
    const { error } = await supabaseClient
      .from("financial_data")
      .upsert({
        user_id: context.userId,
        data: payload,
        updated_at: now,
      }, { onConflict: "user_id" });
    if (!isCurrentAccount(context)) return false;

    if (error) throw error;

    CLOUD.lastCloudUpdate = now;
    localStorage.setItem(KEYS.lastSync, now);
    markSyncClean(signature);
    CLOUD.retryCount = 0;
    updateSyncUI(`Sincronizado em ${new Date(now).toLocaleString("pt-BR")}`, "sync-ok");
    return true;
  } catch (error) {
    if (!isCurrentAccount(context)) return false;
    failed = true;
    retryable = ![400, 401, 403].includes(Number(error.status || error.statusCode)) && !["42501", "23514"].includes(error.code);
    console.error(error);
    markSyncDirty();
    updateSyncUI("Falha ao sincronizar — seus dados continuam salvos localmente", "sync-error");
    if (!silent) toast("Não foi possível sincronizar com a nuvem.");
    return false;
  } finally {
    // A previous account's response must never modify the current account's state.
    if (!isCurrentAccount(context)) return;
    CLOUD.syncing = false;

    // If something changed while a request was in flight, one new grouped sync is enough.
    if (!CLOUD.loggingOut && (CLOUD.pendingSync || payloadSignature(localFinancialPayload()) !== signature)) {
      CLOUD.pendingSync = false;
      scheduleCloudSync();
    } else if (failed && retryable && !CLOUD.loggingOut && navigator.onLine && CLOUD.retryCount < 3) {
      scheduleCloudSync({ retry: true });
    } else if (!failed && !CLOUD.loggingOut && hasUnsyncedChanges()) {
      scheduleCloudSync();
    }
  }
}

function scheduleCloudSync({ retry = false } = {}) {
  if (!CLOUD.user || CLOUD.loggingOut || CLOUD.conflict) return;
  const context = accountContext();
  clearTimeout(CLOUD.syncTimer);
  markSyncDirty();
  if (!retry) CLOUD.retryCount = 0;
  const delay = retry ? [10000, 30000, 60000][CLOUD.retryCount++] : CLOUD.debounceMs;
  updateSyncUI(retry ? `Salvo no aparelho • nova tentativa em ${delay / 1000}s` : "Alterações salvas • sincronização em instantes", "sync-warn");

  CLOUD.syncTimer = setTimeout(() => {
    CLOUD.syncTimer = null;
    if (isCurrentAccount(context)) uploadLocalToCloud({ silent: true });
  }, delay);
}

async function reconcileCloudAndLocal(context = accountContext()) {
  updateSyncUI("Carregando seus dados...", "sync-warn");

  CLOUD.lastSyncedSignature = localStorage.getItem(KEYS.lastSignature);

  let cloudRow = null;
  try {
    cloudRow = await fetchCloudFinancialData(context);
  } catch (error) {
    if (!isCurrentAccount(context)) return;
    console.error(error);
    CLOUD.ready = true;
    updateSyncUI(
      currentAccountHasLocalData()
        ? (isSyncDirty()
            ? "Sem acesso à nuvem — há alterações pendentes neste aparelho"
            : "Sem acesso à nuvem — usando os dados locais desta conta")
        : "Sem acesso à nuvem — esta conta ainda não possui dados locais",
      "sync-error"
    );
    return;
  }
  if (!isCurrentAccount(context)) return;

  if (cloudRow) {
    try {
      cloudRow.data = FinancialValidation.normalizeFinancialData(cloudRow.data);
    } catch (error) {
      CLOUD.ready = false;
      updateSyncUI("Dados da nuvem inválidos — os dados locais foram preservados", "sync-error");
      return;
    }
    CLOUD.lastCloudUpdate = cloudRow.updated_at;

    const localModified = localStorage.getItem(KEYS.localModified);
    const cloudModified = cloudRow.data?.local_modified_at || cloudRow.updated_at;
    const localHasUnsyncedWork = currentAccountHasLocalData() && isSyncDirty();
    if (localHasUnsyncedWork && !isDateAfter(localModified, cloudModified)) {
      CLOUD.ready = true;
      CLOUD.conflict = true;
      CLOUD.remoteConflict = cloudRow;
      $("#syncConflict").classList.remove("hidden");
      updateSyncUI("Há alterações locais e dados mais recentes na nuvem — escolha quais manter", "sync-warn");
      return;
    }

    // Preserve offline/local edits instead of silently overwriting them.
    if (localHasUnsyncedWork && isDateAfter(localModified, cloudModified)) {
      CLOUD.ready = true;
      await uploadLocalToCloud({ silent: true });
      return;
    }

    try {
      applyCloudPayload(cloudRow.data || {});
    } catch (error) {
      console.error(error);
      CLOUD.ready = false;
      updateSyncUI("Dados da nuvem inválidos — os dados locais foram preservados", "sync-error");
      return;
    }
    localStorage.setItem(KEYS.lastSync, cloudRow.updated_at || new Date().toISOString());
    markSyncClean();
    CLOUD.ready = true;
    updateSyncUI("Dados desta conta carregados da nuvem", "sync-ok");
    return;
  }

  if (currentAccountHasLocalData() && hasMeaningfulLocalData()) {
    CLOUD.ready = true;
    markSyncDirty();
    await uploadLocalToCloud({ silent: true });
    return;
  }

  const migratedLegacy = migrateLegacyDataOnceForUser();
  if (migratedLegacy && hasMeaningfulLocalData()) {
    CLOUD.ready = true;
    markSyncDirty();
    await uploadLocalToCloud({ silent: true });
    return;
  }

  clearCurrentAccountLocalData();
  CLOUD.ready = true;
  markSyncClean();
  updateSyncUI("Nova conta — comece sua configuração financeira", "sync-ok");
}

async function enterAuthenticatedApp(user) {
  clearTimeout(CLOUD.syncTimer);
  CLOUD.accountEpoch += 1;
  CLOUD.user = user;
  CLOUD.ready = false;
  CLOUD.syncing = false;
  CLOUD.pendingSync = false;
  CLOUD.retryCount = 0;
  CLOUD.loggingOut = false;
  CLOUD.conflict = false;
  CLOUD.remoteConflict = null;
  CLOUD.lastSyncedSignature = null;
  const context = accountContext();
  clearAccountScreen();
  showAuthScreen("Carregando os dados desta conta...");

  $("#accountEmail").textContent = user.email || "Conta";
  $("#settingsAccountEmail").textContent = user.email || "Conta conectada";

  await ensureProfile(user, context);
  if (!isCurrentAccount(context)) return;
  await reconcileCloudAndLocal(context);
  if (!isCurrentAccount(context)) return;

  if (hasCompletedSetup()) showDashboard();
  else showOnboarding();
}

function clearAccountScreen() {
  $("#syncConflict").classList.add("hidden");
  closeTransactionModal();
  closeSettingsDialog();
  state.setupIncomes = [];
  state.setupFixed = [];
  state.setupStep = 1;
  transactionFilters.type = "all";
  transactionFilters.search = "";
  $("#transactionSearch").value = "";
  $$("[data-transaction-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.transactionFilter === "all")));
  $$("#transactionList, #fixedStatusList, #settingsIncomeList, #settingsFixedList, #setupIncomeList, #setupFixedList, #topExpensesList, #reportTextSummary, #reportPendingList, #reportPaidList").forEach((element) => { element.textContent = ""; });
  Object.keys(reportCharts).forEach(destroyChart);
  $("#reportsView").classList.add("hidden");
  $("#dashboardView").classList.remove("hidden");
  $("#transactionForm").reset();
  $("#transactionDate").value = localToday();
  fillTransactionCategories();
  $("#accountEmail").textContent = "";
  $("#settingsAccountEmail").textContent = "Conta";
  $("#authPassword").value = "";
  $("#authPassword").type = "password";
  $("#togglePassword").setAttribute("aria-pressed", "false");
  $("#togglePassword").setAttribute("aria-label", "Mostrar senha");
}

function leaveAuthenticatedApp(message = "Sua sessão foi encerrada. Entre novamente.") {
  clearTimeout(CLOUD.syncTimer);
  CLOUD.accountEpoch += 1;
  CLOUD.user = null;
  CLOUD.ready = false;
  CLOUD.syncing = false;
  CLOUD.pendingSync = false;
  CLOUD.lastSyncedSignature = null;
  CLOUD.retryCount = 0;
  CLOUD.loggingOut = false;
  CLOUD.conflict = false;
  CLOUD.remoteConflict = null;
  clearAccountScreen();
  showAuthScreen(message);
}

async function initializeV4() {
  $("#transactionDate").value = localToday();
  $("#monthFilter").value = currentMonth();
  fillTransactionCategories();

  setAuthMode("login");

  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (session?.user) await enterAuthenticatedApp(session.user);
    else showAuthScreen();
  } catch (error) {
    console.error(error);
    leaveAuthenticatedApp("Não foi possível abrir a sessão. Entre novamente.");
  }
}

$("#loginTab").addEventListener("click", () => setAuthMode("login"));
$("#signupTab").addEventListener("click", () => setAuthMode("signup"));

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;

  $("#authSubmitBtn").disabled = true;
  setAuthMessage(authMode === "signup" ? "Criando sua conta..." : "Entrando...", "");

  try {
    if (authMode === "signup") {
      const name = $("#authName").value.trim();
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;

      if (data.session?.user) {
        await enterAuthenticatedApp(data.session.user);
      } else {
        setAuthMessage("Conta criada. Confira seu e-mail e confirme o cadastro antes de entrar.", "success");
        setAuthMode("login");
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await enterAuthenticatedApp(data.user);
    }
  } catch (error) {
    setAuthMessage(friendlyAuthError(error), "error");
  } finally {
    $("#authSubmitBtn").disabled = false;
  }
});

$("#googleLoginBtn").addEventListener("click", async () => {
  setAuthMessage("Abrindo login do Google...", "");
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) setAuthMessage(friendlyAuthError(error), "error");
});

$("#logoutBtn").addEventListener("click", async () => {
  if (CLOUD.loggingOut) return;
  const context = accountContext();
  CLOUD.loggingOut = true;
  $("#logoutBtn").disabled = true;
  clearTimeout(CLOUD.syncTimer);
  try {
    if (CLOUD.user && navigator.onLine && hasUnsyncedChanges()) await uploadLocalToCloud({ silent: true });
    if (!isCurrentAccount(context)) return;
    const { error } = await supabaseClient.auth.signOut({ scope: "local" });
    if (error) throw error;
    if (isCurrentAccount(context)) leaveAuthenticatedApp("Você saiu da sua conta. Seus dados locais serão usados somente ao entrar novamente nesta conta.");
  } catch (error) {
    if (isCurrentAccount(context)) {
      CLOUD.loggingOut = false;
      toast("Não foi possível encerrar a sessão. Tente sair novamente.");
    }
  } finally {
    $("#logoutBtn").disabled = false;
  }
});

$("#syncNowBtn").addEventListener("click", () => uploadLocalToCloud());
$("#syncBtn").addEventListener("click", () => uploadLocalToCloud());

window.addEventListener("online", () => {
  if (CLOUD.user && hasUnsyncedChanges()) {
    uploadLocalToCloud({ silent: true });
  } else if (CLOUD.user) {
    updateSyncUI("Conectado • tudo sincronizado", "sync-ok");
  }
});
window.addEventListener("offline", () => {
  updateSyncUI("Offline — alterações ficam salvas neste aparelho", "sync-warn");
});

$("#exportBackupBtn").addEventListener("click", () => {
  const backup = {
    app: "Minhas Finanças",
    version: 4,
    exported_at: new Date().toISOString(),
    user_email: CLOUD.user?.email || null,
    financial_data: localFinancialPayload(),
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `minhas-financas-backup-${localToday()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Backup exportado.");
});

$("#importBackupInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const context = accountContext();
    if (file.size > 5 * 1024 * 1024) throw new Error("Backup maior que 5 MB.");
    const parsed = JSON.parse(await file.text());
    if (!isCurrentAccount(context)) return;
    const data = FinancialValidation.normalizeFinancialData(parsed.financial_data || parsed);

    if (!data || typeof data !== "object") throw new Error("Arquivo inválido.");
    if (!confirm("Importar este backup substituirá os dados financeiros atuais desta conta. Continuar?")) {
      event.target.value = "";
      return;
    }

    applyCloudPayload({
      settings: data.settings || null,
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      paidFixed: data.paidFixed || {},
      local_modified_at: new Date().toISOString(),
    });
    markSyncDirty();

    if (CLOUD.user) await uploadLocalToCloud();
    if (!isCurrentAccount(context)) return;
    if (hasCompletedSetup()) showDashboard();
    else showOnboarding();
    renderSettingsLists();
    toast("Backup importado com sucesso.");
  } catch (error) {
    console.error(error);
    toast("Não foi possível importar esse arquivo.");
  } finally {
    event.target.value = "";
  }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  const authEventEpoch = ++CLOUD.authEventEpoch;
  if (event === "SIGNED_OUT") {
    leaveAuthenticatedApp();
  } else if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event) && session?.user && session.user.id !== CLOUD.user?.id) {
    // Supabase calls must run outside the auth callback's lock.
    setTimeout(() => {
      if (authEventEpoch !== CLOUD.authEventEpoch) return;
      if (session.user.id !== CLOUD.user?.id) enterAuthenticatedApp(session.user).catch(() => {
        if (CLOUD.user?.id === session.user.id) leaveAuthenticatedApp("Não foi possível carregar sua conta.");
      });
    }, 0);
  }
});

$("#keepLocalData").addEventListener("click", async () => {
  if (!CLOUD.conflict) return;
  const context = accountContext();
  $("#keepLocalData").disabled = true;
  $("#useCloudData").disabled = true;
  try {
    const success = await uploadLocalToCloud({ force: true });
    if (!isCurrentAccount(context)) return;
    if (success) {
      CLOUD.conflict = false;
      CLOUD.remoteConflict = null;
      $("#syncConflict").classList.add("hidden");
      // Changes made while uploading still need their grouped sync.
      if (hasUnsyncedChanges()) scheduleCloudSync();
    }
  } finally {
    $("#keepLocalData").disabled = false;
    $("#useCloudData").disabled = false;
  }
});

$("#useCloudData").addEventListener("click", () => {
  if (!CLOUD.conflict || !CLOUD.remoteConflict) return;
  if (!confirm("Usar os dados da nuvem substituirá as alterações ainda não enviadas deste aparelho. Continuar?")) return;
  const row = CLOUD.remoteConflict;
  applyCloudPayload(row.data);
  localStorage.setItem(KEYS.lastSync, row.updated_at || new Date().toISOString());
  CLOUD.conflict = false;
  CLOUD.remoteConflict = null;
  $("#syncConflict").classList.add("hidden");
  updateSyncUI("Dados da nuvem aplicados nesta conta", "sync-ok");
  hasCompletedSetup() ? showDashboard() : showOnboarding();
});

initializeV4();


// ===== V5.2 MOTION SYSTEM =====
function addMotionClasses() {
  const selectors = [
    [".editorial-head", "motion-left"],
    [".editorial-balance", "motion-right"],
    [".main-grid > .panel:nth-child(1)", "motion-left"],
    [".main-grid > .panel:nth-child(2)", "motion-right"],
    ["#dashboardView > .panel", "motion-up"],
    ["#reportsView .month-row", "motion-left"],
    ["#reportsView .report-summary-grid", "motion-right"],
    ["#reportsView .reports-grid", "motion-up"],
    ["#reportsView > .panel", "motion-up"],
  ];

  selectors.forEach(([selector, cls]) => {
    document.querySelectorAll(selector).forEach((el) => el.classList.add(cls));
  });
}

function motionObserverStart() {
  addMotionClasses();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("motion-visible");
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.12,
    rootMargin: "0px 0px -24px 0px"
  });

  document.querySelectorAll(".motion-left,.motion-right,.motion-up,.motion-scale")
    .forEach((el) => observer.observe(el));
}

function animateRenderedList(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  [...container.children].forEach((el, index) => {
    if (
      el.classList.contains("transaction-item") ||
      el.classList.contains("fixed-status") ||
      el.classList.contains("rank-item") ||
      el.classList.contains("mini-item")
    ) {
      el.classList.add("motion-list-item");
      el.style.setProperty("--motion-delay", `${Math.min(index * 55, 385)}ms`);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.add("motion-visible"));
      });
    }
  });
}

function animateCurrentLists() {
  animateRenderedList("#transactionList");
  animateRenderedList("#fixedStatusList");
  animateRenderedList("#topExpensesList");
  animateRenderedList("#settingsIncomeList");
  animateRenderedList("#settingsFixedList");
}

function retriggerViewAnimation(viewEl) {
  if (!viewEl) return;
  viewEl.classList.remove("view-enter");
  void viewEl.offsetWidth;
  viewEl.classList.add("view-enter");
}

window.addEventListener("load", () => {
  motionObserverStart();
  animateCurrentLists();
});



// ===== V5.3 TRANSACTION MODAL =====
const dialogBackgroundElements = new Set();
let settingsDialogOpener;
let settingsDialogPreviousOverflow;

function setDialogBackgroundInert(inert) {
  if (inert) {
    $$(".app-header, #authScreen, #onboarding, #dashboard, #syncConflict, .bottom-nav, #iosInstallBanner").forEach((element) => {
      if (!element.inert) {
        element.inert = true;
        dialogBackgroundElements.add(element);
      }
    });
  } else {
    dialogBackgroundElements.forEach((element) => { element.inert = false; });
    dialogBackgroundElements.clear();
  }
}

function openSettingsDialog() {
  const panel = $("#settingsPanel");
  if (!panel.classList.contains("hidden")) return;
  if (!$("#transactionModal").classList.contains("hidden")) closeTransactionModal();
  settingsDialogOpener = document.activeElement;
  settingsDialogPreviousOverflow = document.body.style.overflow;
  updateMobileVisualViewport();
  panel.classList.remove("hidden");
  document.body.classList.add("settings-modal-open");
  document.body.style.overflow = "hidden";
  $("#settingsPanel .modal").scrollTop = 0;
  $("#closeSettings").focus({ preventScroll: true });
  setDialogBackgroundInert(true);
}

function closeSettingsDialog() {
  const panel = $("#settingsPanel");
  if (panel.classList.contains("hidden")) return;
  if (panel.contains(document.activeElement)) document.activeElement.blur();
  panel.classList.add("hidden");
  document.body.classList.remove("settings-modal-open");
  document.body.style.overflow = settingsDialogPreviousOverflow;
  setDialogBackgroundInert(false);
  settingsDialogOpener?.focus({ preventScroll: true });
}

let transactionModalFocusTimer;
let transactionModalOpener;
let transactionModalPreviousOverflow;

function openTransactionModal() {
  const modal = $("#transactionModal");
  if (!modal || !modal.classList.contains("hidden")) return;
  if (!$("#settingsPanel").classList.contains("hidden")) closeSettingsDialog();

  transactionModalOpener = document.activeElement;
  transactionModalPreviousOverflow = document.body.style.overflow;
  updateMobileVisualViewport();
  modal.classList.remove("hidden");
  document.body.classList.add("transaction-modal-open");
  document.body.style.overflow = "hidden";

  $(".transaction-sheet-body").scrollTop = 0;
  $("#closeTransactionModal")?.focus({ preventScroll: true });
  setDialogBackgroundInert(true);
  transactionModalFocusTimer = setTimeout(() => {
    // On desktop, focusing is convenient.
    // On mobile it opens the keyboard immediately and can cover the action buttons.
    const mobileSheet = window.matchMedia("(max-width:580px), (max-width:960px) and (max-height:500px)").matches;
    if (!modal.classList.contains("hidden") && !mobileSheet) {
      $("#transactionAmount")?.focus();
    }
  }, 120);
}

function closeTransactionModal() {
  const modal = $("#transactionModal");
  if (!modal || modal.classList.contains("hidden")) return;

  clearTimeout(transactionModalFocusTimer);
  if (modal.contains(document.activeElement)) document.activeElement.blur();
  modal.classList.add("hidden");
  document.body.classList.remove("transaction-modal-open");
  document.body.style.overflow = transactionModalPreviousOverflow;
  setDialogBackgroundInert(false);
  transactionModalOpener?.focus({ preventScroll: true });
}

$("#closeTransactionModal")?.addEventListener("click", closeTransactionModal);
$("#cancelTransactionModal")?.addEventListener("click", closeTransactionModal);
$("#openTransactionModalInline")?.addEventListener("click", openTransactionModal);

$("#transactionModal")?.addEventListener("click", (event) => {
  if (event.target === $("#transactionModal")) closeTransactionModal();
});

document.addEventListener("keydown", (event) => {
  const settingsOpen = !$("#settingsPanel").classList.contains("hidden");
  const modal = settingsOpen ? $("#settingsPanel") : $("#transactionModal");
  if (modal.classList.contains("hidden")) return;
  if (event.key === "Tab") {
    const controls = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')]
      .filter((control) => control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  if (event.key === "Escape") {
    settingsOpen ? closeSettingsDialog() : closeTransactionModal();
  }
});

$(".import-label").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    $("#importBackupInput").click();
  }
});



// ===== V6 FLUENT MOBILE / NAV POLISH =====
function updateBottomNavSafeSpacing() {
  const nav = document.querySelector(".bottom-nav");
  if (!nav) return;

  const navHeight = nav.getBoundingClientRect().height || 68;
  document.documentElement.style.setProperty("--bottom-nav-space", `${Math.ceil(navHeight + 36)}px`);
}

window.addEventListener("load", updateBottomNavSafeSpacing);
window.addEventListener("resize", updateBottomNavSafeSpacing);
window.addEventListener("orientationchange", () => {
  setTimeout(updateBottomNavSafeSpacing, 180);
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    item.classList.remove("nav-tap");
    void item.offsetWidth;
    item.classList.add("nav-tap");
  });
});


// ===== V6.4.5 REAL MOBILE VIEWPORT =====
function updateMobileVisualViewport() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--mobile-visual-height", `${Math.round(height)}px`);
  const top = window.visualViewport?.offsetTop || 0;
  document.documentElement.style.setProperty("--mobile-visual-top", `${Math.round(top)}px`);
  document.body.classList.toggle("transaction-viewport-short", height <= 650);
}

updateMobileVisualViewport();
window.addEventListener("resize", updateMobileVisualViewport);
window.addEventListener("orientationchange", () => {
  setTimeout(updateMobileVisualViewport, 120);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateMobileVisualViewport);
  window.visualViewport.addEventListener("scroll", updateMobileVisualViewport);
}

