// =====================================================
//  PharmaCare — Frontend JS (Fixed)
//  Student Web Dev Project
// =====================================================

// ── Dark Mode Theme Toggle ──────────────────────────
function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  const btn = document.getElementById('theme-btn');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  btn.textContent = isDark ? '☀️' : '🌙';
}

function loadTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  const btn = document.getElementById('theme-btn');
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    if (btn) btn.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    if (btn) btn.textContent = '🌙';
  }
}

// Load theme on page load
document.addEventListener('DOMContentLoaded', loadTheme);

// ── Auth token from session ──────────────────────────
function getToken() { return sessionStorage.getItem('token') || ''; }

// Guard — redirect to login if no token
if (!getToken()) { window.location.href = '/login.html'; }

// ── API helper ───────────────────────────────────────
async function api(path, method='GET', body=null) {
  const opts = {
    method,
    headers: { 'Content-Type':'application/json', 'x-token': getToken() }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { sessionStorage.clear(); window.location.href='/login.html'; }
  return res.json();
}

// ── Toast ─────────────────────────────────────────────
function toast(msg, type='success') {
  const d = document.createElement('div');
  d.className = 'toast toast-' + type;
  d.textContent = msg;
  document.getElementById('toast-zone').appendChild(d);
  setTimeout(() => d.remove(), 3000);
}

// ── Modal ─────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── Navigation ────────────────────────────────────────
const PAGE_TITLES = {
  dashboard:'🏠 Dashboard', medicines:'💊 Medicines',
  categories:'🏷️ Categories', suppliers:'🚚 Suppliers',
  customers:'👥 Customers', sales:'🧾 Sales', analytics:'📈 Analytics'
};

// Defined AFTER functions to avoid hoisting issues
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.getElementById('pg-' + page).classList.add('active');
  const btn = document.querySelector(`[data-page="${page}"]`);
  if (btn) btn.classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;
  // Call loader after a tiny tick so DOM is painted first
  setTimeout(() => {
    const loaders = {
      dashboard: loadDashboard, medicines: loadMedicines,
      categories: loadCategories, suppliers: loadSuppliers,
      customers: loadCustomers, sales: loadSales, analytics: loadAnalytics
    };
    if (loaders[page]) loaders[page]();
  }, 0);
}

// ── Dropdown fill ─────────────────────────────────────
async function fillSelect(selId, apiPath, placeholder) {
  const data = await api(apiPath);
  const sel  = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    data.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
}

// ── Logout ─────────────────────────────────────────────
async function doLogout() {
  await api('/api/logout', 'POST');
  sessionStorage.clear();
  window.location.href = '/login.html';
}

