/* =============================================
   HOUSEHOLD CASH FLOW TRACKING SYSTEM
   script.js — Merged Transactions + Income
   ============================================= */
'use strict';

// =============================================
// 1. DATABASE
// =============================================
const DB = {
  KEYS: {
    transactions: 'hcf_transactions',
    goals:        'hcf_goals',
    budget:       'hcf_budget',
    bills:        'hcf_bills',
    settings:     'hcf_settings',
    darkMode:     'hcf_darkmode',
    monthlyFixed: 'hcf_monthly_fixed'
  },
  load(key, fallback) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
    catch { return fallback; }
  },
  save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch(e) { console.error('Save failed', e); }
  }
};

// =============================================
// 2. STATE
// =============================================
let transactions = DB.load(DB.KEYS.transactions, []);
let goals        = DB.load(DB.KEYS.goals, []);
let budget       = DB.load(DB.KEYS.budget, {});
let bills        = DB.load(DB.KEYS.bills, []);
let monthlyFixed = DB.load(DB.KEYS.monthlyFixed, {}); // { "2025-05": { Husband:{salary,cat,extra,extraDesc}, Wife:{...}, Joint:{...} } }
let settings     = DB.load(DB.KEYS.settings, {
  familyName: 'Our Family', husbandName: 'Husband',
  wifeName: 'Wife', currency: '₱', emergencyTarget: 50000
});

// UI state
let currentTxnType = 'income';   // 'income' | 'expense'
let currentFreq    = 'onetime';  // 'onetime' | 'monthly'
let currentMember  = 'Husband';
let histPage       = 1;
const PER_PAGE     = 10;

// Chart instances
let pieChart = null, barChart = null, trendChart = null;

// =============================================
// 3. UTILITIES
// =============================================
function fmt(n) {
  const s = settings.currency || '₱';
  const abs = Math.abs(n).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  return n < 0 ? `-${s}${abs}` : `${s}${abs}`;
}
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function today() { return new Date().toISOString().split('T')[0]; }
function fmtDate(d) {
  if (!d) return '';
  return new Date(d+'T00:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'});
}
function daysUntil(d) {
  const dt = new Date(d+'T00:00:00'), now = new Date();
  now.setHours(0,0,0,0);
  return Math.ceil((dt-now)/86400000);
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function monthKey(d) { return d ? d.slice(0,7) : today().slice(0,7); }
function currMonthKey() {
  const n=new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(()=>{ t.className='toast'; }, 3000);
}

// Category data — income vs expense
const INCOME_CATS = [
  {v:'Salary',    label:'💼 Salary',     cls:'cat-salary'},
  {v:'Business',  label:'🏪 Business',   cls:'cat-business'},
  {v:'Freelance', label:'💻 Freelance',  cls:'cat-freelance'},
  {v:'Investment',label:'📈 Investment', cls:'cat-investment'},
  {v:'Bonus',     label:'🎁 Bonus',      cls:'cat-bonus'},
  {v:'Allowance', label:'💸 Allowance',  cls:'cat-allowance'},
  {v:'Other',     label:'📌 Other',      cls:'cat-other'}
];
const EXPENSE_CATS = [
  {v:'Food',          label:'🍔 Food',           cls:'cat-food'},
  {v:'Bills',         label:'💡 Bills',           cls:'cat-bills'},
  {v:'Transportation',label:'🚗 Transportation',  cls:'cat-transport'},
  {v:'School',        label:'🏫 School',          cls:'cat-school'},
  {v:'Business',      label:'💼 Business',        cls:'cat-business'},
  {v:'Savings',       label:'🏦 Savings',         cls:'cat-savings'},
  {v:'Emergency Fund',label:'🆘 Emergency Fund',  cls:'cat-emergency'},
  {v:'Miscellaneous', label:'🎲 Miscellaneous',   cls:'cat-misc'}
];
const ALL_CATS = [...new Set([...INCOME_CATS, ...EXPENSE_CATS].map(c=>c.v))];

function getCatCls(cat) {
  const all = [...INCOME_CATS, ...EXPENSE_CATS];
  const found = all.find(c=>c.v===cat);
  return found ? found.cls : 'cat-other';
}
function getCatEmoji(cat) {
  const all = [...INCOME_CATS, ...EXPENSE_CATS];
  const found = all.find(c=>c.v===cat);
  if (!found) return '📌';
  return found.label.split(' ')[0];
}

// =============================================
// 4. NAVIGATION
// =============================================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
  const pg = document.getElementById(`page-${id}`);
  if (pg) pg.classList.add('active');
  const lk = document.querySelector(`.nav-link[data-page="${id}"]`);
  if (lk) lk.classList.add('active');
  const titles = {
    dashboard:'Dashboard', transactions:'Transactions',
    analytics:'Analytics', savings:'Savings & Goals',
    budget:'Budget Planner', reports:'Reports', settings:'Settings'
  };
  document.getElementById('pageTitle').textContent = titles[id] || id;
  if (id==='analytics') renderCharts();
  if (id==='budget')    { renderBudget(); renderBillList(); }
  if (id==='reports')   renderReportPreview();
  if (id==='settings')  loadSettings();
  if (id==='savings')   renderGoals();
  if (id==='transactions') { updateCategoryDropdown(); renderMemberSummaryCards(); renderHistory(); }
  closeSidebar();
}

// =============================================
// 5. SIDEBAR / DARK MODE
// =============================================
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}
function initDarkMode() {
  if (localStorage.getItem(DB.KEYS.darkMode)==='dark')
    document.documentElement.setAttribute('data-theme','dark');
}
function toggleDarkMode() {
  const cur = document.documentElement.getAttribute('data-theme');
  const nxt = cur==='dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nxt);
  localStorage.setItem(DB.KEYS.darkMode, nxt);
}

// =============================================
// 6. TRANSACTIONS PAGE — TYPE / FREQ / MEMBER
// =============================================

