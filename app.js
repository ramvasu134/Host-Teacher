/**
 * app.js — Host-Teacher Meeting Portal
 * Manages meetings and discussion points with localStorage persistence.
 */

(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────── */
  const STORAGE_KEY = 'hostTeacherMeetings';

  /* ── State ──────────────────────────────────────────────────── */
  let meetings = loadMeetings();
  let activeMeetingId = null;

  /* ── DOM refs ───────────────────────────────────────────────── */
  const meetingForm     = document.getElementById('meetingForm');
  const meetingsList    = document.getElementById('meetingsList');
  const filterStatus    = document.getElementById('filterStatus');
  const modalOverlay    = document.getElementById('modalOverlay');
  const modalClose      = document.getElementById('modalClose');
  const modalTitle      = document.getElementById('modalTitle');
  const modalMeta       = document.getElementById('modalMeta');
  const discussionList  = document.getElementById('discussionList');
  const addPointForm    = document.getElementById('addPointForm');
  const newPointText    = document.getElementById('newPointText');
  const pointError      = document.getElementById('pointError');
  const meetingNotesEdit= document.getElementById('meetingNotesEdit');
  const saveNotesBtn    = document.getElementById('saveNotesBtn');
  const deleteMeetingBtn= document.getElementById('deleteMeetingBtn');

  // Stats
  const statTotal     = document.getElementById('totalMeetings');
  const statUpcoming  = document.getElementById('upcomingMeetings');
  const statOpen      = document.getElementById('openPoints');
  const statResolved  = document.getElementById('resolvedPoints');

  /* ── Utilities ───────────────────────────────────────────────── */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function loadMeetings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveMeetings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  }

  function isUpcoming(meeting) {
    return new Date(meeting.dateTime) >= new Date();
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast' + (type ? ' ' + type : '');
    // Force reflow so transition triggers
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  /* ── Stats ───────────────────────────────────────────────────── */
  function updateStats() {
    const upcoming = meetings.filter(isUpcoming).length;
    const allPoints = meetings.flatMap(m => m.points);
    const open = allPoints.filter(p => !p.resolved).length;
    const resolved = allPoints.filter(p => p.resolved).length;

    statTotal.textContent    = meetings.length;
    statUpcoming.textContent = upcoming;
    statOpen.textContent     = open;
    statResolved.textContent = resolved;
  }

  /* ── Render Meeting List ─────────────────────────────────────── */
  function renderMeetings() {
    const filter = filterStatus.value;

    let list = meetings.slice().sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

    if (filter === 'upcoming') list = list.filter(isUpcoming);
    if (filter === 'past')     list = list.filter(m => !isUpcoming(m));

    if (list.length === 0) {
      meetingsList.innerHTML = '<p class="empty-state">No meetings found.</p>';
      return;
    }

    meetingsList.innerHTML = list.map(m => {
      const upcoming   = isUpcoming(m);
      const cardClass  = upcoming ? 'upcoming' : 'past';
      const badgeClass = upcoming ? 'badge-upcoming' : 'badge-past';
      const badgeText  = upcoming ? 'Upcoming' : 'Past';
      const openPoints = m.points.filter(p => !p.resolved).length;
      const pointLabel = openPoints === 1 ? '1 open point' : `${openPoints} open points`;

      return `
        <div class="meeting-card ${cardClass}" data-id="${m.id}" tabindex="0" role="button" aria-label="Open meeting: ${escapeHtml(m.title)}">
          <div class="meeting-info">
            <div class="meeting-title">${escapeHtml(m.title)}</div>
            <div class="meeting-participants">
              <span class="role">Host</span>${escapeHtml(m.host)}
              &nbsp;&nbsp;<span class="role">Teacher</span>${escapeHtml(m.teacher)}
            </div>
          </div>
          <div class="meeting-meta">
            <div class="meeting-date">📅 ${formatDateTime(m.dateTime)}</div>
            <div class="status-badge ${badgeClass}">${badgeText}</div>
            <div class="point-count">💬 ${pointLabel}</div>
          </div>
        </div>`;
    }).join('');

    // Attach click & keyboard listeners
    meetingsList.querySelectorAll('.meeting-card').forEach(card => {
      card.addEventListener('click', () => openMeetingModal(card.dataset.id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') openMeetingModal(card.dataset.id);
      });
    });

    updateStats();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Create Meeting ──────────────────────────────────────────── */
  meetingForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateMeetingForm()) return;

    const meeting = {
      id:       generateId(),
      title:    document.getElementById('meetingTitle').value.trim(),
      dateTime: document.getElementById('meetingDate').value,
      host:     document.getElementById('hostName').value.trim(),
      teacher:  document.getElementById('teacherName').value.trim(),
      notes:    document.getElementById('meetingNotes').value.trim(),
      points:   [],
      createdAt: new Date().toISOString()
    };

    meetings.push(meeting);
    saveMeetings();
    renderMeetings();
    meetingForm.reset();
    showToast('Meeting created successfully!', 'success');
  });

  function validateMeetingForm() {
    let valid = true;
    const fields = [
      { id: 'meetingTitle', errId: 'titleError',   msg: 'Please enter a title.' },
      { id: 'meetingDate',  errId: 'dateError',    msg: 'Please select a date and time.' },
      { id: 'hostName',     errId: 'hostError',    msg: 'Please enter the host name.' },
      { id: 'teacherName',  errId: 'teacherError', msg: 'Please enter the teacher name.' }
    ];

    fields.forEach(({ id, errId, msg }) => {
      const input = document.getElementById(id);
      const err   = document.getElementById(errId);
      if (!input.value.trim()) {
        err.textContent = msg;
        input.setAttribute('aria-invalid', 'true');
        valid = false;
      } else {
        err.textContent = '';
        input.removeAttribute('aria-invalid');
      }
    });

    return valid;
  }

  /* ── Modal ───────────────────────────────────────────────────── */
  function openMeetingModal(id) {
    const meeting = meetings.find(m => m.id === id);
    if (!meeting) return;
    activeMeetingId = id;

    modalTitle.textContent = meeting.title;
    modalMeta.innerHTML = `
      <span>👤 <strong>Host:</strong> ${escapeHtml(meeting.host)}</span>
      <span>🎓 <strong>Teacher:</strong> ${escapeHtml(meeting.teacher)}</span>
      <span>📅 ${formatDateTime(meeting.dateTime)}</span>
      <span>${isUpcoming(meeting) ? '🟢 Upcoming' : '⚫ Past'}</span>
    `;

    meetingNotesEdit.value = meeting.notes || '';
    renderDiscussionPoints(meeting);

    modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    modalClose.focus();
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
    activeMeetingId = null;
    pointError.textContent = '';
  }

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal();
  });

  /* ── Discussion Points ───────────────────────────────────────── */
  function renderDiscussionPoints(meeting) {
    if (!meeting.points || meeting.points.length === 0) {
      discussionList.innerHTML = '<li class="empty-state" style="list-style:none">No discussion points yet.</li>';
      return;
    }

    discussionList.innerHTML = meeting.points.map((pt, idx) => `
      <li class="discussion-item ${pt.resolved ? 'resolved' : ''}" data-idx="${idx}">
        <input type="checkbox" ${pt.resolved ? 'checked' : ''} aria-label="Mark as resolved" />
        <span class="point-text ${pt.resolved ? 'done' : ''}">${escapeHtml(pt.text)}</span>
        <button class="delete-point-btn" aria-label="Delete discussion point" title="Delete">✕</button>
      </li>`
    ).join('');

    discussionList.querySelectorAll('.discussion-item').forEach((item, idx) => {
      item.querySelector('input[type="checkbox"]').addEventListener('change', () => togglePoint(idx));
      item.querySelector('.delete-point-btn').addEventListener('click', () => deletePoint(idx));
    });
  }

  addPointForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const text = newPointText.value.trim();
    if (!text) {
      pointError.textContent = 'Please enter a discussion point.';
      return;
    }
    pointError.textContent = '';

    const meeting = meetings.find(m => m.id === activeMeetingId);
    if (!meeting) return;

    meeting.points.push({ text, resolved: false, createdAt: new Date().toISOString() });
    saveMeetings();
    renderDiscussionPoints(meeting);
    newPointText.value = '';
    updateStats();
    showToast('Discussion point added.', 'success');
  });

  function togglePoint(idx) {
    const meeting = meetings.find(m => m.id === activeMeetingId);
    if (!meeting) return;
    meeting.points[idx].resolved = !meeting.points[idx].resolved;
    saveMeetings();
    renderDiscussionPoints(meeting);
    renderMeetings();
    showToast(meeting.points[idx].resolved ? 'Point marked as resolved.' : 'Point reopened.', 'success');
  }

  function deletePoint(idx) {
    const meeting = meetings.find(m => m.id === activeMeetingId);
    if (!meeting) return;
    meeting.points.splice(idx, 1);
    saveMeetings();
    renderDiscussionPoints(meeting);
    renderMeetings();
    showToast('Discussion point removed.', '');
  }

  /* ── Save Notes ──────────────────────────────────────────────── */
  saveNotesBtn.addEventListener('click', function () {
    const meeting = meetings.find(m => m.id === activeMeetingId);
    if (!meeting) return;
    meeting.notes = meetingNotesEdit.value.trim();
    saveMeetings();
    showToast('Notes saved.', 'success');
  });

  /* ── Delete Meeting ──────────────────────────────────────────── */
  deleteMeetingBtn.addEventListener('click', function () {
    if (!activeMeetingId) return;
    const meeting = meetings.find(m => m.id === activeMeetingId);
    if (!meeting) return;
    if (!window.confirm(`Delete meeting "${meeting.title}"? This cannot be undone.`)) return;

    meetings = meetings.filter(m => m.id !== activeMeetingId);
    saveMeetings();
    renderMeetings();
    closeModal();
    showToast('Meeting deleted.', '');
  });

  /* ── Filter ──────────────────────────────────────────────────── */
  filterStatus.addEventListener('change', renderMeetings);

  /* ── Init ────────────────────────────────────────────────────── */
  renderMeetings();
  updateStats();
}());
