// ===== Host Dashboard Meeting — WebRTC + WebSocket =====
// Called from teacher-dashboard.html when a meeting is started/ended.
//
// Public API:
//   initDashboardMeeting(meetingCode)  — call when meeting starts
//   cleanupDashboardMeeting()          — call when meeting ends
//   dashToggleMic()                    — mic button handler
//   dashToggleSpeaker()                — speaker button handler
//   sendDashChatMessage()              — chat send button handler

// ── Configuration ─────────────────────────────────────────────────────────────
const _DM_ICE = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Read teacher identity injected by Thymeleaf
const _dmEl = document.getElementById('dashMeetingData');
const DASH_USER_ID   = _dmEl ? _dmEl.dataset.userId   : '';
const DASH_USER_NAME = _dmEl ? _dmEl.dataset.userName : '';

// ── Runtime state ─────────────────────────────────────────────────────────────
let _dm_code        = '';
let _dm_stomp       = null;
let _dm_local       = null;      // MediaStream (mic)
let _dm_peers       = {};        // peerId → RTCPeerConnection
let _dm_pending     = {};        // peerId → queued ICE candidates
let _dm_micOn       = true;
let _dm_spkMuted    = false;
let _dm_wsTimer     = null;
let _dm_wsConnecting = false;

// ── Public: start meeting ────────────────────────────────────────────────────

function initDashboardMeeting(meetingCode) {
    _dm_code = meetingCode;
    _showDashChat();    // switch chat tab to real UI

    // Get mic first, then connect WebSocket
    navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false
    })
    .then(function (stream) {
        _dm_local = stream;
        _dm_micOn = true;
        _dm_updateMicBtn(true);
        _dm_setupViz(stream);
        _dm_connectWS();
    })
    .catch(function (err) {
        console.warn('[DashMeeting] Mic denied:', err);
        _dm_micOn = false;
        _dm_updateMicBtn(false);
        _dm_connectWS();   // still connect for chat / control
    });
}

// ── Public: end meeting ──────────────────────────────────────────────────────

function cleanupDashboardMeeting() {
    clearTimeout(_dm_wsTimer);
    if (_dm_stomp && _dm_stomp.connected) {
        try {
            _dm_stomp.send('/app/participant/' + _dm_code, {},
                JSON.stringify({ event: 'leave', micEnabled: false, cameraEnabled: false }));
            _dm_stomp.send('/app/control/' + _dm_code, {},
                JSON.stringify({ event: 'end-meeting' }));
            _dm_stomp.disconnect();
        } catch (e) {}
    }
    _dm_stomp       = null;
    _dm_wsConnecting = false;

    Object.values(_dm_peers).forEach(pc => pc.close());
    _dm_peers   = {};
    _dm_pending = {};

    if (_dm_local) { _dm_local.getTracks().forEach(t => t.stop()); _dm_local = null; }
    _dm_code = '';

    _hideDashChat();
    _dm_clearParticipants();
    _dm_updateMicBtn(false);
}

// ── Public: mic toggle ───────────────────────────────────────────────────────

function dashToggleMic() {
    if (!_dm_local) return;
    _dm_micOn = !_dm_micOn;
    _dm_local.getAudioTracks().forEach(t => { t.enabled = _dm_micOn; });
    _dm_updateMicBtn(_dm_micOn);
    _dm_sendParticipant('mic-toggle');
}

// ── Public: speaker toggle ───────────────────────────────────────────────────

function dashToggleSpeaker() {
    _dm_spkMuted = !_dm_spkMuted;
    document.querySelectorAll('audio[id^="dash-sr-"]').forEach(el => {
        el.muted = _dm_spkMuted;
    });
    const btn  = document.getElementById('speakerBtn');
    const icon = btn ? btn.querySelector('i') : null;
    if (icon) icon.className = _dm_spkMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
}

// ── Public: send chat ────────────────────────────────────────────────────────

