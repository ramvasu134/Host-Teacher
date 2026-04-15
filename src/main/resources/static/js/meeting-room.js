/**
 * Meeting Room JavaScript
 * WebRTC + WebSocket Signaling + Recording + Chat + Screen Share
 */

// ===== Configuration =====
const meetingData = document.getElementById('meetingData');
const MEETING_CODE = meetingData.dataset.meetingCode;
const USER_ID = meetingData.dataset.userId;
const USER_NAME = meetingData.dataset.userName;
const IS_HOST = meetingData.dataset.isHost === 'true';
const RECORDING_ENABLED = meetingData.dataset.recordingEnabled === 'true';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// ===== State =====
let localStream = null;
let screenStream = null;
let stompClient = null;
let peerConnections = {};
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let isMicOn = true;
let isCameraOn = true;
let isScreenSharing = false;
let isChatOpen = true;
let isParticipantsOpen = false;
let isHandRaised = false;
let meetingStartTime = Date.now();
let timerInterval = null;

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    initMedia();
    connectWebSocket();
    startTimer();
});

// ===== Media Initialization =====
async function initMedia() {
    try {
        // AUDIO ONLY - No video capture
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        // Show placeholder since no video
        document.getElementById('localPlaceholder').classList.add('active');
    } catch (err) {
        console.error('Mic access denied:', err);
        document.getElementById('localPlaceholder').classList.add('active');
    }
}

// ===== WebSocket Connection =====
let _wsReconnectTimer = null;
let _wsConnecting = false;

function connectWebSocket() {
    if (_wsConnecting) return;
    if (stompClient && stompClient.connected) return;

    _wsConnecting = true;
    if (stompClient) { try { stompClient.disconnect(); } catch(e) {} stompClient = null; }

    const socket = new SockJS('/ws');
    stompClient = Stomp.over(socket);
    stompClient.debug = null; // Disable debug logging

    stompClient.connect({}, (frame) => {
        _wsConnecting = false;
        console.log('WebSocket connected');

        // Subscribe to signaling
        stompClient.subscribe('/topic/signal/' + MEETING_CODE, (message) => {
            handleSignalingMessage(JSON.parse(message.body));
        });

        // Subscribe to chat
        stompClient.subscribe('/topic/chat/' + MEETING_CODE, (message) => {
            displayChatMessage(JSON.parse(message.body));
        });

        // Subscribe to participant events
        stompClient.subscribe('/topic/participant/' + MEETING_CODE, (message) => {
            handleParticipantEvent(JSON.parse(message.body));
        });

        // Subscribe to control events
        stompClient.subscribe('/topic/control/' + MEETING_CODE, (message) => {
            handleControlEvent(JSON.parse(message.body));
        });

        // Announce joining
        sendParticipantEvent('join');

    }, (error) => {
        _wsConnecting = false;
        console.error('WebSocket error:', error);
        if (stompClient) { try { stompClient.disconnect(); } catch(e) {} stompClient = null; }
        clearTimeout(_wsReconnectTimer);
        _wsReconnectTimer = setTimeout(connectWebSocket, 3000);
    });
}

// ===== WebRTC Signaling =====
function handleSignalingMessage(data) {
    const senderId = String(data.senderId);
    if (senderId === String(USER_ID)) return;

    if (data.type === 'offer') {
        handleOffer(senderId, data.senderName, data);
    } else if (data.type === 'answer') {
        handleAnswer(senderId, data);
    } else if (data.type === 'ice-candidate') {
        handleIceCandidate(senderId, data);
    } else if (data.type === 'request-offer') {
        createOffer(senderId);
    }
}

async function createOffer(targetId) {
    const pc = getOrCreatePeerConnection(targetId);

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        stompClient.send('/app/signal/' + MEETING_CODE, {}, JSON.stringify({
            type: 'offer',
            sdp: offer.sdp,
            targetId: targetId
        }));
    } catch (err) {
        console.error('Error creating offer:', err);
    }
}

async function handleOffer(senderId, senderName, data) {
    const pc = getOrCreatePeerConnection(senderId, senderName);

    try {
        await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'offer',
            sdp: data.sdp
        }));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        stompClient.send('/app/signal/' + MEETING_CODE, {}, JSON.stringify({
            type: 'answer',
            sdp: answer.sdp,
            targetId: senderId
        }));
    } catch (err) {
        console.error('Error handling offer:', err);
    }
}

