// ============================================
// StudentsZone — Admin Panel Logic
// Advanced features: search, sort, filter, export,
// activity log, settings, sample seeding.
// ============================================

import {
  db, auth, ref, onValue, push, set, update, remove,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword
} from './firebase-config.js';

// ============================================
// State
// ============================================
const state = {
  data: { internship: {}, scholarship: {}, job: {} },
  activity: [],
  filters: {
    internship: { search: '', sort: 'newest', status: 'all' },
    scholarship: { search: '', sort: 'newest', status: 'all' },
    job: { search: '', sort: 'newest', status: 'all' }
  },
  pendingConfirm: null,
  user: null,
  isSignupMode: false
};

// Restore display name preference
state.displayName = localStorage.getItem('sz_admin_name') || '';

// ============================================
// DOM Shortcuts
// ============================================
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const authScreen = $('authScreen');
const adminApp = $('adminApp');
const loginForm = $('loginForm');
const authError = $('authError');
const authSubmitBtn = $('authSubmitBtn');

// ============================================
// Auth: Tab Switching (Sign In / Sign Up)
// ============================================
$$('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.isSignupMode = tab.dataset.tab === 'signup';
    if (state.isSignupMode) {
      authSubmitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> <span>Create Account</span>';
      $('authTitle').textContent = 'Create Admin Account';
      $('authSubtitle').textContent = 'Set up your first admin account';
      $('loginPassword').setAttribute('autocomplete', 'new-password');
      showAuthInfo('Use a strong password (min 6 characters). After creation you\'ll be signed in automatically.');
    } else {
      authSubmitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> <span>Sign In</span>';
      $('authTitle').textContent = 'Admin Login';
      $('authSubtitle').textContent = 'Sign in to manage StudentsZone';
      $('loginPassword').setAttribute('autocomplete', 'current-password');
      clearAuthError();
    }
  });
});

// ============================================
// Toggle Password
// ============================================
$('togglePassword').addEventListener('click', () => {
  const pwd = $('loginPassword');
  const icon = $('togglePassword').querySelector('i');
  pwd.type = pwd.type === 'password' ? 'text' : 'password';
  icon.className = pwd.type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
});

// ============================================
// Auth Errors
// ============================================
function showAuthError(msg) {
  authError.textContent = msg;
  authError.className = 'auth-error active';
}
function showAuthInfo(msg) {
  authError.textContent = msg;
  authError.className = 'auth-error active info';
}
function clearAuthError() {
  authError.className = 'auth-error';
}

// ============================================
// Auth State Listener
// ============================================
onAuthStateChanged(auth, user => {
  if (user) {
    state.user = user;
    authScreen.style.display = 'none';
    adminApp.style.display = 'flex';
    const name = state.displayName || user.email.split('@')[0];
    $('adminName').textContent = name;
    $('adminEmail').textContent = user.email;
    $('welcomeName').textContent = name;
    $('settingsEmail').textContent = user.email;
    $('settingsDisplayName').value = state.displayName || '';
    initData();
  } else {
    state.user = null;
    authScreen.style.display = 'flex';
    adminApp.style.display = 'none';
  }
});

// ============================================
// Login / Signup
// ============================================
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  clearAuthError();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;

  if (!email || !password) {
    showAuthError('Please fill in all fields.');
    return;
  }
  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters.');
    return;
  }

  authSubmitBtn.disabled = true;
  const origHtml = authSubmitBtn.innerHTML;
  authSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Please wait...</span>';

  try {
    if (state.isSignupMode) {
      await createUserWithEmailAndPassword(auth, email, password);
      showToast('Admin account created successfully!');
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    const messages = {
      'auth/invalid-email': 'Invalid email address format.',
      'auth/user-not-found': 'No admin account with this email. Use "Create Account" to register.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
      'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.'
    };
    showAuthError(messages[err.code] || err.message || 'Authentication failed.');
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.innerHTML = origHtml;
  }
});

