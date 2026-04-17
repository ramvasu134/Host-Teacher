// ===== Host Meeting Room JavaScript =====

// Get meeting data from DOM
const meetingData = document.getElementById('meetingData');
const MEETING_CODE = meetingData ? meetingData.dataset.meetingCode : '';
const MEETING_ID   = meetingData ? meetingData.dataset.meetingId   : '';
const USER_ID      = meetingData ? meetingData.dataset.userId      : '';
const USER_NAME    = meetingData ? meetingData.dataset.userName    : '';
const RECORDING_ENABLED = meetingData ? meetingData.dataset.recordingEnabled === 'true' : false;

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ===== State =====
let stompClient    = null;
let localStream    = null;
let peerConnections = {};   // studentId -> RTCPeerConnection
let pendingCandidates = {}; // peerId → queued ICE candidates before remoteDesc is set
let isMicEnabled   = true;
let isRecording    = false;
let currentTab     = 'participants'; // 'participants' | 'chat' | 'recordings'
let chatUnread     = 0;
let recordingUnread = 0;
let meetingStartTime = Date.now();

// ===== Boot =====
document.addEventListener('DOMContentLoaded', function () {
    // Ensure initial tab state is correct
    switchTab('participants');
    initAudio();
    startMeetingTimer();
    // Seed student strip from server-rendered participant list (students already in room)
    _seedStudentStripFromDOM();
});

// Populate student strip from server-rendered participants on page load
function _seedStudentStripFromDOM() {
    const existing = document.querySelectorAll('#participantsList .participant-item.student');
    existing.forEach(function(item) {
        const uid  = item.dataset.userId;
        const name = (item.querySelector('.participant-name') || {}).textContent || 'Student';
        if (uid) _addStudentChip(uid, name.trim());
    });
}

// ===== Audio — get mic FIRST, then connect WebSocket =====
function initAudio() {
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
        .then(function (stream) {
            localStream = stream;
            updateMicUI(true);
            setupAudioVisualization(stream);
            connectWebSocket();
        })
        .catch(function (err) {
            console.warn('Mic access denied:', err);
            updateMicUI(false);
            connectWebSocket(); // still connect so control / chat works
        });
}

// ===== WebSocket =====
let _wsReconnectTimer = null;
let _wsConnecting = false;

function connectWebSocket() {
    if (_wsConnecting) return;
    if (stompClient && stompClient.connected) return;

    _wsConnecting = true;
    if (stompClient) { try { stompClient.disconnect(); } catch(e) {} stompClient = null; }

    const socket = new SockJS('/ws');
    stompClient  = Stomp.over(socket);
    stompClient.debug = null;

    stompClient.connect({}, function () {
        _wsConnecting = false;
        console.log('Host WebSocket connected');

        // ── WebRTC signaling (offers / answers / ICE from students) ──
        stompClient.subscribe('/topic/signal/' + MEETING_CODE, function (m) {
            handleSignaling(JSON.parse(m.body));
        });

        // ── Participant join / leave / mic-toggle ──
        stompClient.subscribe('/topic/participant/' + MEETING_CODE, function (m) {
            handleParticipantEvent(JSON.parse(m.body));
        });

        // ── Chat messages ──
        stompClient.subscribe('/topic/chat/' + MEETING_CODE, function (m) {
            handleChatMessage(JSON.parse(m.body));
        });

        // ── Control events (mute-all etc.) ──
        stompClient.subscribe('/topic/control/' + MEETING_CODE, function (m) {
            handleControlEvent(JSON.parse(m.body));
        });

        // ── Recording saved events (auto-saved student clips) ──
        if (RECORDING_ENABLED) {
            stompClient.subscribe('/topic/recording/' + MEETING_CODE, function (m) {
                handleRecordingEvent(JSON.parse(m.body));
            });
        }

        // Announce host presence — students already in the room will
        // receive this and call createOffer(hostId) automatically
        sendParticipantEvent('join');

    }, function (err) {
        _wsConnecting = false;
        console.error('WebSocket error, reconnecting…', err);
        if (stompClient) { try { stompClient.disconnect(); } catch(e) {} stompClient = null; }
        clearTimeout(_wsReconnectTimer);
        _wsReconnectTimer = setTimeout(connectWebSocket, 5000);
    });
}

