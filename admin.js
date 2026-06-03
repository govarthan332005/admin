// Admin Panel Logic
import {
  db, auth, ref, onValue, push, set, update, remove,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword
} from './firebase-config.js';

// ============ DOM Elements ============
const authScreen = document.getElementById('authScreen');
const adminApp = document.getElementById('adminApp');
const loginForm = document.getElementById('loginForm');
const authError = document.getElementById('authError');
const adminName = document.getElementById('adminName');
const adminEmail = document.getElementById('adminEmail');
const setupLink = document.getElementById('setupLink');
const togglePassword = document.getElementById('togglePassword');

// ============ Auth State ============
let isSetupMode = false;

onAuthStateChanged(auth, user => {
  if (user) {
    authScreen.style.display = 'none';
    adminApp.style.display = 'flex';
    adminName.textContent = user.email.split('@')[0];
    adminEmail.textContent = user.email;
    initAdmin();
  } else {
    authScreen.style.display = 'flex';
    adminApp.style.display = 'none';
  }
});

// Toggle password visibility
togglePassword.addEventListener('click', () => {
  const pwd = document.getElementById('loginPassword');
  const icon = togglePassword.querySelector('i');
  if (pwd.type === 'password') { pwd.type = 'text'; icon.className = 'fa-solid fa-eye-slash'; }
  else { pwd.type = 'password'; icon.className = 'fa-solid fa-eye'; }
});

// Toggle Setup Mode
setupLink.addEventListener('click', e => {
  e.preventDefault();
  isSetupMode = !isSetupMode;
  const submitBtn = loginForm.querySelector('.auth-submit');
  if (isSetupMode) {
    submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Admin Account';
    setupLink.textContent = 'Already have an account? Sign in';
    showAuthError('You\'re creating a new admin account. After signup, sign in to access the dashboard.', false);
  } else {
    submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
    setupLink.textContent = 'Setup admin account';
    authError.classList.remove('active');
  }
});

function showAuthError(msg, isError = true) {
  authError.textContent = msg;
  authError.classList.add('active');
  authError.style.color = isError ? 'var(--danger)' : 'var(--primary-light)';
  authError.style.background = isError ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)';
  authError.style.borderColor = isError ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.3)';
}

// Login / Signup
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  authError.classList.remove('active');

  try {
    if (isSetupMode) {
      await createUserWithEmailAndPassword(auth, email, password);
      showToast('Admin account created! You are now signed in.');
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    const messages = {
      'auth/invalid-email': 'Invalid email address.',
      'auth/user-not-found': 'No admin account with this email. Use "Setup admin account" to create one.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/network-request-failed': 'Network error. Please check your connection.'
    };
    showAuthError(messages[err.code] || err.message);
  }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut(auth);
});

// ============ Sidebar Navigation ============
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const viewTitle = document.getElementById('viewTitle');

sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

document.querySelectorAll('.sidebar-link').forEach(link => {
  link.addEventListener('click', () => {
    switchView(link.dataset.view);
    if (window.innerWidth <= 900) sidebar.classList.remove('open');
  });
});

document.querySelectorAll('[data-view][data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
    if (btn.dataset.action === 'add') {
      setTimeout(() => openForm(btn.dataset.view.slice(0, -1)), 200);
    }
  });
});