async function handleAnswer(senderId, data) {
    const pc = peerConnections[senderId];
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: data.sdp
            }));
        } catch (err) {
            console.error('Error handling answer:', err);
        }
    }
}

async function handleIceCandidate(senderId, data) {
    const pc = peerConnections[senderId];
    if (pc && data.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error('Error adding ICE candidate:', err);
        }
    }
}

function getOrCreatePeerConnection(peerId, peerName) {
    if (peerConnections[peerId]) return peerConnections[peerId];

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerId] = pc;

    // Add local tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            stompClient.send('/app/signal/' + MEETING_CODE, {}, JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate,
                targetId: peerId
            }));
        }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
        addRemoteVideo(peerId, peerName || 'Participant', event.streams[0]);
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            removeRemoteVideo(peerId);
            delete peerConnections[peerId];
        }
    };

    return pc;
}

// ===== Video Management =====
function addRemoteVideo(peerId, peerName, stream) {
    let tileId = 'tile-' + peerId;
    let existing = document.getElementById(tileId);

    if (existing) {
        existing.querySelector('video').srcObject = stream;
        return;
    }

    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.id = tileId;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsinline = true;
    video.srcObject = stream;

    const label = document.createElement('div');
    label.className = 'video-label';
    label.innerHTML = `<span>${peerName || 'Participant'}</span>`;

    tile.appendChild(video);
    tile.appendChild(label);
    document.getElementById('videoGrid').appendChild(tile);

    updateParticipantCount();
}

function removeRemoteVideo(peerId) {
    const tile = document.getElementById('tile-' + peerId);
    if (tile) {
        tile.remove();
        updateParticipantCount();
    }
}

function updateParticipantCount() {
    const count = document.querySelectorAll('.video-tile').length;
    document.getElementById('participantCount').innerHTML =
        '<i class="fas fa-users me-1"></i>' + count;
}

// ===== Participant Events =====
function sendParticipantEvent(eventType) {
    if (stompClient && stompClient.connected) {
        stompClient.send('/app/participant/' + MEETING_CODE, {}, JSON.stringify({
            event: eventType,
            micEnabled: isMicOn,
            cameraEnabled: isCameraOn,
            handRaised: isHandRaised
        }));
    }
}

function handleParticipantEvent(data) {
    if (String(data.userId) === String(USER_ID)) return;

    if (data.event === 'join') {
        // New participant joined - send them an offer
        createOffer(String(data.userId));
        refreshParticipants();
    } else if (data.event === 'leave') {
        removeRemoteVideo(String(data.userId));
        if (peerConnections[String(data.userId)]) {
            peerConnections[String(data.userId)].close();
            delete peerConnections[String(data.userId)];
        }
        refreshParticipants();
    }
}

function handleControlEvent(data) {
    if (data.event === 'end-meeting') {
        alert('The host has ended the meeting.');
        window.location.href = IS_HOST ? '/host/dashboard' : '/student/dashboard';
    } else if (data.event === 'mute-all' && !IS_HOST) {
        toggleMic(true);
    }
}

// ===== Controls =====
function toggleMic(forceMute) {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            if (forceMute === true) {
                isMicOn = false;
            } else {
                isMicOn = !isMicOn;
            }
            audioTracks[0].enabled = isMicOn;
        }
    }

    const btn = document.getElementById('btnMic');
    if (isMicOn) {
        btn.classList.remove('muted');
        btn.querySelector('i').className = 'fas fa-microphone';
    } else {
        btn.classList.add('muted');
        btn.querySelector('i').className = 'fas fa-microphone-slash';
    }
    sendParticipantEvent('mic-toggle');
}

function toggleCamera() {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            isCameraOn = !isCameraOn;
            videoTracks[0].enabled = isCameraOn;
        }
    }

    const btn = document.getElementById('btnCamera');
    const placeholder = document.getElementById('localPlaceholder');
    if (isCameraOn) {
        btn.classList.remove('muted');
        btn.querySelector('i').className = 'fas fa-video';
        placeholder.classList.remove('active');
    } else {
        btn.classList.add('muted');
        btn.querySelector('i').className = 'fas fa-video-slash';
        placeholder.classList.add('active');
    }
    sendParticipantEvent('camera-toggle');
}

