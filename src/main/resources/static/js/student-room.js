/**
 * Student Meeting Room JavaScript
 */

// ===== Config =====
const meetingData = document.getElementById('meetingData');
const MEETING_CODE       = meetingData.dataset.meetingCode;
const USER_ID            = meetingData.dataset.userId;
const USER_NAME          = meetingData.dataset.userName;
const RECORDING_ENABLED  = meetingData.dataset.recordingEnabled === 'true';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ===== State =====
let localStream    = null;
let stompClient    = null;
let peerConnections = {};
let pendingCandidates = {};   // peerId → queued ICE candidates before remoteDesc is set
let isMicOn        = true;
let isSpeakerOn    = true;
let isChatOpen     = false;
let isSettingsOpen = false;
let isThemesOpen   = false;

let mediaRecorder  = null;
let recordedChunks = [];
let recordingStartTime = 0;

// ===== Boot =====
function buildInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.substring(0, 2).toUpperCase();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('userInitials').textContent = buildInitials(USER_NAME);

    // Restore Auto Join preference
    const autoJoin = localStorage.getItem('sr_autoJoin') === 'true';
    document.getElementById('autoJoinToggle').checked = autoJoin;

    // Restore saved theme
    const savedTheme = localStorage.getItem('sr_theme') || 'matte-black';
    srApplyTheme(savedTheme, true);

    // Close settings/themes dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('.sr-settings-anchor');
        if (!anchor) {
            closeSettings();
            closeThemesPanel();
        }
    });

    // ===== Click ANYWHERE on center stage to toggle mic =====
    const stage = document.getElementById('srCenterStage');
    if (stage) {
        stage.addEventListener('click', (e) => {
            // Don't fire if clicking a real interactive element
            const isInteractive = e.target.closest(
                'button, a, input, select, textarea, .sr-chat-dialog, ' +
                '.sr-settings-dropdown, .sr-themes-panel, .sr-modal-overlay'
            );
            if (!isInteractive) {
                srToggleMic();
            }
        });
    }

    // CRITICAL: Wait for mic permission BEFORE connecting WebSocket.
    initAudio().then(() => connectWebSocket()).catch(() => connectWebSocket());
});

// ===== Audio init =====
async function initAudio() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: false
        });
    } catch (err) {
        console.warn('Mic access denied:', err);
    }
}

// ===== WebSocket =====
let _wsReconnectTimer = null;
let _wsConnecting = false;

function connectWebSocket() {
    // Prevent multiple simultaneous connection attempts
    if (_wsConnecting) return;
    // If already connected, skip
    if (stompClient && stompClient.connected) return;

    _wsConnecting = true;
    // Cleanly disconnect any stale client before creating a new one
    if (stompClient) {
        try { stompClient.disconnect(); } catch (e) {}
        stompClient = null;
    }

    const socket = new SockJS('/ws');
    stompClient  = Stomp.over(socket);
    stompClient.debug = null;

    stompClient.connect({}, () => {
        _wsConnecting = false;
        setConnectionStatus(true);

        stompClient.subscribe('/topic/signal/'      + MEETING_CODE, m => handleSignaling(JSON.parse(m.body)));
        stompClient.subscribe('/topic/chat/'        + MEETING_CODE, m => displayChatMessage(JSON.parse(m.body)));
        stompClient.subscribe('/topic/participant/' + MEETING_CODE, m => handleParticipantEvent(JSON.parse(m.body)));
        stompClient.subscribe('/topic/control/'     + MEETING_CODE, m => handleControlEvent(JSON.parse(m.body)));

        // Subscribe to user-specific notifications (schedule, reminders, etc.)
        if (USER_ID) {
            stompClient.subscribe('/topic/notifications/' + USER_ID, m => {
                const data = JSON.parse(m.body);
                if (data) showSrNotifToast(data.title, data.message, data.type);
            });
        }

        sendParticipantEvent('join');

    }, () => {
        _wsConnecting = false;
        setConnectionStatus(false);
        // Disconnect stale client so next attempt is clean
        if (stompClient) { try { stompClient.disconnect(); } catch (e) {} stompClient = null; }
        clearTimeout(_wsReconnectTimer);
        _wsReconnectTimer = setTimeout(connectWebSocket, 3000);
    });
}