/** Switch between Income and Expense */
function setTxnType(type) {
  currentTxnType = type;
  const isIncome = type === 'income';

  // Update banner buttons
  document.getElementById('btnIncome').className  = 'txn-type-btn' + (isIncome ? ' active-income' : '');
  document.getElementById('btnExpense').className = 'txn-type-btn' + (!isIncome ? ' active-expense' : '');

  // Show/hide monthly toggle (only for income)
  document.getElementById('freqToggleWrap').style.display = isIncome ? '' : 'none';
  // Show/hide member summary cards (only for income)
  document.getElementById('memberSummarySection').style.display = isIncome ? '' : 'none';

  // If expense selected, force onetime view
  if (!isIncome) setFreq('onetime', true);

  // Update form title
  document.getElementById('formPanelTitle').textContent = isIncome ? '➕ Add Income' : '➕ Add Expense';
  document.getElementById('txnType').value = type;

  // Update category dropdown + desc label
  updateCategoryDropdown();
  document.getElementById('txnDescLabel').textContent = isIncome ? 'Source / Description' : 'Description';
  document.getElementById('txnSubmitBtn').textContent = isIncome ? '➕ Add Income' : '➕ Add Expense';

  renderHistory();
}

/** Switch between one-time and monthly fixed (income only) */
function setFreq(freq, silent=false) {
  currentFreq = freq;
  document.querySelectorAll('.freq-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.freq === freq);
  });
  document.getElementById('onetimeForm').style.display   = freq==='onetime' ? '' : 'none';
  document.getElementById('monthlyForm').style.display   = freq==='monthly'  ? '' : 'none';
  if (freq==='monthly') renderMonthlyFixedForm();
}

/** Select a family member */
function selectMember(m) {
  currentMember = m;
  document.querySelectorAll('.mem-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.member === m);
  });
  document.getElementById('txnMember').value = m;
}

/** Populate the category <select> based on current type */
function updateCategoryDropdown() {
  const sel = document.getElementById('txnCategory');
  if (!sel) return;
  const cats = currentTxnType === 'income' ? INCOME_CATS : EXPENSE_CATS;
  sel.innerHTML = cats.map(c=>`<option value="${c.v}">${c.label}</option>`).join('');

  // Also populate filter dropdown
  const flt = document.getElementById('filterCategory');
  if (flt) {
    const cur = flt.value;
    flt.innerHTML = `<option value="">All Categories</option>` +
      ALL_CATS.map(c=>`<option value="${c}" ${c===cur?'selected':''}>${getCatEmoji(c)} ${c}</option>`).join('');
  }
}

// =============================================
// 7. ONE-TIME TRANSACTION SUBMIT
// =============================================
function submitTransaction() {
  const date     = document.getElementById('txnDate').value;
  const desc     = document.getElementById('txnDesc').value.trim();
  const category = document.getElementById('txnCategory').value;
  const type     = document.getElementById('txnType').value;
  const amount   = parseFloat(document.getElementById('txnAmount').value);
  const member   = document.getElementById('txnMember').value;
  const notes    = document.getElementById('txnNotes').value.trim();
  const editId   = document.getElementById('txnEditId').value;

  if (!date || !desc || isNaN(amount) || amount<=0) {
    showToast('Please fill in all required fields.', 'error'); return;
  }

  const entry = { id: editId||uid(), date, desc, category, type, amount, member, notes, freq:'onetime' };

  if (editId) {
    const i = transactions.findIndex(t=>t.id===editId);
    if (i!==-1) transactions[i] = entry;
    showToast('Entry updated!', 'success');
  } else {
    transactions.push(entry);
    showToast(`${type==='income'?'Income':'Expense'} added!`, 'success');
  }

  DB.save(DB.KEYS.transactions, transactions);
  resetForm();
  renderDashboard();
  renderHistory();
  renderMemberSummaryCards();
}

function resetForm() {
  document.getElementById('txnDate').value    = today();
  document.getElementById('txnDesc').value    = '';
  document.getElementById('txnAmount').value  = '';
  document.getElementById('txnNotes').value   = '';
  document.getElementById('txnEditId').value  = '';
  document.getElementById('txnSubmitBtn').textContent = currentTxnType==='income'?'➕ Add Income':'➕ Add Expense';
  updateCategoryDropdown();
}

function editEntry(id) {
  const t = transactions.find(t=>t.id===id);
  if (!t) return;
  showPage('transactions');
  // Set the type first
  setTxnType(t.type);
  setFreq('onetime');
  selectMember(t.member||'Husband');
  document.getElementById('txnDate').value    = t.date;
  document.getElementById('txnDesc').value    = t.desc;
  document.getElementById('txnAmount').value  = t.amount;
  document.getElementById('txnNotes').value   = t.notes||'';
  document.getElementById('txnEditId').value  = t.id;
  document.getElementById('txnType').value    = t.type;
  // Set category after dropdown is populated
  setTimeout(()=>{ document.getElementById('txnCategory').value = t.category; }, 10);
  document.getElementById('txnSubmitBtn').textContent = '💾 Update Entry';
  window.scrollTo({top:0,behavior:'smooth'});
}

function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return;
  transactions = transactions.filter(t=>t.id!==id);
  DB.save(DB.KEYS.transactions, transactions);
  renderDashboard(); renderHistory(); renderMemberSummaryCards();
  showToast('Entry deleted.','warning');
}

