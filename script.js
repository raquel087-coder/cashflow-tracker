/* =============================================
   HOUSEHOLD CASH FLOW TRACKING SYSTEM
   script.js — All Application Logic
   ============================================= */

'use strict';

// ===================================================
// 1. DATA STORE — All state lives here
// ===================================================
const DB = {
  KEYS: {
    transactions: 'hcf_transactions',
    goals: 'hcf_goals',
    budget: 'hcf_budget',
    bills: 'hcf_bills',
    settings: 'hcf_settings',
    darkMode: 'hcf_darkmode'
  },

  // Load from localStorage or return default
  load(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },

  // Save to localStorage
  save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch (e) { console.error('Save failed', e); }
  }
};

// ===================================================
// 2. APPLICATION STATE
// ===================================================
let transactions = DB.load(DB.KEYS.transactions, []);
let goals        = DB.load(DB.KEYS.goals, []);
let budget       = DB.load(DB.KEYS.budget, {});
let bills        = DB.load(DB.KEYS.bills, []);
let settings     = DB.load(DB.KEYS.settings, {
  familyName: 'Our Family',
  husbandName: 'Husband',
  wifeName: 'Wife',
  currency: '₱',
  emergencyTarget: 50000
});

// Pagination state
let currentPage = 1;
const PER_PAGE = 10;

// Chart instances — stored so we can destroy/rebuild
let pieChartInstance = null;
let barChartInstance = null;
let trendChartInstance = null;

// ===================================================
// 3. UTILITIES
// ===================================================

