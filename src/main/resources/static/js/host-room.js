// ===== Host Meeting Room JavaScript - AiR Voices =====

// Get meeting data from DOM
const meetingData = document.getElementById('meetingData');
const MEETING_CODE = meetingData ? meetingData.dataset.meetingCode : '';
const MEETING_ID = meetingData ? meetingData.dataset.meetingId : '';
const USER_ID = meetingData ? meetingData.dataset.userId : '';
const USER_NAME = meetingData ? meetingData.dataset.userName : '';
const IS_HOST = true;
const RECORDING_ENABLED = meetingData ? meetingData.dataset.recordingEnabled === 'true' : false;

// State
let stompClient = null;
let localStream = null;
let isMicEnabled = true;
let isRecording = false;
let isChatOpen = false;
let meetingStartTime = Date.now();

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initWebSocket();
    initAudio();
    startMeetingTimer();
});

// ===== WebSocket Connection =====
function initWebSocket() {
    const socket = new SockJS('/ws');
    stompClient = Stomp.over(socket);
    stompClient.debug = null; // Disable debug logs

    stompClient.connect({}, function(frame) {
        console.log('Connected to WebSocket');

        // Subscribe to meeting updates
        stompClient.subscribe('/topic/meeting/' + MEETING_CODE, function(message) {
            handleMeetingUpdate(JSON.parse(message.body));
        });

        // Subscribe to chat messages
        stompClient.subscribe('/topic/chat/' + MEETING_CODE, function(message) {
            handleChatMessage(JSON.parse(message.body));
        });

        // Notify that host joined
        stompClient.send('/app/meeting/join', {}, JSON.stringify({
            meetingCode: MEETING_CODE,
            userId: USER_ID,
            userName: USER_NAME,
            isHost: true
        }));
    }, function(error) {
        console.error('WebSocket connection error:', error);
        setTimeout(initWebSocket, 5000); // Reconnect after 5s
    });
}

// ===== Audio =====
function initAudio() {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(function(stream) {
            localStream = stream;
            updateMicUI(true);
            setupAudioVisualization(stream);
        })
        .catch(function(error) {
            console.error('Error accessing microphone:', error);
            updateMicUI(false);
        });
}

function toggleMic() {
    if (!localStream) return;

    isMicEnabled = !isMicEnabled;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = isMicEnabled;
    });

    updateMicUI(isMicEnabled);

    // Broadcast mic status
    if (stompClient && stompClient.connected) {
        stompClient.send('/app/meeting/mic', {}, JSON.stringify({
            meetingCode: MEETING_CODE,
            userId: USER_ID,
            micEnabled: isMicEnabled
        }));
    }
}

function updateMicUI(enabled) {
    const btn = document.getElementById('btnMic');
    const micStatus = document.getElementById('micStatus');
    const hostMicIcon = document.getElementById('hostMicIcon');
    const audioRing = document.getElementById('hostAudioRing');

    if (enabled) {
        btn.classList.remove('muted');
        btn.innerHTML = '<i class="fas fa-microphone"></i><span>Mic</span>';
        micStatus.innerHTML = '<i class="fas fa-microphone"></i><span>Microphone Active</span>';
        micStatus.classList.remove('muted');
        hostMicIcon.classList.remove('muted');
        hostMicIcon.classList.remove('fa-microphone-slash');
        hostMicIcon.classList.add('fa-microphone');
        audioRing.classList.add('speaking');
    } else {
        btn.classList.add('muted');
        btn.innerHTML = '<i class="fas fa-microphone-slash"></i><span>Unmute</span>';
        micStatus.innerHTML = '<i class="fas fa-microphone-slash"></i><span>Microphone Muted</span>';
        micStatus.classList.add('muted');
        hostMicIcon.classList.add('muted');
        hostMicIcon.classList.remove('fa-microphone');
        hostMicIcon.classList.add('fa-microphone-slash');
        audioRing.classList.remove('speaking');
    }
}

function setupAudioVisualization(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const audioRing = document.getElementById('hostAudioRing');

    function visualize() {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (isMicEnabled && average > 20) {
            const scale = 1 + (average / 255) * 0.15;
            audioRing.style.transform = `scale(${scale})`;
            audioRing.style.opacity = 0.6 + (average / 255) * 0.4;
        } else {
            audioRing.style.transform = 'scale(1)';
            audioRing.style.opacity = 0.3;
        }

        requestAnimationFrame(visualize);
    }

    visualize();
}

// ===== Recording =====
function toggleRecording() {
    isRecording = !isRecording;

    const btn = document.getElementById('btnRecord');
    const recordingStatus = document.getElementById('recordingStatus');

    if (isRecording) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-stop rec-icon"></i><span>Stop</span>';
        recordingStatus.style.display = 'flex';

        // Notify server to start recording
        if (stompClient && stompClient.connected) {
            stompClient.send('/app/meeting/recording/start', {}, JSON.stringify({
                meetingCode: MEETING_CODE,
                userId: USER_ID
            }));
        }
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-circle rec-icon"></i><span>Record</span>';
        recordingStatus.style.display = 'none';

        // Notify server to stop recording
        if (stompClient && stompClient.connected) {
            stompClient.send('/app/meeting/recording/stop', {}, JSON.stringify({
                meetingCode: MEETING_CODE,
                userId: USER_ID
            }));
        }
    }
}