// =============================================
// 8. MONTHLY FIXED INCOME
// =============================================
function renderMonthlyFixedForm() {
  const el = document.getElementById('monthlyMembersGrid');
  const selEl = document.getElementById('monthlyTargetMonth');
  if (!el) return;

  // Populate month select
  if (selEl) {
    const now = new Date();
    let opts = '';
    for (let i=0;i<6;i++) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const lbl = d.toLocaleDateString('en-PH',{month:'long',year:'numeric'});
      opts += `<option value="${k}" ${i===0?'selected':''}>${lbl}</option>`;
    }
    selEl.innerHTML = opts;
  }

  const mk = selEl ? selEl.value : currMonthKey();
  const saved = monthlyFixed[mk] || {};

  const members = [
    {key:'Husband', label: settings.husbandName||'Husband', cls:'av-husband'},
    {key:'Wife',    label: settings.wifeName||'Wife',       cls:'av-wife'},
    {key:'Joint',   label:'Joint / Family',                 cls:'av-joint'}
  ];

  el.innerHTML = members.map(m => {
    const s = saved[m.key] || {};
    return `
      <div class="mon-mem-card">
        <div class="mon-mem-header">
          <div class="mon-mem-avatar ${m.cls}">${m.label.charAt(0)}</div>
          <div>
            <div class="mon-mem-name">${esc(m.label)}</div>
            <div class="mon-mem-sub">Monthly Income</div>
          </div>
        </div>
        <div class="mon-mem-fields">
          <div class="mon-field">
            <label>Primary Income (₱)</label>
            <input type="number" id="mf_salary_${m.key}" value="${s.salary||''}" placeholder="0.00" min="0" step="0.01" />
          </div>
          <div class="mon-field">
            <label>Category</label>
            <select id="mf_cat_${m.key}">
              ${INCOME_CATS.map(c=>`<option value="${c.v}" ${s.cat===c.v?'selected':''}>${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="mon-field">
            <label>Extra Income (₱)</label>
            <input type="number" id="mf_extra_${m.key}" value="${s.extra||''}" placeholder="0.00" min="0" step="0.01" />
          </div>
          <div class="mon-field">
            <label>Extra Source</label>
            <input type="text" id="mf_extraDesc_${m.key}" value="${s.extraDesc||''}" placeholder="e.g. Bonus, Sideline" />
          </div>
        </div>
      </div>`;
  }).join('');
}

function saveMonthlyFixed() {
  const selEl = document.getElementById('monthlyTargetMonth');
  const mk = selEl ? selEl.value : currMonthKey();
  if (!monthlyFixed[mk]) monthlyFixed[mk] = {};

  const members = ['Husband','Wife','Joint'];
  let added = 0;

  members.forEach(m => {
    const salary    = parseFloat(document.getElementById(`mf_salary_${m}`)?.value) || 0;
    const cat       = document.getElementById(`mf_cat_${m}`)?.value || 'Salary';
    const extra     = parseFloat(document.getElementById(`mf_extra_${m}`)?.value) || 0;
    const extraDesc = document.getElementById(`mf_extraDesc_${m}`)?.value.trim() || '';

    monthlyFixed[mk][m] = { salary, cat, extra, extraDesc };

    const dateStr = mk + '-01';

    // Add primary income entry if not yet recorded this month
    if (salary > 0) {
      const exists = transactions.some(t =>
        t.member===m && t.date.startsWith(mk) && t.freq==='monthly' && t.category===cat
      );
      if (!exists) {
        const memberLabel = m==='Husband'?(settings.husbandName||'Husband'):m==='Wife'?(settings.wifeName||'Wife'):'Joint';
        transactions.push({
          id:uid(), date:dateStr, desc:`${memberLabel} ${cat}`,
          category:cat, type:'income', amount:salary,
          member:m, notes:'Monthly fixed income', freq:'monthly'
        });
        added++;
      }
    }

    // Add extra income if not yet recorded
    if (extra > 0 && extraDesc) {
      const existsExtra = transactions.some(t =>
        t.member===m && t.date.startsWith(mk) && t.freq==='monthly-extra' && t.desc===extraDesc
      );
      if (!existsExtra) {
        transactions.push({
          id:uid(), date:dateStr, desc:extraDesc,
          category:'Other', type:'income', amount:extra,
          member:m, notes:'Monthly extra income', freq:'monthly-extra'
        });
        added++;
      }
    }
  });

  DB.save(DB.KEYS.monthlyFixed, monthlyFixed);
  DB.save(DB.KEYS.transactions, transactions);
  renderDashboard(); renderHistory(); renderMemberSummaryCards();
  showToast(`Monthly income saved!${added>0?` (${added} entries added)`:''}`, 'success');
}

// =============================================
// 9. MEMBER SUMMARY CARDS
// =============================================
function renderMemberSummaryCards() {
  const el = document.getElementById('memberSummaryCards');
  if (!el) return;

  const now = new Date();
  const mk  = currMonthKey();
  const members = [
    {key:'Husband', label:settings.husbandName||'Husband', cls:'av-husband'},
    {key:'Wife',    label:settings.wifeName||'Wife',       cls:'av-wife'},
    {key:'Joint',   label:'Joint / Family',                cls:'av-joint'}
  ];

  el.innerHTML = members.map(m => {
    const all   = transactions.filter(t=>t.member===m.key && t.type==='income');
    const month = all.filter(t=>t.date.startsWith(mk));
    const mTot  = month.reduce((s,t)=>s+t.amount,0);
    const allTot= all.reduce((s,t)=>s+t.amount,0);

    // Last month
    const lm  = new Date(now.getFullYear(),now.getMonth()-1,1);
    const lmk = `${lm.getFullYear()}-${String(lm.getMonth()+1).padStart(2,'0')}`;
    const lmTot = all.filter(t=>t.date.startsWith(lmk)).reduce((s,t)=>s+t.amount,0);

    // This week
    const ws = new Date(now); ws.setDate(now.getDate()-now.getDay());
    const wsStr = ws.toISOString().split('T')[0];
    const wTot = all.filter(t=>t.date>=wsStr&&t.date<=today()).reduce((s,t)=>s+t.amount,0);

    const barPct = lmTot>0 ? Math.min((mTot/lmTot)*100,100).toFixed(0) : (mTot>0?100:0);

    // Top category
    const catMap={};
    month.forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});
    const top = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];

    return `
      <div class="ms-card">
        <div class="ms-top">
          <div class="ms-avatar ${m.cls}">${m.label.charAt(0)}</div>
          <div><div class="ms-name">${esc(m.label)}</div><div class="ms-role">Income Summary</div></div>
        </div>
        <div>
          <div class="ms-total">${fmt(mTot)}</div>
          <div class="ms-total-label">This month's income</div>
          <div class="ms-bar-track"><div class="ms-bar-fill" style="width:${barPct}%"></div></div>
          <div class="ms-vs">vs last month: ${fmt(lmTot)}</div>
        </div>
        <div class="ms-breakdown">
          <div class="ms-row"><span>This week</span><span class="ms-val">${fmt(wTot)}</span></div>
          <div class="ms-row"><span>All-time total</span><span class="ms-val">${fmt(allTot)}</span></div>
          <div class="ms-row"><span>Top source</span><span class="ms-val">${top?`${getCatEmoji(top[0])} ${top[0]}`:'—'}</span></div>
        </div>
      </div>`;
  }).join('');
}

// =============================================
// 10. HISTORY TABLE
// =============================================
function renderHistory() {
  const tbody = document.getElementById('historyBody');
  if (!tbody) return;

  populateHistoryFilters();

  const search  = (document.getElementById('searchInput')?.value||'').toLowerCase();
  const typeFlt = document.getElementById('filterType')?.value||'';
  const memFlt  = document.getElementById('filterMember')?.value||'';
  const catFlt  = document.getElementById('filterCategory')?.value||'';
  const mthFlt  = document.getElementById('filterMonth')?.value||'';

  let rows = [...transactions].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if (search)  rows = rows.filter(t=>(t.desc+' '+(t.notes||'')+(t.category||'')).toLowerCase().includes(search));
  if (typeFlt) rows = rows.filter(t=>t.type===typeFlt);
  if (memFlt)  rows = rows.filter(t=>t.member===memFlt);
  if (catFlt)  rows = rows.filter(t=>t.category===catFlt);
  if (mthFlt)  rows = rows.filter(t=>t.date.startsWith(mthFlt));

  const total  = rows.length;
  const pages  = Math.ceil(total/PER_PAGE)||1;
  if (histPage>pages) histPage=pages;
  const paged  = rows.slice((histPage-1)*PER_PAGE, histPage*PER_PAGE);
  const fTotal = rows.reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount, 0);

  if (!paged.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No entries found.</td></tr>`;
  } else {
    tbody.innerHTML = paged.map(t => {
      const memLabel = t.member==='Husband'?(settings.husbandName||'Husband')
                     : t.member==='Wife'?(settings.wifeName||'Wife'):'Joint';
      const memCls   = t.member==='Husband'?'av-husband':t.member==='Wife'?'av-wife':'av-joint';
      const freqBadge = (t.freq==='monthly'||t.freq==='monthly-extra')
        ? `<span class="badge badge-monthly" style="margin-left:4px">Monthly</span>`
        : `<span class="badge badge-onetime" style="margin-left:4px">Daily</span>`;
      return `
        <tr>
          <td>${fmtDate(t.date)}</td>
          <td>${esc(t.desc)}</td>
          <td><span class="badge ${getCatCls(t.category)}">${getCatEmoji(t.category)} ${t.category}</span></td>
          <td>
            <span style="display:inline-flex;align-items:center;gap:5px">
              <span class="mem-avatar ${memCls}" style="width:20px;height:20px;font-size:9px">${memLabel.charAt(0)}</span>
              ${esc(memLabel)}
            </span>
          </td>
          <td><span class="badge badge-${t.type}">${t.type==='income'?'Income':'Expense'}</span></td>
          <td>${freqBadge}</td>
          <td class="amount-${t.type}">${t.type==='income'?'+':'-'} ${fmt(t.amount)}</td>
          <td>
            <button class="action-btn edit-btn" onclick="editEntry('${t.id}')">✏️ Edit</button>
            <button class="action-btn del-btn"  onclick="deleteEntry('${t.id}')">🗑️ Del</button>
          </td>
        </tr>`;
    }).join('');
  }

  // Footer
  const foot = document.getElementById('historyFooter');
  if (foot) {
    foot.style.color = fTotal>=0?'var(--income-color)':'var(--expense-color)';
    foot.textContent = rows.length>0 ? `Net of filtered entries: ${fmt(fTotal)}` : '';
  }

  // Pagination
  const pagEl = document.getElementById('historyPagination');
  if (pagEl) {
    pagEl.innerHTML = pages<=1 ? '' :
      Array.from({length:pages},(_,i)=>
        `<button class="page-btn ${i+1===histPage?'active':''}" onclick="histGoTo(${i+1})">${i+1}</button>`
      ).join('');
  }
}

function histGoTo(n) { histPage=n; renderHistory(); }

function populateHistoryFilters() {
  // Member filter labels
  const fh = document.getElementById('fltHusband');
  const fw = document.getElementById('fltWife');
  if (fh) fh.textContent = settings.husbandName||'Husband';
  if (fw) fw.textContent = settings.wifeName||'Wife';

  // Month filter
  const sel = document.getElementById('filterMonth');
  if (!sel) return;
  const months = [...new Set(transactions.map(t=>t.date.slice(0,7)))].sort().reverse();
  const cur = sel.value;
  sel.innerHTML = `<option value="">All Months</option>` +
    months.map(m=>{
      const [y,mo]=m.split('-');
      const lbl = new Date(+y,+mo-1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});
      return `<option value="${m}" ${m===cur?'selected':''}>${lbl}</option>`;
    }).join('');
}