/** Format a number as currency */
function fmt(num) {
  const sym = settings.currency || '₱';
  return `${sym}${Math.abs(num).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Generate a unique ID */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Today's date string YYYY-MM-DD */
function today() {
  return new Date().toISOString().split('T')[0];
}

/** Format a date string for display */
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Days until a date */
function daysUntil(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d - now) / 86400000);
}

/** Category emoji map */
const CAT_EMOJI = {
  'Food': '🍔', 'Bills': '💡', 'Transportation': '🚗',
  'School Expenses': '🏫', 'Business': '💼', 'Savings': '🏦',
  'Emergency Fund': '🆘', 'Miscellaneous': '🎲'
};

/** Category CSS class map */
const CAT_CLASS = {
  'Food': 'cat-food', 'Bills': 'cat-bills', 'Transportation': 'cat-transport',
  'School Expenses': 'cat-school', 'Business': 'cat-business', 'Savings': 'cat-savings',
  'Emergency Fund': 'cat-emergency', 'Miscellaneous': 'cat-misc'
};

/** Show a toast message */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3200);
}

// ===================================================
// 4. PAGE NAVIGATION
// ===================================================

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const page = document.getElementById(`page-${pageId}`);
  if (page) page.classList.add('active');

  const link = document.querySelector(`.nav-link[data-page="${pageId}"]`);
  if (link) link.classList.add('active');

  // Update topbar title
  const titles = {
    dashboard: 'Dashboard', transactions: 'Transactions',
    analytics: 'Analytics', savings: 'Savings & Goals',
    budget: 'Budget Planner', reports: 'Reports', settings: 'Settings'
  };
  document.getElementById('pageTitle').textContent = titles[pageId] || pageId;

  // Page-specific init
  if (pageId === 'analytics') renderCharts();
  if (pageId === 'budget') renderBudget();
  if (pageId === 'reports') renderReportPreview();
  if (pageId === 'settings') loadSettings();
  if (pageId === 'savings') renderGoals();

  closeSidebar();
}

// ===================================================
// 5. SIDEBAR / TOPBAR
// ===================================================

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

// ===================================================
// 6. DARK MODE
// ===================================================

function initDarkMode() {
  const saved = localStorage.getItem(DB.KEYS.darkMode);
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
}

function toggleDarkMode() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(DB.KEYS.darkMode, next);
}

// ===================================================
// 7. DASHBOARD
// ===================================================

function renderDashboard() {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  // Filter this month's transactions
  const monthTxns = transactions.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  // Totals (all time)
  const totalIncome   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const remaining     = totalIncome - totalExpenses;
  const totalSavings  = transactions.filter(t =>
    t.type === 'income' && (t.category === 'Savings' || t.category === 'Emergency Fund')
  ).reduce((s, t) => s + t.amount, 0);

  document.getElementById('totalIncome').textContent    = fmt(totalIncome);
  document.getElementById('totalExpenses').textContent  = fmt(totalExpenses);
  document.getElementById('remainingBalance').textContent = remaining >= 0 ? fmt(remaining) : `-${fmt(remaining)}`;
  document.getElementById('totalSavings').textContent   = fmt(totalSavings);

  document.getElementById('incomeChange').textContent   = `${fmt(monthTxns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0))} this month`;
  document.getElementById('expenseChange').textContent  = `${fmt(monthTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0))} this month`;

  // Remaining balance color
  const balEl = document.getElementById('remainingBalance');
  balEl.style.color = remaining >= 0 ? 'var(--income-color)' : 'var(--expense-color)';

  renderWeeklySummary();
  renderMonthlySummary();
  renderRecentTransactions();
  renderFamilyIncome();
}

// ---- Weekly Summary ----
function renderWeeklySummary() {
  const el = document.getElementById('weeklyBars');
  if (!el) return;

  const now = new Date();
  // Show last 7 days
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const dayTxns = transactions.filter(t => t.date === key);
    const income  = dayTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = dayTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    dayData.push({ label: days[d.getDay()], income, expense });
  }

  const maxVal = Math.max(...dayData.map(d => Math.max(d.income, d.expense)), 1);

  el.innerHTML = dayData.map(d => `
    <div class="week-day">
      <span class="week-day-label">${d.label}</span>
      <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
        <div class="week-bar-track"><div class="week-bar-fill" style="width:${(d.income/maxVal)*100}%"></div></div>
        <div class="week-bar-track"><div class="week-bar-fill expense" style="width:${(d.expense/maxVal)*100}%"></div></div>
      </div>
      <span class="week-amount">${d.expense > 0 ? fmt(d.expense) : (d.income > 0 ? fmt(d.income) : '—')}</span>
    </div>
  `).join('');
}

// ---- Monthly Summary ----
function renderMonthlySummary() {
  const el = document.getElementById('monthlySummaryBox');
  if (!el) return;

  const now = new Date();
  const m = now.getMonth(), y = now.getFullYear();

  const mTxns = transactions.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getMonth() === m && d.getFullYear() === y;
  });

  const mIncome  = mTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const mExpense = mTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const mBalance = mIncome - mExpense;

  const monthName = now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  el.innerHTML = `
    <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;">${monthName}</p>
    <div class="monthly-row income">
      <span class="monthly-row-label">💵 Total Income</span>
      <span class="monthly-row-value" style="color:var(--income-color)">${fmt(mIncome)}</span>
    </div>
    <div class="monthly-row expense">
      <span class="monthly-row-label">🛒 Total Expenses</span>
      <span class="monthly-row-value" style="color:var(--expense-color)">${fmt(mExpense)}</span>
    </div>
    <div class="monthly-row balance">
      <span class="monthly-row-label">💼 Net Cash Flow</span>
      <span class="monthly-row-value" style="color:${mBalance>=0?'var(--income-color)':'var(--expense-color)'}">${mBalance>=0?'+':''}${fmt(mBalance)}</span>
    </div>
  `;
}

// ---- Recent Transactions (last 5) ----
function renderRecentTransactions() {
  const tbody = document.getElementById('recentTxnBody');
  if (!tbody) return;

  const recent = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  if (recent.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No transactions yet. Add one!</td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(t => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td>${escapeHtml(t.desc)}</td>
      <td><span class="badge ${CAT_CLASS[t.category]||''}">${CAT_EMOJI[t.category]||''} ${t.category}</span></td>
      <td><span class="badge badge-${t.type}">${t.type.charAt(0).toUpperCase()+t.type.slice(1)}</span></td>
      <td class="amount-${t.type}">${t.type==='expense'?'-':'+'} ${fmt(t.amount)}</td>
    </tr>
  `).join('');
}

// ---- Family Income ----
function renderFamilyIncome() {
  const el = document.getElementById('familyIncomeGrid');
  if (!el) return;

  const members = [
    { key: 'Husband', label: settings.husbandName || 'Husband', cls: 'av-husband' },
    { key: 'Wife',    label: settings.wifeName || 'Wife',     cls: 'av-wife' },
    { key: 'Joint',   label: 'Joint / Family',                cls: 'av-joint' }
  ];

  el.innerHTML = members.map(m => {
    const inc  = transactions.filter(t => t.member === m.key && t.type === 'income').reduce((s,t)=>s+t.amount,0);
    const exp  = transactions.filter(t => t.member === m.key && t.type === 'expense').reduce((s,t)=>s+t.amount,0);
    return `
      <div class="member-income-card">
        <div class="member-avatar ${m.cls}">${m.label.charAt(0)}</div>
        <div class="member-name">${escapeHtml(m.label)}</div>
        <div class="member-total">${fmt(inc)}</div>
        <div class="member-label">Income — Expenses: <strong style="color:var(--expense-color)">${fmt(exp)}</strong></div>
      </div>
    `;
  }).join('');
}

// ===================================================
// 8. TRANSACTIONS
// ===================================================