function sendParticipantEvent(type) {
    if (stompClient && stompClient.connected) {
        stompClient.send('/app/participant/' + MEETING_CODE, {}, JSON.stringify({
            event: type,
            micEnabled: isMicEnabled,
            cameraEnabled: false
        }));
    }
}

function sendSignal(payload) {
    if (stompClient && stompClient.connected) {
        stompClient.send('/app/signal/' + MEETING_CODE, {}, JSON.stringify(payload));
    }
}

// ===== WebRTC =====
function getOrCreatePC(peerId) {
    if (peerConnections[peerId]) return peerConnections[peerId];

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerId] = pc;

    // Add host's mic track so students can hear the host
    if (localStream) {
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }

    pc.onicecandidate = e => {
        if (e.candidate) sendSignal({ type: 'ice-candidate', candidate: e.candidate, targetId: peerId });
    };

    // Receive student audio
    pc.ontrack = e => playStudentAudio(peerId, e.streams[0]);

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            const audio = document.getElementById('sr-audio-' + peerId);
            if (audio) audio.remove();
            delete peerConnections[peerId];
        }
    };

    return pc;
}

function playStudentAudio(peerId, stream) {
    let audio = document.getElementById('sr-audio-' + peerId);
    if (!audio) {
        audio = document.createElement('audio');
        audio.id        = 'sr-audio-' + peerId;
        audio.autoplay  = true;
        audio.playsInline = true;
        document.body.appendChild(audio);
    }
    audio.srcObject = stream;
}

function handleSignaling(data) {
    const sid = String(data.senderId);
    if (sid === String(USER_ID)) return; // ignore own messages
    // Only process signals explicitly targeted at this user (host), or broadcast signals with no target
    if (data.targetId && String(data.targetId) !== String(USER_ID)) return;
    if      (data.type === 'offer')         handleOffer(sid, data);
    else if (data.type === 'answer')        handleAnswer(sid, data);
    else if (data.type === 'ice-candidate') handleIce(sid, data);
}

async function handleOffer(sid, data) {
    const pc = getOrCreatePC(sid);
    try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
        await drainCandidates(sid);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'answer', sdp: answer.sdp, targetId: sid });
    } catch (e) { console.error('handleOffer error:', e); }
}

async function handleAnswer(sid, data) {
    const pc = peerConnections[sid];
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
            await drainCandidates(sid);
        } catch (e) { console.error('handleAnswer error:', e); }
    }
}

