/**
 * Student Meeting Room JavaScript
 */

// ===== Config =====
const meetingData = document.getElementById('meetingData');
const MEETING_CODE = meetingData.dataset.meetingCode;
const USER_ID      = meetingData.dataset.userId;
const USER_NAME    = meetingData.dataset.userName;

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

    // ===== Click on middle panel to toggle mic =====
    const mainPanel = document.querySelector('.sr-main');
    if (mainPanel) {
        mainPanel.addEventListener('click', (e) => {
            // Only toggle mic if clicking on the panel itself or logo/video areas
            // Avoid triggering on interactive elements like buttons or inputs
            const clickedElement = e.target;
            const isInteractive = clickedElement.closest('button, a, input, select, textarea, .sr-chat-dialog, .sr-settings-dropdown, .sr-themes-panel');
            if (!isInteractive) {
                srToggleMic();
            }
        });
        // Add cursor pointer style to indicate clickable area
        mainPanel.style.cursor = 'pointer';
    }

    initAudio();
    connectWebSocket();
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
function connectWebSocket() {
    const socket = new SockJS('/ws');
    stompClient  = Stomp.over(socket);
    stompClient.debug = null;

    stompClient.connect({}, () => {
        setConnectionStatus(true);

        stompClient.subscribe('/topic/signal/'      + MEETING_CODE, m => handleSignaling(JSON.parse(m.body)));
        stompClient.subscribe('/topic/chat/'        + MEETING_CODE, m => displayChatMessage(JSON.parse(m.body)));
        stompClient.subscribe('/topic/participant/' + MEETING_CODE, m => handleParticipantEvent(JSON.parse(m.body)));
        stompClient.subscribe('/topic/control/'     + MEETING_CODE, m => handleControlEvent(JSON.parse(m.body)));

        sendParticipantEvent('join');

    }, () => {
        setConnectionStatus(false);
        setTimeout(connectWebSocket, 3000);
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
    if      (data.type === 'offer')         handleOffer(sid, data);
    else if (data.type === 'answer')        handleAnswer(sid, data);
    else if (data.type === 'ice-candidate') handleIce(sid, data);
    else if (data.type === 'request-offer') createOffer(sid);
}

async function createOffer(targetId) {
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
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: 'answer', sdp: answer.sdp, targetId: sid });
    } catch (e) { console.error(e); }
}

async function handleAnswer(sid, data) {
    const pc = peerConnections[sid];
    if (pc) try { await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp })); } catch(e){}
}

async function handleIce(sid, data) {
    const pc = peerConnections[sid];
    if (pc && data.candidate) try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e){}
}

function getOrCreatePC(peerId) {
    if (peerConnections[peerId]) return peerConnections[peerId];
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerId] = pc;

    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.onicecandidate = e => { if (e.candidate) send({ type: 'ice-candidate', candidate: e.candidate, targetId: peerId }); };
    pc.ontrack = e  => showHostVideo(e.streams[0]);
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            hideHostVideo();
            delete peerConnections[peerId];
        }
    };
    return pc;
}

function send(payload) {
    if (stompClient && stompClient.connected)
        stompClient.send('/app/signal/' + MEETING_CODE, {}, JSON.stringify(payload));
}

// ===== Host video =====
function showHostVideo(stream) {
    document.getElementById('hostVideo').srcObject = stream;
    document.getElementById('hostVideoArea').classList.add('active');
    document.getElementById('waitingCard').classList.add('hidden');
}

function hideHostVideo() {
    document.getElementById('hostVideoArea').classList.remove('active');
    document.getElementById('waitingCard').classList.remove('hidden');
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
    if (data.event === 'join') createOffer(String(data.userId));
    else if (data.event === 'leave') {
        const pc = peerConnections[String(data.userId)];
        if (pc) { pc.close(); delete peerConnections[String(data.userId)]; }
        if (Object.keys(peerConnections).length === 0) hideHostVideo();
    }
}

function handleControlEvent(data) {
    if (data.event === 'end-meeting') {
        alert('The teacher has ended the meeting.');
        window.location.href = '/student/room';
    } else if (data.event === 'mute-all') {
        srToggleMic(true);
    }
}

// ===== Controls =====
function srToggleMic(forceMute) {
    if (localStream) {
        const track = localStream.getAudioTracks()[0];
        if (track) {
            isMicOn = forceMute === true ? false : !isMicOn;
            track.enabled = isMicOn;
        }
    }
    const btn = document.getElementById('btnMic');
    const icon = btn.querySelector('i');
    if (isMicOn) {
        btn.classList.remove('muted');
        btn.classList.add('sr-control-btn-green');
        icon.className = 'fas fa-microphone';

        // Start recording
        if (localStream) {
            try {
                recordedChunks = [];
                mediaRecorder = new MediaRecorder(localStream);
                mediaRecorder.ondataavailable = e => {
                    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
                };
                mediaRecorder.onstop = () => {
                    const durationStr = Math.floor((Date.now() - recordingStartTime) / 1000);
                    if (recordedChunks.length > 0 && durationStr > 0) {
                        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                        uploadRecording(blob, durationStr);
                    }
                };
                recordingStartTime = Date.now();
                mediaRecorder.start();
            } catch (err) {
                console.error("MediaRecorder error:", err);
            }
        }
    } else {
        btn.classList.add('muted');
        btn.classList.remove('sr-control-btn-green');
        icon.className = 'fas fa-microphone-slash';

        // Stop recording
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }
    sendParticipantEvent('mic-toggle');
}

function uploadRecording(blob, duration) {
    const formData = new FormData();
    formData.append('file', blob, 'audio-clip.webm');
    formData.append('duration', duration);

    fetch(`/api/meeting/${MEETING_CODE}/recording/upload`, {
        method: 'POST',
        body: formData
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const modal = document.getElementById('srRecordingsModal');
            if (modal && modal.classList.contains('open')) {
                srLoadRecordings();
            }
        }
    })
    .catch(err => console.error("Upload error:", err));
}

function srToggleSpeaker() {
    isSpeakerOn = !isSpeakerOn;
    const vid  = document.getElementById('hostVideo');
    const btn  = document.getElementById('btnSpeaker');
    const icon = btn.querySelector('i');
    if (vid) vid.muted = !isSpeakerOn;
    if (isSpeakerOn) {
        btn.classList.remove('muted');
        icon.className = 'fas fa-volume-up';
    } else {
        btn.classList.add('muted');
        icon.className = 'fas fa-volume-mute';
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
    stompClient.send('/app/chat/' + MEETING_CODE, {}, JSON.stringify({ message: msg }));
    input.value = '';
}

function displayChatMessage(data) {
    const body = document.getElementById('srChatMessages');

    // Remove empty-state placeholder if present
    const empty = body.querySelector('.sr-chat-empty');
    if (empty) empty.remove();

    // Align messages to top when there are items
    body.style.justifyContent = 'flex-start';

    const time = data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div  = document.createElement('div');
    div.className = 'sr-chat-msg';
    div.innerHTML = `
        <div class="sr-chat-msg-header">
            <span class="sr-chat-sender">${escHtml(data.senderName || 'Unknown')}</span>
            <span class="sr-chat-time">${time}</span>
        </div>
        <div class="sr-chat-msg-body">${escHtml(data.message)}</div>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}

function escHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}