// =============================================
// 11. DASHBOARD
// =============================================
function renderDashboard() {
  const mk      = currMonthKey();
  const todayStr = today();
  const mTxns   = transactions.filter(t=>t.date.startsWith(mk));
  const todayTxns = transactions.filter(t=>t.date === todayStr);

  // TODAY's income and expenses
  const todayInc = todayTxns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const todayExp = todayTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const todayBal = todayInc - todayExp;

  // THIS MONTH's income and expenses
  const mInc = mTxns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const mExp = mTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

  // Total Savings = all-time
  const totalSav = transactions.filter(t=>t.type==='income'&&(t.category==='Savings'||t.category==='Emergency Fund')).reduce((s,t)=>s+t.amount,0);

  // Month name for sub-labels
  const mName = new Date().toLocaleDateString('en-PH',{month:'long',year:'numeric'});
  const todayLabel = new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});

  // Populate the 5 cards
  document.getElementById('todayIncome').textContent    = fmt(todayInc);
  document.getElementById('todayExpenses').textContent  = fmt(todayExp);
  document.getElementById('todayIncomeDate').textContent  = todayLabel;
  document.getElementById('todayExpensesDate').textContent = todayLabel;
  document.getElementById('totalIncome').textContent    = fmt(mInc);
  document.getElementById('totalExpenses').textContent  = fmt(mExp);
  document.getElementById('incomeChange').textContent   = mName;
  document.getElementById('expenseChange').textContent  = mName;

  // Remaining balance = today's income - today's expenses
  const balEl = document.getElementById('remainingBalance');
  balEl.textContent = fmt(todayBal);
  balEl.style.color = todayBal >= 0 ? 'var(--income-color)' : 'var(--expense-color)';

  // Update the sub-label to clarify it's today's balance
  const balSub = document.querySelector('.card-balance .card-sub');
  if (balSub) balSub.textContent = `Today: ${fmt(todayInc)} in, ${fmt(todayExp)} out`;

  // Weekly bars
  const now = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayData = [];
  for (let i=6;i>=0;i--) {
    const d=new Date(now); d.setDate(now.getDate()-i);
    const key=d.toISOString().split('T')[0];
    const dtx=transactions.filter(t=>t.date===key);
    dayData.push({label:days[d.getDay()],
      income:dtx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),
      expense:dtx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)});
  }
  const maxV = Math.max(...dayData.map(d=>Math.max(d.income,d.expense)),1);
  document.getElementById('weeklyBars').innerHTML = dayData.map(d=>`
    <div class="week-day">
      <span class="week-day-label">${d.label}</span>
      <div style="flex:1;display:flex;flex-direction:column;gap:3px">
        <div class="week-bar-track"><div class="week-bar-fill" style="width:${(d.income/maxV)*100}%"></div></div>
        <div class="week-bar-track"><div class="week-bar-fill expense" style="width:${(d.expense/maxV)*100}%"></div></div>
      </div>
      <span class="week-amount">${d.expense>0?fmt(d.expense):d.income>0?fmt(d.income):'—'}</span>
    </div>`).join('');

  // Monthly summary box
  const mBal = mInc - mExp;
  document.getElementById('monthlySummaryBox').innerHTML = `
    <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">${mName}</p>
    <div class="monthly-row income"><span class="monthly-row-label">💵 Income</span><span class="monthly-row-value" style="color:var(--income-color)">${fmt(mInc)}</span></div>
    <div class="monthly-row expense"><span class="monthly-row-label">🛒 Expenses</span><span class="monthly-row-value" style="color:var(--expense-color)">${fmt(mExp)}</span></div>
    <div class="monthly-row balance"><span class="monthly-row-label">💼 Net</span><span class="monthly-row-value" style="color:${mBal>=0?'var(--income-color)':'var(--expense-color)'}">` + fmt(mBal) + `</span></div>`;

  // Recent transactions
  const recent = [...transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  document.getElementById('recentTxnBody').innerHTML = recent.length===0
    ? `<tr class="empty-row"><td colspan="6">No entries yet. Add your first one!</td></tr>`
    : recent.map(t=>{
        const ml = t.member==='Husband'?(settings.husbandName||'Husband'):t.member==='Wife'?(settings.wifeName||'Wife'):'Joint';
        return `<tr>
          <td>${fmtDate(t.date)}</td>
          <td>${esc(t.desc)}</td>
          <td><span class="badge ${getCatCls(t.category)}">${getCatEmoji(t.category)} ${t.category}</span></td>
          <td>${esc(ml)}</td>
          <td><span class="badge badge-${t.type}">${t.type==='income'?'Income':'Expense'}</span></td>
          <td class="amount-${t.type}">${t.type==='income'?'+':'-'} ${fmt(t.amount)}</td>
        </tr>`;
      }).join('');

  // Family income breakdown
  const fMembers = [
    {key:'Husband',label:settings.husbandName||'Husband',cls:'av-husband2'},
    {key:'Wife',   label:settings.wifeName||'Wife',      cls:'av-wife2'},
    {key:'Joint',  label:'Joint / Family',               cls:'av-joint2'}
  ];
  document.getElementById('familyIncomeGrid').innerHTML = fMembers.map(m=>{
    const inc = transactions.filter(t=>t.member===m.key&&t.type==='income').reduce((s,t)=>s+t.amount,0);
    const exp = transactions.filter(t=>t.member===m.key&&t.type==='expense').reduce((s,t)=>s+t.amount,0);
    return `<div class="member-income-card">
      <div class="member-avatar ${m.cls}">${m.label.charAt(0)}</div>
      <div class="member-name">${esc(m.label)}</div>
      <div class="member-total">${fmt(inc)}</div>
      <div class="member-label">Expenses: <strong style="color:var(--expense-color)">${fmt(exp)}</strong></div>
    </div>`;
  }).join('');

  // Sync avatar initials
  document.getElementById('topAvH').textContent = (settings.husbandName||'H').charAt(0).toUpperCase();
  document.getElementById('topAvW').textContent = (settings.wifeName||'W').charAt(0).toUpperCase();
  document.getElementById('familyNameDisplay').textContent = settings.familyName||'Our Family';
}