async function handleIce(sid, data) {
    const pc = peerConnections[sid];
    if (!pc || !data.candidate) return;
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

function handleParticipantEvent(data) {
    if (String(data.userId) === String(USER_ID)) return;

    if (data.event === 'join') {
        addParticipantToList(data.userId, data.userName);
        updateParticipantCount();
        // Tell this student (and any others) to create an offer to the host
        sendSignal({ type: 'request-offer', targetId: String(data.userId) });
    } else if (data.event === 'leave') {
        removeParticipantFromList(data.userId);
        updateParticipantCount();
        const pc = peerConnections[String(data.userId)];
        if (pc) { pc.close(); delete peerConnections[String(data.userId)]; }
        const audio = document.getElementById('sr-audio-' + data.userId);
        if (audio) audio.remove();
    } else if (data.event === 'mic-toggle') {
        updateParticipantMicStatus(data.userId, data.micEnabled);
        if (data.micEnabled) showSpeakingStudent(data.userId, data.userName);
        else                  hideSpeakingStudent(data.userId);
    }
}

function handleControlEvent(data) {
    // future use
}

// ===== Recording Events from Students =====
function handleRecordingEvent(data) {
    if (!data || !data.success) return;

    // Add to recordings list
    addRecordingToList(data);

    // Badge on Recordings tab
    if (currentTab !== 'recordings') {
        recordingUnread++;
        const badge = document.getElementById('recordingTabCount');
        if (badge) {
            badge.textContent = recordingUnread > 9 ? '9+' : recordingUnread;
            badge.style.display = 'inline-flex';
        }
    }

    // Toast notification
    showRoomToast(
        '🎙️ Recording Saved',
        (data.userName || 'A student') + ' saved a clip (' + (data.duration || 0) + 's)',
        '#22c55e'
    );
}

function addRecordingToList(data) {
    const list  = document.getElementById('recordingsList');
    const empty = document.getElementById('recordingsEmpty');
    if (!list) return;
    if (empty) empty.style.display = 'none';

    const item = document.createElement('div');
    item.className = 'rec-item';
    const secs = data.duration || 0;
    const dur  = secs > 0 ? secs + 's' : '—';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const audioId = 'host-audio-rec-' + data.recordingId;
    item.innerHTML = `
        <div class="rec-item-header">
            <span class="rec-item-name"><i class="fas fa-user-graduate" style="margin-right:5px;"></i>${escapeHtml(data.userName || 'Student')}</span>
            <span class="rec-item-duration"><i class="fas fa-hourglass-half"></i> ${dur}</span>
        </div>
        <div class="rec-item-meta"><i class="fas fa-clock"></i> ${time}</div>
        <div class="rec-item-actions">
            <button type="button" class="rec-item-btn rec-item-play" onclick="hostTogglePlay('${audioId}', this)">
                <i class="fas fa-play"></i> Play
            </button>
            <a href="/api/meeting/recording/${data.recordingId}/download" class="rec-item-btn rec-item-download">
                <i class="fas fa-download"></i> Download
            </a>
            <button type="button" class="rec-item-btn rec-item-delete" onclick="deleteRecording(${data.recordingId})">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
        <audio id="${audioId}" src="/api/meeting/recording/${data.recordingId}/play" preload="none"
               onended="hostResetPlayBtn('${audioId}')" style="display:none;"></audio>`;
    list.insertBefore(item, list.firstChild);
}

// Inline audio play/pause for host recording list
function hostTogglePlay(audioId, btn) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    // Pause all other audios
    document.querySelectorAll('audio[id^="host-audio-rec-"]').forEach(a => {
        if (a.id !== audioId && !a.paused) { a.pause(); a.currentTime = 0; }
    });
    document.querySelectorAll('.rec-item-play').forEach(b => {
        const icon = b.querySelector('i');
        if (icon) icon.className = 'fas fa-play';
    });
    if (audio.paused) {
        audio.play();
        const icon = btn.querySelector('i');
        if (icon) icon.className = 'fas fa-pause';
    } else {
        audio.pause();
        const icon = btn.querySelector('i');
        if (icon) icon.className = 'fas fa-play';
    }
}
function hostResetPlayBtn(audioId) {
    const audio = document.getElementById(audioId);
    if (audio) audio.currentTime = 0;
    const item = audio ? audio.closest('.rec-item') : null;
    if (item) {
        const btn = item.querySelector('.rec-item-play');
        if (btn) { const i = btn.querySelector('i'); if (i) i.className = 'fas fa-play'; }
    }
}

function deleteRecording(recordingId) {
    if (!confirm('Are you sure you want to delete this recording?')) return;
    fetch(`/api/meeting/recording/${recordingId}/delete`, { method: 'POST' })
        .then(r => r.ok ? Promise.resolve() : Promise.reject(r.status))
        .then(() => {
            const item = document.querySelector(`[data-recording-id="${recordingId}"]`);
            if (item) item.remove();
            const empty = document.getElementById('recordingsEmpty');
            const list = document.getElementById('recordingsList');
            if (list && !list.querySelector('.rec-item') && empty) {
                empty.style.display = 'flex';
            }
            showRoomToast('Deleted', 'Recording removed successfully', '#ef4444');
        })
        .catch(err => showRoomToast('Error', 'Failed to delete recording', '#ef4444'));
}

// ===== Mic Toggle =====
function toggleMic() {
    if (!localStream) return;
    isMicEnabled = !isMicEnabled;
    localStream.getAudioTracks().forEach(t => { t.enabled = isMicEnabled; });
    updateMicUI(isMicEnabled);
    sendParticipantEvent('mic-toggle');
}