function setConnectionStatus(online) {
    const dot  = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    dot.classList.toggle('online', online);
    text.textContent  = online ? 'Online'  : 'Offline';
    text.style.color  = online ? '#22c55e' : '#ef4444';
}

// ===== WebRTC signaling =====
function handleSignaling(data) {
    const sid = String(data.senderId);
    if (sid === String(USER_ID)) return;
    // Only process signals that are explicitly targeted at this student (or broadcast with no target)
    if (data.targetId && String(data.targetId) !== String(USER_ID)) return;
    if      (data.type === 'offer')         handleOffer(sid, data);
    else if (data.type === 'answer')        handleAnswer(sid, data);
    else if (data.type === 'ice-candidate') handleIce(sid, data);
    else if (data.type === 'request-offer') createOffer(sid);
}

async function createOffer(targetId) {
    // Idempotency guard: skip if a connection attempt is already in progress for this peer
    if (peerConnections[targetId]) return;
    const pc = getOrCreatePC(targetId);
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: 'offer', sdp: offer.sdp, targetId });
    } catch (e) { console.error(e); }
}

async function handleOffer(sid, data) {
    const pc = getOrCreatePC(sid);
    try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
        await drainCandidates(sid);          // flush any queued ICE candidates
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: 'answer', sdp: answer.sdp, targetId: sid });
    } catch (e) { console.error(e); }
}

async function handleAnswer(sid, data) {
    const pc = peerConnections[sid];
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
            await drainCandidates(sid);      // flush any queued ICE candidates
        } catch(e) { console.error(e); }
    }
}

async function handleIce(sid, data) {
    const pc = peerConnections[sid];
    if (!pc || !data.candidate) return;
    // If remote description not set yet, queue the candidate to apply later
    if (pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e) {}
    } else {
        if (!pendingCandidates[sid]) pendingCandidates[sid] = [];
        pendingCandidates[sid].push(data.candidate);
    }
}

// Drain all queued ICE candidates for a peer after remote description is set
async function drainCandidates(peerId) {
    const queue = pendingCandidates[peerId];
    if (!queue || !queue.length) return;
    delete pendingCandidates[peerId];
    const pc = peerConnections[peerId];
    if (!pc) return;
    for (const c of queue) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
    }
}

function getOrCreatePC(peerId) {
    if (peerConnections[peerId]) return peerConnections[peerId];
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerId] = pc;

    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.onicecandidate = e => { if (e.candidate) send({ type: 'ice-candidate', candidate: e.candidate, targetId: peerId }); };
    pc.ontrack = e  => playHostAudio(e.streams[0]);
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            hideHostAudio();
            delete peerConnections[peerId];
        }
    };
    return pc;
}

function send(payload) {
    if (stompClient && stompClient.connected)
        stompClient.send('/app/signal/' + MEETING_CODE, {}, JSON.stringify(payload));
}

// ===== Host audio playback =====
function playHostAudio(stream) {
    let audio = document.getElementById('host-audio-el');
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'host-audio-el';
        audio.autoplay = true;
        audio.playsInline = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
    }
    audio.srcObject = stream;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(() => {
            const btn = document.getElementById('unmuteBtn');
            if (btn) btn.style.display = 'inline-flex';
        });
    }

    // Update teacher-connected indicator
    _setTeacherConnected(true);
}

function resumeHostAudio() {
    const audio = document.getElementById('host-audio-el');
    if (!audio) return;
    audio.play().then(() => {
        const btn = document.getElementById('unmuteBtn');
        if (btn) btn.style.display = 'none';
    }).catch(() => {});
}

function hideHostAudio() {
    const audio = document.getElementById('host-audio-el');
    if (audio) { audio.srcObject = null; audio.remove(); }
    _setTeacherConnected(false);
    const btn = document.getElementById('unmuteBtn');
    if (btn) btn.style.display = 'none';
}

