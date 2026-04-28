/* ============================================================
   LAOUPA — Application principale
   Version 1.0.0
   Copyright LEROY Aurélien 2026 — Tous droits réservés
   ============================================================ */

'use strict';

/* ============================================================
   CONSTANTES
   ============================================================ */
const DB_NAME    = 'laoupaDB';
const DB_VERSION = 1;

const WORKER_COLORS = [
  '#e63946','#f4a261','#2a9d8f','#457b9d','#6a4c93',
  '#f72585','#4cc9f0','#52b788','#e9c46a','#264653',
  '#a8dadc','#c77dff','#ff6b6b','#06d6a0','#ffd166'
];

const MOTIF_LABELS = {
  'absence-matin'  : 'Absence matin',
  'absence-apmidi' : 'Absence après-midi',
  'absence-journee': 'Absence journée',
  'rdv-soutien'    : 'RDV Soutien ESAT',
  'conge'          : 'Congé posé',
  'rdv-medical'    : 'RDV médical',
  'autre'          : 'Autre'
};

const RECURRENCE_LABELS = {
  'none'      : '',
  'weekly'    : '🔁 Hebdomadaire',
  'bimonthly' : '🔁 Bi-mensuelle',
  'monthly'   : '🔁 Mensuelle'
};

const TAG_LABELS = {
  'incident'   : 'Incident',
  'observation': 'Observation',
  'reunion'    : 'Réunion',
  'autre'      : 'Autre'
};