function updateMicUI(enabled) {
    const btn        = document.getElementById('btnMic');
    const micStatus  = document.getElementById('micStatus');
    const hostMicIcon = document.getElementById('hostMicIcon');
    const audioRing  = document.getElementById('hostAudioRing');

    if (enabled) {
        btn.classList.remove('muted');
        btn.innerHTML = '<i class="fas fa-microphone"></i><span>Mic</span>';
        if (micStatus)   { micStatus.innerHTML = '<i class="fas fa-microphone"></i><span>Microphone Active</span>'; micStatus.classList.remove('muted'); }
        if (hostMicIcon) { hostMicIcon.classList.remove('muted', 'fa-microphone-slash'); hostMicIcon.classList.add('fa-microphone'); }
        if (audioRing)   audioRing.classList.add('speaking');
    } else {
        btn.classList.add('muted');
        btn.innerHTML = '<i class="fas fa-microphone-slash"></i><span>Unmute</span>';
        if (micStatus)   { micStatus.innerHTML = '<i class="fas fa-microphone-slash"></i><span>Microphone Muted</span>'; micStatus.classList.add('muted'); }
        if (hostMicIcon) { hostMicIcon.classList.add('muted', 'fa-microphone-slash'); hostMicIcon.classList.remove('fa-microphone'); }
        if (audioRing)   audioRing.classList.remove('speaking');
    }
}

function setupAudioVisualization(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser     = audioContext.createAnalyser();
    const source       = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const audioRing = document.getElementById('hostAudioRing');

    function visualize() {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        if (isMicEnabled && avg > 20) {
            const scale = 1 + (avg / 255) * 0.15;
            if (audioRing) { audioRing.style.transform = `scale(${scale})`; audioRing.style.opacity = 0.6 + (avg / 255) * 0.4; }
        } else {
            if (audioRing) { audioRing.style.transform = 'scale(1)'; audioRing.style.opacity = 0.3; }
        }
        requestAnimationFrame(visualize);
    }
    visualize();
}

// ===== Recording (UI only — host's Record button marks session intent) =====
function toggleRecording() {
    if (!RECORDING_ENABLED) return; // guard: should never be called if disabled
    isRecording = !isRecording;
    const btn             = document.getElementById('btnRecord');
    const recordingStatus = document.getElementById('recordingStatus');

    if (isRecording) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-stop rec-icon"></i><span>Stop</span>';
        if (recordingStatus) recordingStatus.style.display = 'flex';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-circle rec-icon"></i><span>Record</span>';
        if (recordingStatus) recordingStatus.style.display = 'none';
    }
}

// ===== Tab Switching (Participants / Chat / Recordings) =====
function switchTab(tab) {
    currentTab = tab;
    const pContent = document.getElementById('contentParticipants');
    const cContent = document.getElementById('contentChat');
    const rContent = document.getElementById('contentRecordings');
    const pTab     = document.getElementById('tabParticipants');
    const cTab     = document.getElementById('tabChat');
    const rTab     = document.getElementById('tabRecordings');
    const chatBtn  = document.getElementById('btnChat');

    if (pContent) pContent.style.display = tab === 'participants' ? 'flex' : 'none';
    if (cContent) cContent.style.display = tab === 'chat'         ? 'flex' : 'none';
    if (rContent) rContent.style.display = tab === 'recordings'   ? 'flex' : 'none';

    if (pTab) pTab.classList.toggle('panel-tab-active', tab === 'participants');
    if (cTab) cTab.classList.toggle('panel-tab-active', tab === 'chat');
    if (rTab) rTab.classList.toggle('panel-tab-active', tab === 'recordings');

    if (chatBtn) chatBtn.classList.toggle('active', tab === 'chat');

    if (tab === 'chat') {
        chatUnread = 0;
        updateChatBadge();
        scrollChatToBottom();
        const inp = document.getElementById('chatInput');
        if (inp) inp.focus();
    }

    if (tab === 'recordings') {
        recordingUnread = 0;
        const badge = document.getElementById('recordingTabCount');
        if (badge) badge.style.display = 'none';
    }
}

