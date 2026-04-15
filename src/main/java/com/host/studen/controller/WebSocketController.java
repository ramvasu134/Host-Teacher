package com.host.studen.controller;

import com.host.studen.model.ChatMessage;
import com.host.studen.model.Meeting;
import com.host.studen.model.Recording;
import com.host.studen.model.User;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.ChatService;
import com.host.studen.service.MeetingService;
import com.host.studen.service.RecordingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Controller
public class WebSocketController {

    private static final Logger log = LoggerFactory.getLogger(WebSocketController.class);

    @Autowired
    private MeetingService meetingService;

    @Autowired
    private ChatService chatService;

    @Autowired
    private RecordingService recordingService;

    // WebRTC Signaling
    @MessageMapping("/signal/{meetingCode}")
    @SendTo("/topic/signal/{meetingCode}")
    public Map<String, Object> handleSignal(@DestinationVariable String meetingCode,
                                            Map<String, Object> signal,
                                            SimpMessageHeaderAccessor headerAccessor) {
        Authentication auth = (Authentication) headerAccessor.getUser();
        if (auth != null) {
            CustomUserDetails userDetails = (CustomUserDetails) auth.getPrincipal();
            signal.put("senderId", userDetails.getUserId());
            signal.put("senderName", userDetails.getDisplayName());
        }
        return signal;
    }

    // Chat Messages
    @MessageMapping("/chat/{meetingCode}")
    @SendTo("/topic/chat/{meetingCode}")
    public Map<String, Object> handleChat(@DestinationVariable String meetingCode,
                                          Map<String, Object> message,
                                          SimpMessageHeaderAccessor headerAccessor) {
        Authentication auth = (Authentication) headerAccessor.getUser();
        Map<String, Object> response = new HashMap<>();

        if (auth != null) {
            CustomUserDetails userDetails = (CustomUserDetails) auth.getPrincipal();
            User user = userDetails.getUser();

            // Save to database (only if content is non-null and non-empty)
            String content = (String) message.get("content");
            Meeting meeting = meetingService.findByMeetingCode(meetingCode).orElse(null);
            if (meeting != null && content != null && !content.trim().isEmpty()) {
                chatService.saveMessage(meeting, user, content);
            }

            response.put("senderId", userDetails.getUserId());
            response.put("senderName", userDetails.getDisplayName());
            response.put("role", userDetails.getRole());
            response.put("content", message.get("content"));
            response.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm")));
        }

        return response;
    }

    // Participant Events (join, leave, mic toggle, camera toggle, hand raise)
    @MessageMapping("/participant/{meetingCode}")
    @SendTo("/topic/participant/{meetingCode}")
    public Map<String, Object> handleParticipantEvent(@DestinationVariable String meetingCode,
                                                       Map<String, Object> event,
                                                       SimpMessageHeaderAccessor headerAccessor) {
        Authentication auth = (Authentication) headerAccessor.getUser();
        if (auth != null) {
            CustomUserDetails userDetails = (CustomUserDetails) auth.getPrincipal();
            event.put("userId", userDetails.getUserId());
            event.put("userName", userDetails.getDisplayName());
            event.put("userRole", userDetails.getRole());
        }
        return event;
    }

    // Meeting Control Events (mute all, end meeting, etc.)
    @MessageMapping("/control/{meetingCode}")
    @SendTo("/topic/control/{meetingCode}")
    public Map<String, Object> handleControlEvent(@DestinationVariable String meetingCode,
                                                   Map<String, Object> event,
                                                   SimpMessageHeaderAccessor headerAccessor) {
        Authentication auth = (Authentication) headerAccessor.getUser();
        if (auth != null) {
            CustomUserDetails userDetails = (CustomUserDetails) auth.getPrincipal();
            event.put("issuedBy", userDetails.getUserId());
            event.put("issuedByName", userDetails.getDisplayName());
        }
        return event;
    }

    /**
     * Auto-save recording endpoint - called when student stops speaking
     * Recordings are automatically saved without user confirmation
     */
    @MessageMapping("/recording/{meetingCode}")
    @SendTo("/topic/recording/{meetingCode}")
    public Map<String, Object> handleRecording(@DestinationVariable String meetingCode,
                                               Map<String, Object> recordingData,
                                               SimpMessageHeaderAccessor headerAccessor) {
        Map<String, Object> response = new HashMap<>();
        
        try {
            Authentication auth = (Authentication) headerAccessor.getUser();
            if (auth == null) {
                response.put("success", false);
                response.put("error", "Not authenticated");
                return response;
            }

            CustomUserDetails userDetails = (CustomUserDetails) auth.getPrincipal();
            User user = userDetails.getUser();

            Meeting meeting = meetingService.findByMeetingCode(meetingCode).orElse(null);
            if (meeting == null) {
                response.put("success", false);
                response.put("error", "Meeting not found");
                return response;
            }

            // Extract recording data
            String audioBase64 = (String) recordingData.get("audioData");
            long durationSeconds = recordingData.containsKey("duration") 
                    ? ((Number) recordingData.get("duration")).longValue() 
                    : 0;
            String contentType = (String) recordingData.getOrDefault("contentType", "audio/webm");

            if (audioBase64 == null || audioBase64.isEmpty()) {
                response.put("success", false);
                response.put("error", "No audio data provided");
                return response;
            }

            // Decode base64 audio data
            byte[] audioBytes = Base64.getDecoder().decode(audioBase64);

            // Auto-save recording (no confirmation needed)
            Recording savedRecording = recordingService.saveRecordingFromBytes(
                    audioBytes, meeting, user, durationSeconds, contentType);

            log.info("Auto-saved recording for user {} in meeting {}: {} ({} seconds)", 
                    user.getDisplayName(), meetingCode, savedRecording.getId(), durationSeconds);

            response.put("success", true);
            response.put("recordingId", savedRecording.getId());
            response.put("fileName", savedRecording.getFileName());
            response.put("duration", durationSeconds);
            response.put("userName", user.getDisplayName());
            response.put("event", "recording_saved");
            response.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));

        } catch (Exception e) {
            log.error("Error auto-saving recording: {}", e.getMessage(), e);
            response.put("success", false);
            response.put("error", "Failed to save recording: " + e.getMessage());
        }

        return response;
    }
}