const DAY_NAMES  = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const MONTH_NAMES= ['Janvier','Février','Mars','Avril','Mai','Juin',
                    'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

/* ============================================================
   ÉTAT GLOBAL
   ============================================================ */
let db        = null;
let currentTab= 'dashboard';
let weekOffset= 0;
let confirmCallback = null;
let selectedWorkerColor = WORKER_COLORS[0];

/* ============================================================
   INITIALISATION
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initDB().then(() => {
    loadSettings();
    cleanupExpired();
    renderAll();
    bindEvents();
    startAutoCleanup();

    // Masquer splash
    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.style.display = 'none';
        document.getElementById('app').classList.remove('hidden');
      }, 500);
    }, 1200);
  });
});

/* ============================================================
   INDEXEDDB
   ============================================================ */
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const d = e.target.result;

      // Store événements pro
      if (!d.objectStoreNames.contains('events')) {
        const s = d.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date',     'date',     { unique: false });
        s.createIndex('done',     'done',     { unique: false });
        s.createIndex('doneAt',   'doneAt',   { unique: false });
      }

      // Store RDV travailleurs
      if (!d.objectStoreNames.contains('rdv')) {
        const s = d.createObjectStore('rdv', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date',       'date',       { unique: false });
        s.createIndex('workerId',   'workerId',   { unique: false });
        s.createIndex('done',       'done',       { unique: false });
        s.createIndex('doneAt',     'doneAt',     { unique: false });
        s.createIndex('recurrence', 'recurrence', { unique: false });
      }

      // Store travailleurs
      if (!d.objectStoreNames.contains('workers')) {
        d.createObjectStore('workers', { keyPath: 'id', autoIncrement: true });
      }

      // Store paramètres
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => { db = e.target.result; resolve(); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* --- Helpers DB génériques --- */
function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbGet(store, id) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbPut(store, item) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbDelete(store, id) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function dbGetSetting(key) {
  return new Promise((resolve) => {
    const tx  = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror   = () => resolve(null);
  });
}

function dbSetSetting(key, value) {
  return dbPut('settings', { key, value });
}

/* ============================================================
   PARAMÈTRES / THÈME
   ============================================================ */
async function loadSettings() {
  const theme = await dbGetSetting('theme') || 'nature';
  applyTheme(theme);
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.getElementById('theme-grid')
    .querySelectorAll('.theme-btn')
    .forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  dbSetSetting('theme', theme);

  // Mettre à jour meta theme-color
  const colors = {
    'nature'    : '#2d6a4f',
    'light'     : '#3a86ff',
    'dark'      : '#1a1d27',
    'orange'    : '#e85d04',
    'neon-green': '#030f06',
    'neon-orange':'#0e0800',
    'contrast'  : '#000000',
    'paper'     : '#f5f0e8'
  };
  document.querySelector('meta[name="theme-color"]')
    .setAttribute('content', colors[theme] || '#2d6a4f');
}

/* ============================================================
   NETTOYAGE AUTO
   ============================================================ */
async function cleanupExpired() {
  const now = Date.now();
  const H24 = 24 * 60 * 60 * 1000;
  const D15 = 15 * 24 * 60 * 60 * 1000;

  const events = await dbGetAll('events');
  for (const ev of events) {
    if (ev.done && ev.doneAt && (now - ev.doneAt) > H24) {
      await dbDelete('events', ev.id);
    }
  }

  const rdvs = await dbGetAll('rdv');
  for (const r of rdvs) {
    if (r.done && r.doneAt && (now - r.doneAt) > D15) {
      await dbDelete('rdv', r.id);
    }
  }
}

function startAutoCleanup() {
  setInterval(async () => {
    await cleanupExpired();
    renderAll();
  }, 60 * 60 * 1000); // toutes les heures
}

/* ============================================================
   RENDU GLOBAL
   ============================================================ */
async function renderAll() {
  await renderDashboard();
  await renderHistory();
  await renderTeam();
  await renderNotifBanner();
  if (currentTab === 'week') renderWeek();
}

/* ============================================================
   BANDEAU NOTIFICATIONS
   ============================================================ */
async function renderNotifBanner() {
  const container = document.getElementById('notif-cards');
  const now       = Date.now();

  const [events, rdvs, workers] = await Promise.all([
    dbGetAll('events'),
    dbGetAll('rdv'),
    dbGetAll('workers')
  ]);

  const workerMap = {};
  workers.forEach(w => workerMap[w.id] = w);

  // Éléments actifs, triés par date
  const actifs = [
    ...events.filter(e => !e.done).map(e => ({
      type   : 'event',
      dateMs : new Date(e.date).getTime(),
      label  : e.description
                ? e.description.substring(0, 40) + (e.description.length > 40 ? '…' : '')
                : '(sans description)',
      tag    : e.tag
    })),
    ...rdvs.filter(r => !r.done).map(r => {
      const w = workerMap[r.workerId];
      return {
        type   : 'rdv',
        dateMs : new Date(r.date + (r.time ? 'T' + r.time : 'T00:00')).getTime(),
        label  : (w ? w.firstname + (w.lastname ? ' ' + w.lastname : '') : 'Inconnu') +
                 ' — ' + (MOTIF_LABELS[r.motif] || r.motif),
        color  : w ? w.color : '#888'
      };
    })
  ]
  .sort((a, b) => a.dateMs - b.dateMs)
  .slice(0, 3);

  container.innerHTML = '';

  if (actifs.length === 0) {
    container.innerHTML = '<span class="notif-empty">✅ Aucun élément à venir</span>';
    return;
  }

  actifs.forEach(item => {
    const urgent  = (item.dateMs - now) < 24 * 3600 * 1000 && item.dateMs > now;
    const overdue = item.dateMs < now;
    const card    = document.createElement('div');
    card.className = 'notif-card' + (urgent || overdue ? ' urgent' : '');

    card.innerHTML = `
      <div class="notif-card-type">
        ${item.type === 'event' ? '⚡ Événement' : '👷 RDV'}
      </div>
      <div class="notif-card-main">${item.label}</div>
      <div class="notif-card-date">${formatDateRelative(item.dateMs)}</div>
    `;

    if (item.type === 'rdv' && item.color) {
      card.style.borderLeftColor = item.color;
      card.style.borderLeftWidth = '4px';
    }

    container.appendChild(card);

    function initNotifScroll() {
  const wrapper = document.getElementById('notif-cards-wrapper');
  if (!wrapper || wrapper._scrollInit) return;
  wrapper._scrollInit = true;

  let isDown = false, startX, scrollLeft;

  wrapper.addEventListener('mousedown', e => {
    isDown = true;
    wrapper.classList.add('dragging');
    startX = e.pageX - wrapper.offsetLeft;
    scrollLeft = wrapper.scrollLeft;
  });
  wrapper.addEventListener('mouseleave', () => { isDown = false; wrapper.classList.remove('dragging'); });
  wrapper.addEventListener('mouseup',    () => { isDown = false; wrapper.classList.remove('dragging'); });
  wrapper.addEventListener('mousemove',  e => {
    if (!isDown) return;
    e.preventDefault();
    wrapper.scrollLeft = scrollLeft - (e.pageX - wrapper.offsetLeft - startX);
  });

  wrapper.addEventListener('touchstart', e => {
    startX = e.touches[0].pageX;
    scrollLeft = wrapper.scrollLeft;
  }, { passive: true });
  wrapper.addEventListener('touchmove', e => {
    wrapper.scrollLeft = scrollLeft - (e.touches[0].pageX - startX);
  }, { passive: true });
}

  });
}

/* ============================================================
   TABLEAU DE BORD
   ============================================================ */
async function renderDashboard() {
  const [events, rdvs, workers] = await Promise.all([
    dbGetAll('events'),
    dbGetAll('rdv'),
    dbGetAll('workers')
  ]);

  const workerMap = {};
  workers.forEach(w => workerMap[w.id] = w);

  // Événements actifs — triés par date décroissante (plus récent en haut)
  const activeEvents = events
    .filter(e => !e.done)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // RDV actifs — triés par date croissante (plus proche en haut)
  const activeRdv = rdvs
    .filter(r => !r.done)
    .sort((a, b) => {
      const da = new Date(a.date + (a.time ? 'T' + a.time : 'T00:00'));
      const db_ = new Date(b.date + (b.time ? 'T' + b.time : 'T00:00'));
      return da - db_;
    });

  // Badges
  document.getElementById('badge-events').textContent = activeEvents.length;
  document.getElementById('badge-rdv').textContent    = activeRdv.length;

  // Rendu événements
  const listEvents  = document.getElementById('list-events');
  const emptyEvents = document.getElementById('empty-events');
  listEvents.innerHTML = '';
  listEvents.appendChild(emptyEvents);

  if (activeEvents.length === 0) {
    emptyEvents.style.display = '';
  } else {
    emptyEvents.style.display = 'none';
    activeEvents.forEach(ev => {
      listEvents.appendChild(buildEventCard(ev, false));
    });
  }

  // Rendu RDV
  const listRdv  = document.getElementById('list-rdv');
  const emptyRdv = document.getElementById('empty-rdv');
  listRdv.innerHTML = '';
  listRdv.appendChild(emptyRdv);

  if (activeRdv.length === 0) {
    emptyRdv.style.display = '';
  } else {
    emptyRdv.style.display = 'none';
    activeRdv.forEach(r => {
      listRdv.appendChild(buildRdvCard(r, workerMap, false));
    });
  }
}

/* ============================================================
   CONSTRUCTION DES CARTES
   ============================================================ */
function buildEventCard(ev, isHistory) {
  const now        = Date.now();
  const dateMs     = new Date(ev.date).getTime();
  const isOverdue  = !isHistory && dateMs < now;
  const isSoon     = !isHistory && !isOverdue && (dateMs - now) < 24 * 3600 * 1000;

  const card = document.createElement('div');
  card.className = 'card card-event' +
    (isOverdue ? ' card-overdue' : '') +
    (isSoon    ? ' card-soon'    : '');
  card.dataset.id   = ev.id;
  card.dataset.type = 'event';

  // Countdown historique
  let histCountdown = '';
  if (isHistory && ev.doneAt) {
    const remaining = 24 * 3600 * 1000 - (now - ev.doneAt);
    const hrs = Math.max(0, Math.floor(remaining / 3600000));
    histCountdown = `<div class="hist-countdown">🗑️ Suppression dans ${hrs}h</div>
      <div class="hist-delete-bar">
        <div class="hist-delete-bar-fill" style="width:${Math.max(0,Math.min(100, (1 - remaining/(24*3600000))*100))}%"></div>
      </div>`;
  }

  card.innerHTML = `
    <div class="card-header">
      ${!isHistory ? `<div class="card-check" data-id="${ev.id}" data-type="event"></div>` : ''}
      <div class="card-body">
        <div class="card-top-row">
          <span class="card-motif">⚡ ${ev.tag ? TAG_LABELS[ev.tag] || ev.tag : 'Événement Pro'}</span>
          <span class="card-date ${isOverdue ? 'overdue' : isSoon ? 'soon' : ''}">
            ${formatDateShort(ev.date)}
          </span>
        </div>
        ${ev.tag ? `<span class="card-tag">${TAG_LABELS[ev.tag] || ev.tag}</span>` : ''}
        ${isOverdue ? '<span class="overdue-badge">⚠️ Dépassé</span>' : ''}
        <div class="card-desc" data-id="${ev.id}" data-type="event-desc">
          ${escHtml(ev.description || '')}
        </div>
        ${histCountdown}
      </div>
    </div>
    <div class="card-actions">
      ${isHistory
        ? `<button class="btn-card-action btn-card-restore" data-id="${ev.id}" data-type="event">↩️ Restaurer</button>
           <button class="btn-card-action btn-card-delete"  data-id="${ev.id}" data-type="event">🗑️ Supprimer</button>`
        : `<button class="btn-card-action btn-card-edit"   data-id="${ev.id}" data-type="event">✏️ Modifier</button>
           <button class="btn-card-action btn-card-delete" data-id="${ev.id}" data-type="event">🗑️ Supprimer</button>`
      }
    </div>
  `;

  // Clic sur description pour étendre
  const desc = card.querySelector('.card-desc');
  if (desc) desc.addEventListener('click', () => desc.classList.toggle('expanded'));

  return card;
}

function buildRdvCard(r, workerMap, isHistory) {
  const now       = Date.now();
  const dateMs    = new Date(r.date + (r.time ? 'T' + r.time : 'T00:00')).getTime();
  const isOverdue = !isHistory && dateMs < now;
  const isSoon    = !isHistory && !isOverdue && (dateMs - now) < 24 * 3600 * 1000;
  const worker    = workerMap[r.workerId];
  const color     = worker ? worker.color : '#888';
  const initials  = worker
    ? (worker.firstname[0] + (worker.lastname ? worker.lastname[0] : '')).toUpperCase()
    : '?';
  const wname = worker
    ? worker.firstname + (worker.lastname ? ' ' + worker.lastname : '')
    : 'Inconnu';

  let histCountdown = '';
  if (isHistory && r.doneAt) {
    const D15     = 15 * 24 * 3600 * 1000;
    const remaining = D15 - (now - r.doneAt);
    const days    = Math.max(0, Math.floor(remaining / 86400000));
    histCountdown = `<div class="hist-countdown">🗑️ Suppression dans ${days}j</div>
      <div class="hist-delete-bar">
        <div class="hist-delete-bar-fill" style="width:${Math.max(0,Math.min(100,(1-remaining/D15)*100))}%"></div>
      </div>`;
  }

  const card = document.createElement('div');
  card.className = 'card card-rdv' +
    (isOverdue ? ' card-overdue' : '') +
    (isSoon    ? ' card-soon'    : '');
  card.style.borderLeftColor = color;
  card.dataset.id   = r.id;
  card.dataset.type = 'rdv';

  card.innerHTML = `
    <div class="card-header">
      ${!isHistory ? `<div class="card-check" data-id="${r.id}" data-type="rdv"></div>` : ''}
      <div class="card-body">
        <div class="card-top-row">
          <div class="worker-avatar" style="background:${color}">${initials}</div>
          <span class="card-worker-name">${escHtml(wname)}</span>
          <span class="card-date ${isOverdue ? 'overdue' : isSoon ? 'soon' : ''}">
            ${formatDateShort(r.date, r.time)}
          </span>
        </div>
        <div class="card-motif">${MOTIF_LABELS[r.motif] || r.motif}</div>
        ${isOverdue ? '<span class="overdue-badge">⚠️ Dépassé</span>' : ''}
        ${r.recurrence && r.recurrence !== 'none'
          ? `<div class="card-recurrence">${RECURRENCE_LABELS[r.recurrence] || ''}</div>`
          : ''}
        ${r.note ? `<div class="card-desc">${escHtml(r.note)}</div>` : ''}
        ${histCountdown}
      </div>
    </div>
    <div class="card-actions">
      ${isHistory
        ? `<button class="btn-card-action btn-card-restore" data-id="${r.id}" data-type="rdv">↩️ Restaurer</button>
           <button class="btn-card-action btn-card-delete"  data-id="${r.id}" data-type="rdv">🗑️ Supprimer</button>`
        : `<button class="btn-card-action btn-card-edit"   data-id="${r.id}" data-type="rdv">✏️ Modifier</button>
           <button class="btn-card-action btn-card-delete" data-id="${r.id}" data-type="rdv">🗑️ Supprimer</button>`
      }
    </div>
  `;

  return card;
}

/* ============================================================
   FICHE TRAVAILLEUR
   ============================================================ */
async function openWorkerDetail(workerId) {
  const [worker, rdvs, events] = await Promise.all([
    dbGet('workers', workerId),
    dbGetAll('rdv'),
    dbGetAll('events')
  ]);
  if (!worker) return;

  const initials = (worker.firstname[0] + (worker.lastname ? worker.lastname[0] : '')).toUpperCase();
  const workerRdv = rdvs
    .filter(r => r.workerId === workerId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const header = document.getElementById('worker-detail-header');
  header.innerHTML = `
    <div class="worker-avatar-large" style="background:${worker.color};width:64px;height:64px;font-size:24px;margin:0 auto">
      ${initials}
    </div>
    <div class="worker-detail-name">
      ${escHtml(worker.firstname)}${worker.lastname ? ' ' + escHtml(worker.lastname) : ''}
    </div>
  `;

  const body = document.getElementById('worker-detail-body');
  const activeRdv = workerRdv.filter(r => !r.done);
  const histRdv   = workerRdv.filter(r => r.done);

  body.innerHTML = `
    <div class="worker-detail-section">
      <div class="worker-detail-section-title">RDV à venir (${activeRdv.length})</div>
      ${activeRdv.length === 0
        ? '<p class="worker-detail-empty">Aucun RDV actif</p>'
        : activeRdv.map(r => `
            <div class="card card-rdv" style="border-left-color:${worker.color};margin-bottom:8px">
              <div class="card-motif">${MOTIF_LABELS[r.motif] || r.motif}</div>
              <div class="card-date">${formatDateShort(r.date, r.time)}</div>
              ${r.note ? `<div class="card-desc">${escHtml(r.note)}</div>` : ''}
            </div>
          `).join('')
      }
    </div>
    <div class="worker-detail-section">
      <div class="worker-detail-section-title">Historique (${histRdv.length})</div>
      ${histRdv.length === 0
        ? '<p class="worker-detail-empty">Aucun historique</p>'
        : histRdv.map(r => `
            <div class="card card-rdv" style="border-left-color:${worker.color};opacity:0.7;margin-bottom:8px">
              <div class="card-motif">${MOTIF_LABELS[r.motif] || r.motif}</div>
              <div class="card-date">${formatDateShort(r.date, r.time)}</div>
            </div>
          `).join('')
      }
    </div>
  `;

  document.getElementById('worker-detail-edit').onclick   = () => {
    closeModal('modal-worker-detail');
    openWorkerForm(workerId);
  };
  document.getElementById('worker-detail-delete').onclick = () => {
    closeModal('modal-worker-detail');
    showConfirm(
      `Supprimer ${worker.firstname} ? Ses RDV seront aussi supprimés.`,
      async () => {
        // Supprimer tous ses RDV
        const siens = rdvs.filter(r => r.workerId === workerId);
        for (const r of siens) await dbDelete('rdv', r.id);
        await dbDelete('workers', workerId);
        showToast('Travailleur supprimé');
        renderAll();
      }
    );
  };

  openModal('modal-worker-detail');
}

/* ============================================================
   VUE SEMAINE
   ============================================================ */
async function renderWeek() {
  const [events, rdvs, workers] = await Promise.all([
    dbGetAll('events'),
    dbGetAll('rdv'),
    dbGetAll('workers')
  ]);

  const workerMap = {};
  workers.forEach(w => workerMap[w.id] = w);

  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  const monday   = new Date(today);
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
  monday.setDate(today.getDate() - dayOfWeek + weekOffset * 7);

  const weekStart = new Date(monday);
  const weekEnd   = new Date(monday);
  weekEnd.setDate(weekEnd.getDate() + 6);

  document.getElementById('week-label').textContent =
    `${monday.getDate()} ${MONTH_NAMES[monday.getMonth()]} — ${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  const grid = document.getElementById('week-grid');
  grid.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dayStr = toLocalDateStr(day);

    const dayEvents = events.filter(e => e.date && e.date.startsWith(dayStr));
    const dayRdvs   = rdvs.filter(r => r.date === dayStr);
    const isToday   = day.getTime() === today.getTime();

    const cell = document.createElement('div');
    cell.className = 'week-day-cell' + (isToday ? ' today' : '');
    cell.dataset.date = dayStr;

    // Dots
    const allItems = [
      ...dayEvents.map(e => ({ type: 'event', color: null })),
      ...dayRdvs.map(r => ({
        type : 'rdv',
        color: workerMap[r.workerId] ? workerMap[r.workerId].color : '#888'
      }))
    ];

    const visibleDots = allItems.slice(0, 4);
    const more        = allItems.length > 4 ? allItems.length - 4 : 0;

    cell.innerHTML = `
      <span class="week-day-name">${DAY_NAMES[day.getDay()]}</span>
      <span class="week-day-num">${day.getDate()}</span>
      <div class="week-day-dots">
        ${visibleDots.map(item =>
          `<div class="week-dot ${item.type === 'event' ? 'week-dot-event' : ''}"
                style="${item.color ? 'background:' + item.color : ''}"></div>`
        ).join('')}
        ${more > 0 ? `<span class="week-more">+${more}</span>` : ''}
      </div>
    `;

    cell.addEventListener('click', () => openDayDetail(dayStr, dayEvents, dayRdvs, workerMap));
    grid.appendChild(cell);
  }
}

function openDayDetail(dateStr, dayEvents, dayRdvs, workerMap) {
  const detail = document.getElementById('day-detail');
  const title  = document.getElementById('day-detail-title');
  const list   = document.getElementById('day-detail-list');

  const d = new Date(dateStr + 'T00:00');
  title.textContent = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;

  list.innerHTML = '';

  if (dayEvents.length === 0 && dayRdvs.length === 0) {
    list.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;padding:12px 0">Aucun élément ce jour</p>';
  }

  dayEvents.forEach(ev => list.appendChild(buildEventCard(ev, ev.done)));
  dayRdvs.forEach(r   => list.appendChild(buildRdvCard(r, workerMap, r.done)));

  detail.classList.remove('hidden');
}

/* ============================================================
   FORMULAIRES
   ============================================================ */

/* --- Événement Pro --- */
async function openEventForm(id = null) {
  const form  = document.getElementById('form-event');
  const title = document.getElementById('modal-event-title');

  form.reset();
  document.getElementById('event-id').value = '';

  if (id) {
    const ev = await dbGet('events', id);
    if (!ev) return;
    title.textContent = '✏️ Modifier l\'événement';
    document.getElementById('event-id').value  = ev.id;
    document.getElementById('event-date').value = ev.date;
    document.getElementById('event-tag').value  = ev.tag || '';
    document.getElementById('event-desc').value = ev.description || '';
  } else {
    title.textContent = '⚡ Événement Professionnel';
    // Pré-remplir date/heure actuelle
    const now   = new Date();
    const local = now.getFullYear() + '-' +
      pad(now.getMonth() + 1) + '-' +
      pad(now.getDate()) + 'T' +
      pad(now.getHours()) + ':' +
      pad(now.getMinutes());
    document.getElementById('event-date').value = local;
  }

  openModal('modal-event');
}

async function saveEvent(e) {
  e.preventDefault();
  const id   = document.getElementById('event-id').value;
  const date = document.getElementById('event-date').value;
  const tag  = document.getElementById('event-tag').value;
  const desc = document.getElementById('event-desc').value.trim();

  if (!date || !desc) { showToast('⚠️ Date et description obligatoires'); return; }

  const obj = { date, tag, description: desc, done: false, doneAt: null };
  if (id) {
    const existing = await dbGet('events', parseInt(id));
    obj.id    = parseInt(id);
    obj.done  = existing.done;
    obj.doneAt= existing.doneAt;
  }

  await dbPut('events', obj);
  closeModal('modal-event');
  showToast(id ? '✅ Événement modifié' : '✅ Événement ajouté');
  renderAll();
}

/* --- RDV Travailleur --- */
async function openRdvForm(id = null) {
  const form   = document.getElementById('form-rdv');
  const title  = document.getElementById('modal-rdv-title');
  const select = document.getElementById('rdv-worker');

  form.reset();
  document.getElementById('rdv-id').value = '';

  // Peupler la liste des travailleurs
  const workers = await dbGetAll('workers');
  select.innerHTML = '<option value="">— Sélectionner —</option>';
  workers.sort((a, b) => a.firstname.localeCompare(b.firstname));
  workers.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.firstname + (w.lastname ? ' ' + w.lastname : '');
    select.appendChild(opt);
  });

  if (id) {
    const r = await dbGet('rdv', id);
    if (!r) return;
    title.textContent = '✏️ Modifier le RDV';
    document.getElementById('rdv-id').value         = r.id;
    document.getElementById('rdv-worker').value     = r.workerId;
    document.getElementById('rdv-date').value       = r.date;
    document.getElementById('rdv-time').value       = r.time || '';
    document.getElementById('rdv-motif').value      = r.motif;
    document.getElementById('rdv-note').value       = r.note || '';
    document.getElementById('rdv-recurrence').value = r.recurrence || 'none';
  } else {
    title.textContent = '👷 RDV / Absence';
    // Date du jour par défaut
    const today = new Date();
    document.getElementById('rdv-date').value = toLocalDateStr(today);

    if (workers.length === 0) {
      showToast('⚠️ Ajoutez d\'abord un travailleur dans Équipe');
      closeModal('modal-rdv');
      switchTab('team');
      return;
    }
  }

  openModal('modal-rdv');
}

async function saveRdv(e) {
  e.preventDefault();
  const id         = document.getElementById('rdv-id').value;
  const workerId   = parseInt(document.getElementById('rdv-worker').value);
  const date       = document.getElementById('rdv-date').value;
  const time       = document.getElementById('rdv-time').value;
  const motif      = document.getElementById('rdv-motif').value;
  const note       = document.getElementById('rdv-note').value.trim();
  const recurrence = document.getElementById('rdv-recurrence').value;

  if (!workerId || !date || !motif) {
    showToast('⚠️ Travailleur, date et motif obligatoires');
    return;
  }

  const obj = { workerId, date, time, motif, note, recurrence, done: false, doneAt: null };
  if (id) {
    const existing = await dbGet('rdv', parseInt(id));
    obj.id    = parseInt(id);
    obj.done  = existing.done;
    obj.doneAt= existing.doneAt;
  }

  await dbPut('rdv', obj);
  closeModal('modal-rdv');
  showToast(id ? '✅ RDV modifié' : '✅ RDV ajouté');
  renderAll();
}

/* --- Travailleur --- */
async function openWorkerForm(id = null) {
  const form  = document.getElementById('form-worker');
  const title = document.getElementById('modal-worker-title');

  form.reset();
  document.getElementById('worker-id').value = '';
  selectedWorkerColor = WORKER_COLORS[0];

  buildColorPicker();

  if (id) {
    const w = await dbGet('workers', id);
    if (!w) return;
    title.textContent = '✏️ Modifier le travailleur';
    document.getElementById('worker-id').value        = w.id;
    document.getElementById('worker-firstname').value = w.firstname;
    document.getElementById('worker-lastname').value  = w.lastname || '';
    selectedWorkerColor = w.color;
    updateColorPicker(w.color);
  } else {
    title.textContent = '👷 Nouveau travailleur';
    // Couleur auto : prendre la première non utilisée
    const workers = await dbGetAll('workers');
    const usedColors = workers.map(w => w.color);
    const free = WORKER_COLORS.find(c => !usedColors.includes(c));
    selectedWorkerColor = free || WORKER_COLORS[0];
    updateColorPicker(selectedWorkerColor);
  }

  updateAvatarPreview();
  openModal('modal-worker');
}

function buildColorPicker() {
  const picker = document.getElementById('color-picker');
  picker.innerHTML = '';
  WORKER_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className  = 'color-swatch';
    swatch.style.background = color;
    swatch.dataset.color    = color;
    swatch.addEventListener('click', () => {
      selectedWorkerColor = color;
      updateColorPicker(color);
      updateAvatarPreview();
    });
    picker.appendChild(swatch);
  });
}

function updateColorPicker(selectedColor) {
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === selectedColor);
  });
}

function updateAvatarPreview() {
  const firstname = document.getElementById('worker-firstname').value || '?';
  const lastname  = document.getElementById('worker-lastname').value  || '';
  const initials  = (firstname[0] + (lastname ? lastname[0] : '')).toUpperCase();
  const av        = document.getElementById('avatar-preview');
  av.textContent       = initials;
  av.style.background  = selectedWorkerColor;
}

async function saveWorker(e) {
  e.preventDefault();
  const id        = document.getElementById('worker-id').value;
  const firstname = document.getElementById('worker-firstname').value.trim();
  const lastname  = document.getElementById('worker-lastname').value.trim();

  if (!firstname) { showToast('⚠️ Le prénom est obligatoire'); return; }

  const obj = { firstname, lastname, color: selectedWorkerColor };
  if (id) obj.id = parseInt(id);

  await dbPut('workers', obj);
  closeModal('modal-worker');
  showToast(id ? '✅ Travailleur modifié' : '✅ Travailleur ajouté');
  renderAll();
}

/* ============================================================
   ACTIONS CARTES : COCHER / RESTAURER / SUPPRIMER
   ============================================================ */
async function checkItem(type, id) {
  const store = type === 'event' ? 'events' : 'rdv';
  const item  = await dbGet(store, id);
  if (!item) return;

  item.done  = true;
  item.doneAt= Date.now();
  await dbPut(store, item);

  // Si RDV récurrent → générer le suivant
  if (type === 'rdv' && item.recurrence && item.recurrence !== 'none') {
    await generateNextRecurrence(item);
  }

  showToast('✅ Déplacé dans l\'historique');
  renderAll();
}

async function generateNextRecurrence(rdv) {
  const date = new Date(rdv.date + 'T00:00');

  if (rdv.recurrence === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (rdv.recurrence === 'bimonthly') {
    date.setDate(date.getDate() + 14);
  } else if (rdv.recurrence === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  }

  const newRdv = {
    workerId  : rdv.workerId,
    date      : toLocalDateStr(date),
    time      : rdv.time,
    motif     : rdv.motif,
    note      : rdv.note,
    recurrence: rdv.recurrence,
    done      : false,
    doneAt    : null
  };

  await dbPut('rdv', newRdv);
}

async function restoreItem(type, id) {
  const store = type === 'event' ? 'events' : 'rdv';
  const item  = await dbGet(store, id);
  if (!item) return;

  item.done  = false;
  item.doneAt= null;
  await dbPut(store, item);
  showToast('↩️ Élément restauré');
  renderAll();
}

async function deleteItem(type, id) {
  const store = type === 'event' ? 'events' : 'rdv';
  const item  = await dbGet(store, id);
  const label = type === 'event' ? 'cet événement' : 'ce RDV';

  showConfirm(`Supprimer définitivement ${label} ?`, async () => {
    await dbDelete(store, id);
    showToast('🗑️ Supprimé');
    renderAll();
  });
}

/* ============================================================
   GESTION DES ÉVÉNEMENTS DOM
   ============================================================ */
function bindEvents() {

  // Navigation onglets
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // FAB
  const fab = document.getElementById('fab-btn');
  fab.addEventListener('click', () => {
    openModal('modal-fab-choice');
    fab.classList.add('open');
  });

  document.getElementById('fab-choice-cancel').addEventListener('click', () => {
    closeModal('modal-fab-choice');
    fab.classList.remove('open');
  });

  document.getElementById('choice-event').addEventListener('click', () => {
    closeModal('modal-fab-choice');
    fab.classList.remove('open');
    openEventForm();
  });

  document.getElementById('choice-rdv').addEventListener('click', () => {
    closeModal('modal-fab-choice');
    fab.classList.remove('open');
    openRdvForm();
  });

  // Fermeture modales au clic overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
        fab.classList.remove('open');
      }
    });
  });

  // Formulaires
  document.getElementById('form-event').addEventListener('submit', saveEvent);
  document.getElementById('form-rdv').addEventListener('submit', saveRdv);
  document.getElementById('form-worker').addEventListener('submit', saveWorker);

  // Annulations
  document.getElementById('event-cancel').addEventListener('click',  () => closeModal('modal-event'));
  document.getElementById('rdv-cancel').addEventListener('click',    () => closeModal('modal-rdv'));
  document.getElementById('worker-cancel').addEventListener('click', () => closeModal('modal-worker'));
  document.getElementById('worker-detail-close').addEventListener('click', () => closeModal('modal-worker-detail'));

  // Confirmation
  document.getElementById('confirm-cancel').addEventListener('click', () => closeModal('modal-confirm'));
  document.getElementById('confirm-ok').addEventListener('click', () => {
    closeModal('modal-confirm');
    if (confirmCallback) confirmCallback();
  });

  // Avatar preview live
  document.getElementById('worker-firstname').addEventListener('input', updateAvatarPreview);
  document.getElementById('worker-lastname').addEventListener('input',  updateAvatarPreview);

  // Thèmes
  document.getElementById('theme-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.theme-btn');
    if (btn) applyTheme(btn.dataset.theme);
  });

  // Bouton équipe depuis settings
  document.getElementById('btn-settings-team').addEventListener('click', () => {
    switchTab('team');
  });

  // Bouton ajouter travailleur
  document.getElementById('btn-add-worker').addEventListener('click', () => openWorkerForm());

  // Semaine navigation
  document.getElementById('week-prev').addEventListener('click', () => { weekOffset--; renderWeek(); });
  document.getElementById('week-next').addEventListener('click', () => { weekOffset++; renderWeek(); });

  // Fermeture détail jour
  document.getElementById('day-detail-close').addEventListener('click', () => {
    document.getElementById('day-detail').classList.add('hidden');
  });

  // Délégation clics sur cartes (cocher, modifier, supprimer, restaurer)
  document.getElementById('main-content').addEventListener('click', async (e) => {

    // Case à cocher
    const check = e.target.closest('.card-check');
    if (check) {
      const id   = parseInt(check.dataset.id);
      const type = check.dataset.type;
      await checkItem(type, id);
      return;
    }

    // Bouton modifier
    const editBtn = e.target.closest('.btn-card-edit');
    if (editBtn) {
      const id   = parseInt(editBtn.dataset.id);
      const type = editBtn.dataset.type;
      if (type === 'event') openEventForm(id);
      else                  openRdvForm(id);
      return;
    }

    // Bouton supprimer
    const delBtn = e.target.closest('.btn-card-delete');
    if (delBtn) {
      const id   = parseInt(delBtn.dataset.id);
      const type = delBtn.dataset.type;
      await deleteItem(type, id);
      return;
    }

    // Bouton restaurer
    const restBtn = e.target.closest('.btn-card-restore');
    if (restBtn) {
      const id   = parseInt(restBtn.dataset.id);
      const type = restBtn.dataset.type;
      await restoreItem(type, id);
      return;
    }
  });
}

/* ============================================================
   NAVIGATION ONGLETS
   ============================================================ */
function switchTab(tab) {
  currentTab = tab;

  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('tab-' + tab).classList.add('active');

  // N'active le bouton nav que s'il existe
  const navBtn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (tab === 'week')     renderWeek();
  if (tab === 'history')  renderHistory();
  if (tab === 'team')     renderTeam();
  if (tab === 'settings') loadSettings();
}

/* ============================================================
   CONSTRUCTION DES CARTES
   ============================================================ */
function buildEventCard(ev, isHistory) {
  const card      = document.createElement('div');
  const now       = Date.now();
  const dateMs    = new Date(ev.date).getTime();
  const isOverdue = !ev.done && dateMs < now;
  const isUrgent  = !ev.done && (dateMs - now) < 24 * 3600 * 1000 && dateMs > now;

  card.className = 'card card-event' +
    (isOverdue ? ' overdue' : '') +
    (isUrgent  ? ' urgent'  : '') +
    (ev.done   ? ' card-done' : '');

  card.innerHTML = `
    <div class="card-top">
      ${!isHistory ? `
        <button class="card-check" data-id="${ev.id}" data-type="event" title="Marquer traité">
          <span class="check-icon">☐</span>
        </button>` : `
        <span class="card-done-icon">✅</span>
      `}
      <div class="card-body">
        <div class="card-header-row">
          ${ev.tag ? `<span class="card-tag tag-${ev.tag}">${TAG_LABELS[ev.tag] || ev.tag}</span>` : ''}
          ${isOverdue ? '<span class="overdue-badge">⚠️ Dépassé</span>' : ''}
          ${isUrgent  ? '<span class="urgent-badge">🔔 Urgent</span>'   : ''}
        </div>
        <div class="card-date">${formatDateFull(ev.date)}</div>
        <div class="card-desc">${escHtml(ev.description || '')}</div>
        ${isHistory && ev.doneAt ? `
          <div class="card-done-at">Traité le ${formatTs(ev.doneAt)}</div>
        ` : ''}
      </div>
      <div class="card-actions">
        ${!isHistory ? `
          <button class="btn-card-edit"   data-id="${ev.id}" data-type="event" title="Modifier">✏️</button>
          <button class="btn-card-delete" data-id="${ev.id}" data-type="event" title="Supprimer">🗑️</button>
        ` : `
          <button class="btn-card-restore" data-id="${ev.id}" data-type="event" title="Restaurer">↩️</button>
          <button class="btn-card-delete"  data-id="${ev.id}" data-type="event" title="Supprimer">🗑️</button>
        `}
      </div>
    </div>
    ${isHistory ? `
      <div class="hist-delete-bar">
        <div class="hist-delete-bar-fill" style="width:${getHistBarWidth(ev.doneAt, 'event')}%"></div>
      </div>
    ` : ''}
  `;

  return card;
}

function buildRdvCard(rdv, workerMap, isHistory) {
  const worker    = workerMap[rdv.workerId];
  const color     = worker ? worker.color : '#888888';
  const name      = worker
    ? worker.firstname + (worker.lastname ? ' ' + worker.lastname : '')
    : 'Travailleur inconnu';
  const initials  = worker
    ? (worker.firstname[0] + (worker.lastname ? worker.lastname[0] : '')).toUpperCase()
    : '?';

  const now       = Date.now();
  const dateMs    = new Date(rdv.date + (rdv.time ? 'T' + rdv.time : 'T00:00')).getTime();
  const isOverdue = !rdv.done && dateMs < now;
  const isUrgent  = !rdv.done && (dateMs - now) < 24 * 3600 * 1000 && dateMs > now;

  const card = document.createElement('div');
  card.className = 'card card-rdv' +
    (isOverdue ? ' overdue' : '') +
    (isUrgent  ? ' urgent'  : '') +
    (rdv.done  ? ' card-done' : '');
  card.style.borderLeftColor = color;

  card.innerHTML = `
    <div class="card-top">
      ${!isHistory ? `
        <button class="card-check" data-id="${rdv.id}" data-type="rdv" title="Marquer traité">
          <span class="check-icon">☐</span>
        </button>` : `
        <span class="card-done-icon">✅</span>
      `}
      <div class="card-body">
        <div class="card-header-row">
          <div class="worker-chip" style="background:${color}20;border-color:${color}">
            <span class="worker-chip-avatar" style="background:${color}">${initials}</span>
            <span class="worker-chip-name">${escHtml(name)}</span>
          </div>
          ${isOverdue ? '<span class="overdue-badge">⚠️ Dépassé</span>' : ''}
          ${isUrgent  ? '<span class="urgent-badge">🔔 Urgent</span>'   : ''}
        </div>
        <div class="card-motif">${MOTIF_LABELS[rdv.motif] || rdv.motif}</div>
        <div class="card-date">${formatDateShort(rdv.date, rdv.time)}</div>
        ${rdv.note ? `<div class="card-desc">${escHtml(rdv.note)}</div>` : ''}
        ${rdv.recurrence && rdv.recurrence !== 'none'
          ? `<div class="card-recurrence">${RECURRENCE_LABELS[rdv.recurrence]}</div>` : ''}
        ${isHistory && rdv.doneAt
          ? `<div class="card-done-at">Traité le ${formatTs(rdv.doneAt)}</div>` : ''}
      </div>
      <div class="card-actions">
        ${!isHistory ? `
          <button class="btn-card-edit"   data-id="${rdv.id}" data-type="rdv" title="Modifier">✏️</button>
          <button class="btn-card-delete" data-id="${rdv.id}" data-type="rdv" title="Supprimer">🗑️</button>
        ` : `
          <button class="btn-card-restore" data-id="${rdv.id}" data-type="rdv" title="Restaurer">↩️</button>
          <button class="btn-card-delete"  data-id="${rdv.id}" data-type="rdv" title="Supprimer">🗑️</button>
        `}
      </div>
    </div>
    ${isHistory ? `
      <div class="hist-delete-bar">
        <div class="hist-delete-bar-fill" style="width:${getHistBarWidth(rdv.doneAt, 'rdv')}%"></div>
      </div>
    ` : ''}
  `;

  return card;
}

/* ============================================================
   RENDU HISTORIQUE
   ============================================================ */
async function renderHistory() {
  const [events, rdvs, workers] = await Promise.all([
    dbGetAll('events'),
    dbGetAll('rdv'),
    dbGetAll('workers')
  ]);

  const workerMap = {};
  workers.forEach(w => workerMap[w.id] = w);

  const doneEvents = events
    .filter(e => e.done)
    .sort((a, b) => b.doneAt - a.doneAt);

  const doneRdvs = rdvs
    .filter(r => r.done)
    .sort((a, b) => b.doneAt - a.doneAt);

  // Badges
  document.getElementById('badge-hist-events').textContent = doneEvents.length;
  document.getElementById('badge-hist-rdv').textContent    = doneRdvs.length;

  // Événements
  const listHE  = document.getElementById('list-hist-events');
  const emptyHE = document.getElementById('empty-hist-events');
  listHE.innerHTML = '';
  listHE.appendChild(emptyHE);

  if (doneEvents.length === 0) {
    emptyHE.style.display = '';
  } else {
    emptyHE.style.display = 'none';
    doneEvents.forEach(ev => listHE.appendChild(buildEventCard(ev, true)));
  }

  // RDV
  const listHR  = document.getElementById('list-hist-rdv');
  const emptyHR = document.getElementById('empty-hist-rdv');
  listHR.innerHTML = '';
  listHR.appendChild(emptyHR);

  if (doneRdvs.length === 0) {
    emptyHR.style.display = '';
  } else {
    emptyHR.style.display = 'none';
    doneRdvs.forEach(r => listHR.appendChild(buildRdvCard(r, workerMap, true)));
  }
}

/* ============================================================
   RENDU ÉQUIPE
   ============================================================ */
async function renderTeam() {
  const [workers, rdvs] = await Promise.all([
    dbGetAll('workers'),
    dbGetAll('rdv')
  ]);

  const container = document.getElementById('list-workers');
  const empty     = document.getElementById('empty-workers');

  container.innerHTML = '';
  container.appendChild(empty);

  if (workers.length === 0) {
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';
  workers
    .sort((a, b) => a.firstname.localeCompare(b.firstname))
    .forEach(w => {
      const initials    = (w.firstname[0] + (w.lastname ? w.lastname[0] : '')).toUpperCase();
      const activeCount = rdvs.filter(r => r.workerId === w.id && !r.done).length;
      const totalCount  = rdvs.filter(r => r.workerId === w.id).length;

      const card = document.createElement('div');
      card.className = 'worker-card';
      card.innerHTML = `
        <div class="worker-card-avatar" style="background:${w.color}">${initials}</div>
        <div class="worker-card-info">
          <div class="worker-card-name">
            ${escHtml(w.firstname)}${w.lastname ? ' ' + escHtml(w.lastname) : ''}
          </div>
          <div class="worker-card-stats">
            ${activeCount > 0
              ? `<span class="worker-stat active">${activeCount} RDV actif${activeCount > 1 ? 's' : ''}</span>`
              : '<span class="worker-stat none">Aucun RDV actif</span>'
            }
            <span class="worker-stat total">${totalCount} au total</span>
          </div>
        </div>
        <button class="worker-card-btn" title="Voir la fiche">›</button>
      `;
      card.addEventListener('click', () => openWorkerDetail(w.id));
      container.appendChild(card);
    });
}

/* ============================================================
   MODALES — open / close
   ============================================================ */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function showConfirm(message, callback) {
  document.getElementById('confirm-message').textContent = message;
  confirmCallback = callback;
  openModal('modal-confirm');
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, 2500);
}

/* ============================================================
   UTILITAIRES DATE
   ============================================================ */
function pad(n) { return String(n).padStart(2, '0'); }

function toLocalDateStr(date) {
  return date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate());
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  // Gérer format datetime-local (avec T)
  const clean = dateStr.includes('T') ? dateStr : dateStr + 'T00:00';
  const d     = new Date(clean);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` +
    (dateStr.includes('T') ? ` à ${pad(d.getHours())}h${pad(d.getMinutes())}` : '');
}

function formatDateShort(dateStr, timeStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00');
  let s   = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  if (timeStr) s += ` à ${timeStr.replace(':', 'h')}`;
  return s;
}

function formatDateRelative(dateMs) {
  const now  = Date.now();
  const diff = dateMs - now;
  const d    = new Date(dateMs);
  const timeStr = `${pad(d.getHours())}h${pad(d.getMinutes())}`;

  if (diff < 0) {
    const hours = Math.abs(Math.floor(diff / 3600000));
    if (hours < 24) return `⚠️ Il y a ${hours}h`;
    const days = Math.floor(Math.abs(diff) / 86400000);
    return `⚠️ Il y a ${days}j`;
  }
  if (diff < 3600000)   return `🔴 Dans ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000)  return `🟠 Aujourd'hui ${timeStr}`;
  if (diff < 172800000) return `🟡 Demain ${timeStr}`;
  const days = Math.floor(diff / 86400000);
  return `🟢 Dans ${days} jours`;
}

function formatTs(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} à ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

function getHistBarWidth(doneAt, type) {
  if (!doneAt) return 0;
  const maxMs = type === 'event'
    ? 24 * 3600 * 1000       // 24h pour événements
    : 15 * 24 * 3600 * 1000; // 15j pour RDV
  const elapsed = Date.now() - doneAt;
  return Math.min(100, Math.round((elapsed / maxMs) * 100));
}

/* ============================================================
   UTILITAIRES
   ============================================================ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================
   SERVICE WORKER — enregistrement
   ============================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('LAOUPA SW enregistré'))
      .catch(err => console.warn('SW error:', err));
  });
}