// ============================================
// Logout
// ============================================
$('logoutBtn').addEventListener('click', async () => {
  try {
    await signOut(auth);
    showToast('Signed out successfully');
  } catch (err) {
    showToast('Error signing out: ' + err.message, true);
  }
});

// ============================================
// Sidebar Navigation
// ============================================
const sidebar = $('sidebar');
const backdrop = $('sidebarBackdrop');

$('hamburger').addEventListener('click', () => {
  sidebar.classList.add('open');
  backdrop.classList.add('show');
});
$('sidebarClose').addEventListener('click', closeSidebar);
backdrop.addEventListener('click', closeSidebar);
function closeSidebar() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('show');
}

$$('.sidebar-link').forEach(link => {
  link.addEventListener('click', () => {
    switchView(link.dataset.view);
    if (window.innerWidth <= 1024) closeSidebar();
  });
});

// Dashboard quick-action buttons
$$('[data-view][data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    switchView(view);
    if (btn.dataset.action === 'add') {
      const typeMap = { internships: 'internship', scholarships: 'scholarship', jobs: 'job' };
      setTimeout(() => openForm(typeMap[view]), 250);
    }
  });
});

function switchView(view) {
  $$('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
  $$('.view').forEach(v => v.classList.remove('active'));
  const target = $(`view-${view}`);
  if (target) target.classList.add('active');

  const titles = {
    dashboard: { t: 'Dashboard', s: 'Overview of all opportunities' },
    internships: { t: 'Internships', s: 'Manage internship listings' },
    scholarships: { t: 'Scholarships', s: 'Manage scholarship listings' },
    jobs: { t: 'Jobs', s: 'Manage job listings' },
    activity: { t: 'Activity Log', s: 'Recent admin actions' },
    settings: { t: 'Settings', s: 'Account & app preferences' }
  };
  const conf = titles[view] || titles.dashboard;
  $('viewTitle').textContent = conf.t;
  $('viewSubtitle').textContent = conf.s;
}

// ============================================
// Firebase Data Sync
// ============================================
function initData() {
  bindCollection('internships', 'internship');
  bindCollection('scholarships', 'scholarship');
  bindCollection('jobs', 'job');
}

function bindCollection(path, key) {
  onValue(ref(db, path), snap => {
    state.data[key] = snap.val() || {};
    renderAll();
    updateDashboard();
  }, err => {
    console.error(`Failed to sync ${path}:`, err);
    showToast(`Failed to load ${path}: ${err.message}`, true);
  });
}

function updateDashboard() {
  const counts = {
    internship: Object.values(state.data.internship),
    scholarship: Object.values(state.data.scholarship),
    job: Object.values(state.data.job)
  };
  const activeOf = arr => arr.filter(x => (x.applyStatus || 'available') === 'available').length;

  $('dashInternships').textContent = counts.internship.length;
  $('dashScholarships').textContent = counts.scholarship.length;
  $('dashJobs').textContent = counts.job.length;
  $('dashTotal').textContent = counts.internship.length + counts.scholarship.length + counts.job.length;

  $('dashIntActive').textContent = `${activeOf(counts.internship)} active`;
  $('dashSchActive').textContent = `${activeOf(counts.scholarship)} active`;
  $('dashJobActive').textContent = `${activeOf(counts.job)} active`;
  $('dashTotalActive').textContent = `${activeOf(counts.internship) + activeOf(counts.scholarship) + activeOf(counts.job)} active`;

  // Sidebar counts
  $('navCountInt').textContent = counts.internship.length;
  $('navCountSch').textContent = counts.scholarship.length;
  $('navCountJob').textContent = counts.job.length;

  // Recent activity feed (last 6 items across all types)
  const allItems = [
    ...counts.internship.map((v, i) => ({ ...v, _t: 'internship' })),
    ...counts.scholarship.map((v, i) => ({ ...v, _t: 'scholarship' })),
    ...counts.job.map((v, i) => ({ ...v, _t: 'job' }))
  ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);

  const recent = $('recentList');
  if (allItems.length === 0) {
    recent.innerHTML = `<div class="empty-block"><i class="fa-solid fa-inbox"></i><p>No listings yet. Add your first one!</p></div>`;
  } else {
    recent.innerHTML = allItems.map(item => {
      const ico = item._t === 'scholarship' ? 'fa-award' : item._t === 'job' ? 'fa-building' : 'fa-briefcase';
      const colorClass = item._t === 'internship' ? 't-internship' : item._t === 'scholarship' ? 't-scholarship' : 't-job';
      return `
        <div class="recent-row">
          <div class="r-ico item-thumb ${colorClass}"><i class="fa-solid ${ico}"></i></div>
          <div class="r-info">
            <div class="r-title">${escapeHtml(item.title || 'Untitled')}</div>
            <div class="r-sub">${escapeHtml(item.company || item.provider || 'No company')} · ${item._t}</div>
          </div>
          <div class="r-time">${timeAgo(item.createdAt)}</div>
        </div>
      `;
    }).join('');
  }
}

// ============================================
// Render Admin Lists
// ============================================
const listIds = {
  internship: 'adminInternshipsList',
  scholarship: 'adminScholarshipsList',
  job: 'adminJobsList'
};

function renderAll() {
  renderList('internship');
  renderList('scholarship');
  renderList('job');
}

function renderList(type) {
  const list = $(listIds[type]);
  if (!list) return;

  const f = state.filters[type];
  let items = Object.entries(state.data[type]).map(([id, v]) => ({ id, ...v }));

  // Filter by status
  if (f.status !== 'all') {
    items = items.filter(it => (it.applyStatus || 'available') === f.status);
  }

  // Filter by search
  if (f.search) {
    const q = f.search.toLowerCase();
    items = items.filter(it =>
      (it.title || '').toLowerCase().includes(q) ||
      (it.company || '').toLowerCase().includes(q) ||
      (it.provider || '').toLowerCase().includes(q) ||
      (it.location || '').toLowerCase().includes(q) ||
      (it.description || '').toLowerCase().includes(q)
    );
  }

  // Sort
  if (f.sort === 'newest') items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  else if (f.sort === 'oldest') items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  else if (f.sort === 'title') items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  if (items.length === 0) {
    const hasFilter = f.search || f.status !== 'all';
    list.innerHTML = `
      <div class="empty-list">
        <i class="fa-solid ${hasFilter ? 'fa-magnifying-glass' : 'fa-folder-plus'}"></i>
        <h3>${hasFilter ? 'No matches found' : `No ${type}s yet`}</h3>
        <p>${hasFilter ? 'Try a different search or filter.' : 'Click "Add New" to create your first ' + type + '.'}</p>
      </div>`;
    return;
  }

  list.innerHTML = items.map(item => renderRow(item, type)).join('');

  // Bind listeners
  list.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => openForm(btn.dataset.edit, btn.dataset.id)));
  list.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete(btn.dataset.delete, btn.dataset.id)));
  list.querySelectorAll('[data-view-item]').forEach(btn =>
    btn.addEventListener('click', () => viewItem(btn.dataset.viewItem, btn.dataset.id)));
}