// =============================================
// 12. CHARTS
// =============================================
function getColors(n) {
  const p=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];
  return Array.from({length:n},(_,i)=>p[i%p.length]);
}
function textColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim()||'#333';
}
function renderCharts() {
  // Pie
  const catMap={};
  transactions.filter(t=>t.type==='expense').forEach(t=>{ catMap[t.category]=(catMap[t.category]||0)+t.amount; });
  const labs=Object.keys(catMap), vals=Object.values(catMap);
  if (pieChart) pieChart.destroy();
  const pc=document.getElementById('pieChart');
  if (pc && labs.length) {
    pieChart=new Chart(pc,{type:'doughnut',data:{labels:labs,datasets:[{data:vals,backgroundColor:getColors(labs.length),borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:textColor(),font:{size:12}}},
      tooltip:{callbacks:{label:c=>` ${c.label}: ${fmt(c.raw)}`}}},cutout:'60%'}});
  }

  // Bar (monthly)
  const months=[],incD=[],expD=[];
  const now=new Date();
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months.push(d.toLocaleDateString('en-PH',{month:'short',year:'2-digit'}));
    const mt=transactions.filter(t=>t.date.startsWith(k));
    incD.push(mt.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0));
    expD.push(mt.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0));
  }
  if (barChart) barChart.destroy();
  const bc=document.getElementById('barChart');
  if (bc) barChart=new Chart(bc,{type:'bar',data:{labels:months,datasets:[
    {label:'Income',data:incD,backgroundColor:'#10b98180',borderColor:'#10b981',borderWidth:2,borderRadius:6},
    {label:'Expenses',data:expD,backgroundColor:'#ef444480',borderColor:'#ef4444',borderWidth:2,borderRadius:6}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:textColor(),font:{size:12}}},
    tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.raw)}`}}},
    scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>fmt(v)}}}}});

  // Trend line
  const balD=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const mt=transactions.filter(t=>t.date.startsWith(k));
    const inc=mt.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const exp=mt.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    balD.push(inc-exp);
  }
  if (trendChart) trendChart.destroy();
  const tc=document.getElementById('trendChart');
  if (tc) trendChart=new Chart(tc,{type:'line',data:{labels:months,datasets:[
    {label:'Net Balance',data:balD,borderColor:'#3b82f6',backgroundColor:'#3b82f615',fill:true,tension:0.4,pointRadius:5,borderWidth:2},
    {label:'Income',data:incD,borderColor:'#10b981',fill:false,tension:0.4,borderWidth:2,borderDash:[5,3]},
    {label:'Expenses',data:expD,borderColor:'#ef4444',fill:false,tension:0.4,borderWidth:2,borderDash:[5,3]}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{labels:{color:textColor(),font:{size:12}}},tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.raw)}`}}},
    scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>fmt(v)}}}}});

  // Spending analysis
  const sorted=Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  const tot=sorted.reduce((s,[,v])=>s+v,0)||1;
  const sa=document.getElementById('spendingAnalysis');
  if (sa) sa.innerHTML=sorted.length===0
    ?`<p style="color:var(--text-secondary);font-size:14px;grid-column:1/-1;text-align:center;padding:30px">No expense data yet.</p>`
    :sorted.map(([cat,amt])=>`
      <div class="spend-cat-card">
        <span class="spend-cat-icon">${getCatEmoji(cat)}</span>
        <span class="spend-cat-name">${cat}</span>
        <span class="spend-cat-amount">${fmt(amt)}</span>
        <div class="spend-cat-bar"><div class="spend-cat-fill" style="width:${Math.min((amt/tot)*100,100).toFixed(1)}%"></div></div>
        <span style="font-size:11px;color:var(--text-secondary)">${((amt/tot)*100).toFixed(1)}%</span>
      </div>`).join('');
}