function _setTeacherConnected(connected) {
    const dot  = document.querySelector('.sr-conn-dot');
    const text = document.getElementById('srTeacherConnText');
    if (dot) {
        dot.classList.toggle('online', connected);
        dot.classList.toggle('offline', !connected);
    }
    if (text) text.textContent = connected ? 'Teacher Connected' : 'Waiting for teacher…';
}

// ===== Participant events =====
function sendParticipantEvent(type) {
    if (stompClient && stompClient.connected)
        stompClient.send('/app/participant/' + MEETING_CODE, {}, JSON.stringify({
            event: type, micEnabled: isMicOn, cameraEnabled: false, handRaised: false
        }));
}

function handleParticipantEvent(data) {
    if (String(data.userId) === String(USER_ID)) return;
    if (data.event === 'join') {
        // Only initiate a WebRTC connection to the HOST — not to other students
        if (data.userRole === 'HOST') {
            createOffer(String(data.userId));
        }
    } else if (data.event === 'leave') {
        const pc = peerConnections[String(data.userId)];
        if (pc) { pc.close(); delete peerConnections[String(data.userId)]; }
        if (Object.keys(peerConnections).length === 0) hideHostAudio();
    }
}

function handleControlEvent(data) {
    if (data.event === 'end-meeting') {
        // Show a brief toast then redirect — avoid blocking alert()
        showSrNotifToast('Meeting Ended', 'The teacher has ended the meeting.', 'MEETING_STARTED');
        hideHostAudio();
        setTimeout(() => { window.location.href = '/student/room'; }, 2500);
    } else if (data.event === 'mute-all') {
        srToggleMic(true);
    }
}

// ===== Controls =====
function srToggleMic(forceMute) {
    // Update mic state
    if (localStream) {
        const track = localStream.getAudioTracks()[0];
        if (track) {
            isMicOn = forceMute === true ? false : !isMicOn;
            track.enabled = isMicOn;
        }
    } else {
        isMicOn = forceMute === true ? false : !isMicOn;
    }

    _updateMicUI(isMicOn);

    if (isMicOn) {
        // ── Start recording only when teacher has recording enabled ──
        if (RECORDING_ENABLED && localStream) {
            try {
                recordedChunks = [];
                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
                const opts = mimeType ? { mimeType } : {};
                mediaRecorder = new MediaRecorder(localStream, opts);
                mediaRecorder.ondataavailable = e => {
                    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
                };
                mediaRecorder.onstop = _onRecordingStop;
                recordingStartTime = Date.now();
                mediaRecorder.start(500); // collect every 500ms for reliability
            } catch (err) {
                console.error('MediaRecorder start error:', err);
            }
        }
    } else {
        // ── Stop recording ──
        if (RECORDING_ENABLED && mediaRecorder && mediaRecorder.state !== 'inactive') {
            try {
                mediaRecorder.stop();
            } catch (e) {
                console.error('MediaRecorder stop error:', e);
            }
        }
    }

    sendParticipantEvent('mic-toggle');
}

// ── Update all mic-related UI ──
function _updateMicUI(micOn) {
    const btn      = document.getElementById('btnMic');
    const icon     = document.getElementById('srMicIcon') || (btn && btn.querySelector('i'));
    const stage    = document.getElementById('srMicStage') || btn?.closest('.sr-mic-stage');
    const stageWrap = document.querySelector('.sr-mic-stage');
    const hintText = document.getElementById('srMicHintText');

    if (micOn) {
        // Active: green
        if (btn)  { btn.classList.remove('muted'); }
        if (icon) { icon.className = 'fas fa-microphone'; }
        if (stageWrap) stageWrap.classList.add('sr-mic-active');
        if (hintText) hintText.textContent = '🎙️ Speaking — tap to mute';
    } else {
        // Muted: red
        if (btn)  { btn.classList.add('muted'); }
        if (icon) { icon.className = 'fas fa-microphone-slash'; }
        if (stageWrap) stageWrap.classList.remove('sr-mic-active');
        if (hintText) hintText.textContent = '🔇 Muted — tap anywhere to speak';
    }
}