function renderRow(item, type) {
  const ico = type === 'scholarship' ? 'fa-award' : type === 'job' ? 'fa-building' : 'fa-briefcase';
  const company = type === 'scholarship' ? (item.provider || 'Provider') : (item.company || 'Company');
  const status = (item.applyStatus || 'available').toLowerCase();
  const statusInfo = {
    available: { c: 'status-available', i: 'fa-circle-check', t: 'Available' },
    walkin: { c: 'status-walkin', i: 'fa-person-walking', t: 'Walk-in' },
    unavailable: { c: 'status-unavailable', i: 'fa-circle-xmark', t: 'Unavailable' }
  }[status] || { c: 'status-available', i: 'fa-circle-check', t: 'Available' };

  return `
    <div class="admin-item">
      <div class="item-thumb t-${type}"><i class="fa-solid ${ico}"></i></div>
      <div class="item-info">
        <div class="item-title">${escapeHtml(item.title || 'Untitled')}</div>
        <div class="item-sub">
          <span><i class="fa-solid fa-building"></i> ${escapeHtml(company)}</span>
          ${item.location ? `<span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(item.location)}</span>` : ''}
          ${item.duration ? `<span><i class="fa-solid fa-clock"></i> ${escapeHtml(item.duration)}</span>` : ''}
          <span class="status-pill ${statusInfo.c}">
            <i class="fa-solid ${statusInfo.i}"></i> ${statusInfo.t}
          </span>
        </div>
      </div>
      <div class="item-actions">
        ${item.applyLink ? `<a href="${escapeHtml(item.applyLink)}" target="_blank" rel="noopener" class="icon-btn view" title="Open apply link"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
        <button class="icon-btn edit" data-edit="${type}" data-id="${item.id}" title="Edit">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="icon-btn delete" data-delete="${type}" data-id="${item.id}" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function viewItem(type, id) {
  // Simply scroll into view (could be expanded later)
  openForm(type, id);
}