function submitTransaction() {
  const date     = document.getElementById('txnDate').value;
  const desc     = document.getElementById('txnDesc').value.trim();
  const category = document.getElementById('txnCategory').value;
  const type     = document.getElementById('txnType').value;
  const amount   = parseFloat(document.getElementById('txnAmount').value);
  const member   = document.getElementById('txnMember').value;
  const editId   = document.getElementById('txnEditId').value;

  if (!date || !desc || isNaN(amount) || amount <= 0) {
    showToast('Please fill all fields correctly.', 'error');
    return;
  }

  if (editId) {
    // Edit mode
    const idx = transactions.findIndex(t => t.id === editId);
    if (idx !== -1) {
      transactions[idx] = { ...transactions[idx], date, desc, category, type, amount, member };
      showToast('Transaction updated!', 'success');
    }
  } else {
    // New transaction
    transactions.push({ id: uid(), date, desc, category, type, amount, member });
    showToast('Transaction added!', 'success');
  }

  DB.save(DB.KEYS.transactions, transactions);
  resetForm();
  renderDashboard();
  renderTransactions();
  checkBillNotifications();
}

function resetForm() {
  document.getElementById('txnDate').value     = today();
  document.getElementById('txnDesc').value     = '';
  document.getElementById('txnCategory').value = 'Food';
  document.getElementById('txnType').value     = 'income';
  document.getElementById('txnAmount').value   = '';
  document.getElementById('txnMember').value   = 'Husband';
  document.getElementById('txnEditId').value   = '';
  document.getElementById('txnSubmitBtn').textContent = 'Add Transaction';
}

function editTransaction(id) {
  const t = transactions.find(t => t.id === id);
  if (!t) return;
  document.getElementById('txnDate').value     = t.date;
  document.getElementById('txnDesc').value     = t.desc;
  document.getElementById('txnCategory').value = t.category;
  document.getElementById('txnType').value     = t.type;
  document.getElementById('txnAmount').value   = t.amount;
  document.getElementById('txnMember').value   = t.member || 'Husband';
  document.getElementById('txnEditId').value   = t.id;
  document.getElementById('txnSubmitBtn').textContent = 'Update Transaction';
  showPage('transactions');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  transactions = transactions.filter(t => t.id !== id);
  DB.save(DB.KEYS.transactions, transactions);
  renderDashboard();
  renderTransactions();
  showToast('Transaction deleted.', 'warning');
}