// ── Called when MediaRecorder.stop() finishes ──
function _onRecordingStop() {
    if (!recordedChunks || recordedChunks.length === 0) return;
    const durationSecs = Math.max(1, Math.round((Date.now() - recordingStartTime) / 1000));
    const mimeType = (mediaRecorder && mediaRecorder.mimeType) ? mediaRecorder.mimeType : 'audio/webm';
    const blob = new Blob(recordedChunks, { type: mimeType });
    recordedChunks = [];
    mediaRecorder = null;

    // Show save dialog immediately
    setTimeout(() => srShowSaveDialog(blob, durationSecs), 100);
}

// ===== Save Recording Dialog =====
let _pendingBlob     = null;
let _pendingDuration = 0;

function srShowSaveDialog(blob, durationSecs) {
    _pendingBlob     = blob;
    _pendingDuration = durationSecs;

    const info = document.getElementById('srSaveRecInfo');
    if (info) info.textContent = 'Audio clip ready — ' + durationSecs + ' second(s). How would you like to save it?';

    const status = document.getElementById('srSaveRecStatus');
    if (status) { status.textContent = ''; status.style.display = 'none'; }

    // Reset button states
    ['srSaveRecDownloadBtn','srSaveRecUploadBtn','srSaveRecBothBtn'].forEach(id => {
        const b = document.getElementById(id);
        if (b) { b.disabled = false; b.style.opacity = '1'; }
    });

    // Wire up buttons
    const dlBtn   = document.getElementById('srSaveRecDownloadBtn');
    const ulBtn   = document.getElementById('srSaveRecUploadBtn');
    const bothBtn = document.getElementById('srSaveRecBothBtn');

    if (dlBtn)   dlBtn.onclick   = () => { srDownloadBlob(_pendingBlob, _pendingDuration); srCloseSaveDialog(); };
    if (ulBtn)   ulBtn.onclick   = () => srUploadOnly(_pendingBlob, _pendingDuration);
    if (bothBtn) bothBtn.onclick = () => srSaveBoth(_pendingBlob, _pendingDuration);

    document.getElementById('srSaveRecOverlay').classList.add('active');
    document.getElementById('srSaveRecModal').classList.add('open');
}

function srCloseSaveDialog() {
    document.getElementById('srSaveRecOverlay').classList.remove('active');
    document.getElementById('srSaveRecModal').classList.remove('open');
    _pendingBlob     = null;
    _pendingDuration = 0;
}

function srDiscardRecording() {
    srCloseSaveDialog();
    showSrNotifToast('Recording Discarded', 'The audio clip was discarded.', 'MEETING_STARTED');
}

