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
let currentTab     = 'participants'; // 'participants' | 'chat'
let chatUnread     = 0;
let meetingStartTime = Date.now();

// ===== Boot =====
document.addEventListener('DOMContentLoaded', function () {
    initAudio();
    startMeetingTimer();
});

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
        await drainCandidates(sid);          // flush any queued ICE candidates
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
            await drainCandidates(sid);      // flush any queued ICE candidates
        } catch (e) { console.error('handleAnswer error:', e); }
    }
}

async function handleIce(sid, data) {
    const pc = peerConnections[sid];
    if (!pc || !data.candidate) return;
    // If remote description not set yet, queue to apply later
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

// ===== Recording =====
function toggleRecording() {
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

// ===== Tab Switching (Participants / Chat) =====
function switchTab(tab) {
    currentTab = tab;
    const pContent = document.getElementById('contentParticipants');
    const cContent = document.getElementById('contentChat');
    const pTab     = document.getElementById('tabParticipants');
    const cTab     = document.getElementById('tabChat');
    const chatBtn  = document.getElementById('btnChat');

    if (pContent) pContent.style.display = tab === 'participants' ? 'flex' : 'none';
    if (cContent) cContent.style.display = tab === 'chat'         ? 'flex' : 'none';
    if (pTab)  pTab.classList.toggle('panel-tab-active', tab === 'participants');
    if (cTab)  cTab.classList.toggle('panel-tab-active', tab === 'chat');
    if (chatBtn) chatBtn.classList.toggle('active', tab === 'chat');

    if (tab === 'chat') {
        chatUnread = 0;
        updateChatBadge();
        scrollChatToBottom();
        const inp = document.getElementById('chatInput');
        if (inp) inp.focus();
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

    // Show unread badge when chat tab is not active
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
}

function removeParticipantFromList(userId) {
    const item = document.querySelector(`.participant-item[data-user-id="${userId}"]`);
    if (item) item.remove();
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
    d.textContent = text;
    return d.innerHTML;
}

// ===== Keyboard shortcuts =====
document.addEventListener('keydown', function (e) {
    if (e.key === 'm' || e.key === 'M') {
        if (document.activeElement.tagName !== 'INPUT') toggleMic();
    }
    if (e.key === 'Escape') {
        closeEndModal();
        if (isChatOpen) toggleChat();
    }
});

// ===== Cleanup =====
window.addEventListener('beforeunload', function () {
    // Cancel any pending reconnect
    clearTimeout(_wsReconnectTimer);
    // Notify students host is leaving
    if (stompClient && stompClient.connected) {
        sendParticipantEvent('leave');
        stompClient.send('/app/control/' + MEETING_CODE, {}, JSON.stringify({ event: 'end-meeting' }));
        stompClient.disconnect();
    }
    // Close all peer connections
    Object.values(peerConnections).forEach(pc => pc.close());
    if (localStream) localStream.getTracks().forEach(t => t.stop());
});

