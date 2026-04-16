package com.host.studen.controller.api;

import com.host.studen.model.Meeting;
import com.host.studen.model.MeetingParticipant;
import com.host.studen.model.Recording;
import com.host.studen.model.User;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.MeetingService;
import com.host.studen.service.RecordingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/meeting")
public class MeetingApiController {

    @Autowired
    private MeetingService meetingService;

    @Autowired
    private RecordingService recordingService;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @GetMapping("/{meetingCode}/participants")
    public ResponseEntity<List<Map<String, Object>>> getParticipants(@PathVariable String meetingCode) {
        Meeting meeting = meetingService.findByMeetingCode(meetingCode)
                .orElseThrow(() -> new RuntimeException("Meeting not found"));

        List<MeetingParticipant> participants = meetingService.getActiveParticipants(meeting);
        List<Map<String, Object>> result = participants.stream()
                .map(p -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", p.getUser().getId());
                    map.put("displayName", p.getUser().getDisplayName());
                    map.put("role", p.getRoleInMeeting().name());
                    map.put("micEnabled", p.isMicEnabled());
                    map.put("cameraEnabled", p.isCameraEnabled());
                    map.put("handRaised", p.isHandRaised());
                    return map;
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    @GetMapping("/{meetingCode}/info")
    public ResponseEntity<Map<String, Object>> getMeetingInfo(@PathVariable String meetingCode) {
        Meeting meeting = meetingService.findByMeetingCode(meetingCode)
                .orElseThrow(() -> new RuntimeException("Meeting not found"));

        Map<String, Object> info = new HashMap<>();
        info.put("id", meeting.getId());
        info.put("title", meeting.getTitle());
        info.put("meetingCode", meeting.getMeetingCode());
        info.put("status", meeting.getStatus().name());
        info.put("hostName", meeting.getHost().getDisplayName());
        info.put("participantCount", meetingService.getActiveParticipantCount(meeting));
        info.put("recordingEnabled", meeting.isRecordingEnabled());
        info.put("chatEnabled", meeting.isChatEnabled());
        info.put("screenShareEnabled", meeting.isScreenShareEnabled());

        return ResponseEntity.ok(info);
    }

    @PostMapping("/{meetingCode}/recording/upload")
    public ResponseEntity<Map<String, Object>> uploadRecording(
            @PathVariable String meetingCode,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "duration", defaultValue = "0") long duration,
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            Meeting meeting = meetingService.findByMeetingCode(meetingCode)
                    .orElseThrow(() -> new RuntimeException("Meeting not found"));

            // Guard: only save if meeting has recording enabled
            if (!meeting.isRecordingEnabled()) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Recording is disabled for this meeting");
                return ResponseEntity.badRequest().body(response);
            }

            User user = userDetails.getUser();
            Recording recording = recordingService.saveRecording(file, meeting, user, duration);

            // ── Notify teacher via WebSocket so they see it instantly ──
            Map<String, Object> wsPayload = new HashMap<>();
            wsPayload.put("success", true);
            wsPayload.put("event", "recording_saved");
            wsPayload.put("recordingId", recording.getId());
            wsPayload.put("fileName", recording.getFileName());
            wsPayload.put("duration", duration);
            wsPayload.put("userName", user.getDisplayName());
            wsPayload.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            messagingTemplate.convertAndSend("/topic/recording/" + meetingCode, wsPayload);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("recordingId", recording.getId());
            response.put("fileName", recording.getFileName());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @GetMapping("/recording/{id}/download")
    public ResponseEntity<Resource> downloadRecording(@PathVariable Long id) {
        try {
            Recording recording = recordingService.findById(id)
                    .orElseThrow(() -> new RuntimeException("Recording not found"));

            Path filePath = recordingService.getRecordingPath(recording);
            Resource resource = new UrlResource(filePath.toUri());

            if (!resource.exists()) {
                return ResponseEntity.notFound().build();
            }

            String contentType = recording.getContentType() != null ? recording.getContentType() : "application/octet-stream";

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + recording.getFileName() + "\"")
                    .body(resource);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/recording/{id}/play")
    public ResponseEntity<Resource> playRecording(@PathVariable Long id) {
        try {
            Recording recording = recordingService.findById(id)
                    .orElseThrow(() -> new RuntimeException("Recording not found"));

            Path filePath = recordingService.getRecordingPath(recording);
            Resource resource = new UrlResource(filePath.toUri());

            if (!resource.exists()) {
                return ResponseEntity.notFound().build();
            }

            String contentType = recording.getContentType() != null ? recording.getContentType() : "video/webm";

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "inline; filename=\"" + recording.getFileName() + "\"")
                    .body(resource);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/recording/{id}")
    public ResponseEntity<Map<String, Object>> deleteRecording(@PathVariable Long id) {
        try {
            recordingService.deleteRecording(id);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Recording deleted successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
}