async function toggleScreenShare() {
    const btn = document.getElementById('btnScreenShare');
    const screenView = document.getElementById('screenShareView');
    const screenVideo = document.getElementById('screenShareVideo');

    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: true
            });

            screenVideo.srcObject = screenStream;
            screenView.style.display = 'block';
            isScreenSharing = true;
            btn.classList.add('active');

            // Replace video track in peer connections
            const screenTrack = screenStream.getVideoTracks()[0];
            Object.values(peerConnections).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            });

            // Handle user stopping screen share via browser UI
            screenTrack.onended = () => stopScreenShare();

        } catch (err) {
            console.error('Screen share error:', err);
        }
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    const btn = document.getElementById('btnScreenShare');
    const screenView = document.getElementById('screenShareView');

    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
    }

    screenView.style.display = 'none';
    isScreenSharing = false;
    if (btn) btn.classList.remove('active');

    // Restore camera track
    if (localStream) {
        const cameraTrack = localStream.getVideoTracks()[0];
        if (cameraTrack) {
            Object.values(peerConnections).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(cameraTrack);
            });
        }
    }
}

// ===== Recording =====
function toggleRecording() {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
}

function startRecording() {
    recordedChunks = [];

    // Capture all audio + video from the page
    const videoArea = document.getElementById('videoArea');
    let streamToRecord;

    try {
        // Try to capture canvas/stream
        if (localStream) {
            // Record local stream + audio
            streamToRecord = localStream;
        }
    } catch (e) {
        console.warn('Could not create combined stream:', e);
    }

    if (!streamToRecord && localStream) {
        streamToRecord = localStream;
    }

    if (!streamToRecord) {
        alert('No media available to record');
        return;
    }

    try {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
                ? 'video/webm;codecs=vp8,opus'
                : 'video/webm';

        mediaRecorder = new MediaRecorder(streamToRecord, {
            mimeType: mimeType,
            videoBitsPerSecond: 2500000
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            uploadRecording();
        };

        mediaRecorder.start(1000); // Collect data every second
        isRecording = true;

        const btn = document.getElementById('btnRecord');
        btn.classList.add('recording');
        btn.querySelector('span').textContent = 'Stop';

        console.log('Recording started');
    } catch (err) {
        console.error('Recording error:', err);
        alert('Could not start recording: ' + err.message);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    isRecording = false;
    const btn = document.getElementById('btnRecord');
    if (btn) {
        btn.classList.remove('recording');
        btn.querySelector('span').textContent = 'Record';
    }
    console.log('Recording stopped');
}

function uploadRecording() {
    if (recordedChunks.length === 0) return;

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const formData = new FormData();
    const fileName = 'recording_' + MEETING_CODE + '_' + Date.now() + '.webm';
    formData.append('file', blob, fileName);
    formData.append('duration', Math.floor((Date.now() - meetingStartTime) / 1000));

    fetch('/api/meeting/' + MEETING_CODE + '/recording/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Recording uploaded:', data.recordingId);
            displaySystemMessage('Recording saved successfully');
        } else {
            console.error('Upload failed:', data.error);
        }
    })
    .catch(err => {
        console.error('Upload error:', err);
        // Fallback: download locally
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    });

    recordedChunks = [];
}

// ===== Chat =====
function toggleChat() {
    const panel = document.getElementById('chatPanel');
    isChatOpen = !isChatOpen;
    panel.style.display = isChatOpen ? 'flex' : 'none';

    const btn = document.getElementById('btnChat');
    if (btn) {
        if (isChatOpen) btn.classList.add('active');
        else btn.classList.remove('active');
    }

    // Close participants panel if open
    if (isChatOpen && isParticipantsOpen) {
        toggleParticipants();
    }
}

function toggleParticipants() {
    const panel = document.getElementById('participantsPanel');
    isParticipantsOpen = !isParticipantsOpen;
    panel.style.display = isParticipantsOpen ? 'flex' : 'none';

    const btn = document.getElementById('btnParticipants');
    if (btn) {
        if (isParticipantsOpen) btn.classList.add('active');
        else btn.classList.remove('active');
    }

    // Close chat if open
    if (isParticipantsOpen && isChatOpen) {
        toggleChat();
    }

    if (isParticipantsOpen) refreshParticipants();
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    if (!content || !stompClient || !stompClient.connected) return;

    stompClient.send('/app/chat/' + MEETING_CODE, {}, JSON.stringify({
        content: content
    }));

    input.value = '';
}