// ============================================
// Toolbar Bindings (search / sort / filter / export)
// ============================================
function bindToolbar(type, suffix) {
  const search = $(`search${suffix}`);
  const sort = $(`sort${suffix}`);
  const filter = $(`filter${suffix}`);
  const exp = $(`export${suffix}`);

  if (search) search.addEventListener('input', e => {
    state.filters[type].search = e.target.value;
    renderList(type);
  });
  if (sort) sort.addEventListener('change', e => {
    state.filters[type].sort = e.target.value;
    renderList(type);
  });
  if (filter) filter.addEventListener('change', e => {
    state.filters[type].status = e.target.value;
    renderList(type);
  });
  if (exp) exp.addEventListener('click', () => exportCSV(type));
}
bindToolbar('internship', 'Internships');
bindToolbar('scholarship', 'Scholarships');
bindToolbar('job', 'Jobs');

// ============================================
// Form (Add / Edit)
// ============================================
const formOverlay = $('formModalOverlay');
const itemForm = $('itemForm');

$('addInternshipBtn').addEventListener('click', () => openForm('internship'));
$('addScholarshipBtn').addEventListener('click', () => openForm('scholarship'));
$('addJobBtn').addEventListener('click', () => openForm('job'));
$('formModalClose').addEventListener('click', closeForm);
$('formCancel').addEventListener('click', closeForm);
formOverlay.addEventListener('click', e => { if (e.target === formOverlay) closeForm(); });

// Description char count
$('fDescription').addEventListener('input', e => {
  $('descCount').textContent = e.target.value.length;
});

// Apply status -> toggle link field
$('fApplyStatus').addEventListener('change', e => {
  const group = $('applyLinkGroup');
  const input = $('fApplyLink');
  const req = $('linkReq');
  if (e.target.value === 'available') {
    group.style.display = '';
    input.required = true;
    req.style.display = '';
  } else {
    group.style.display = 'none';
    input.required = false;
    input.value = '';
    req.style.display = 'none';
  }
});