// =============================================
// 13. SAVINGS GOALS
// =============================================
function openGoalModal(id='') {
  ['goalName','goalTarget','goalCurrent','goalDeadline'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('goalEmoji').value='🎯';
  document.getElementById('goalEditId').value='';
  document.getElementById('goalModalTitle').textContent='Add Savings Goal';
  if (id) {
    const g=goals.find(g=>g.id===id);
    if (g) {
      document.getElementById('goalName').value=g.name;
      document.getElementById('goalTarget').value=g.target;
      document.getElementById('goalCurrent').value=g.current;
      document.getElementById('goalDeadline').value=g.deadline||'';
      document.getElementById('goalEmoji').value=g.emoji||'🎯';
      document.getElementById('goalEditId').value=g.id;
      document.getElementById('goalModalTitle').textContent='Edit Goal';
    }
  }
  document.getElementById('goalModal').classList.add('open');
}
function closeGoalModal() { document.getElementById('goalModal').classList.remove('open'); }
function saveGoal() {
  const name=document.getElementById('goalName').value.trim();
  const target=parseFloat(document.getElementById('goalTarget').value);
  const current=parseFloat(document.getElementById('goalCurrent').value)||0;
  const deadline=document.getElementById('goalDeadline').value;
  const emoji=document.getElementById('goalEmoji').value||'🎯';
  const editId=document.getElementById('goalEditId').value;
  if (!name||isNaN(target)||target<=0){showToast('Fill in goal name and target.','error');return;}
  if (editId) { const i=goals.findIndex(g=>g.id===editId); if(i!==-1) goals[i]={...goals[i],name,target,current,deadline,emoji}; showToast('Goal updated!','success'); }
  else { goals.push({id:uid(),name,target,current,deadline,emoji}); showToast('Goal added!','success'); }
  DB.save(DB.KEYS.goals,goals); closeGoalModal(); renderGoals();
}
function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  goals=goals.filter(g=>g.id!==id); DB.save(DB.KEYS.goals,goals); renderGoals(); showToast('Goal deleted.','warning');
}
function renderGoals() {
  const el=document.getElementById('goalsGrid');
  if (!el) return;
  if (!goals.length) { el.innerHTML=`<div class="no-goals"><p style="font-size:32px">🎯</p><p>No savings goals yet.</p></div>`; renderEF(); return; }
  el.innerHTML=goals.map(g=>{
    const pct=Math.min((g.current/g.target)*100,100).toFixed(1);
    const dl=g.deadline?daysUntil(g.deadline):null;
    const dlStr=dl!==null?(dl<0?`<span style="color:var(--danger)">Deadline passed</span>`:`${dl} days left`):'No deadline';
    return `<div class="goal-card">
      <div class="goal-header"><span class="goal-emoji">${g.emoji||'🎯'}</span>
        <div class="goal-actions">
          <button class="action-btn edit-btn" onclick="openGoalModal('${g.id}')">✏️</button>
          <button class="action-btn del-btn"  onclick="deleteGoal('${g.id}')">🗑️</button>
        </div>
      </div>
      <div class="goal-name">${esc(g.name)}</div>
      <div class="goal-deadline">📅 ${dlStr}</div>
      <div class="goal-amounts"><span class="goal-current">${fmt(g.current)}</span><span class="goal-divider">/</span><span class="goal-target">${fmt(g.target)}</span></div>
      <div class="goal-progress-track"><div class="goal-progress-fill" style="width:${pct}%"></div></div>
      <div class="goal-pct">${pct}% achieved</div>
    </div>`;
  }).join('');
  renderEF();
}
function renderEF() {
  const el=document.getElementById('emergencyFundBox');
  if (!el) return;
  const ef=transactions.filter(t=>t.category==='Emergency Fund').reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0);
  const target=settings.emergencyTarget||50000;
  const pct=Math.min((ef/target)*100,100).toFixed(1);
  el.innerHTML=`
    <div class="ef-top">
      <div><div class="ef-amount">${fmt(Math.max(ef,0))}</div><div class="ef-label">Emergency Fund Balance</div></div>
      <div class="ef-target">Target: ${fmt(target)}</div>
    </div>
    <div class="ef-progress-track"><div class="ef-progress-fill" style="width:${pct}%"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-top:6px">
      <span>${pct}% reached</span><span>${fmt(Math.max(target-ef,0))} remaining</span>
    </div>`;
}