// ═══════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════
async function loadDashboard() {
  try {
    const d = await api('/api/dashboard');
    if (d.error) throw new Error(d.error);

    // Stats
    setText('s-meds',  d.total_medicines);
    setText('s-low',   d.low_stock);
    setText('s-exp',   d.expired);
    setText('s-rev',   '₹' + Number(d.total_revenue).toLocaleString('en-IN', {maximumFractionDigits:0}));
    setText('s-cust',  d.total_customers);
    setText('s-bills', d.total_bills);

    // Recent sales
    const rt = document.getElementById('recent-sales-body');
    if (rt) rt.innerHTML = (d.recent_sales||[]).length
      ? d.recent_sales.map(s => `<tr>
          <td><span class="mono text-sm">${s.invoice_no}</span></td>
          <td>${s.customer}</td>
          <td><strong>₹${Number(s.net_amount).toFixed(2)}</strong></td>
          <td><span class="badge badge-${s.payment_method==='cash'?'green':s.payment_method==='card'?'blue':'purple'}">${s.payment_method.toUpperCase()}</span></td>
          <td class="text-muted text-sm">${s.sale_date}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8">No sales yet</td></tr>';

    // Expiring
    const et = document.getElementById('expiring-body');
    if (et) et.innerHTML = (d.expiring_soon||[]).length
      ? d.expiring_soon.map(m => {
          const dl = m.days_left;
          const cls = dl < 0 ? 'badge-red' : dl <= 20 ? 'badge-orange' : 'badge-blue';
          const lbl = dl < 0 ? 'Expired' : dl + 'd left';
          return `<tr>
            <td>${m.name}</td><td>${m.quantity}</td>
            <td class="text-sm">${m.expiry_date}</td>
            <td><span class="badge ${cls}">${lbl}</span></td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="4" style="text-align:center;padding:20px;color:#94a3b8">All clear ✅</td></tr>';

    // Bar charts
    drawBars('month-chart', d.monthly||[], 'mo', 'rev', '#2563eb');
    drawBars('cat-chart',   d.catrev||[],  'name','rev','#16a34a');

  } catch(e) { console.error('Dashboard error:', e); }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function drawBars(containerId, data, labelKey, valKey, color) {
  const el = document.getElementById(containerId);
  if (!el || !data.length) return;
  const vals = data.map(r => Number(r[valKey]) || 0);
  const max  = Math.max(...vals, 1);
  el.innerHTML = data.map((r, i) => {
    const pct = (vals[i] / max * 100).toFixed(1);
    const v   = vals[i];
    const fmt = v >= 1000 ? '₹' + (v/1000).toFixed(1) + 'K' : '₹' + v.toFixed(0);
    return `<div class="bar-col">
      <div class="bar-val">${fmt}</div>
      <div class="bar" style="height:${pct}%;background:${color}" title="${r[labelKey]}: ₹${v.toFixed(2)}"></div>
      <div class="bar-lbl">${r[labelKey]}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════
//  MEDICINES
// ═══════════════════════════════════════════════════════
let editMedId = null;

async function loadMedicines() {
  const search = (document.getElementById('med-search')||{}).value || '';
  const data   = await api('/api/medicines?search=' + encodeURIComponent(search));
  const tbody  = document.getElementById('medicines-body');
  if (!tbody) return;
  const today = new Date();
  tbody.innerHTML = data.length ? data.map(m => {
    const exp  = m.expiry_date ? new Date(m.expiry_date) : null;
    const days = exp ? Math.ceil((exp - today) / 86400000) : null;
    const sClr = m.quantity < 10 ? '#dc2626' : m.quantity < 20 ? '#ea580c' : '#16a34a';
    const sBdg = m.quantity < 10 ? '<span class="badge badge-red">Critical</span>'
               : m.quantity < 20 ? '<span class="badge badge-orange">Low</span>'
               : '<span class="badge badge-green">In Stock</span>';
    const eBdg = !exp ? '-'
               : days < 0 ? '<span class="badge badge-red">Expired</span>'
               : days <= 30 ? `<span class="badge badge-orange">${days}d left</span>`
               : `<span class="text-sm text-muted">${String(m.expiry_date).slice(0,10)}</span>`;
    const pct  = Math.min(100, Math.round(m.quantity / 3));
    return `<tr>
      <td><strong>${m.name}</strong><br><span class="text-sm text-muted">${m.generic_name||''}</span></td>
      <td><span class="badge badge-blue">${m.category_name||'—'}</span></td>
      <td class="text-sm text-muted">${m.supplier_name||'—'}</td>
      <td>${m.quantity} ${sBdg}<div class="stock-bar"><div class="stock-fill" style="width:${pct}%;background:${sClr}"></div></div></td>
      <td class="mono">₹${Number(m.selling_price).toFixed(2)}</td>
      <td>${eBdg}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openEditMed(${m.id})">✏️ Edit</button>
        <button class="btn btn-danger  btn-sm" onclick="deleteMed(${m.id},'${m.name.replace(/'/g,"\\'").replace(/"/g,'&quot;')}')">🗑️</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" style="text-align:center;padding:30px;color:#94a3b8">No medicines found</td></tr>';
}

async function openAddMed() {
  editMedId = null;
  document.getElementById('med-form').reset();
  document.getElementById('med-modal-title').textContent = 'Add Medicine';
  await fillSelect('med-cat', '/api/helpers/categories', '-- Select Category --');
  await fillSelect('med-sup', '/api/helpers/suppliers',  '-- Select Supplier --');
  openModal('med-modal');
}

async function openEditMed(id) {
  const rows = await api('/api/medicines');
  const m = rows.find(r => r.id === id);
  if (!m) return;
  editMedId = id;
  document.getElementById('med-modal-title').textContent = 'Edit Medicine';
  await fillSelect('med-cat', '/api/helpers/categories', '-- Select Category --');
  await fillSelect('med-sup', '/api/helpers/suppliers',  '-- Select Supplier --');
  const set = (id, v) => { const el=document.getElementById(id); if(el) el.value = v||''; };
  set('med-name', m.name); set('med-generic', m.generic_name); set('med-batch', m.batch_no);
  set('med-mfg', m.manufacture_date ? String(m.manufacture_date).slice(0,10) : '');
  set('med-exp', m.expiry_date ? String(m.expiry_date).slice(0,10) : '');
  set('med-qty', m.quantity); set('med-pp', m.purchase_price); set('med-sp', m.selling_price);
  set('med-desc', m.description); set('med-cat', m.category_id); set('med-sup', m.supplier_id);
  openModal('med-modal');
}

async function saveMed() {
  const g = id => (document.getElementById(id)||{}).value || '';
  const body = {
    name: g('med-name').trim(), generic_name: g('med-generic').trim(),
    category_id: g('med-cat')||null, supplier_id: g('med-sup')||null,
    batch_no: g('med-batch').trim(),
    manufacture_date: g('med-mfg')||null, expiry_date: g('med-exp'),
    quantity: parseInt(g('med-qty'))||0,
    purchase_price: parseFloat(g('med-pp'))||0,
    selling_price:  parseFloat(g('med-sp'))||0,
    description: g('med-desc').trim()
  };
  if (!body.name || !body.expiry_date) return toast('Name and Expiry Date are required!', 'error');
  const res = editMedId
    ? await api('/api/medicines', 'PUT', {...body, id:editMedId})
    : await api('/api/medicines', 'POST', body);
  if (res.success) { closeModal('med-modal'); toast(editMedId?'Medicine updated!':'Medicine added!'); loadMedicines(); }
  else toast('Error: ' + (res.error||'Unknown'), 'error');
}

async function deleteMed(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  const res = await api('/api/medicines?id=' + id, 'DELETE');
  if (res.success) { toast('Deleted!'); loadMedicines(); }
  else toast('Error: ' + res.error, 'error');
}

// ═══════════════════════════════════════════════════════
//  CATEGORIES
// ═══════════════════════════════════════════════════════
async function loadCategories() {
  const data  = await api('/api/categories');
  const tbody = document.getElementById('cat-body');
  if (!tbody) return;
  tbody.innerHTML = data.length ? data.map(c => `<tr>
    <td><strong>${c.name}</strong></td>
    <td class="text-muted">${c.description||'—'}</td>
    <td><span class="badge badge-blue">${c.medicine_count}</span></td>
    <td style="display:flex;gap:6px">
      <button class="btn btn-primary btn-sm" onclick="editCat(${c.id})">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteCat(${c.id},'${c.name.replace(/'/g,"\\'")}')">🗑️ Delete</button>
    </td>
  </tr>`).join('') : '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8">No categories</td></tr>';
}

let editingCatId = null;

async function editCat(id) {
  const data = await api('/api/categories?id=' + id);
  editingCatId = id;
  document.getElementById('cat-name').value = data.name || '';
  document.getElementById('cat-desc').value = data.description || '';
  document.querySelector('#cat-modal .modal-header h3').textContent = 'Edit Category';
  document.querySelector('#cat-modal .btn-primary').textContent = '💾 Update';
  openModal('cat-modal');
}

async function addCat() {
  const name = (document.getElementById('cat-name')||{}).value?.trim();
  const desc = (document.getElementById('cat-desc')||{}).value?.trim();
  if (!name) return toast('Category name required!','error');
  
  let res;
  if (editingCatId) {
    res = await api('/api/categories?id='+editingCatId,'PUT',{name,description:desc});
  } else {
    res = await api('/api/categories','POST',{name,description:desc});
  }
  
  if (res.success) { 
    closeModal('cat-modal'); 
    toast(editingCatId ? 'Category updated!' : 'Category added!'); 
    loadCategories(); 
    document.getElementById('cat-form').reset();
    editingCatId = null;
    document.querySelector('#cat-modal .modal-header h3').textContent = 'Add Category';
    document.querySelector('#cat-modal .btn-primary').textContent = '💾 Save';
  }
  else toast('Error: '+res.error,'error');
}

async function deleteCat(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  const res = await api('/api/categories?id='+id,'DELETE');
  if (res.success) { toast('Deleted!'); loadCategories(); }
  else toast('Cannot delete — medicines are linked!','error');
}

// ═══════════════════════════════════════════════════════
//  SUPPLIERS
// ═══════════════════════════════════════════════════════
async function loadSuppliers() {
  const data  = await api('/api/suppliers');
  const tbody = document.getElementById('sup-body');
  if (!tbody) return;
  tbody.innerHTML = data.length ? data.map(s => `<tr>
    <td><strong>${s.name}</strong></td>
    <td>${s.contact_person||'—'}</td>
    <td class="mono text-sm">${s.phone||'—'}</td>
    <td class="text-sm text-muted">${s.email||'—'}</td>
    <td class="text-sm text-muted">${s.address||'—'}</td>
    <td><span class="badge badge-blue">${s.medicine_count}</span></td>
    <td style="display:flex;gap:6px">
      <button class="btn btn-primary btn-sm" onclick="editSup(${s.id})">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteSup(${s.id},'${s.name.replace(/'/g,"\\'")}')">🗑️ Delete</button>
    </td>
  </tr>`).join('') : '<tr><td colspan="7" style="padding:20px;text-align:center;color:#94a3b8">No suppliers</td></tr>';
}

let editingSupId = null;

async function editSup(id) {
  const data = await api('/api/suppliers?id=' + id);
  editingSupId = id;
  document.getElementById('sup-name').value = data.name || '';
  document.getElementById('sup-contact').value = data.contact_person || '';
  document.getElementById('sup-phone').value = data.phone || '';
  document.getElementById('sup-email').value = data.email || '';
  document.getElementById('sup-address').value = data.address || '';
  document.querySelector('#sup-modal .modal-header h3').textContent = 'Edit Supplier';
  document.querySelector('#sup-modal .btn-primary').textContent = '💾 Update';
  openModal('sup-modal');
}

async function addSup() {
  const g = id => (document.getElementById(id)||{}).value?.trim()||'';
  const body = { name:g('sup-name'), contact_person:g('sup-contact'), phone:g('sup-phone'), email:g('sup-email'), address:g('sup-address') };
  if (!body.name) return toast('Supplier name required!','error');
  
  let res;
  if (editingSupId) {
    res = await api('/api/suppliers?id='+editingSupId,'PUT',body);
  } else {
    res = await api('/api/suppliers','POST',body);
  }
  
  if (res.success) { 
    closeModal('sup-modal'); 
    toast(editingSupId ? 'Supplier updated!' : 'Supplier added!'); 
    loadSuppliers(); 
    document.getElementById('sup-form').reset();
    editingSupId = null;
    document.querySelector('#sup-modal .modal-header h3').textContent = 'Add Supplier';
    document.querySelector('#sup-modal .btn-primary').textContent = '💾 Save';
  }
  else toast('Error: '+res.error,'error');
}

async function deleteSup(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  const res = await api('/api/suppliers?id='+id,'DELETE');
  if (res.success) { toast('Deleted!'); loadSuppliers(); }
  else toast('Error!','error');
}

// ═══════════════════════════════════════════════════════
//  CUSTOMERS
// ═══════════════════════════════════════════════════════
async function loadCustomers() {
  const search = (document.getElementById('cus-search')||{}).value || '';
  const data   = await api('/api/customers?search=' + encodeURIComponent(search));
  const tbody  = document.getElementById('cus-body');
  if (!tbody) return;
  tbody.innerHTML = data.length ? data.map(c => `<tr>
    <td><div style="display:flex;align-items:center;gap:8px">
      <div style="width:28px;height:28px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#1d4ed8;flex-shrink:0">${c.name[0].toUpperCase()}</div>
      <strong>${c.name}</strong></div></td>
    <td class="mono text-sm">${c.phone||'—'}</td>
    <td class="text-sm text-muted">${c.email||'—'}</td>
    <td class="text-sm text-muted">${c.address||'—'}</td>
    <td><span class="badge badge-green">${c.total_orders} orders</span></td>
    <td class="mono"><strong>₹${Number(c.total_spent).toFixed(2)}</strong></td>
    <td style="display:flex;gap:6px">
      <button class="btn btn-primary btn-sm" onclick="editCus(${c.id})">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteCus(${c.id},'${c.name.replace(/'/g,"\\'")}')">🗑️ Delete</button>
    </td>
  </tr>`).join('') : '<tr><td colspan="7" style="padding:20px;text-align:center;color:#94a3b8">No customers</td></tr>';
}

let editingCusId = null;

async function editCus(id) {
  const data = await api('/api/customers?id=' + id);
  editingCusId = id;
  document.getElementById('cus-name').value = data.name || '';
  document.getElementById('cus-phone').value = data.phone || '';
  document.getElementById('cus-email').value = data.email || '';
  document.getElementById('cus-address').value = data.address || '';
  document.querySelector('#cus-modal .modal-header h3').textContent = 'Edit Customer';
  document.querySelector('#cus-modal .btn-primary').textContent = '💾 Update';
  openModal('cus-modal');
}

async function addCus() {
  const g = id => (document.getElementById(id)||{}).value?.trim()||'';
  const body = { name:g('cus-name'), phone:g('cus-phone'), email:g('cus-email'), address:g('cus-address') };
  if (!body.name) return toast('Customer name required!','error');
  
  let res;
  if (editingCusId) {
    res = await api('/api/customers?id='+editingCusId,'PUT',body);
  } else {
    res = await api('/api/customers','POST',body);
  }
  
  if (res.success) { 
    closeModal('cus-modal'); 
    toast(editingCusId ? 'Customer updated!' : 'Customer added!'); 
    loadCustomers(); 
    document.getElementById('cus-form').reset();
    editingCusId = null;
    document.querySelector('#cus-modal .modal-header h3').textContent = 'Add Customer';
    document.querySelector('#cus-modal .btn-primary').textContent = '💾 Save';
  }
  else toast('Error: '+res.error,'error');
}

async function deleteCus(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  const res = await api('/api/customers?id='+id,'DELETE');
  if (res.success) { toast('Deleted!'); loadCustomers(); }
  else toast('Error!','error');
}

// ═══════════════════════════════════════════════════════
//  SALES
// ═══════════════════════════════════════════════════════
async function loadSales() {
  const data  = await api('/api/sales');
  const tbody = document.getElementById('sales-body');
  if (!tbody) return;
  tbody.innerHTML = data.length ? data.map(s => `<tr>
    <td><span class="mono text-sm">${s.invoice_no}</span></td>
    <td>${s.customer_name}</td>
    <td class="mono">₹${Number(s.total_amount).toFixed(2)}</td>
    <td class="mono" style="color:#dc2626">-₹${Number(s.discount).toFixed(2)}</td>
    <td class="mono"><strong>₹${Number(s.net_amount).toFixed(2)}</strong></td>
    <td><span class="badge badge-${s.payment_method==='cash'?'green':s.payment_method==='card'?'blue':'purple'}">${s.payment_method.toUpperCase()}</span></td>
    <td class="text-sm text-muted">${new Date(s.sale_date).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</td>
    <td><button class="btn btn-outline btn-sm" onclick="viewSale(${s.id},'${s.invoice_no}')">🔍 View</button></td>
  </tr>`).join('') : '<tr><td colspan="8" style="padding:30px;text-align:center;color:#94a3b8">No sales yet</td></tr>';
}

async function viewSale(id, inv) {
  const items = await api('/api/sale-items?id=' + id);
  document.getElementById('view-inv-no').textContent = inv;
  const tbody = document.getElementById('view-items-body');
  let grandTotal = 0;
  tbody.innerHTML = items.map(i => {
    grandTotal += Number(i.total);
    return `<tr>
      <td>${i.medicine_name}</td>
      <td class="mono">${i.quantity}</td>
      <td class="mono">₹${Number(i.unit_price).toFixed(2)}</td>
      <td class="mono"><strong>₹${Number(i.total).toFixed(2)}</strong></td>
    </tr>`;
  }).join('');
  openModal('view-sale-modal');
}

// ── New Sale ──────────────────────────────────────────
let saleItems = [];

async function openNewSale() {
  saleItems = [];
  document.getElementById('sale-form').reset();
  await fillSelect('sale-customer', '/api/helpers/customers', 'Walk-in Customer');
  renderSaleRows();
  openModal('new-sale-modal');
}

function addSaleRow() {
  saleItems.push({ medicine_id:'', name:'', qty:1, price:0, max:9999 });
  renderSaleRows();
}

function removeSaleRow(i) { saleItems.splice(i,1); renderSaleRows(); }

function renderSaleRows() {
  const el = document.getElementById('sale-items-list');
  if (!el) return;
  el.innerHTML = saleItems.length ? saleItems.map((it,i) => `
    <div class="sale-item-row">
      <div style="position:relative">
        <input type="text" placeholder="Type medicine name..." value="${it.name}"
          oninput="searchMed(${i},this.value)" id="ms-${i}" autocomplete="off"
          style="width:100%;padding:7px 11px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:13px">
        <div id="md-${i}" class="auto-list" style="display:none"></div>
      </div>
      <input type="number" min="1" value="${it.qty}" onchange="updateQty(${i},this.value)"
        style="padding:7px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:13px;text-align:center">
      <div style="text-align:right;font-size:13px;font-weight:600;font-family:monospace">
        ₹${(it.qty*it.price).toFixed(2)}
      </div>
      <button onclick="removeSaleRow(${i})"
        style="background:#fee2e2;border:none;border-radius:6px;cursor:pointer;color:#dc2626;font-size:14px;width:28px;height:28px">✕</button>
    </div>`).join('')
    : '<p style="color:#94a3b8;font-size:13px;padding:8px 0">Add medicines using the button below</p>';
  calcTotal();
}

const stimeout = {};
async function searchMed(idx, q) {
  clearTimeout(stimeout[idx]);
  const dd = document.getElementById('md-'+idx);
  if (!dd) return;
  if (q.length < 2) { dd.style.display='none'; return; }
  stimeout[idx] = setTimeout(async () => {
    const res = await api('/api/helpers/med-search?q=' + encodeURIComponent(q));
    if (!res.length) { dd.style.display='none'; return; }
    dd.innerHTML = res.map(r =>
      `<div onmousedown="pickMed(${idx},${r.id},'${r.name.replace(/'/g,"\\'")}',${r.selling_price},${r.quantity})">
        <strong>${r.name}</strong> &nbsp;
        <span style="color:#94a3b8;font-size:12px">Stock: ${r.quantity} | ₹${r.selling_price}</span>
      </div>`).join('');
    dd.style.display = 'block';
  }, 250);
}

function pickMed(idx, id, name, price, qty) {
  saleItems[idx] = { medicine_id:id, name, qty:1, price, max:qty };
  const dd = document.getElementById('md-'+idx);
  if (dd) dd.style.display='none';
  renderSaleRows();
  setTimeout(() => { const el=document.getElementById('ms-'+idx); if(el) el.value=name; }, 10);
}

function updateQty(idx, val) { saleItems[idx].qty = parseInt(val)||1; calcTotal(); }

function calcTotal() {
  const total    = saleItems.reduce((s,i)=>s+i.qty*i.price, 0);
  const discount = parseFloat((document.getElementById('sale-discount')||{}).value)||0;
  const net      = Math.max(0, total - discount);
  setText('sale-total-display','₹'+total.toFixed(2));
  setText('sale-net-display','₹'+net.toFixed(2));
}

async function confirmSale() {
  const valid = saleItems.filter(i=>i.medicine_id && i.qty>0);
  if (!valid.length) return toast('Add at least one medicine!','error');
  const body = {
    customer_id:    (document.getElementById('sale-customer')||{}).value||null,
    discount:       parseFloat((document.getElementById('sale-discount')||{}).value)||0,
    payment_method: (document.getElementById('sale-payment')||{}).value||'cash',
    items:          valid.map(i=>({medicine_id:i.medicine_id,qty:i.qty,price:i.price}))
  };
  const res = await api('/api/sales','POST',body);
  if (res.success) { closeModal('new-sale-modal'); toast('Sale confirmed! '+res.invoice); loadSales(); }
  else toast('Error: '+(res.error||'Unknown'),'error');
}

// ═══════════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════════
let analyticsViewType = 'month';
let analyticsChartType = 'bar';

async function loadAnalytics() {
  try {
    const data = await api('/api/dashboard');
    if (data.error) throw new Error(data.error);
    
    // Draw charts
    drawAnalyticsMonthChart(data.monthly || []);
    drawAnalyticsCategoryChart(data.catrev || []);
    drawAnalyticsPaymentChart(data.payment || []);
    
    // Load all sales
    const sales = await api('/api/sales');
    renderAnalyticsSales(sales);
    
    // Setup view type buttons
    document.getElementById('view-day').onclick = () => switchAnalyticsView('day');
    document.getElementById('view-month').onclick = () => switchAnalyticsView('month');
    document.getElementById('view-year').onclick = () => switchAnalyticsView('year');
    
    // Setup chart type buttons
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
      btn.onclick = () => switchAnalyticsChartType(btn.dataset.type);
    });
    
  } catch(e) { console.error('Analytics error:', e); }
}

function switchAnalyticsView(type) {
  analyticsViewType = type;
  document.querySelectorAll('#view-day,#view-month,#view-year').forEach(el => {
    el.style.background = el.id === ('view-'+type) ? 'var(--accent)' : 'transparent';
    el.style.color = el.id === ('view-'+type) ? 'white' : 'var(--text)';
  });
  loadAnalytics();
}

function switchAnalyticsChartType(type) {
  analyticsChartType = type;
  document.querySelectorAll('.chart-type-btn').forEach(el => {
    el.style.background = el.dataset.type === type ? 'var(--accent)' : 'transparent';
    el.style.color = el.dataset.type === type ? 'white' : 'var(--text)';
  });
  loadAnalytics();
}

function drawAnalyticsMonthChart(data) {
  const el = document.getElementById('analytics-month-chart');
  if (!el || !data.length) return;
  
  const vals = data.map(r => Number(r.rev) || 0);
  const max = Math.max(...vals, 1);
  
  if (analyticsChartType === 'bar') {
    el.innerHTML = data.map((r, i) => {
      const pct = (vals[i] / max * 100).toFixed(1);
      const v = vals[i];
      const fmt = v >= 1000 ? '₹' + (v/1000).toFixed(1) + 'K' : '₹' + v.toFixed(0);
      return `<div class="bar-col">
        <div class="bar-val">${fmt}</div>
        <div class="bar" style="height:${pct}%;background:#2563eb" title="${r.mo}: ₹${v.toFixed(2)}"></div>
        <div class="bar-lbl">${r.mo}</div>
      </div>`;
    }).join('');
  } else if (analyticsChartType === 'line') {
    drawLineChart('analytics-month-chart', data, 'mo', 'rev', '2563eb');
  } else {
    drawAreaChart('analytics-month-chart', data, 'mo', 'rev', '2563eb');
  }
}

function drawAnalyticsCategoryChart(data) {
  const el = document.getElementById('analytics-category-chart');
  if (!el || !data.length) return;
  
  const vals = data.map(r => Number(r.rev) || 0);
  const max = Math.max(...vals, 1);
  
  el.innerHTML = data.map((r, i) => {
    const pct = (vals[i] / max * 100).toFixed(1);
    const v = vals[i];
    return `<div style="display:flex;align-items:center;margin-bottom:12px;gap:10px">
      <div style="width:140px;font-size:12px;font-weight:500">${r.name}</div>
      <div style="flex:1;height:24px;background:#e2e8f0;border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:#16a34a;display:flex;align-items:center;justify-content:flex-end;padding-right:6px">
          <span style="color:white;font-size:11px;font-weight:600">₹${v.toFixed(0)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function drawAnalyticsPaymentChart(data) {
  const el = document.getElementById('analytics-payment-chart');
  if (!el) return;
  
  // Use sample data if not provided
  const paymentData = data && data.length ? data : [
    { method: 'UPI', amount: 60000, count: 301 },
    { method: 'CASH', amount: 55000, count: 332 },
    { method: 'CARD', amount: 70000, count: 336 }
  ];
  
  const vals = paymentData.map(r => Number(r.amount) || 0);
  const max = Math.max(...vals, 1);
  const colors = { 'UPI': '#a855f7', 'CASH': '#14b8a6', 'CARD': '#2563eb' };
  
  el.innerHTML = paymentData.map((r, i) => {
    const pct = (vals[i] / max * 100).toFixed(1);
    const v = vals[i];
    const fmt = v >= 1000 ? '₹' + (v/1000).toFixed(1) + 'K' : '₹' + v.toFixed(0);
    return `<div class="bar-col">
      <div class="bar-val">${fmt}</div>
      <div class="bar" style="height:${pct}%;background:${colors[r.method] || '#3b82f6'}" title="${r.method}: ${r.count} bills | ₹${v.toFixed(2)}"></div>
      <div class="bar-lbl">${r.method}</div>
    </div>`;
  }).join('');
}

function drawLineChart(containerId, data, labelKey, valKey, color) {
  const el = document.getElementById(containerId);
  if (!el || !data.length) return;
  
  const vals = data.map(r => Number(r[valKey]) || 0);
  const max = Math.max(...vals, 1);
  const h = 200;
  const w = 100;
  
  // Build SVG path
  let pathData = data.map((r, i) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w;
    const y = h - (vals[i] / max) * h;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  
  const colorHex = color.startsWith('#') ? color : '#' + color;
  let html = `<svg style="width:100%;height:${h}px;display:block" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path d="${pathData}" style="stroke:${colorHex};stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round" />
  </svg>`;
  
  el.innerHTML = html;
}

function drawAreaChart(containerId, data, labelKey, valKey, color) {
  const el = document.getElementById(containerId);
  if (!el || !data.length) return;
  
  const vals = data.map(r => Number(r[valKey]) || 0);
  const max = Math.max(...vals, 1);
  const h = 200;
  const w = 100;
  
  // Build SVG path for curve
  let pathData = data.map((r, i) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w;
    const y = h - (vals[i] / max) * h;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  
  // Add closing path
  pathData += ` L ${w} ${h} L 0 ${h} Z`;
  
  const colorHex = color.startsWith('#') ? color : '#' + color;
  const fillColor = colorHex + '33';
  
  let html = `<svg style="width:100%;height:${h}px;display:block" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path d="${pathData}" style="fill:${fillColor};stroke:${colorHex};stroke-width:2;stroke-linejoin:round;stroke-linecap:round" />
  </svg>`;
  
  el.innerHTML = html;
}

function renderAnalyticsSales(sales) {
  const tbody = document.getElementById('analytics-sales-body');
  if (!tbody) return;
  
  tbody.innerHTML = sales.length ? sales.map(s => `<tr>
    <td><span class="mono text-sm">${s.invoice_no}</span></td>
    <td class="text-sm text-muted">${new Date(s.sale_date).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'})}</td>
    <td><strong>${s.customer_name}</strong></td>
    <td class="text-center text-sm"><span class="badge badge-blue">${s.item_count || 1}</span></td>
    <td class="mono">₹${Number(s.total_amount).toFixed(2)}</td>
    <td class="mono" style="color:#dc2626">-₹${Number(s.discount).toFixed(2)}</td>
    <td class="mono"><strong>₹${Number(s.net_amount).toFixed(2)}</strong></td>
    <td><span class="badge badge-${s.payment_method==='cash'?'green':s.payment_method==='card'?'blue':'purple'}">${s.payment_method.toUpperCase()}</span></td>
    <td><button class="btn btn-outline btn-sm" onclick="viewSale(${s.id},'${s.invoice_no}')">🔍</button></td>
  </tr>`).join('')
  : '<tr><td colspan="9" style="padding:20px;text-align:center;color:#94a3b8">No sales data</td></tr>';
}

// ═══════════════════════════════════════════════════════
//  INIT — runs after DOM is fully loaded
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Show username
  const uname = sessionStorage.getItem('username') || 'Admin';
  const dbname = sessionStorage.getItem('dbName') || '';
  setText('current-user', uname + (dbname ? ' · ' + dbname : ''));

  // Date
  setText('current-date', new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long',year:'numeric'}));

  // Overlay click-to-close (safe here — DOM is ready)
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target===o) o.classList.remove('open'); });
  });

  // Load dashboard
  navigate('dashboard');
});