function renderTransactions() {
  const tbody = document.getElementById('allTxnBody');
  if (!tbody) return;

  const search   = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const typeFlt  = document.getElementById('filterType')?.value || '';
  const catFlt   = document.getElementById('filterCategory')?.value || '';
  const monthFlt = document.getElementById('filterMonth')?.value || '';

  // Populate month filter
  populateMonthFilter();

  let filtered = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (search)   filtered = filtered.filter(t => t.desc.toLowerCase().includes(search) || t.category.toLowerCase().includes(search));
  if (typeFlt)  filtered = filtered.filter(t => t.type === typeFlt);
  if (catFlt)   filtered = filtered.filter(t => t.category === catFlt);
  if (monthFlt) filtered = filtered.filter(t => t.date.startsWith(monthFlt));

  // Pagination
  const total = filtered.length;
  const pages = Math.ceil(total / PER_PAGE) || 1;
  if (currentPage > pages) currentPage = pages;
  const start = (currentPage - 1) * PER_PAGE;
  const paginated = filtered.slice(start, start + PER_PAGE);

  if (paginated.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No transactions found.</td></tr>`;
  } else {
    tbody.innerHTML = paginated.map(t => `
      <tr>
        <td>${fmtDate(t.date)}</td>
        <td>${escapeHtml(t.desc)}</td>
        <td><span class="badge ${CAT_CLASS[t.category]||''}">${CAT_EMOJI[t.category]||''} ${t.category}</span></td>
        <td>${escapeHtml(t.member || 'Joint')}</td>
        <td><span class="badge badge-${t.type}">${t.type.charAt(0).toUpperCase()+t.type.slice(1)}</span></td>
        <td class="amount-${t.type}">${t.type==='expense'?'-':'+'} ${fmt(t.amount)}</td>
        <td>
          <button class="action-btn edit-btn" onclick="editTransaction('${t.id}')">✏️ Edit</button>
          <button class="action-btn del-btn" onclick="deleteTransaction('${t.id}')">🗑️ Del</button>
        </td>
      </tr>
    `).join('');
  }

  // Render pagination
  renderPagination(pages, filtered);
}

function renderPagination(pages, filtered) {
  const el = document.getElementById('pagination');
  if (!el || pages <= 1) { if (el) el.innerHTML = ''; return; }

  let html = '';
  for (let i = 1; i <= pages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  el.innerHTML = html;
}

function goToPage(n) { currentPage = n; renderTransactions(); }

function populateMonthFilter() {
  const sel = document.getElementById('filterMonth');
  if (!sel) return;
  const months = [...new Set(transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
  const current = sel.value;
  sel.innerHTML = `<option value="">All Months</option>` +
    months.map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
      return `<option value="${m}" ${m === current ? 'selected' : ''}>${label}</option>`;
    }).join('');
}

// ===================================================
// 9. CHARTS & ANALYTICS
// ===================================================

function renderCharts() {
  renderPieChart();
  renderBarChart();
  renderTrendChart();
  renderSpendingAnalysis();
}

function getChartColors(n) {
  const palette = [
    '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'
  ];
  return Array.from({ length: n }, (_, i) => palette[i % palette.length]);
}

// ---- Pie Chart: Expenses by Category ----
function renderPieChart() {
  const ctx = document.getElementById('pieChart');
  if (!ctx) return;

  // Aggregate expenses by category
  const catMap = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(catMap);
  const data   = Object.values(catMap);

  if (pieChartInstance) pieChartInstance.destroy();

  if (labels.length === 0) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  pieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: getChartColors(labels.length),
        borderWidth: 2,
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim() || '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 14, font: { size: 12, family: "'DM Sans', sans-serif" }, color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#333' } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } }
      },
      cutout: '60%'
    }
  });
}

// ---- Bar Chart: Monthly Income vs Expenses ----
function renderBarChart() {
  const ctx = document.getElementById('barChart');
  if (!ctx) return;

  // Get last 6 months
  const months = [];
  const incomeData = [], expenseData = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
    months.push(label);

    const mTxns = transactions.filter(t => t.date.startsWith(key));
    incomeData.push(mTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
    expenseData.push(mTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
  }

  if (barChartInstance) barChartInstance.destroy();

  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: 'Income', data: incomeData, backgroundColor: '#10b98180', borderColor: '#10b981', borderWidth: 2, borderRadius: 6 },
        { label: 'Expenses', data: expenseData, backgroundColor: '#ef444480', borderColor: '#ef4444', borderWidth: 2, borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { size: 12, family: "'DM Sans', sans-serif" }, color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#333' } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#e2e8f020' }, ticks: { callback: v => fmt(v), font: { size: 11 } } }
      }
    }
  });
}

// ---- Trend Chart: 6-Month Line ----
function renderTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;

  const months = [], balanceData = [], incomeData = [], expenseData = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }));

    const mTxns = transactions.filter(t => t.date.startsWith(key));
    const inc = mTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = mTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    incomeData.push(inc);
    expenseData.push(exp);
    balanceData.push(inc - exp);
  }

  if (trendChartInstance) trendChartInstance.destroy();

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Net Balance', data: balanceData,
          borderColor: '#3b82f6', backgroundColor: '#3b82f615',
          fill: true, tension: 0.4, pointRadius: 5, pointHoverRadius: 7, borderWidth: 2
        },
        {
          label: 'Income', data: incomeData,
          borderColor: '#10b981', backgroundColor: 'transparent',
          fill: false, tension: 0.4, pointRadius: 4, borderWidth: 2, borderDash: [5, 3]
        },
        {
          label: 'Expenses', data: expenseData,
          borderColor: '#ef4444', backgroundColor: 'transparent',
          fill: false, tension: 0.4, pointRadius: 4, borderWidth: 2, borderDash: [5, 3]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { font: { size: 12, family: "'DM Sans', sans-serif" }, color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#333' } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } }
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#e2e8f020' }, ticks: { callback: v => fmt(v) } }
      }
    }
  });
}

// ---- Spending Analysis Cards ----
function renderSpendingAnalysis() {
  const el = document.getElementById('spendingAnalysis');
  if (!el) return;

  const catMap = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  });

  const total = Object.values(catMap).reduce((s, v) => s + v, 0) || 1;
  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    el.innerHTML = `<p style="color:var(--text-secondary);font-size:14px;grid-column:1/-1;text-align:center;padding:20px">No expense data yet.</p>`;
    return;
  }

  el.innerHTML = sorted.map(([cat, amt]) => `
    <div class="spend-cat-card">
      <span class="spend-cat-icon">${CAT_EMOJI[cat] || '📌'}</span>
      <span class="spend-cat-name">${cat}</span>
      <span class="spend-cat-amount">${fmt(amt)}</span>
      <div class="spend-cat-bar">
        <div class="spend-cat-fill" style="width:${Math.min((amt / total) * 100, 100).toFixed(1)}%"></div>
      </div>
      <span style="font-size:11px;color:var(--text-secondary)">${((amt/total)*100).toFixed(1)}% of total expenses</span>
    </div>
  `).join('');
}

// ===================================================
// 10. SAVINGS GOALS
// ===================================================

function openGoalModal(id = '') {
  document.getElementById('goalName').value    = '';
  document.getElementById('goalTarget').value  = '';
  document.getElementById('goalCurrent').value = '';
  document.getElementById('goalDeadline').value = '';
  document.getElementById('goalEmoji').value   = '🎯';
  document.getElementById('goalEditId').value  = '';
  document.getElementById('goalModalTitle').textContent = 'Add Savings Goal';

  if (id) {
    const g = goals.find(g => g.id === id);
    if (g) {
      document.getElementById('goalName').value    = g.name;
      document.getElementById('goalTarget').value  = g.target;
      document.getElementById('goalCurrent').value = g.current;
      document.getElementById('goalDeadline').value = g.deadline || '';
      document.getElementById('goalEmoji').value   = g.emoji || '🎯';
      document.getElementById('goalEditId').value  = g.id;
      document.getElementById('goalModalTitle').textContent = 'Edit Savings Goal';
    }
  }

  document.getElementById('goalModal').classList.add('open');
}

function closeGoalModal() {
  document.getElementById('goalModal').classList.remove('open');
}

function saveGoal() {
  const name    = document.getElementById('goalName').value.trim();
  const target  = parseFloat(document.getElementById('goalTarget').value);
  const current = parseFloat(document.getElementById('goalCurrent').value) || 0;
  const deadline = document.getElementById('goalDeadline').value;
  const emoji   = document.getElementById('goalEmoji').value || '🎯';
  const editId  = document.getElementById('goalEditId').value;

  if (!name || isNaN(target) || target <= 0) {
    showToast('Please fill in goal name and target amount.', 'error');
    return;
  }

  if (editId) {
    const idx = goals.findIndex(g => g.id === editId);
    if (idx !== -1) goals[idx] = { ...goals[idx], name, target, current, deadline, emoji };
    showToast('Goal updated!', 'success');
  } else {
    goals.push({ id: uid(), name, target, current, deadline, emoji });
    showToast('Goal added!', 'success');
  }

  DB.save(DB.KEYS.goals, goals);
  closeGoalModal();
  renderGoals();
}

function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  goals = goals.filter(g => g.id !== id);
  DB.save(DB.KEYS.goals, goals);
  renderGoals();
  showToast('Goal deleted.', 'warning');
}

function renderGoals() {
  const el = document.getElementById('goalsGrid');
  if (!el) return;

  if (goals.length === 0) {
    el.innerHTML = `<div class="no-goals" style="grid-column:1/-1">
      <p style="font-size:32px">🎯</p>
      <p>No savings goals yet. Add your first goal!</p>
    </div>`;
    return;
  }

  el.innerHTML = goals.map(g => {
    const pct = Math.min((g.current / g.target) * 100, 100).toFixed(1);
    const daysLeft = g.deadline ? daysUntil(g.deadline) : null;
    const daysStr = daysLeft !== null
      ? (daysLeft < 0 ? `<span style="color:var(--danger)">Deadline passed</span>` : `${daysLeft} days left`)
      : 'No deadline';

    return `
      <div class="goal-card">
        <div class="goal-header">
          <span class="goal-emoji">${g.emoji || '🎯'}</span>
          <div class="goal-actions">
            <button class="action-btn edit-btn" onclick="openGoalModal('${g.id}')">✏️</button>
            <button class="action-btn del-btn" onclick="deleteGoal('${g.id}')">🗑️</button>
          </div>
        </div>
        <div class="goal-name">${escapeHtml(g.name)}</div>
        <div class="goal-deadline">📅 ${daysStr}</div>
        <div class="goal-amounts">
          <span class="goal-current">${fmt(g.current)}</span>
          <span class="goal-divider">/</span>
          <span class="goal-target">${fmt(g.target)}</span>
        </div>
        <div class="goal-progress-track">
          <div class="goal-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="goal-pct">${pct}% achieved</div>
      </div>
    `;
  }).join('');

  renderEmergencyFund();
}

function renderEmergencyFund() {
  const el = document.getElementById('emergencyFundBox');
  if (!el) return;

  const efTotal = transactions.filter(t => t.category === 'Emergency Fund').reduce((s, t) => {
    return t.type === 'income' ? s + t.amount : s - t.amount;
  }, 0);

  const target = settings.emergencyTarget || 50000;
  const pct = Math.min((efTotal / target) * 100, 100).toFixed(1);

  el.innerHTML = `
    <div class="ef-top">
      <div>
        <div class="ef-amount">${fmt(Math.max(efTotal, 0))}</div>
        <div class="ef-label">Emergency Fund Balance</div>
      </div>
      <div class="ef-target">Target: ${fmt(target)}</div>
    </div>
    <div class="ef-progress-track">
      <div class="ef-progress-fill" style="width:${pct}%"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-top:6px">
      <span>${pct}% of target reached</span>
      <span>${fmt(Math.max(target - efTotal, 0))} remaining</span>
    </div>
  `;
}

// ===================================================
// 11. BUDGET PLANNER
// ===================================================

const BUDGET_CATEGORIES = [
  { key: 'Food', label: '🍔 Food' },
  { key: 'Bills', label: '💡 Bills' },
  { key: 'Transportation', label: '🚗 Transportation' },
  { key: 'School Expenses', label: '🏫 School' },
  { key: 'Business', label: '💼 Business' },
  { key: 'Savings', label: '🏦 Savings' },
  { key: 'Emergency Fund', label: '🆘 Emergency' },
  { key: 'Miscellaneous', label: '🎲 Misc' }
];

function initBudgetMonthSelect() {
  const sel = document.getElementById('budgetMonth');
  if (!sel) return;
  const now = new Date();
  let html = '';
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    html += `<option value="${val}" ${i === 0 ? 'selected' : ''}>${label}</option>`;
  }
  sel.innerHTML = html;
}

function renderBudget() {
  const month = document.getElementById('budgetMonth')?.value || getCurrentMonthKey();
  const monthBudget = budget[month] || {};

  // Budget form
  const formEl = document.getElementById('budgetFormGrid');
  if (formEl) {
    formEl.innerHTML = BUDGET_CATEGORIES.map(c => `
      <div class="budget-item">
        <label>${c.label}</label>
        <input type="number" id="budget_${c.key.replace(/\s/g,'_')}" value="${monthBudget[c.key] || ''}" placeholder="0.00" min="0" step="0.01" />
      </div>
    `).join('');
  }

  // Budget comparison
  const compEl = document.getElementById('budgetComparison');
  if (!compEl) return;

  // Actual spending this month
  const actual = {};
  transactions.filter(t => t.date.startsWith(month) && t.type === 'expense').forEach(t => {
    actual[t.category] = (actual[t.category] || 0) + t.amount;
  });

  const maxVal = Math.max(...BUDGET_CATEGORIES.map(c => Math.max(monthBudget[c.key] || 0, actual[c.key] || 0)), 1);

  compEl.innerHTML = BUDGET_CATEGORIES.map(c => {
    const planned = monthBudget[c.key] || 0;
    const spent   = actual[c.key] || 0;
    const ratio   = planned > 0 ? (spent / planned) : 0;
    const pct     = Math.min(ratio * 100, 100).toFixed(0);
    const over    = ratio > 1;
    const warn    = ratio > 0.8;
    const barClass = over ? 'over' : (warn ? 'warning' : '');

    return `
      <div class="budget-row">
        <span class="budget-row-label">${c.label}</span>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${barClass}" style="width:${pct}%"></div>
        </div>
        <span class="budget-actual" style="color:${over?'var(--expense-color)':warn?'var(--warning)':'var(--income-color)'}">${fmt(spent)}</span>
        <span class="budget-planned">${planned > 0 ? fmt(planned) : '—'}</span>
      </div>
    `;
  }).join('');
}

function saveBudget() {
  const month = document.getElementById('budgetMonth')?.value || getCurrentMonthKey();
  if (!budget[month]) budget[month] = {};
  BUDGET_CATEGORIES.forEach(c => {
    const val = parseFloat(document.getElementById(`budget_${c.key.replace(/\s/g,'_')}`)?.value) || 0;
    budget[month][c.key] = val;
  });
  DB.save(DB.KEYS.budget, budget);
  renderBudget();
  showToast('Budget saved!', 'success');
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ===================================================
// 12. BILL REMINDERS
// ===================================================

function openBillModal(id = '') {
  document.getElementById('billName').value    = '';
  document.getElementById('billAmount').value  = '';
  document.getElementById('billDue').value     = '';
  document.getElementById('billRecurring').value = 'monthly';
  document.getElementById('billEditId').value  = '';

  if (id) {
    const b = bills.find(b => b.id === id);
    if (b) {
      document.getElementById('billName').value    = b.name;
      document.getElementById('billAmount').value  = b.amount;
      document.getElementById('billDue').value     = b.due;
      document.getElementById('billRecurring').value = b.recurring;
      document.getElementById('billEditId').value  = b.id;
    }
  }

  document.getElementById('billModal').classList.add('open');
}

function closeBillModal() {
  document.getElementById('billModal').classList.remove('open');
}

function saveBill() {
  const name      = document.getElementById('billName').value.trim();
  const amount    = parseFloat(document.getElementById('billAmount').value);
  const due       = document.getElementById('billDue').value;
  const recurring = document.getElementById('billRecurring').value;
  const editId    = document.getElementById('billEditId').value;

  if (!name || !due || isNaN(amount)) {
    showToast('Please fill in all bill fields.', 'error');
    return;
  }

  if (editId) {
    const idx = bills.findIndex(b => b.id === editId);
    if (idx !== -1) bills[idx] = { ...bills[idx], name, amount, due, recurring };
    showToast('Reminder updated!', 'success');
  } else {
    bills.push({ id: uid(), name, amount, due, recurring });
    showToast('Bill reminder added!', 'success');
  }

  DB.save(DB.KEYS.bills, bills);
  closeBillModal();
  renderBillList();
  checkBillNotifications();
}

function deleteBill(id) {
  if (!confirm('Delete this bill reminder?')) return;
  bills = bills.filter(b => b.id !== id);
  DB.save(DB.KEYS.bills, bills);
  renderBillList();
  checkBillNotifications();
  showToast('Reminder deleted.', 'warning');
}

function renderBillList() {
  const el = document.getElementById('billList');
  if (!el) return;

  if (bills.length === 0) {
    el.innerHTML = `<div class="no-bills">📋 No bill reminders yet.</div>`;
    return;
  }

  const sorted = [...bills].sort((a, b) => new Date(a.due) - new Date(b.due));

  el.innerHTML = sorted.map(b => {
    const days = daysUntil(b.due);
    const overdueClass = days < 0 ? 'bill-overdue' : days <= 7 ? 'bill-soon' : '';
    const statusText = days < 0 ? `⚠️ Overdue (${Math.abs(days)}d ago)` : days === 0 ? '⚡ Due Today!' : `${days} days`;

    return `
      <div class="bill-item">
        <div class="bill-item-left">
          <span class="bill-item-name">💡 ${escapeHtml(b.name)}</span>
          <span class="bill-item-due ${overdueClass}">Due: ${fmtDate(b.due)} — ${statusText} — ${b.recurring}</span>
        </div>
        <div class="bill-item-right">
          <span class="bill-item-amount">${fmt(b.amount)}</span>
          <button class="action-btn edit-btn" onclick="openBillModal('${b.id}')">✏️</button>
          <button class="action-btn del-btn" onclick="deleteBill('${b.id}')">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

// ===================================================
// 13. NOTIFICATIONS
// ===================================================

function checkBillNotifications() {
  const badge   = document.getElementById('notifBadge');
  const listEl  = document.getElementById('notifList');
  if (!badge || !listEl) return;

  const upcoming = bills.filter(b => {
    const days = daysUntil(b.due);
    return days >= -1 && days <= 7;
  });

  badge.textContent = upcoming.length;
  badge.style.display = upcoming.length > 0 ? 'flex' : 'none';

  if (upcoming.length === 0) {
    listEl.innerHTML = `<p class="no-notif">No upcoming bills in the next 7 days.</p>`;
    return;
  }

  listEl.innerHTML = upcoming.map(b => {
    const days = daysUntil(b.due);
    const text = days < 0 ? `Overdue (${Math.abs(days)}d)` : days === 0 ? 'Due TODAY!' : `Due in ${days} days`;
    return `<div class="notif-item">💡 <strong>${escapeHtml(b.name)}</strong> — ${fmt(b.amount)} — ${text}</div>`;
  }).join('');
}

// ===================================================
// 14. REPORTS & EXPORT
// ===================================================

function renderReportPreview() {
  const el = document.getElementById('reportPreviewContent');
  if (!el) return;

  const totalIncome   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance       = totalIncome - totalExpenses;
  const generated     = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  el.innerHTML = `
    <div class="report-preview-title">📊 ${escapeHtml(settings.familyName || 'Family')} Financial Report</div>
    <div class="report-preview-sub">Generated: ${generated} | Total Transactions: ${transactions.length}</div>
    <div class="report-summary-grid">
      <div class="report-summary-item">
        <div class="report-summary-label">Total Income</div>
        <div class="report-summary-val" style="color:var(--income-color)">${fmt(totalIncome)}</div>
      </div>
      <div class="report-summary-item">
        <div class="report-summary-label">Total Expenses</div>
        <div class="report-summary-val" style="color:var(--expense-color)">${fmt(totalExpenses)}</div>
      </div>
      <div class="report-summary-item">
        <div class="report-summary-label">Net Balance</div>
        <div class="report-summary-val" style="color:${balance>=0?'var(--income-color)':'var(--expense-color)'}">${fmt(balance)}</div>
      </div>
    </div>
    <p style="color:var(--text-secondary);font-size:12px;margin-top:10px;">
      Use the export buttons above to download a full PDF or Excel report.
    </p>
  `;
}

function exportPDF() {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const familyName = settings.familyName || 'Family';
    const generated  = new Date().toLocaleDateString('en-PH');

    // Header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 80);
    doc.text(`${familyName} — Financial Report`, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generated}`, 14, 28);

    // Summary
    const totalIncome   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance       = totalIncome - totalExpenses;

    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(`Total Income: ${fmt(totalIncome)}`, 14, 40);
    doc.text(`Total Expenses: ${fmt(totalExpenses)}`, 14, 48);
    doc.text(`Net Balance: ${fmt(balance)}`, 14, 56);

    // Transaction table
    const rows = [...transactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(t => [fmtDate(t.date), t.desc, t.category, t.member || 'Joint', t.type, `${t.type==='expense'?'-':'+'} ${fmt(t.amount)}`]);

    doc.autoTable({
      head: [['Date', 'Description', 'Category', 'Member', 'Type', 'Amount']],
      body: rows,
      startY: 66,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 247, 255] }
    });

    doc.save(`${familyName.replace(/\s+/g, '_')}_Financial_Report.pdf`);
    showToast('PDF exported successfully!', 'success');
  } catch (e) {
    showToast('PDF export failed. Please try again.', 'error');
    console.error(e);
  }
}

function exportExcel() {
  try {
    const rows = transactions.map(t => ({
      Date: fmtDate(t.date),
      Description: t.desc,
      Category: t.category,
      Member: t.member || 'Joint',
      Type: t.type.charAt(0).toUpperCase() + t.type.slice(1),
      Amount: t.type === 'expense' ? -t.amount : t.amount
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, `${(settings.familyName || 'Family').replace(/\s+/g,'_')}_Transactions.xlsx`);
    showToast('Excel exported successfully!', 'success');
  } catch (e) {
    showToast('Excel export failed.', 'error');
    console.error(e);
  }
}

function printReport() {
  window.print();
}

// ===================================================
// 15. SETTINGS
// ===================================================

function loadSettings() {
  document.getElementById('familyName').value      = settings.familyName || '';
  document.getElementById('husbandName').value     = settings.husbandName || '';
  document.getElementById('wifeName').value        = settings.wifeName || '';
  document.getElementById('currencySymbol').value  = settings.currency || '₱';
  document.getElementById('emergencyTarget').value = settings.emergencyTarget || '';
}

function saveSettings() {
  settings.familyName      = document.getElementById('familyName').value.trim() || 'Our Family';
  settings.husbandName     = document.getElementById('husbandName').value.trim() || 'Husband';
  settings.wifeName        = document.getElementById('wifeName').value.trim() || 'Wife';
  settings.currency        = document.getElementById('currencySymbol').value.trim() || '₱';
  settings.emergencyTarget = parseFloat(document.getElementById('emergencyTarget').value) || 50000;

  DB.save(DB.KEYS.settings, settings);
  document.getElementById('familyNameDisplay').textContent = settings.familyName;
  renderDashboard();
  showToast('Settings saved!', 'success');
}

function resetAllData() {
  if (!confirm('⚠️ This will DELETE all your data permanently. Are you sure?')) return;
  if (!confirm('Last chance! Click OK to confirm reset.')) return;

  Object.values(DB.KEYS).forEach(k => localStorage.removeItem(k));
  transactions = []; goals = []; budget = {}; bills = [];
  settings = { familyName: 'Our Family', husbandName: 'Husband', wifeName: 'Wife', currency: '₱', emergencyTarget: 50000 };

  renderDashboard();
  renderTransactions();
  showPage('dashboard');
  showToast('All data has been reset.', 'warning');
}

// ===================================================
// 16. HELPERS
// ===================================================

/** Safely escape HTML to prevent XSS */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===================================================
// 17. AUTO-SAVE (every 30 seconds)
// ===================================================

setInterval(() => {
  DB.save(DB.KEYS.transactions, transactions);
  DB.save(DB.KEYS.goals, goals);
  DB.save(DB.KEYS.budget, budget);
  DB.save(DB.KEYS.bills, bills);
}, 30000);

// ===================================================
// 18. INITIALIZATION
// ===================================================

document.addEventListener('DOMContentLoaded', () => {

  // ---- Dark Mode ----
  initDarkMode();
  document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

  // ---- Sidebar / hamburger ----
  document.getElementById('hamburger').addEventListener('click', openSidebar);
  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);

  // ---- Nav links ----
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showPage(link.dataset.page);
    });
  });

  // ---- Set today's date as default in form ----
  const txnDateInput = document.getElementById('txnDate');
  if (txnDateInput) txnDateInput.value = today();

  // ---- Page date in topbar ----
  document.getElementById('pageDate').textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // ---- Family name ----
  document.getElementById('familyNameDisplay').textContent = settings.familyName || 'Our Family';

  // ---- Initialize selects ----
  initBudgetMonthSelect();

  // ---- Initial renders ----
  renderDashboard();
  renderTransactions();
  renderBillList();
  renderGoals();
  checkBillNotifications();

  // ---- Close modals on overlay click ----
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  console.log('✅ Household Cash Flow Tracking System initialized.');
});