// ===== Chat =====
function toggleChat() {
    const chatPanel = document.getElementById('chatPanel');
    const btn = document.getElementById('btnChat');

    isChatOpen = !isChatOpen;
    chatPanel.style.display = isChatOpen ? 'flex' : 'none';

    if (isChatOpen) {
        btn.classList.add('active');
        scrollChatToBottom();
    } else {
        btn.classList.remove('active');
    }
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message) return;

    if (stompClient && stompClient.connected) {
        stompClient.send('/app/chat/send', {}, JSON.stringify({
            meetingCode: MEETING_CODE,
            senderId: USER_ID,
            senderName: USER_NAME,
            message: message
        }));
    }

    input.value = '';
}

function handleChatMessage(data) {
    const chatMessages = document.getElementById('chatMessages');

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';
    msgDiv.innerHTML = `
        <div class="chat-msg-header">
            <span class="chat-sender">${escapeHtml(data.senderName)}</span>
            <span class="chat-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
        </div>
        <div class="chat-msg-body">${escapeHtml(data.message)}</div>
    `;

    chatMessages.appendChild(msgDiv);
    scrollChatToBottom();
}

function scrollChatToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ===== Meeting Updates =====
function handleMeetingUpdate(data) {
    if (data.type === 'PARTICIPANT_JOINED') {
        addParticipantToList(data.userId, data.userName, false);
        updateParticipantCount();
    } else if (data.type === 'PARTICIPANT_LEFT') {
        removeParticipantFromList(data.userId);
        updateParticipantCount();
    } else if (data.type === 'MIC_STATUS') {
        updateParticipantMicStatus(data.userId, data.micEnabled);
        if (data.micEnabled && data.userId !== USER_ID) {
            showSpeakingStudent(data.userId, data.userName);
        } else if (!data.micEnabled) {
            hideSpeakingStudent(data.userId);
        }
    } else if (data.type === 'MEETING_ENDED') {
        window.location.href = '/host/dashboard';
    }
}

function addParticipantToList(userId, userName, isHost) {
    const list = document.getElementById('participantsList');

    // Check if already exists
    if (document.querySelector(`.participant-item[data-user-id="${userId}"]`)) {
        return;
    }

    const item = document.createElement('div');
    item.className = 'participant-item student';
    item.dataset.userId = userId;
    item.innerHTML = `
        <div class="participant-avatar">
            <i class="fas fa-user-graduate"></i>
        </div>
        <div class="participant-info">
            <span class="participant-name">${escapeHtml(userName)}</span>
            <span class="participant-status-text">
                <span class="status-muted">Muted</span>
            </span>
        </div>
        <div class="participant-status">
            <i class="fas fa-microphone-slash status-mic muted"></i>
        </div>
    `;

    list.appendChild(item);
}

function removeParticipantFromList(userId) {
    const item = document.querySelector(`.participant-item[data-user-id="${userId}"]`);
    if (item) {
        item.remove();
    }
}

function updateParticipantMicStatus(userId, enabled) {
    const item = document.querySelector(`.participant-item[data-user-id="${userId}"]`);
    if (!item) return;

    const icon = item.querySelector('.status-mic');
    const statusText = item.querySelector('.participant-status-text');

    if (enabled) {
        icon.classList.remove('fa-microphone-slash', 'muted');
        icon.classList.add('fa-microphone');
        statusText.innerHTML = '<span class="status-unmuted">Speaking</span>';
    } else {
        icon.classList.remove('fa-microphone');
        icon.classList.add('fa-microphone-slash', 'muted');
        statusText.innerHTML = '<span class="status-muted">Muted</span>';
    }
}

function updateParticipantCount() {
    const count = document.querySelectorAll('.participant-item').length;
    document.querySelector('#participantCount span').textContent = count;
    document.querySelector('.participant-badge').textContent = count;
}

function showSpeakingStudent(userId, userName) {
    const speakingNow = document.getElementById('speakingNow');
    const speakingName = speakingNow.querySelector('.speaking-name');

    speakingNow.style.display = 'block';
    speakingName.textContent = userName;
}

function hideSpeakingStudent(userId) {
    const speakingNow = document.getElementById('speakingNow');
    speakingNow.style.display = 'none';
}

// ===== End Meeting =====
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

    setInterval(function() {
        const elapsed = Math.floor((Date.now() - meetingStartTime) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;

        timerEl.textContent =
            String(hours).padStart(2, '0') + ':' +
            String(minutes).padStart(2, '0') + ':' +
            String(seconds).padStart(2, '0');
    }, 1000);
}

// ===== Utility Functions =====
function copyMeetingCode() {
    navigator.clipboard.writeText(MEETING_CODE).then(function() {
        // Show brief feedback
        const btn = document.querySelector('.copy-btn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => btn.innerHTML = originalHTML, 1500);
    });
}

function toggleSettings() {
    // Future settings panel
    alert('Settings coming soon');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', function(event) {
    // M to toggle mic
    if (event.key === 'm' || event.key === 'M') {
        if (document.activeElement.tagName !== 'INPUT') {
            toggleMic();
        }
    }
    // Escape to close modals
    if (event.key === 'Escape') {
        closeEndModal();
        if (isChatOpen) toggleChat();
    }
});

// ===== Cleanup =====
window.addEventListener('beforeunload', function() {
    if (stompClient && stompClient.connected) {
        stompClient.send('/app/meeting/leave', {}, JSON.stringify({
            meetingCode: MEETING_CODE,
            userId: USER_ID
        }));
        stompClient.disconnect();
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
});