// =============================================
// 14. BUDGET PLANNER
// =============================================
const BUDGET_CATS=[
  {key:'Food',label:'🍔 Food'},{key:'Bills',label:'💡 Bills'},{key:'Transportation',label:'🚗 Transportation'},
  {key:'School',label:'🏫 School'},{key:'Business',label:'💼 Business'},{key:'Savings',label:'🏦 Savings'},
  {key:'Emergency Fund',label:'🆘 Emergency'},{key:'Miscellaneous',label:'🎲 Misc'}
];
function initBudgetMonth() {
  const sel=document.getElementById('budgetMonth'); if(!sel) return;
  const now=new Date(); let h='';
  for(let i=0;i<6;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const v=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const l=d.toLocaleDateString('en-PH',{month:'long',year:'numeric'});
    h+=`<option value="${v}" ${i===0?'selected':''}>${l}</option>`;
  }
  sel.innerHTML=h;
}
function renderBudget() {
  const mk=document.getElementById('budgetMonth')?.value||currMonthKey();
  const mb=budget[mk]||{};
  const fg=document.getElementById('budgetFormGrid');
  if(fg) fg.innerHTML=BUDGET_CATS.map(c=>`
    <div class="budget-item">
      <label>${c.label}</label>
      <input type="number" id="bg_${c.key.replace(/\s/g,'_')}" value="${mb[c.key]||''}" placeholder="0.00" min="0" step="0.01"/>
    </div>`).join('');
  const actual={};
  transactions.filter(t=>t.date.startsWith(mk)&&t.type==='expense').forEach(t=>{actual[t.category]=(actual[t.category]||0)+t.amount;});
  const comp=document.getElementById('budgetComparison');
  if(comp) comp.innerHTML=BUDGET_CATS.map(c=>{
    const planned=mb[c.key]||0, spent=actual[c.key]||0;
    const ratio=planned>0?spent/planned:0, pct=Math.min(ratio*100,100).toFixed(0);
    const cls=ratio>1?'over':ratio>0.8?'warning':'';
    return `<div class="budget-row">
      <span class="budget-row-label">${c.label}</span>
      <div class="budget-bar-track"><div class="budget-bar-fill ${cls}" style="width:${pct}%"></div></div>
      <span class="budget-actual" style="color:${ratio>1?'var(--expense-color)':ratio>0.8?'var(--warning)':'var(--income-color)'}">${fmt(spent)}</span>
      <span class="budget-planned">${planned>0?fmt(planned):'—'}</span>
    </div>`;
  }).join('');
}
function saveBudget() {
  const mk=document.getElementById('budgetMonth')?.value||currMonthKey();
  if(!budget[mk]) budget[mk]={};
  BUDGET_CATS.forEach(c=>{ budget[mk][c.key]=parseFloat(document.getElementById(`bg_${c.key.replace(/\s/g,'_')}`)?.value)||0; });
  DB.save(DB.KEYS.budget,budget); renderBudget(); showToast('Budget saved!','success');
}