function displayChatMessage(data) {
    const container = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';
    msgDiv.innerHTML = `
        <div class="chat-msg-header">
            <span class="chat-sender">${escapeHtml(data.senderName)}${data.role === 'HOST' ? ' <span class="host-badge" style="background:#4f46e5;color:white;padding:1px 5px;border-radius:3px;font-size:9px;">HOST</span>' : ''}</span>
            <span class="chat-time">${data.timestamp || ''}</span>
        </div>
        <div class="chat-msg-body">${escapeHtml(data.content)}</div>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function displaySystemMessage(text) {
    const container = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';
    msgDiv.style.background = 'rgba(34, 197, 94, 0.1)';
    msgDiv.innerHTML = `<div class="chat-msg-body" style="color:#86efac;font-size:12px;"><i class="fas fa-info-circle me-1"></i>${escapeHtml(text)}</div>`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

// ===== Hand Raise =====
function toggleHandRaise() {
    isHandRaised = !isHandRaised;
    const btn = document.getElementById('btnHandRaise');
    if (isHandRaised) {
        btn.classList.add('active');
        btn.style.background = '#f59e0b';
    } else {
        btn.classList.remove('active');
        btn.style.background = '';
    }
    sendParticipantEvent('hand-raise');
}

// ===== Leave / End Meeting =====
function leaveMeeting() {
    if (confirm('Are you sure you want to leave the meeting?')) {
        cleanup();
        // Submit leave form
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/meeting/leave/' + MEETING_CODE;

        // CSRF token
        const csrfMeta = document.querySelector('meta[name="_csrf"]');
        if (csrfMeta) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = '_csrf';
            input.value = csrfMeta.content;
            form.appendChild(input);
        }

        document.body.appendChild(form);
        form.submit();
    }
}

function endMeeting() {
    if (confirm('End meeting for all participants?')) {
        // Notify all participants
        if (stompClient && stompClient.connected) {
            stompClient.send('/app/control/' + MEETING_CODE, {}, JSON.stringify({
                event: 'end-meeting'
            }));
        }

        if (isRecording) stopRecording();

        cleanup();
        document.getElementById('endMeetingForm').submit();
    }
}

function cleanup() {
    sendParticipantEvent('leave');
    // Cancel any pending reconnect timer
    clearTimeout(_wsReconnectTimer);

    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
    }
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
    }

    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    if (stompClient) stompClient.disconnect();
    if (timerInterval) clearInterval(timerInterval);
}

// ===== Refresh Participants =====
function refreshParticipants() {
    fetch('/api/meeting/' + MEETING_CODE + '/participants')
        .then(res => res.json())
        .then(participants => {
            const list = document.getElementById('participantsList');
            list.innerHTML = '';
            participants.forEach(p => {
                const item = document.createElement('div');
                item.className = 'participant-item';
                item.innerHTML = `
                    <div class="participant-avatar">
                        <i class="fas ${p.role === 'HOST' ? 'fa-user-tie' : 'fa-user-graduate'}"></i>
                    </div>
                    <div class="participant-info">
                        <span class="participant-name">${escapeHtml(p.displayName)}</span>
                        <span class="participant-role">${p.role}</span>
                    </div>
                    <div class="participant-controls">
                        <i class="fas fa-microphone${p.micEnabled ? '' : '-slash text-danger'}"></i>
                        <i class="fas fa-video${p.cameraEnabled ? '' : '-slash text-danger'}"></i>
                        ${p.handRaised ? '<i class="fas fa-hand-paper" style="color:#f59e0b;"></i>' : ''}
                    </div>
                `;
                list.appendChild(item);
            });
            updateParticipantCount();
        })
        .catch(err => console.error('Error refreshing participants:', err));
}

// ===== Timer =====
function startTimer() {
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - meetingStartTime;
        const hours = Math.floor(elapsed / 3600000).toString().padStart(2, '0');
        const minutes = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
        const seconds = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
        document.getElementById('meetingTimer').textContent = hours + ':' + minutes + ':' + seconds;
    }, 1000);
}

// ===== Utility =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'm' || e.key === 'M') toggleMic();
    if (e.key === 'v' || e.key === 'V') toggleCamera();
    if (e.key === 'h' || e.key === 'H') toggleHandRaise();
    if (e.key === 'c' || e.key === 'C') toggleChat();
});

// ===== Page Unload =====
window.addEventListener('beforeunload', (e) => {
    cleanup();
});