// Keep as toggle so the control-bar Chat button toggles between tabs
function toggleChat() {
    switchTab(currentTab === 'chat' ? 'participants' : 'chat');
}

function updateChatBadge() {
    const badge = document.getElementById('chatBadge');
    if (!badge) return;
    if (chatUnread > 0) {
        badge.textContent = chatUnread > 9 ? '9+' : chatUnread;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

function sendChatMessage() {
    const input   = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;
    if (stompClient && stompClient.connected) {
        stompClient.send('/app/chat/' + MEETING_CODE, {}, JSON.stringify({ content: message }));
    }
    input.value = '';
}

function handleChatMessage(data) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';
    msgDiv.innerHTML = `
        <div class="chat-msg-header">
            <span class="chat-sender">${escapeHtml(data.senderName || data.userName || 'Unknown')}</span>
            <span class="chat-time">${data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="chat-msg-body">${escapeHtml(data.content || data.message || '')}</div>`;
    chatMessages.appendChild(msgDiv);
    scrollChatToBottom();

    if (currentTab !== 'chat') {
        chatUnread++;
        updateChatBadge();
    }
}

function scrollChatToBottom() {
    const c = document.getElementById('chatMessages');
    if (c) c.scrollTop = c.scrollHeight;
}

// ===== Participant list UI =====
function addParticipantToList(userId, userName) {
    const list = document.getElementById('participantsList');
    if (!list) return;
    if (document.querySelector(`.participant-item[data-user-id="${userId}"]`)) return;

    const item = document.createElement('div');
    item.className        = 'participant-item student';
    item.dataset.userId   = userId;
    item.innerHTML = `
        <div class="participant-avatar"><i class="fas fa-user-graduate"></i></div>
        <div class="participant-info">
            <span class="participant-name">${escapeHtml(userName)}</span>
            <span class="participant-status-text"><span class="status-muted">Muted</span></span>
        </div>
        <div class="participant-status">
            <i class="fas fa-microphone-slash status-mic muted"></i>
        </div>`;
    list.appendChild(item);

    // Also add to the top strip
    _addStudentChip(userId, userName);
}

function removeParticipantFromList(userId) {
    const item = document.querySelector(`.participant-item[data-user-id="${userId}"]`);
    if (item) item.remove();
    _removeStudentChip(userId);
}

function updateParticipantMicStatus(userId, enabled) {
    const item = document.querySelector(`.participant-item[data-user-id="${userId}"]`);
    if (!item) return;
    const icon       = item.querySelector('.status-mic');
    const statusText = item.querySelector('.participant-status-text');
    if (enabled) {
        if (icon) { icon.classList.remove('fa-microphone-slash', 'muted'); icon.classList.add('fa-microphone'); }
        if (statusText) statusText.innerHTML = '<span class="status-unmuted">Speaking</span>';
    } else {
        if (icon) { icon.classList.remove('fa-microphone'); icon.classList.add('fa-microphone-slash', 'muted'); }
        if (statusText) statusText.innerHTML = '<span class="status-muted">Muted</span>';
    }
    // Update the chip mic indicator
    const chip = document.querySelector(`.student-chip[data-user-id="${userId}"]`);
    if (chip) {
        const micI = chip.querySelector('.student-chip-mic');
        if (micI) {
            micI.className = 'fas fa-microphone student-chip-mic' + (enabled ? ' speaking' : '-slash student-chip-mic');
        }
    }
}

// ===== Student Strip helpers =====
function _addStudentChip(userId, userName) {
    const strip = document.getElementById('studentStripList');
    const empty = document.getElementById('studentStripEmpty');
    if (!strip) return;
    if (strip.querySelector(`.student-chip[data-user-id="${userId}"]`)) return;
    if (empty) empty.style.display = 'none';

    const initials = userName.trim().split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const chip = document.createElement('div');
    chip.className = 'student-chip';
    chip.dataset.userId = userId;
    chip.innerHTML = `
        <div class="student-chip-avatar">${escapeHtml(initials)}</div>
        <span class="student-chip-name" title="${escapeHtml(userName)}">${escapeHtml(userName)}</span>
        <i class="fas fa-microphone-slash student-chip-mic"></i>`;
    strip.appendChild(chip);
}

function _removeStudentChip(userId) {
    const chip = document.querySelector(`.student-chip[data-user-id="${userId}"]`);
    if (chip) chip.remove();
    const strip = document.getElementById('studentStripList');
    const empty = document.getElementById('studentStripEmpty');
    if (strip && empty && !strip.querySelector('.student-chip')) {
        empty.style.display = '';
    }
}

function updateParticipantCount() {
    const count    = document.querySelectorAll('#participantsList .participant-item').length;
    const headerEl = document.querySelector('#participantCount span');
    const tabBadge = document.getElementById('participantTabCount');
    if (headerEl) headerEl.textContent = count;
    if (tabBadge) tabBadge.textContent = count;
}

function showSpeakingStudent(userId, userName) {
    const speakingNow  = document.getElementById('speakingNow');
    const speakingName = speakingNow ? speakingNow.querySelector('.speaking-name') : null;
    if (speakingNow)  speakingNow.style.display = 'block';
    if (speakingName) speakingName.textContent = userName || '';
}

function hideSpeakingStudent(userId) {
    const speakingNow = document.getElementById('speakingNow');
    if (speakingNow) speakingNow.style.display = 'none';
}

// ===== Toast Notification =====
function showRoomToast(title, message, color) {
    color = color || '#6366f1';
    const toast = document.createElement('div');
    toast.className = 'room-toast';
    toast.style.borderColor = color;
    toast.innerHTML = `
        <div class="room-toast-body">
            <i class="fas fa-circle-dot room-toast-icon" style="color:${color};"></i>
            <div class="room-toast-text">
                <div class="room-toast-title">${escapeHtml(title)}</div>
                <div class="room-toast-msg">${escapeHtml(message)}</div>
            </div>
            <button class="room-toast-close" onclick="this.closest('.room-toast').remove()">✕</button>
        </div>`;
    document.body.appendChild(toast);
    setTimeout(function() {
        toast.style.transition = 'opacity .4s';
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 400);
    }, 6000);
}