function openForm(type, id = null) {
  itemForm.reset();
  $('itemType').value = type;
  $('itemId').value = id || '';
  $('descCount').textContent = '0';

  // Customize labels & placeholders per type
  const conf = {
    internship: {
      companyLbl: 'Company',
      companyPh: 'e.g. Google, Microsoft',
      stipendLbl: 'Stipend',
      stipendPh: 'e.g. ₹15,000/month',
      durationLbl: 'Duration',
      durationPh: 'e.g. 3 months',
      icon: 'fa-briefcase',
      iconCls: ''
    },
    scholarship: {
      companyLbl: 'Provider / Organization',
      companyPh: 'e.g. National Scholarship Portal',
      stipendLbl: 'Amount',
      stipendPh: 'e.g. ₹50,000',
      durationLbl: 'Duration / Year',
      durationPh: 'e.g. 2026-27',
      icon: 'fa-award',
      iconCls: 'scholarship'
    },
    job: {
      companyLbl: 'Company',
      companyPh: 'e.g. Microsoft, Amazon',
      stipendLbl: 'Salary',
      stipendPh: 'e.g. ₹8 LPA',
      durationLbl: 'Experience',
      durationPh: 'e.g. 0-2 years',
      icon: 'fa-building',
      iconCls: 'job'
    }
  }[type];

  $('companyLabel').innerHTML = `${conf.companyLbl} <span class="req">*</span>`;
  $('fCompany').placeholder = conf.companyPh;
  $('stipendLabel').textContent = conf.stipendLbl;
  $('fStipend').placeholder = conf.stipendPh;
  $('durationLabel').textContent = conf.durationLbl;
  $('fDuration').placeholder = conf.durationPh;

  const modalIcon = $('modalTypeIcon');
  modalIcon.className = `modal-icon ${conf.iconCls}`;
  modalIcon.innerHTML = `<i class="fa-solid ${conf.icon}"></i>`;

  $('formModalTitle').textContent = id ? `Edit ${capitalize(type)}` : `Add New ${capitalize(type)}`;
  $('formModalSub').textContent = id ? 'Update the fields below and save' : 'Fill in the fields and click save';
  $('submitText').textContent = id ? 'Update' : 'Save';

  if (id) {
    const item = state.data[type][id];
    if (item) {
      $('fTitle').value = item.title || '';
      $('fCompany').value = (type === 'scholarship' ? item.provider : item.company) || '';
      $('fLocation').value = item.location || '';
      $('fDuration').value = item.duration || '';
      $('fStipend').value = item.stipend || item.amount || item.salary || '';
      $('fDeadline').value = item.deadline || '';
      $('fEligibility').value = item.eligibility || '';
      $('fType').value = item.type || '';
      $('fDescription').value = item.description || '';
      $('descCount').textContent = (item.description || '').length;
      $('fApplyStatus').value = item.applyStatus || 'available';
      $('fApplyLink').value = item.applyLink || '';
    }
  } else {
    $('fApplyStatus').value = 'available';
  }

  // Trigger change to set link visibility
  $('fApplyStatus').dispatchEvent(new Event('change'));
  formOverlay.classList.add('active');

  // Focus first input
  setTimeout(() => $('fTitle').focus(), 250);
}