function sendDashChatMessage() {
    const input = document.getElementById('dashChatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !_dm_stomp || !_dm_stomp.connected) return;
    _dm_stomp.send('/app/chat/' + _dm_code, {}, JSON.stringify({ content: text }));
    input.value = '';
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function _dm_connectWS() {
    if (_dm_wsConnecting) return;
    if (_dm_stomp && _dm_stomp.connected) return;
    _dm_wsConnecting = true;
    if (_dm_stomp) { try { _dm_stomp.disconnect(); } catch (e) {} _dm_stomp = null; }

    const socket = new SockJS('/ws');
    _dm_stomp    = Stomp.over(socket);
    _dm_stomp.debug = null;

    _dm_stomp.connect({}, function () {
        _dm_wsConnecting = false;
        console.log('[DashMeeting] WebSocket connected. Meeting:', _dm_code);

        _dm_stomp.subscribe('/topic/signal/'      + _dm_code, m => _dm_onSignal(JSON.parse(m.body)));
        _dm_stomp.subscribe('/topic/participant/' + _dm_code, m => _dm_onParticipant(JSON.parse(m.body)));
        _dm_stomp.subscribe('/topic/chat/'        + _dm_code, m => _dm_onChat(JSON.parse(m.body)));
        _dm_stomp.subscribe('/topic/control/'     + _dm_code, m => { /* future */ });
        _dm_stomp.subscribe('/topic/recording/'   + _dm_code, m => _dm_onRecording(JSON.parse(m.body)));

        // Announce host presence so any waiting students will create an offer
        _dm_sendParticipant('join');

        // Seed cards for participants already in the meeting (race-condition fix)
        _dm_seedExistingParticipants();

    }, function (err) {
        _dm_wsConnecting = false;
        console.error('[DashMeeting] WS error, retrying…', err);
        if (_dm_stomp) { try { _dm_stomp.disconnect(); } catch (e) {} _dm_stomp = null; }
        if (_dm_code) {
            clearTimeout(_dm_wsTimer);
            _dm_wsTimer = setTimeout(_dm_connectWS, 5000);
        }
    });
}

function _dm_sendParticipant(type) {
    if (_dm_stomp && _dm_stomp.connected) {
        _dm_stomp.send('/app/participant/' + _dm_code, {},
            JSON.stringify({ event: type, micEnabled: _dm_micOn, cameraEnabled: false }));
    }
}

function _dm_sendSignal(payload) {
    if (_dm_stomp && _dm_stomp.connected) {
        _dm_stomp.send('/app/signal/' + _dm_code, {}, JSON.stringify(payload));
    }
}

// ── WebRTC ────────────────────────────────────────────────────────────────────

function _dm_getPC(peerId) {
    if (_dm_peers[peerId]) return _dm_peers[peerId];
    const pc = new RTCPeerConnection(_DM_ICE);
    _dm_peers[peerId] = pc;

    // Add teacher's mic track so this student can hear the teacher
    if (_dm_local) {
        _dm_local.getTracks().forEach(t => pc.addTrack(t, _dm_local));
    }

    pc.onicecandidate = e => {
        if (e.candidate) {
            _dm_sendSignal({ type: 'ice-candidate', candidate: e.candidate, targetId: peerId });
        }
    };

    // Receive student audio and play it
    pc.ontrack = e => _dm_playAudio(peerId, e.streams[0]);

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            const audio = document.getElementById('dash-sr-' + peerId);
            if (audio) audio.remove();
            delete _dm_peers[peerId];
        }
    };
    return pc;
}

function _dm_playAudio(peerId, stream) {
    let audio = document.getElementById('dash-sr-' + peerId);
    if (!audio) {
        audio = document.createElement('audio');
        audio.id         = 'dash-sr-' + peerId;
        audio.autoplay   = true;
        audio.playsInline = true;
        audio.muted      = _dm_spkMuted;
        document.body.appendChild(audio);
    }
    audio.srcObject = stream;
}

function _dm_onSignal(data) {
    const sid = String(data.senderId);
    if (sid === String(DASH_USER_ID)) return;                               // ignore own
    if (data.targetId && String(data.targetId) !== String(DASH_USER_ID)) return; // not for me
    if      (data.type === 'offer')         _dm_doOffer(sid, data);
    else if (data.type === 'answer')        _dm_doAnswer(sid, data);
    else if (data.type === 'ice-candidate') _dm_doIce(sid, data);
}

async function _dm_doOffer(sid, data) {
    const pc = _dm_getPC(sid);
    try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
        await _dm_drainICE(sid);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        _dm_sendSignal({ type: 'answer', sdp: answer.sdp, targetId: sid });
    } catch (e) { console.error('[DashMeeting] offer error:', e); }
}

async function _dm_doAnswer(sid, data) {
    const pc = _dm_peers[sid];
    if (!pc) return;
    try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
        await _dm_drainICE(sid);
    } catch (e) { console.error('[DashMeeting] answer error:', e); }
}

