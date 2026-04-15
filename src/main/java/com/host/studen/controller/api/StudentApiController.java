package com.host.studen.controller.api;

import com.host.studen.model.*;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/student")
public class StudentApiController {

    @Autowired
    private MeetingService meetingService;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private ScheduleService scheduleService;

    @Autowired
    private TranscriptService transcriptService;

    @Autowired
    private RecordingService recordingService;

    /**
     * Returns currently LIVE meetings for the student's teacher only.
     * Used by the student lobby page to poll for active meetings (auto-join).
     */
    @GetMapping("/live-meetings")
    public ResponseEntity<List<Map<String, Object>>> getLiveMeetings(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        List<Meeting> live = meetingService.findLiveMeetings();
        String studentTeacherName = (userDetails != null) ? userDetails.getUser().getTeacherName() : null;
        List<Map<String, Object>> result = new ArrayList<>();
        for (Meeting m : live) {
            // Only show meetings that belong to the student's teacher
            if (studentTeacherName == null ||
                    m.getHost().getTeacherName().equals(studentTeacherName)) {
                Map<String, Object> item = new HashMap<>();
                item.put("meetingCode", m.getMeetingCode());
                item.put("title", m.getTitle());
                result.add(item);
            }
        }
        return ResponseEntity.ok(result);
    }

    // ===== Notification Endpoints =====

    @GetMapping("/notifications")
    public ResponseEntity<?> getNotifications(@AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            User student = userDetails.getUser();
            List<Notification> notifications = notificationService.findByUser(student);
            List<Map<String, Object>> result = notifications.stream().map(n -> {
                Map<String, Object> item = new HashMap<>();
                item.put("id", n.getId());
                item.put("title", n.getTitle());
                item.put("message", n.getMessage());
                item.put("type", n.getType().name());
                item.put("read", n.isRead());
                item.put("actionUrl", n.getActionUrl());
                item.put("createdAt", n.getCreatedAt().toString());
                return item;
            }).collect(Collectors.toList());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @GetMapping("/notifications/unread")
    public ResponseEntity<?> getUnreadNotifications(@AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            User student = userDetails.getUser();
            List<Notification> notifications = notificationService.findUnreadByUser(student);
            List<Map<String, Object>> result = notifications.stream().map(n -> {
                Map<String, Object> item = new HashMap<>();
                item.put("id", n.getId());
                item.put("title", n.getTitle());
                item.put("message", n.getMessage());
                item.put("type", n.getType().name());
                item.put("actionUrl", n.getActionUrl());
                item.put("createdAt", n.getCreatedAt().toString());
                return item;
            }).collect(Collectors.toList());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @GetMapping("/notifications/count")
    public ResponseEntity<?> getUnreadCount(@AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            User student = userDetails.getUser();
            long count = notificationService.countUnread(student);
            return ResponseEntity.ok(Map.of("count", count));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @PostMapping("/notifications/{id}/read")
    public ResponseEntity<?> markAsRead(@PathVariable Long id) {
        try {
            notificationService.markAsRead(id);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @PostMapping("/notifications/read-all")
    public ResponseEntity<?> markAllAsRead(@AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            User student = userDetails.getUser();
            notificationService.markAllAsRead(student);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    // ===== Schedule Endpoints =====

    @GetMapping("/schedules")
    public ResponseEntity<?> getSchedules(@AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            User student = userDetails.getUser();
            List<Schedule> schedules = scheduleService.findActiveByTeacherName(student.getTeacherName());
            List<Map<String, Object>> result = schedules.stream().map(s -> {
                Map<String, Object> item = new HashMap<>();
                item.put("id", s.getId());
                item.put("title", s.getTitle());
                item.put("description", s.getDescription());
                item.put("teacherName", s.getTeacher().getDisplayName());
                item.put("startTime", s.getScheduledStartTime().toString());
                item.put("endTime", s.getScheduledEndTime() != null ? s.getScheduledEndTime().toString() : null);
                item.put("createdAt", s.getCreatedAt().toString());
                return item;
            }).collect(Collectors.toList());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    // ===== Transcript Endpoints =====

    @GetMapping("/transcripts")
    public ResponseEntity<?> getMyTranscripts(@AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            User student = userDetails.getUser();
            List<Transcript> transcripts = transcriptService.findByUser(student);
            List<Map<String, Object>> result = transcripts.stream().map(t -> {
                Map<String, Object> item = new HashMap<>();
                item.put("id", t.getId());
                item.put("content", t.getContent());
                item.put("speakerName", t.getSpeakerName());
                item.put("recordingId", t.getRecording() != null ? t.getRecording().getId() : null);
                item.put("startTime", t.getStartTimeSeconds());
                item.put("endTime", t.getEndTimeSeconds());
                item.put("createdAt", t.getCreatedAt() != null ? t.getCreatedAt().toString() : null);
                return item;
            }).collect(Collectors.toList());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @GetMapping("/transcripts/recording/{recordingId}")
    public ResponseEntity<?> getTranscriptsByRecording(@PathVariable Long recordingId,
                                                       @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            List<Transcript> transcripts = transcriptService.findByRecordingId(recordingId);
            List<Map<String, Object>> result = transcripts.stream().map(t -> {
                Map<String, Object> item = new HashMap<>();
                item.put("id", t.getId());
                item.put("content", t.getContent());
                item.put("speakerName", t.getSpeakerName());
                item.put("startTime", t.getStartTimeSeconds());
                item.put("endTime", t.getEndTimeSeconds());
                return item;
            }).collect(Collectors.toList());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }
}