function closeForm() { formOverlay.classList.remove('active'); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ============================================
// Form Submit (Add/Edit)
// ============================================
itemForm.addEventListener('submit', async e => {
  e.preventDefault();

  if (!state.user) {
    showToast('You must be signed in to make changes.', true);
    return;
  }

  const submitBtn = $('formSubmit');
  const origHtml = submitBtn.innerHTML;

  const type = $('itemType').value;
  const id = $('itemId').value;
  const status = $('fApplyStatus').value;

  // Gather all form values
  const title = $('fTitle').value.trim();
  const company = $('fCompany').value.trim();
  const description = $('fDescription').value.trim();
  const applyLink = $('fApplyLink').value.trim();

  // Validation
  if (!title) return formError('Title is required.');
  if (!company) return formError('Company / Provider is required.');
  if (!description) return formError('Description is required.');
  if (status === 'available') {
    if (!applyLink) return formError('Apply Link is required when status is "Available".');
    try { new URL(applyLink); } catch { return formError('Please enter a valid URL (starting with http:// or https://).'); }
  }

  // Build data object
  const data = {
    title,
    location: $('fLocation').value.trim(),
    duration: $('fDuration').value.trim(),
    deadline: $('fDeadline').value.trim(),
    eligibility: $('fEligibility').value.trim(),
    type: $('fType').value.trim(),
    description,
    applyStatus: status,
    applyLink: status === 'available' ? applyLink : ''
  };

  const stipendVal = $('fStipend').value.trim();

  if (type === 'scholarship') {
    data.provider = company;
    if (stipendVal) data.amount = stipendVal;
  } else if (type === 'job') {
    data.company = company;
    if (stipendVal) data.salary = stipendVal;
  } else {
    data.company = company;
    if (stipendVal) data.stipend = stipendVal;
  }

  // Remove empty strings for cleanliness
  Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });

  // Disable button during save
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving...</span>';

  try {
    const path = type === 'scholarship' ? 'scholarships' : type === 'job' ? 'jobs' : 'internships';
    if (id) {
      await update(ref(db, `${path}/${id}`), { ...data, updatedAt: Date.now() });
      logActivity('update', type, data.title);
      showToast(`${capitalize(type)} updated successfully!`);
    } else {
      const newRef = push(ref(db, path));
      await set(newRef, { ...data, createdAt: Date.now() });
      logActivity('create', type, data.title);
      showToast(`${capitalize(type)} added successfully!`);
    }
    closeForm();
  } catch (err) {
    console.error('Save error:', err);
    let msg = err.message || 'Unknown error';
    if (err.code === 'PERMISSION_DENIED') {
      msg = 'Permission denied. Your Firebase Realtime Database rules may need to allow authenticated writes.';
    }
    showToast('Error: ' + msg, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = origHtml;
  }
});

function formError(msg) {
  showToast(msg, true);
  // Bring focus to the message
  return false;
}

// ============================================
// Delete Confirmation
// ============================================
const confirmOverlay = $('confirmOverlay');
$('confirmCancel').addEventListener('click', () => confirmOverlay.classList.remove('active'));
confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) confirmOverlay.classList.remove('active'); });

$('confirmOk').addEventListener('click', async () => {
  if (!state.pendingConfirm) return;
  const { action, type, id } = state.pendingConfirm;
  confirmOverlay.classList.remove('active');

  if (action === 'delete') {
    try {
      const path = type === 'scholarship' ? 'scholarships' : type === 'job' ? 'jobs' : 'internships';
      const item = state.data[type][id];
      await remove(ref(db, `${path}/${id}`));
      logActivity('delete', type, item?.title || 'Unknown');
      showToast(`${capitalize(type)} deleted successfully.`);
    } catch (err) {
      showToast('Error deleting: ' + err.message, true);
    }
  } else if (action === 'clearAll') {
    try {
      await Promise.all([
        remove(ref(db, 'internships')),
        remove(ref(db, 'scholarships')),
        remove(ref(db, 'jobs'))
      ]);
      logActivity('clear', 'all', 'All listings');
      showToast('All data cleared.');
    } catch (err) {
      showToast('Error clearing: ' + err.message, true);
    }
  }
  state.pendingConfirm = null;
});

function confirmDelete(type, id) {
  const item = state.data[type][id];
  state.pendingConfirm = { action: 'delete', type, id };
  $('confirmTitle').textContent = 'Delete this item?';
  $('confirmMessage').textContent = `"${item?.title || 'this item'}" will be permanently removed. This cannot be undone.`;
  $('confirmIcon').innerHTML = '<i class="fa-solid fa-trash"></i>';
  $('confirmOk').textContent = 'Delete';
  confirmOverlay.classList.add('active');
}