function srDownloadBlob(blob, durationSecs) {
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'recording-' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function srSetDialogStatus(msg, isError) {
    const s = document.getElementById('srSaveRecStatus');
    if (!s) return;
    s.textContent  = msg;
    s.style.color  = isError ? '#f87171' : '#22c55e';
    s.style.display = 'block';
}

function srDisableDialogButtons(disable) {
    ['srSaveRecDownloadBtn','srSaveRecUploadBtn','srSaveRecBothBtn'].forEach(id => {
        const b = document.getElementById(id);
        if (b) { b.disabled = disable; b.style.opacity = disable ? '0.5' : '1'; }
    });
}

function srUploadOnly(blob, durationSecs) {
    srDisableDialogButtons(true);
    srSetDialogStatus('Uploading to server…', false);
    uploadRecording(blob, durationSecs)
        .then(() => {
            srSetDialogStatus('✅ Saved to server! Teacher can now play it.', false);
            setTimeout(srCloseSaveDialog, 2000);
        })
        .catch(err => {
            srSetDialogStatus('❌ Upload failed: ' + err.message + '. Try again.', true);
            srDisableDialogButtons(false);
        });
}

function srSaveBoth(blob, durationSecs) {
    // Download immediately
    srDownloadBlob(blob, durationSecs);
    // Then upload
    srDisableDialogButtons(true);
    srSetDialogStatus('Uploading to server…', false);
    uploadRecording(blob, durationSecs)
        .then(() => {
            srSetDialogStatus('✅ Saved to device & server!', false);
            setTimeout(srCloseSaveDialog, 2000);
        })
        .catch(err => {
            srSetDialogStatus('⚠️ Downloaded but upload failed: ' + err.message, true);
            srDisableDialogButtons(false);
        });
}

function uploadRecording(blob, duration) {
    return new Promise(function(resolve, reject) {
        const formData = new FormData();
        formData.append('file', blob, 'audio-clip.webm');
        formData.append('duration', duration);

        fetch('/api/meeting/' + MEETING_CODE + '/recording/upload', {
            method: 'POST',
            body: formData
        })
        .then(function(r) {
            if (!r.ok) return r.json().then(d => Promise.reject(new Error(d.error || 'Server error')));
            return r.json();
        })
        .then(function(data) {
            if (!data.success) return reject(new Error(data.error || 'Upload failed'));
            // Refresh recordings list if open
            const modal = document.getElementById('srRecordingsModal');
            if (modal && modal.classList.contains('open')) srLoadRecordings();
            resolve(data);
        })
        .catch(function(err) {
            reject(err);
        });
    });
}

function srToggleSpeaker() {
    isSpeakerOn = !isSpeakerOn;
    const audio = document.getElementById('host-audio-el');
    const btn   = document.getElementById('btnSpeaker');
    const icon  = btn ? btn.querySelector('i') : null;
    if (audio) audio.muted = !isSpeakerOn;
    if (isSpeakerOn) {
        if (btn)  btn.classList.remove('muted');
        if (icon) icon.className = 'fas fa-volume-up';
    } else {
        if (btn)  btn.classList.add('muted');
        if (icon) icon.className = 'fas fa-volume-mute';
    }
}

// ===== Chat dialog =====
function srToggleChat() {
    isChatOpen = !isChatOpen;
    document.getElementById('srChatDialog').classList.toggle('open', isChatOpen);
    document.getElementById('srOverlay').classList.toggle('active', isChatOpen);
    if (isChatOpen) setTimeout(() => document.getElementById('srChatInput').focus(), 100);
}

// ===== Settings dropdown =====
function srToggleSettings(e) {
    if (e) e.stopPropagation();
    isSettingsOpen = !isSettingsOpen;
    document.getElementById('srSettingsDropdown').classList.toggle('open', isSettingsOpen);
}

function closeSettings() {
    isSettingsOpen = false;
    document.getElementById('srSettingsDropdown').classList.remove('open');
}

function srCloseAll() {
    isChatOpen     = false;
    isSettingsOpen = false;
    document.getElementById('srChatDialog').classList.remove('open');
    document.getElementById('srOverlay').classList.remove('active');
    closeSettings();
    closeThemesPanel();
}

// ===== Settings actions =====
function srAutoJoinChanged(checkbox) {
    localStorage.setItem('sr_autoJoin', checkbox.checked);
}

// ===== RECORDINGS MODAL =====
function srOpenRecordings(e) {
    if (e) e.preventDefault();
    closeSettings();
    document.getElementById('srRecordingsOverlay').classList.add('active');
    document.getElementById('srRecordingsModal').classList.add('open');
    srLoadRecordings();
}

function srCloseRecordings() {
    document.getElementById('srRecordingsOverlay').classList.remove('active');
    document.getElementById('srRecordingsModal').classList.remove('open');
}

function srLoadRecordings() {
    fetch('/api/user/recordings')
        .then(r => r.json())
        .then(data => {
            const list  = document.getElementById('srRecordingsList');
            const empty = document.getElementById('srRecordingsEmpty');
            // Remove old items (keep empty state)
            list.querySelectorAll('.sr-rec-item').forEach(el => el.remove());

            if (!data || data.length === 0) {
                if (empty) empty.style.display = '';
                return;
            }
            if (empty) empty.style.display = 'none';

            let counter = 1;
            data.forEach(rec => {
                const secs = rec.durationSeconds || 0;
                const dur  = secs > 0 ? `${secs}s` : '0s';
                const item = document.createElement('div');
                item.className = 'sr-rec-item';
                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-bottom: 12px;">
                        <div style="font-size:14px; color:#bbb;">
                            #${counter++} <i class="fas fa-hourglass-half" style="margin:0 4px"></i>${dur} &nbsp;<i class="fas fa-calendar-alt" style="margin:0 4px"></i>${escHtml(rec.createdAt)}
                        </div>
                        <button class="sr-rec-item-btn sr-rec-item-del" onclick="srDeleteRecording(${rec.id}, this)" style="padding:5px 8px;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div>
                        <a href="/api/meeting/recording/${rec.id}/play" target="_blank" class="sr-rec-item-btn sr-rec-item-play" style="display:inline-block;">
                            <i class="fas fa-play"></i> Load Audio
                        </a>
                    </div>`;
                list.appendChild(item);
            });
        })
        .catch(() => {});
}

function srDeleteRecording(id, btn) {
    if (!confirm('Delete this recording?')) return;
    fetch(`/api/user/recordings/${id}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(d => { if (d.success) { btn.closest('.sr-rec-item').remove(); srCheckEmpty(); } })
        .catch(() => {});
}

function srCheckEmpty() {
    const items = document.querySelectorAll('#srRecordingsList .sr-rec-item');
    const empty = document.getElementById('srRecordingsEmpty');
    if (empty) empty.style.display = items.length === 0 ? '' : 'none';
}

function srSaveAllRecordings() {
    document.querySelectorAll('#srRecordingsList .sr-rec-item-dl').forEach(a => {
        const link = document.createElement('a');
        link.href     = a.href;
        link.download = '';
        link.click();
    });
}

function srClearAllRecordings() {
    if (!confirm('Delete ALL recordings? This cannot be undone.')) return;
    const btns = [...document.querySelectorAll('#srRecordingsList .sr-rec-item-del')];
    btns.forEach(btn => srDeleteRecording(
        parseInt(btn.getAttribute('onclick').match(/\d+/)[0]), btn
    ));
}

// ===== CHANGE PASSWORD MODAL =====
function srOpenChangePassword(e) {
    if (e) e.preventDefault();
    closeSettings();
    // Reset form
    ['pwdCurrent','pwdNew','pwdConfirm'].forEach(id => { document.getElementById(id).value = ''; });
    const fb = document.getElementById('pwdFeedback');
    fb.style.display = 'none';
    fb.className = 'sr-pwd-feedback';

    document.getElementById('srPasswordOverlay').classList.add('active');
    document.getElementById('srPasswordModal').classList.add('open');
}

function srCloseChangePassword() {
    document.getElementById('srPasswordOverlay').classList.remove('active');
    document.getElementById('srPasswordModal').classList.remove('open');
}

function srToggleEye(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon  = btn.querySelector('i');
    if (input.type === 'password') {
        input.type   = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type   = 'password';
        icon.className = 'fas fa-eye';
    }
}

function srSubmitChangePassword() {
    const current  = document.getElementById('pwdCurrent').value.trim();
    const newPwd   = document.getElementById('pwdNew').value.trim();
    const confirm  = document.getElementById('pwdConfirm').value.trim();
    const fb       = document.getElementById('pwdFeedback');
    const submitBtn = document.querySelector('.sr-btn-submit');

    const showFb = (msg, isError) => {
        fb.textContent  = msg;
        fb.className    = 'sr-pwd-feedback ' + (isError ? 'error' : 'success');
        fb.style.display = 'block';
    };

    if (!current)          { showFb('Current password is required', true);  return; }
    if (newPwd.length < 6) { showFb('New password must be at least 6 characters', true); return; }
    if (newPwd !== confirm) { showFb('Passwords do not match', true); return; }

    submitBtn.disabled   = true;
    submitBtn.textContent = 'Changing...';

    fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPwd, confirmPassword: confirm })
    })
    .then(r => r.json())
    .then(d => {
        submitBtn.disabled   = false;
        submitBtn.textContent = 'Change Password';
        if (d.success) {
            showFb('Password changed successfully!', false);
            setTimeout(srCloseChangePassword, 1800);
        } else {
            showFb(d.message || 'Failed to change password', true);
        }
    })
    .catch(() => {
        submitBtn.disabled   = false;
        submitBtn.textContent = 'Change Password';
        showFb('Network error. Please try again.', true);
    });
}

// ===== THEMES =====
function srOpenThemes(e) {
    if (e) e.preventDefault();
    // Close the settings dropdown, open the themes panel
    document.getElementById('srSettingsDropdown').classList.remove('open');
    isSettingsOpen = false;
    isThemesOpen = !isThemesOpen;
    document.getElementById('srThemesPanel').classList.toggle('open', isThemesOpen);
}

function closeThemesPanel() {
    isThemesOpen = false;
    const p = document.getElementById('srThemesPanel');
    if (p) p.classList.remove('open');
}

function srApplyTheme(theme, silent) {
    document.body.setAttribute('data-theme', theme);
    if (!silent) localStorage.setItem('sr_theme', theme);

    // Update active state in themes panel
    document.querySelectorAll('.sr-theme-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    if (!silent) closeThemesPanel();
}

// ===== Chat send / receive =====
function srSendChat() {
    const input = document.getElementById('srChatInput');
    const msg   = input.value.trim();
    if (!msg || !stompClient || !stompClient.connected) return;
    stompClient.send('/app/chat/' + MEETING_CODE, {}, JSON.stringify({ content: msg }));
    input.value = '';
}

function displayChatMessage(data) {
    const body = document.getElementById('srChatMessages');

    // Remove empty-state placeholder if present
    const empty = body.querySelector('.sr-chat-empty');
    if (empty) empty.remove();

    // Align messages to top when there are items
    body.style.justifyContent = 'flex-start';

    const time = data.timestamp || data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div  = document.createElement('div');
    div.className = 'sr-chat-msg';
    div.innerHTML = `
        <div class="sr-chat-msg-header">
            <span class="sr-chat-sender">${escHtml(data.senderName || data.userName || 'Unknown')}</span>
            <span class="sr-chat-time">${time}</span>
        </div>
        <div class="sr-chat-msg-body">${escHtml(data.content || data.message || '')}</div>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}

function escHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// ===== Notification Toast (for schedule/reminder notifications in meeting) =====
function showSrNotifToast(title, message, type) {
    const typeColor = {
        'SCHEDULE_CREATED':  '#6366f1',
        'SCHEDULE_REMINDER': '#f59e0b',
        'MEETING_STARTED':   '#22c55e',
        'RECORDING_AVAILABLE': '#38bdf8',
        'TRANSCRIPT_READY':  '#a78bfa'
    }[type] || '#6366f1';

    // Add keyframe animation once
    if (!document.getElementById('srNotifToastKF')) {
        const s = document.createElement('style');
        s.id = 'srNotifToastKF';
        s.textContent = '@keyframes srSlideIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}';
        document.head.appendChild(s);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed;top:70px;right:18px;z-index:9999;
        background:#1e293b;border:1px solid ${typeColor};border-radius:12px;
        padding:13px 16px;max-width:300px;min-width:240px;
        box-shadow:0 8px 32px rgba(0,0,0,.5);
        animation:srSlideIn .3s ease;font-family:inherit;pointer-events:all;
    `;
    toast.innerHTML = `
        <div style="display:flex;gap:10px;align-items:flex-start;">
            <i class="fas fa-bell" style="color:${typeColor};margin-top:2px;flex-shrink:0;"></i>
            <div style="flex:1;">
                <div style="font-weight:700;font-size:13px;color:#f0f6fc;margin-bottom:3px;">${escHtml(title || 'Notification')}</div>
                <div style="font-size:12px;color:#8b949e;line-height:1.4;">${escHtml(message || '')}</div>
            </div>
            <button onclick="this.closest('div[style]').remove()" style="background:none;border:none;color:#8b949e;cursor:pointer;padding:0;font-size:14px;flex-shrink:0;">✕</button>
        </div>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = 'opacity .4s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 6000);
}

// ===== Cleanup on page leave =====
window.addEventListener('beforeunload', function() {
    // Cancel any pending reconnect
    clearTimeout(_wsReconnectTimer);
    // Notify other participants
    if (stompClient && stompClient.connected) {
        sendParticipantEvent('leave');
        stompClient.disconnect();
    }
    // Close all peer connections
    Object.values(peerConnections).forEach(function(pc) { try { pc.close(); } catch(e) {} });
    // Stop local mic stream
    if (localStream) localStream.getTracks().forEach(function(t) { t.stop(); });
});