// ===== End Meeting modal =====
function endMeeting() {
    document.getElementById('endMeetingOverlay').classList.add('show');
    document.getElementById('endMeetingModal').classList.add('show');
}

function closeEndModal() {
    document.getElementById('endMeetingOverlay').classList.remove('show');
    document.getElementById('endMeetingModal').classList.remove('show');
}

// ===== Timer =====
function startMeetingTimer() {
    const timerEl = document.getElementById('meetingTimer');
    setInterval(function () {
        const elapsed  = Math.floor((Date.now() - meetingStartTime) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        if (timerEl) timerEl.textContent =
            String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }, 1000);
}

// ===== Utility =====
function copyMeetingCode() {
    navigator.clipboard.writeText(MEETING_CODE).then(function () {
        const btn = document.querySelector('.copy-btn');
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => btn.innerHTML = orig, 1500);
    });
}

function toggleSettings() {
    alert('Settings coming soon');
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = String(text || '');
    return d.innerHTML;
}

// ===== Keyboard shortcuts =====
document.addEventListener('keydown', function (e) {
    if (e.key === 'm' || e.key === 'M') {
        if (document.activeElement.tagName !== 'INPUT') toggleMic();
    }
    if (e.key === 'Escape') {
        closeEndModal();
        if (currentTab === 'chat') switchTab('participants');
    }
});

// ===== Cleanup =====
window.addEventListener('beforeunload', function () {
    clearTimeout(_wsReconnectTimer);
    if (stompClient && stompClient.connected) {
        sendParticipantEvent('leave');
        stompClient.send('/app/control/' + MEETING_CODE, {}, JSON.stringify({ event: 'end-meeting' }));
        stompClient.disconnect();
    }
    Object.values(peerConnections).forEach(pc => pc.close());
    if (localStream) localStream.getTracks().forEach(t => t.stop());
});