// ============================================
// Toast
// ============================================
const toast = $('toast');
const toastMsg = $('toastMsg');
let toastTimer;
function showToast(msg, isError = false) {
  toastMsg.textContent = msg;
  toast.classList.toggle('error', isError);
  toast.querySelector('i').className = isError ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

// ============================================
// Helpers
// ============================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}

// ============================================
// Activity Log (session-only)
// ============================================
function logActivity(action, type, title) {
  state.activity.unshift({
    action, type, title, time: Date.now()
  });
  if (state.activity.length > 50) state.activity.length = 50;
  renderActivity();
}

function renderActivity() {
  const list = $('activityList');
  if (!list) return;
  if (state.activity.length === 0) {
    list.innerHTML = `<div class="empty-block"><i class="fa-solid fa-history"></i><p>No activity recorded yet</p></div>`;
    return;
  }
  list.innerHTML = state.activity.map(a => {
    const actInfo = {
      create: { c: '#10b981', i: 'fa-plus', t: 'Created' },
      update: { c: '#6366f1', i: 'fa-pen', t: 'Updated' },
      delete: { c: '#ef4444', i: 'fa-trash', t: 'Deleted' },
      clear: { c: '#ef4444', i: 'fa-broom', t: 'Cleared' }
    }[a.action] || { c: '#a8a8c2', i: 'fa-circle', t: 'Action' };
    return `
      <div class="activity-row" style="--act-c:${actInfo.c}">
        <div class="item-thumb" style="background:${actInfo.c}; width:36px; height:36px;">
          <i class="fa-solid ${actInfo.i}"></i>
        </div>
        <div class="r-info" style="flex:1">
          <div class="r-title">${actInfo.t} ${a.type}</div>
          <div class="r-sub">${escapeHtml(a.title)}</div>
        </div>
        <div class="act-time">${timeAgo(a.time)}</div>
      </div>
    `;
  }).join('');
}

// ============================================
// CSV Export
// ============================================
function exportCSV(type) {
  const items = Object.entries(state.data[type]).map(([id, v]) => ({ id, ...v }));
  if (items.length === 0) {
    showToast(`No ${type}s to export.`, true);
    return;
  }
  const fields = ['title', type === 'scholarship' ? 'provider' : 'company', 'location', 'duration',
                  type === 'scholarship' ? 'amount' : type === 'job' ? 'salary' : 'stipend',
                  'deadline', 'eligibility', 'type', 'description', 'applyStatus', 'applyLink'];
  const header = fields.join(',');
  const rows = items.map(it => fields.map(f => {
    const v = it[f] || '';
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `studentszone-${type}s-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${items.length} ${type}s.`);
}

// ============================================
// Settings: display name, seed, clear all
// ============================================
$('saveDisplayName').addEventListener('click', () => {
  const name = $('settingsDisplayName').value.trim();
  if (!name) return showToast('Please enter a name.', true);
  state.displayName = name;
  localStorage.setItem('sz_admin_name', name);
  $('adminName').textContent = name;
  $('welcomeName').textContent = name;
  showToast('Display name saved.');
});

$('clearAllBtn').addEventListener('click', () => {
  state.pendingConfirm = { action: 'clearAll' };
  $('confirmTitle').textContent = 'Clear ALL data?';
  $('confirmMessage').textContent = 'This will permanently delete every internship, scholarship, and job. This cannot be undone.';
  $('confirmIcon').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
  $('confirmOk').textContent = 'Clear All';
  confirmOverlay.classList.add('active');
});

$('seedSampleBtn').addEventListener('click', async () => {
  if (!state.user) return showToast('Please sign in first.', true);
  const samples = getSampleData();
  $('seedSampleBtn').disabled = true;
  $('seedSampleBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';
  try {
    for (const [path, items] of Object.entries(samples)) {
      for (const item of items) {
        const newRef = push(ref(db, path));
        await set(newRef, { ...item, createdAt: Date.now() - Math.floor(Math.random() * 86400000 * 7) });
      }
    }
    logActivity('create', 'sample', 'Sample data added');
    showToast('Sample data added successfully!');
  } catch (err) {
    showToast('Error: ' + err.message, true);
  } finally {
    $('seedSampleBtn').disabled = false;
    $('seedSampleBtn').innerHTML = '<i class="fa-solid fa-seedling"></i> Add Sample Data';
  }
});

function getSampleData() {
  return {
    internships: [
      {
        title: 'Frontend Developer Intern',
        company: 'Google India',
        location: 'Bangalore (Hybrid)',
        duration: '6 months',
        stipend: '₹50,000/month',
        deadline: '15 July 2026',
        eligibility: 'B.Tech / B.E. CS, IT, ECE — 3rd/4th year',
        type: 'Full-time, Hybrid',
        description: 'Work on next-generation web applications using React, TypeScript, and modern web technologies. You\'ll collaborate with senior engineers, learn industry best practices, and contribute to products used by millions.',
        applyStatus: 'available',
        applyLink: 'https://careers.google.com'
      },
      {
        title: 'Data Science Intern',
        company: 'Microsoft',
        location: 'Hyderabad',
        duration: '3 months',
        stipend: '₹65,000/month',
        deadline: '20 July 2026',
        eligibility: 'M.Tech / M.S. in Data Science, AI/ML',
        type: 'Paid Internship',
        description: 'Join the Azure ML team to build machine learning models, work on data pipelines, and contribute to research papers.',
        applyStatus: 'available',
        applyLink: 'https://careers.microsoft.com'
      },
      {
        title: 'UI/UX Design Intern',
        company: 'Swiggy',
        location: 'Bangalore',
        duration: '6 months',
        stipend: '₹40,000/month',
        eligibility: 'Any design background',
        type: 'Full-time',
        description: 'Design beautiful, intuitive user experiences for the Swiggy app. Work with product managers and developers.',
        applyStatus: 'walkin'
      }
    ],
    scholarships: [
      {
        title: 'AICTE PG Scholarship',
        provider: 'All India Council for Technical Education',
        location: 'India (All States)',
        duration: '2026-27',
        amount: '₹12,400/month',
        deadline: '30 September 2026',
        eligibility: 'GATE-qualified M.Tech students',
        description: 'Monthly stipend for full-time M.Tech students in AICTE-approved institutions. Renewable based on performance.',
        applyStatus: 'available',
        applyLink: 'https://scholarships.gov.in'
      },
      {
        title: 'Reliance Foundation Scholarship',
        provider: 'Reliance Foundation',
        location: 'India',
        duration: '2026-27',
        amount: '₹6,00,000 total',
        deadline: '15 August 2026',
        eligibility: 'UG students, family income < ₹15L/year',
        description: 'Merit-cum-need based scholarship for undergraduate students with strong academic record and leadership potential.',
        applyStatus: 'available',
        applyLink: 'https://reliancefoundation.org'
      }
    ],
    jobs: [
      {
        title: 'Software Engineer I',
        company: 'Amazon',
        location: 'Bangalore / Hyderabad',
        duration: '0-2 years',
        salary: '₹22 LPA',
        deadline: 'Open until filled',
        eligibility: 'B.Tech / M.Tech CS or equivalent',
        type: 'Full-time',
        description: 'Build large-scale distributed systems that power Amazon\'s retail and cloud businesses. Solve hard engineering problems with talented teams.',
        applyStatus: 'available',
        applyLink: 'https://amazon.jobs'
      },
      {
        title: 'Junior Product Designer',
        company: 'Razorpay',
        location: 'Bangalore (Remote OK)',
        duration: '1-3 years',
        salary: '₹14 LPA',
        eligibility: 'Portfolio with shipped products',
        type: 'Remote, Full-time',
        description: 'Design financial products used by lakhs of businesses. Own end-to-end design from research to handoff.',
        applyStatus: 'available',
        applyLink: 'https://razorpay.com/jobs'
      }
    ]
  };
}

// ============================================
// Keyboard shortcuts
// ============================================
document.addEventListener('keydown', e => {
  // ESC closes modals
  if (e.key === 'Escape') {
    if (formOverlay.classList.contains('active')) closeForm();
    else if (confirmOverlay.classList.contains('active')) confirmOverlay.classList.remove('active');
  }
});
