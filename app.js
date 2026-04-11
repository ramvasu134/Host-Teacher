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
    let id;
    do {
      id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    } while (meetings.some(m => m.id === id));
    return id;
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
    // Meetings whose start time has already passed are treated as past.
    return new Date(meeting.dateTime) > new Date();
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

    // Pre-parse dates once to avoid repeated Date construction in the sort comparator
    const withTime = meetings.map(m => ({ m, t: new Date(m.dateTime).getTime() }));
    withTime.sort((a, b) => a.t - b.t);
    let list = withTime.map(({ m }) => m);

    if (filter === 'upcoming') list = list.filter(isUpcoming);
    if (filter === 'past')     list = list.filter(m => !isUpcoming(m));

    // Clear existing content safely
    meetingsList.textContent = '';

    if (list.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'No meetings found.';
      meetingsList.appendChild(p);
      updateStats();
      return;
    }

    list.forEach(m => {
      const upcoming   = isUpcoming(m);
      const openPoints = m.points.filter(p => !p.resolved).length;
      const pointLabel = openPoints === 1 ? '1 open point' : openPoints + ' open points';

      // Card container
      const card = document.createElement('div');
      card.className = 'meeting-card ' + (upcoming ? 'upcoming' : 'past');
      card.dataset.id = m.id;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Open meeting: ' + m.title);

      // Left: title + participants
      const info = document.createElement('div');
      info.className = 'meeting-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'meeting-title';
      titleEl.textContent = m.title;

      const participants = document.createElement('div');
      participants.className = 'meeting-participants';

      const hostRole = document.createElement('span');
      hostRole.className = 'role';
      hostRole.textContent = 'Host';
      participants.appendChild(hostRole);
      participants.appendChild(document.createTextNode('\u00a0' + m.host + '\u00a0\u00a0'));

      const teacherRole = document.createElement('span');
      teacherRole.className = 'role';
      teacherRole.textContent = 'Teacher';
      participants.appendChild(teacherRole);
      participants.appendChild(document.createTextNode('\u00a0' + m.teacher));

      info.appendChild(titleEl);
      info.appendChild(participants);

      // Right: date, badge, point count
      const meta = document.createElement('div');
      meta.className = 'meeting-meta';

      const dateEl = document.createElement('div');
      dateEl.className = 'meeting-date';
      dateEl.textContent = '📅 ' + formatDateTime(m.dateTime);

      const badge = document.createElement('div');
      badge.className = 'status-badge ' + (upcoming ? 'badge-upcoming' : 'badge-past');
      badge.textContent = upcoming ? 'Upcoming' : 'Past';

      const pointCount = document.createElement('div');
      pointCount.className = 'point-count';
      pointCount.textContent = '💬 ' + pointLabel;

      meta.appendChild(dateEl);
      meta.appendChild(badge);
      meta.appendChild(pointCount);

      card.appendChild(info);
      card.appendChild(meta);

      card.addEventListener('click', () => openMeetingModal(m.id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); // prevent page scroll on Space
          openMeetingModal(m.id);
        }
      });

      meetingsList.appendChild(card);
    });

    updateStats();
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

    // Build modal meta using DOM (no innerHTML with user data)
    modalMeta.textContent = '';

    const hostSpan = document.createElement('span');
    hostSpan.appendChild(document.createTextNode('👤\u00a0'));
    const hostStrong = document.createElement('strong');
    hostStrong.textContent = 'Host:';
    hostSpan.appendChild(hostStrong);
    hostSpan.appendChild(document.createTextNode('\u00a0' + meeting.host));

    const teacherSpan = document.createElement('span');
    teacherSpan.appendChild(document.createTextNode('🎓\u00a0'));
    const teacherStrong = document.createElement('strong');
    teacherStrong.textContent = 'Teacher:';
    teacherSpan.appendChild(teacherStrong);
    teacherSpan.appendChild(document.createTextNode('\u00a0' + meeting.teacher));

    const dateSpan = document.createElement('span');
    dateSpan.textContent = '📅\u00a0' + formatDateTime(meeting.dateTime);

    const statusSpan = document.createElement('span');
    statusSpan.textContent = isUpcoming(meeting) ? '🟢 Upcoming' : '⚫ Past';

    modalMeta.appendChild(hostSpan);
    modalMeta.appendChild(teacherSpan);
    modalMeta.appendChild(dateSpan);
    modalMeta.appendChild(statusSpan);

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
    discussionList.textContent = '';

    if (!meeting.points || meeting.points.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.style.listStyle = 'none';
      li.textContent = 'No discussion points yet.';
      discussionList.appendChild(li);
      return;
    }

    meeting.points.forEach((pt, idx) => {
      const li = document.createElement('li');
      li.className = 'discussion-item' + (pt.resolved ? ' resolved' : '');
      li.dataset.idx = idx;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = pt.resolved;
      checkbox.setAttribute('aria-label', 'Mark as resolved');
      checkbox.addEventListener('change', () => togglePoint(idx));

      const textEl = document.createElement('span');
      textEl.className = 'point-text' + (pt.resolved ? ' done' : '');
      textEl.textContent = pt.text;

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-point-btn';
      delBtn.setAttribute('aria-label', 'Delete discussion point');
      delBtn.title = 'Delete';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => deletePoint(idx));

      li.appendChild(checkbox);
      li.appendChild(textEl);
      li.appendChild(delBtn);
      discussionList.appendChild(li);
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