function switchView(view) {
  document.querySelectorAll('.sidebar-link').forEach(l =>
    l.classList.toggle('active', l.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  const titles = {
    dashboard: 'Dashboard',
    internships: 'Internships Manager',
    scholarships: 'Scholarships Manager',
    jobs: 'Jobs Manager'
  };
  viewTitle.textContent = titles[view] || 'Dashboard';
}

// ============ Data Listeners ============
let dataMap = { internship: {}, scholarship: {}, job: {} };

function initAdmin() {
  onValue(ref(db, 'internships'), snap => {
    dataMap.internship = snap.val() || {};
    renderAdminList('internship');
    updateDashboard();
  });
  onValue(ref(db, 'scholarships'), snap => {
    dataMap.scholarship = snap.val() || {};
    renderAdminList('scholarship');
    updateDashboard();
  });
  onValue(ref(db, 'jobs'), snap => {
    dataMap.job = snap.val() || {};
    renderAdminList('job');
    updateDashboard();
  });
}

function updateDashboard() {
  const iCount = Object.keys(dataMap.internship).length;
  const sCount = Object.keys(dataMap.scholarship).length;
  const jCount = Object.keys(dataMap.job).length;
  document.getElementById('dashInternships').textContent = iCount;
  document.getElementById('dashScholarships').textContent = sCount;
  document.getElementById('dashJobs').textContent = jCount;
  document.getElementById('dashTotal').textContent = iCount + sCount + jCount;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const listIds = {
  internship: 'adminInternshipsList',
  scholarship: 'adminScholarshipsList',
  job: 'adminJobsList'
};

function renderAdminList(type) {
  const list = document.getElementById(listIds[type]);
  const data = dataMap[type];
  const items = Object.entries(data).map(([id, v]) => ({ id, ...v }))
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <i class="fa-solid fa-folder-open"></i>
      <p>No ${type}s yet. Click "Add New" to create one.</p>
    </div>`;
    return;
  }

  list.innerHTML = items.map(item => {
    const companyLabel = type === 'scholarship' ? (item.provider || 'Provider') : (item.company || 'Company');
    const status = (item.applyStatus || 'available').toLowerCase();
    const statusInfo = {
      available: { cls: 'status-available', icon: 'fa-circle-check', text: 'Apply Available' },
      unavailable: { cls: 'status-unavailable', icon: 'fa-circle-xmark', text: 'Not Available' },
      walkin: { cls: 'status-walkin', icon: 'fa-person-walking', text: 'Walk-in' }
    }[status] || { cls: 'status-available', icon: 'fa-circle-check', text: 'Available' };

    return `
      <div class="admin-item">
        <div class="item-info">
          <div class="item-title">${escapeHtml(item.title || 'Untitled')}</div>
          <div class="item-sub">
            <span><i class="fa-solid fa-building"></i> ${escapeHtml(companyLabel)}</span>
            ${item.location ? `<span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(item.location)}</span>` : ''}
            <span class="status-pill ${statusInfo.cls}">
              <i class="fa-solid ${statusInfo.icon}"></i> ${statusInfo.text}
            </span>
          </div>
        </div>
        <div class="item-actions">
          <button class="icon-btn edit" data-edit="${type}" data-id="${item.id}" title="Edit">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="icon-btn delete" data-delete="${type}" data-id="${item.id}" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>`;
  }).join('');

  // Attach listeners
  list.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openForm(btn.dataset.edit, btn.dataset.id));
  });
  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.delete, btn.dataset.id));
  });
}

// ============ Form (Add/Edit) ============
const formOverlay = document.getElementById('formModalOverlay');
const itemForm = document.getElementById('itemForm');
const formModalTitle = document.getElementById('formModalTitle');
const companyLabel = document.getElementById('companyLabel');
const stipendLabel = document.getElementById('stipendLabel');
const durationLabel = document.getElementById('durationLabel');

document.getElementById('addInternshipBtn').addEventListener('click', () => openForm('internship'));
document.getElementById('addScholarshipBtn').addEventListener('click', () => openForm('scholarship'));
document.getElementById('addJobBtn').addEventListener('click', () => openForm('job'));
document.getElementById('formModalClose').addEventListener('click', closeForm);
document.getElementById('formCancel').addEventListener('click', closeForm);
formOverlay.addEventListener('click', e => { if (e.target === formOverlay) closeForm(); });

// Apply Status -> toggle link field
document.getElementById('fApplyStatus').addEventListener('change', e => {
  const linkGroup = document.getElementById('applyLinkGroup');
  const linkInput = document.getElementById('fApplyLink');
  if (e.target.value === 'available') {
    linkGroup.style.display = '';
    linkInput.required = true;
  } else {
    linkGroup.style.display = 'none';
    linkInput.required = false;
  }
});

function openForm(type, id = null) {
  itemForm.reset();
  document.getElementById('itemType').value = type;
  document.getElementById('itemId').value = id || '';

  // Customize labels per type
  if (type === 'scholarship') {
    companyLabel.textContent = 'Provider / Organization *';
    document.getElementById('fCompany').placeholder = 'e.g. National Scholarship Portal';
    stipendLabel.textContent = 'Amount';
    document.getElementById('fStipend').placeholder = 'e.g. ₹50,000';
    durationLabel.textContent = 'Duration / Year';
  } else if (type === 'job') {
    companyLabel.textContent = 'Company *';
    document.getElementById('fCompany').placeholder = 'e.g. Microsoft';
    stipendLabel.textContent = 'Salary';
    document.getElementById('fStipend').placeholder = 'e.g. ₹8 LPA';
    durationLabel.textContent = 'Experience';
    document.getElementById('fDuration').placeholder = 'e.g. 0-2 years';
  } else {
    companyLabel.textContent = 'Company *';
    document.getElementById('fCompany').placeholder = 'e.g. Google';
    stipendLabel.textContent = 'Stipend';
    document.getElementById('fStipend').placeholder = 'e.g. ₹15,000/month';
    durationLabel.textContent = 'Duration';
    document.getElementById('fDuration').placeholder = 'e.g. 3 months';
  }

  formModalTitle.textContent = id ? `Edit ${capitalize(type)}` : `Add New ${capitalize(type)}`;

  if (id) {
    const item = dataMap[type][id];
    if (item) {
      document.getElementById('fTitle').value = item.title || '';
      document.getElementById('fCompany').value = (type === 'scholarship' ? item.provider : item.company) || '';
      document.getElementById('fLocation').value = item.location || '';
      document.getElementById('fDuration').value = item.duration || '';
      document.getElementById('fStipend').value = item.stipend || item.amount || item.salary || '';
      document.getElementById('fDeadline').value = item.deadline || '';
      document.getElementById('fEligibility').value = item.eligibility || '';
      document.getElementById('fType').value = item.type || '';
      document.getElementById('fDescription').value = item.description || '';
      document.getElementById('fApplyStatus').value = item.applyStatus || 'available';
      document.getElementById('fApplyLink').value = item.applyLink || '';
    }
  } else {
    document.getElementById('fApplyStatus').value = 'available';
  }
  // Trigger change to set link visibility
  document.getElementById('fApplyStatus').dispatchEvent(new Event('change'));

  formOverlay.classList.add('active');
}

function closeForm() { formOverlay.classList.remove('active'); }

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

itemForm.addEventListener('submit', async e => {
  e.preventDefault();
  const type = document.getElementById('itemType').value;
  const id = document.getElementById('itemId').value;
  const status = document.getElementById('fApplyStatus').value;

  const data = {
    title: document.getElementById('fTitle').value.trim(),
    location: document.getElementById('fLocation').value.trim(),
    duration: document.getElementById('fDuration').value.trim(),
    deadline: document.getElementById('fDeadline').value.trim(),
    eligibility: document.getElementById('fEligibility').value.trim(),
    type: document.getElementById('fType').value.trim(),
    description: document.getElementById('fDescription').value.trim(),
    applyStatus: status,
    applyLink: status === 'available' ? document.getElementById('fApplyLink').value.trim() : '',
  };

  const stipendVal = document.getElementById('fStipend').value.trim();
  const companyVal = document.getElementById('fCompany').value.trim();

  if (type === 'scholarship') {
    data.provider = companyVal;
    data.amount = stipendVal;
  } else if (type === 'job') {
    data.company = companyVal;
    data.salary = stipendVal;
  } else {
    data.company = companyVal;
    data.stipend = stipendVal;
  }

  // Strip empty fields
  Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });

  try {
    const path = type === 'scholarship' ? 'scholarships' : type === 'job' ? 'jobs' : 'internships';
    if (id) {
      await update(ref(db, `${path}/${id}`), { ...data, updatedAt: Date.now() });
      showToast(`${capitalize(type)} updated successfully!`);
    } else {
      const newRef = push(ref(db, path));
      await set(newRef, { ...data, createdAt: Date.now() });
      showToast(`${capitalize(type)} added successfully!`);
    }
    closeForm();
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
});

// ============ Delete Confirmation ============
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmMessage = document.getElementById('confirmMessage');
let pendingDelete = null;

document.getElementById('confirmCancel').addEventListener('click', () => confirmOverlay.classList.remove('active'));
confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) confirmOverlay.classList.remove('active'); });

document.getElementById('confirmOk').addEventListener('click', async () => {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  try {
    const path = type === 'scholarship' ? 'scholarships' : type === 'job' ? 'jobs' : 'internships';
    await remove(ref(db, `${path}/${id}`));
    showToast(`${capitalize(type)} deleted.`);
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
  confirmOverlay.classList.remove('active');
  pendingDelete = null;
});

function confirmDelete(type, id) {
  const item = dataMap[type][id];
  pendingDelete = { type, id };
  confirmMessage.textContent = `Delete "${item?.title || 'this item'}"? This action cannot be undone.`;
  confirmOverlay.classList.add('active');
}

// ============ Toast ============
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
function showToast(msg, isError = false) {
  toastMsg.textContent = msg;
  toast.classList.toggle('error', isError);
  const icon = toast.querySelector('i');
  icon.className = isError ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