async function _dm_doIce(sid, data) {
    const pc = _dm_peers[sid];
    if (!pc || !data.candidate) return;
    if (pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {}
    } else {
        if (!_dm_pending[sid]) _dm_pending[sid] = [];
        _dm_pending[sid].push(data.candidate);
    }
}

async function _dm_drainICE(peerId) {
    const queue = _dm_pending[peerId];
    if (!queue || !queue.length) return;
    delete _dm_pending[peerId];
    const pc = _dm_peers[peerId];
    if (!pc) return;
    for (const c of queue) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
    }
}

// ── Seed existing participants on WS connect (race-condition fix) ─────────────

function _dm_seedExistingParticipants() {
    if (!_dm_code) return;
    fetch('/api/meeting/' + _dm_code + '/participants')
        .then(function(r) { return r.json(); })
        .then(function(list) {
            list.forEach(function(p) {
                // Only show students (not the host themselves)
                if (String(p.id) === String(DASH_USER_ID)) return;
                if (p.role === 'HOST') return;
                _dm_addCard(p.id, p.displayName || 'Student');
                _dm_updateCount();
                // Ask the student to send us an offer so WebRTC audio connects
                _dm_sendSignal({ type: 'request-offer', targetId: String(p.id) });
            });
        })
        .catch(function(e) { console.warn('[DashMeeting] Could not seed participants:', e); });
}

// ── Participant events ────────────────────────────────────────────────────────

function _dm_onParticipant(data) {
    if (String(data.userId) === String(DASH_USER_ID)) return;

    if (data.event === 'join') {
        _dm_addCard(data.userId, data.userName);
        _dm_updateCount();
        // Tell this student to create an offer directed at the host
        _dm_sendSignal({ type: 'request-offer', targetId: String(data.userId) });

    } else if (data.event === 'leave') {
        _dm_removeCard(data.userId);
        _dm_updateCount();
        const pc = _dm_peers[String(data.userId)];
        if (pc) { pc.close(); delete _dm_peers[String(data.userId)]; }
        const audio = document.getElementById('dash-sr-' + data.userId);
        if (audio) audio.remove();

    } else if (data.event === 'mic-toggle') {
        _dm_updateCardMic(data.userId, data.micEnabled);
    }
}

// ── Chat ──────────────────────────────────────────────────────────────────────