// =============================================
// 15. BILL REMINDERS
// =============================================
function openBillModal(id='') {
  ['billName','billAmount','billDue'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('billRecurring').value='monthly';
  document.getElementById('billEditId').value='';
  if(id){const b=bills.find(b=>b.id===id);if(b){document.getElementById('billName').value=b.name;document.getElementById('billAmount').value=b.amount;document.getElementById('billDue').value=b.due;document.getElementById('billRecurring').value=b.recurring;document.getElementById('billEditId').value=b.id;}}
  document.getElementById('billModal').classList.add('open');
}
function closeBillModal() { document.getElementById('billModal').classList.remove('open'); }
function saveBill() {
  const name=document.getElementById('billName').value.trim();
  const amount=parseFloat(document.getElementById('billAmount').value);
  const due=document.getElementById('billDue').value;
  const recurring=document.getElementById('billRecurring').value;
  const editId=document.getElementById('billEditId').value;
  if(!name||!due||isNaN(amount)){showToast('Fill in all bill fields.','error');return;}
  if(editId){const i=bills.findIndex(b=>b.id===editId);if(i!==-1)bills[i]={...bills[i],name,amount,due,recurring};showToast('Reminder updated!','success');}
  else{bills.push({id:uid(),name,amount,due,recurring});showToast('Reminder added!','success');}
  DB.save(DB.KEYS.bills,bills); closeBillModal(); renderBillList(); checkNotifs();
}
function deleteBill(id) {
  if(!confirm('Delete this bill reminder?')) return;
  bills=bills.filter(b=>b.id!==id); DB.save(DB.KEYS.bills,bills); renderBillList(); checkNotifs(); showToast('Reminder deleted.','warning');
}
function renderBillList() {
  const el=document.getElementById('billList'); if(!el) return;
  if(!bills.length){el.innerHTML=`<div class="no-bills">📋 No bill reminders yet.</div>`;return;}
  el.innerHTML=[...bills].sort((a,b)=>new Date(a.due)-new Date(b.due)).map(b=>{
    const days=daysUntil(b.due);
    const cls=days<0?'bill-overdue':days<=7?'bill-soon':'';
    const txt=days<0?`⚠️ Overdue (${Math.abs(days)}d ago)`:days===0?'⚡ Due Today!':`${days} days`;
    return `<div class="bill-item">
      <div class="bill-item-left">
        <span class="bill-item-name">💡 ${esc(b.name)}</span>
        <span class="bill-item-due ${cls}">Due: ${fmtDate(b.due)} — ${txt} — ${b.recurring}</span>
      </div>
      <div class="bill-item-right">
        <span class="bill-item-amount">${fmt(b.amount)}</span>
        <button class="action-btn edit-btn" onclick="openBillModal('${b.id}')">✏️</button>
        <button class="action-btn del-btn" onclick="deleteBill('${b.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}
function checkNotifs() {
  const badge=document.getElementById('notifBadge'), listEl=document.getElementById('notifList');
  if(!badge||!listEl) return;
  const up=bills.filter(b=>{const d=daysUntil(b.due);return d>=-1&&d<=7;});
  badge.textContent=up.length; badge.style.display=up.length>0?'flex':'none';
  listEl.innerHTML=up.length===0?`<p class="no-notif">No bills due in the next 7 days.</p>`
    :up.map(b=>{const d=daysUntil(b.due);const t=d<0?`Overdue (${Math.abs(d)}d)`:d===0?'Due TODAY!':`In ${d} days`;
      return `<div class="notif-item">💡 <strong>${esc(b.name)}</strong> — ${fmt(b.amount)} — ${t}</div>`;}).join('');
}

// =============================================
// 16. REPORTS
// =============================================
function renderReportPreview() {
  const el=document.getElementById('reportPreviewContent'); if(!el) return;
  const ti=transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const te=transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const bal=ti-te;
  const gen=new Date().toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'});
  el.innerHTML=`
    <div style="font-family:var(--font-display);font-size:22px;font-weight:700;margin-bottom:4px">${esc(settings.familyName||'Family')} Financial Report</div>
    <div style="color:var(--text-secondary);font-size:13px;margin-bottom:20px">Generated: ${gen} | ${transactions.length} total entries</div>
    <div class="report-summary-grid">
      <div class="report-summary-item"><div class="report-summary-label">Total Income</div><div class="report-summary-val" style="color:var(--income-color)">${fmt(ti)}</div></div>
      <div class="report-summary-item"><div class="report-summary-label">Total Expenses</div><div class="report-summary-val" style="color:var(--expense-color)">${fmt(te)}</div></div>
      <div class="report-summary-item"><div class="report-summary-label">Net Balance</div><div class="report-summary-val" style="color:${bal>=0?'var(--income-color)':'var(--expense-color)'}">${fmt(bal)}</div></div>
    </div>
    <p style="color:var(--text-secondary);font-size:12px">Use the export buttons above to download a full PDF or Excel file.</p>`;
}
function exportPDF() {
  try {
    const {jsPDF}=window.jspdf; const doc=new jsPDF();
    doc.setFontSize(20); doc.setTextColor(30,30,80);
    doc.text(`${settings.familyName||'Family'} — Financial Report`,14,20);
    doc.setFontSize(10); doc.setTextColor(100,100,100);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-PH')}`,14,28);
    const ti=transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const te=transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    doc.setFontSize(11); doc.setTextColor(30,30,30);
    doc.text(`Total Income: ${fmt(ti)}`,14,40);
    doc.text(`Total Expenses: ${fmt(te)}`,14,48);
    doc.text(`Net Balance: ${fmt(ti-te)}`,14,56);
    const rows=[...transactions].sort((a,b)=>new Date(b.date)-new Date(a.date))
      .map(t=>{
        const ml=t.member==='Husband'?(settings.husbandName||'Husband'):t.member==='Wife'?(settings.wifeName||'Wife'):'Joint';
        return [fmtDate(t.date),t.desc,t.category,ml,t.type,`${t.type==='expense'?'-':'+'} ${fmt(t.amount)}`];
      });
    doc.autoTable({head:[['Date','Description','Category','Member','Type','Amount']],body:rows,startY:66,
      styles:{fontSize:9,cellPadding:3},headStyles:{fillColor:[59,130,246],textColor:[255,255,255]},
      alternateRowStyles:{fillColor:[245,247,255]}});
    doc.save(`${(settings.familyName||'Family').replace(/\s+/g,'_')}_Report.pdf`);
    showToast('PDF exported!','success');
  } catch(e){ showToast('PDF export failed.','error'); console.error(e); }
}
function exportExcel() {
  try {
    const rows=transactions.map(t=>{
      const ml=t.member==='Husband'?(settings.husbandName||'Husband'):t.member==='Wife'?(settings.wifeName||'Wife'):'Joint';
      return {Date:fmtDate(t.date),Description:t.desc,Category:t.category,Member:ml,
        Type:t.type==='income'?'Income':'Expense',Frequency:t.freq||'onetime',
        Amount:t.type==='expense'?-t.amount:t.amount};
    });
    const ws=XLSX.utils.json_to_sheet(rows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Transactions');
    XLSX.writeFile(wb,`${(settings.familyName||'Family').replace(/\s+/g,'_')}_Transactions.xlsx`);
    showToast('Excel exported!','success');
  } catch(e){ showToast('Excel export failed.','error'); console.error(e); }
}

// =============================================
// 17. SETTINGS
// =============================================
function loadSettings() {
  document.getElementById('familyName').value      = settings.familyName||'';
  document.getElementById('husbandName').value     = settings.husbandName||'';
  document.getElementById('wifeName').value        = settings.wifeName||'';
  document.getElementById('currencySymbol').value  = settings.currency||'₱';
  document.getElementById('emergencyTarget').value = settings.emergencyTarget||'';
}
function saveSettings() {
  settings.familyName      = document.getElementById('familyName').value.trim()||'Our Family';
  settings.husbandName     = document.getElementById('husbandName').value.trim()||'Husband';
  settings.wifeName        = document.getElementById('wifeName').value.trim()||'Wife';
  settings.currency        = document.getElementById('currencySymbol').value.trim()||'₱';
  settings.emergencyTarget = parseFloat(document.getElementById('emergencyTarget').value)||50000;
  DB.save(DB.KEYS.settings,settings);
  renderDashboard();
  // Sync member labels in transactions page
  ['memLabelHusband','memLabelWife'].forEach((id,i)=>{
    const el=document.getElementById(id);
    if(el) el.textContent=i===0?(settings.husbandName||'Husband'):(settings.wifeName||'Wife');
  });
  showToast('Settings saved!','success');
}
function resetAllData() {
  if (!confirm('⚠️ Delete ALL data permanently?')) return;
  if (!confirm('Final confirmation — this cannot be undone.')) return;
  Object.values(DB.KEYS).forEach(k=>localStorage.removeItem(k));
  transactions=[]; goals=[]; budget={}; bills=[]; monthlyFixed={};
  settings={familyName:'Our Family',husbandName:'Husband',wifeName:'Wife',currency:'₱',emergencyTarget:50000};
  renderDashboard(); renderHistory(); showPage('dashboard');
  showToast('All data has been reset.','warning');
}

// =============================================
// 18. AUTO-SAVE
// =============================================
setInterval(()=>{
  DB.save(DB.KEYS.transactions,transactions);
  DB.save(DB.KEYS.goals,goals);
  DB.save(DB.KEYS.budget,budget);
  DB.save(DB.KEYS.bills,bills);
  DB.save(DB.KEYS.monthlyFixed,monthlyFixed);
},30000);

// =============================================
// 19. INIT
// =============================================
document.addEventListener('DOMContentLoaded',()=>{
  initDarkMode();
  document.getElementById('darkModeToggle').addEventListener('click',toggleDarkMode);
  document.getElementById('hamburger').addEventListener('click',openSidebar);
  document.getElementById('sidebarClose').addEventListener('click',closeSidebar);
  document.querySelectorAll('.nav-link').forEach(l=>{
    l.addEventListener('click',e=>{ e.preventDefault(); showPage(l.dataset.page); });
  });

  // Set defaults
  document.getElementById('txnDate').value = today();
  document.getElementById('pageDate').textContent = new Date().toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  // Init budget month select + monthly target month select
  initBudgetMonth();
  const mts = document.getElementById('monthlyTargetMonth');
  if (mts) {
    const now=new Date(); let h='';
    for(let i=0;i<6;i++){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      h+=`<option value="${k}" ${i===0?'selected':''}>${d.toLocaleDateString('en-PH',{month:'long',year:'numeric'})}</option>`;
    }
    mts.innerHTML=h;
  }

  // Initial state
  setTxnType('income');
  updateCategoryDropdown();
  renderDashboard();
  renderHistory();
  renderBillList();
  renderGoals();
  checkNotifs();

  // Modal overlay close on background click
  document.querySelectorAll('.modal-overlay').forEach(o=>{
    o.addEventListener('click',e=>{ if(e.target===o) o.classList.remove('open'); });
  });

  console.log('✅ CashFlow System ready.');
});