function _dm_onChat(data) {
    const box = document.getElementById('dashChatMessages');
    if (!box) return;
    const isOwn  = String(data.senderId) === String(DASH_USER_ID);
    const sender = _dmEsc(data.senderName || data.userName || 'Unknown');
    const text   = _dmEsc(data.content   || data.message  || '');
    const time   = data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'dm-msg' + (isOwn ? ' dm-own' : '');
    div.innerHTML = `<div class="dm-sender">${sender}</div>
        <div class="dm-bubble">${text}</div>
        <div class="dm-time">${time}</div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function _showDashChat() {
    const empty = document.getElementById('dashChatEmpty');
    const chat  = document.getElementById('dashChatContainer');
    if (empty) empty.style.display = 'none';
    if (chat)  chat.style.display  = 'flex';
}

function _hideDashChat() {
    const empty = document.getElementById('dashChatEmpty');
    const chat  = document.getElementById('dashChatContainer');
    if (empty) empty.style.display  = '';
    if (chat)  {
        chat.style.display = 'none';
        const msgs = document.getElementById('dashChatMessages');
        if (msgs) msgs.innerHTML = '';
    }
}

function _dm_updateMicBtn(enabled) {
    const btn  = document.getElementById('micBtn');
    const icon = btn ? btn.querySelector('i') : null;
    if (!icon) return;
    if (enabled) {
        icon.className = 'fas fa-microphone';
        if (btn) btn.style.background = '';
    } else {
        icon.className = 'fas fa-microphone-slash';
        if (btn) btn.style.background = 'rgba(239,68,68,0.3)';
    }
}

function _dm_addCard(userId, userName) {
    const area = document.getElementById('participantsContent');
    if (!area) return;
    // Hide placeholder
    const placeholder = area.querySelector('.no-participants');
    if (placeholder) placeholder.style.display = 'none';
    // Avoid duplicates
    if (area.querySelector('[data-pid="' + userId + '"]')) return;
    const initials = _dmInitials(userName);
    const card = document.createElement('div');
    card.className   = 'dm-pcard';
    card.dataset.pid = userId;
    card.innerHTML =
        '<div class="dm-avatar">' + initials + '</div>' +
        '<div class="dm-pname">' + _dmEsc(userName) + '</div>' +
        '<div class="dm-mic-dots" id="dm-mic-' + userId + '">' +
            '<div class="dm-dot muted"></div>' +
            '<div class="dm-dot" style="background:rgba(6,182,212,0.5);"></div>' +
            '<div class="dm-dot" style="background:rgba(255,255,255,0.2);"></div>' +
        '</div>';
    area.appendChild(card);
}

function _dm_removeCard(userId) {
    const card = document.querySelector('[data-pid="' + userId + '"]');
    if (card) card.remove();
    const area = document.getElementById('participantsContent');
    if (!area) return;
    const remaining = area.querySelectorAll('[data-pid]');
    if (remaining.length === 0) {
        const placeholder = area.querySelector('.no-participants');
        if (placeholder) placeholder.style.display = '';
    }
}

function _dm_updateCardMic(userId, micOn) {
    const el = document.getElementById('dm-mic-' + userId);
    if (!el) return;
    const dot = el.querySelector('.dm-dot');
    if (dot) {
        dot.className = 'dm-dot ' + (micOn ? 'speaking' : 'muted');
    }
    // Also animate card border when speaking
    const card = document.querySelector('[data-pid="' + userId + '"]');
    if (card) {
        card.style.borderColor = micOn ? 'rgba(34,197,94,0.6)' : 'rgba(6,182,212,0.35)';
        card.style.boxShadow   = micOn ? '0 0 14px rgba(34,197,94,0.4)' : '';
    }
}

function _dm_updateCount() {
    const count = document.querySelectorAll('#participantsContent [data-pid]').length;
    const el = document.getElementById('meetingOnline');
    if (el) el.textContent = count;
}

function _dm_clearParticipants() {
    const area = document.getElementById('participantsContent');
    if (!area) return;
    area.querySelectorAll('[data-pid]').forEach(el => el.remove());
    const placeholder = area.querySelector('.no-participants');
    if (placeholder) placeholder.style.display = '';
    const cnt = document.getElementById('meetingOnline');
    if (cnt) cnt.textContent = '0';
}

function _dm_setupViz(stream) {
    try {
        const ctx      = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        ctx.createMediaStreamSource(stream).connect(analyser);
        analyser.fftSize = 256;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const btn = document.getElementById('micBtn');
        (function tick() {
            requestAnimationFrame(tick);
            analyser.getByteFrequencyData(buf);
            const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
            if (btn && _dm_micOn && avg > 15) {
                btn.style.boxShadow = `0 0 ${6 + avg / 16}px rgba(99,102,241,0.7)`;
            } else if (btn) {
                btn.style.boxShadow = '';
            }
        })();
    } catch (e) { /* ignore if AudioContext unsupported */ }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function _dmInitials(name) {
    const parts = (name || '').trim().split(/\s+/);
    return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : (name || '??').substring(0, 2).toUpperCase();
}

function _dmEsc(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

// ── Recording events ──────────────────────────────────────────────────────────

function _dm_onRecording(data) {
    if (data.event !== 'recording_saved') return;
    // Show badge on Recordings nav tab
    const recTab = document.querySelector('.nav-tab[data-tab="recordings"]');
    if (recTab) {
        let badge = recTab.querySelector('.rec-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'rec-badge';
            badge.style.cssText = 'display:inline-block;background:#ef4444;color:#fff;border-radius:50%;font-size:10px;min-width:16px;height:16px;line-height:16px;text-align:center;margin-left:4px;';
            recTab.appendChild(badge);
        }
        badge.textContent = (parseInt(badge.textContent || '0') + 1);
    }
    // Refresh recordings list via AJAX (no page reload)
    if (typeof refreshRecordingsAjax === 'function') {
        refreshRecordingsAjax();
    }
    // Toast notification
    const name = data.userName || 'A student';
    const dur  = data.duration ? ' (' + data.duration + 's)' : '';
    _dmShowToast('🎙️ New Clip', name + ' saved an audio clip' + dur, '#6366f1');
}

function _dmShowToast(title, msg, color) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' + (color||'#374151') + ';color:#fff;padding:12px 18px;border-radius:10px;z-index:9999;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.4);max-width:280px;';
    t.innerHTML = '<strong>' + title + '</strong><br>' + msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4500);
}

// ── Cleanup on page close ─────────────────────────────────────────────────────

window.addEventListener('beforeunload', function () {
    if (_dm_code) cleanupDashboardMeeting();
});

