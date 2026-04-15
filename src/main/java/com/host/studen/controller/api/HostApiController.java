package com.host.studen.controller.api;

import com.host.studen.dto.MeetingRequest;
import com.host.studen.model.*;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/host")
public class HostApiController {

    @Autowired
    private UserService userService;

    @Autowired
    private MeetingService meetingService;

    @Autowired
    private TranscriptService transcriptService;

    @Autowired
    private ScheduleService scheduleService;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private RecordingService recordingService;

    // ===== Student Management =====

    @PutMapping("/students/{id}")
    public ResponseEntity<?> updateStudent(@PathVariable Long id,
                                           @RequestBody Map<String, String> request,
                                           @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            String displayName = request.get("displayName");
            String newPassword = request.get("newPassword");

            if (displayName != null && !displayName.trim().isEmpty()) {
                userService.updateStudentName(id, displayName.trim());
            }
            if (newPassword != null && !newPassword.trim().isEmpty()) {
                userService.resetStudentPassword(id, newPassword.trim());
            }
            if ((displayName == null || displayName.trim().isEmpty()) &&
                    (newPassword == null || newPassword.trim().isEmpty())) {
                return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Nothing to update"));
            }
            return ResponseEntity.ok(Map.of("success", true, "message", "Student updated"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @GetMapping("/students/{id}/credentials")
    public ResponseEntity<?> getStudentCredentials(@PathVariable Long id,
                                                   @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            Optional<User> studentOpt = userService.findById(id);
            if (studentOpt.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Student not found"));
            }
            User student = studentOpt.get();
            User teacher = userDetails.getUser();
            // Security: only teacher who owns this student can view credentials
            if (!student.getTeacherName().equals(teacher.getTeacherName())) {
                return ResponseEntity.status(403).body(Map.of("success", false, "message", "Access denied"));
            }
            String rawPwd = student.getRawPassword();
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "username", student.getUsername(),
                    "displayName", student.getDisplayName(),
                    "password", rawPwd != null ? rawPwd : "(not available - set a new password)"
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @PostMapping("/students/{id}/block")
    public ResponseEntity<?> blockStudent(@PathVariable Long id,
                                          @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            userService.blockStudent(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Student blocked"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @PostMapping("/students/{id}/unblock")
    public ResponseEntity<?> unblockStudent(@PathVariable Long id,
                                            @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            userService.unblockStudent(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Student unblocked"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @PostMapping("/students/{id}/mute")
    public ResponseEntity<?> muteStudent(@PathVariable Long id,
                                         @AuthenticationPrincipal CustomUserDetails userDetails) {
        return ResponseEntity.ok(Map.of("success", true, "message", "Mute signal sent"));
    }

    @PostMapping("/students/{id}/call")
    public ResponseEntity<?> callStudent(@PathVariable Long id,
                                         @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            Optional<User> studentOpt = userService.findById(id);
            if (studentOpt.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Student not found"));
            }
            User student = studentOpt.get();
            User teacher = userDetails.getUser();
            
            // Verify student belongs to this teacher
            if (!student.getTeacherName().equals(teacher.getTeacherName())) {
                return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Access denied"));
            }
            
            // Create a call notification for the student
            notificationService.createNotification(student, "📞 Incoming Call",
                    "Your teacher " + teacher.getDisplayName() + " is calling you. Please join the meeting.",
                    NotificationType.MEETING_STARTED);
            
            return ResponseEntity.ok(Map.of("success", true, "message", "Call notification sent to " + student.getDisplayName()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @DeleteMapping("/students/{id}")
    public ResponseEntity<?> deleteStudent(@PathVariable Long id,
                                           @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            userService.deleteStudent(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Student deleted"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    // ===== Quick Meeting (Start Meeting from dashboard) =====

    @PostMapping("/quick-meeting/start")
    public ResponseEntity<?> startQuickMeeting(@AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            User host = userDetails.getUser();

            // ── Guard: must have at least one active schedule ──────────────
            List<Schedule> schedules = scheduleService.findActiveByTeacher(host);
            if (schedules.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Please create a schedule first before starting a meeting. Go to Schedules → New Schedule."
                ));
            }

            // If teacher already has a live meeting, return it
            List<Meeting> liveMeetings = meetingService.findLiveMeetings();
            for (Meeting m : liveMeetings) {
                if (m.getHost().getId().equals(host.getId())) {
                    return ResponseEntity.ok(Map.of(
                            "success", true,
                            "meetingCode", m.getMeetingCode(),
                            "meetingId", m.getId(),
                            "title", m.getTitle()
                    ));
                }
            }

            // Create a new quick meeting
            MeetingRequest req = new MeetingRequest();
            req.setTitle("Live Session – " +
                    DateTimeFormatter.ofPattern("dd MMM, HH:mm").format(LocalDateTime.now()));
            req.setRecordingEnabled(true);
            req.setChatEnabled(true);
            req.setMaxParticipants(50);

            Meeting meeting = meetingService.createMeeting(req, host);
            Meeting started = meetingService.startMeeting(meeting.getId(), host);

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "meetingCode", started.getMeetingCode(),
                    "meetingId", started.getId(),
                    "title", started.getTitle()
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @PostMapping("/quick-meeting/end")
    public ResponseEntity<?> endQuickMeeting(@RequestBody Map<String, Object> request,
                                              @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            Long meetingId = Long.parseLong(request.get("meetingId").toString());
            meetingService.endMeeting(meetingId, userDetails.getUser());
            return ResponseEntity.ok(Map.of("success", true, "message", "Meeting ended successfully"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    // ===== Transcript Management =====

    @GetMapping("/transcripts")
    public ResponseEntity<?> getAllTranscripts(@AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            User teacher = userDetails.getUser();
            List<User> students = userService.findStudentsByTeacherName(teacher.getTeacherName());
            
            List<Map<String, Object>> allTranscripts = new ArrayList<>();
            for (User student : students) {
                List<Transcript> transcripts = transcriptService.findByUser(student);
                for (Transcript t : transcripts) {
                    Map<String, Object> item = new HashMap<>();
                    item.put("id", t.getId());
                    item.put("content", t.getContent());
                    item.put("speakerName", t.getSpeakerName());
                    item.put("studentName", student.getDisplayName());
                    item.put("recordingId", t.getRecording() != null ? t.getRecording().getId() : null);
                    item.put("startTime", t.getStartTimeSeconds());
                    item.put("endTime", t.getEndTimeSeconds());
                    item.put("createdAt", t.getCreatedAt() != null ? t.getCreatedAt().toString() : null);
                    allTranscripts.add(item);
                }
            }
            return ResponseEntity.ok(allTranscripts);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @GetMapping("/transcripts/recording/{recordingId}")
    public ResponseEntity<?> getTranscriptsByRecording(@PathVariable Long recordingId) {
        try {
            List<Transcript> transcripts = transcriptService.findByRecordingId(recordingId);
            List<Map<String, Object>> result = transcripts.stream().map(t -> {
                Map<String, Object> item = new HashMap<>();
                item.put("id", t.getId());
                item.put("content", t.getContent());
                item.put("speakerName", t.getSpeakerName());
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

    @PostMapping("/transcripts")
    public ResponseEntity<?> createTranscript(@RequestBody Map<String, Object> request,
                                              @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            Long recordingId = Long.parseLong(request.get("recordingId").toString());
            String content = (String) request.get("content");
            String speakerName = (String) request.get("speakerName");
            Integer startTime = request.get("startTime") != null ? Integer.parseInt(request.get("startTime").toString()) : null;
            Integer endTime = request.get("endTime") != null ? Integer.parseInt(request.get("endTime").toString()) : null;

            Recording recording = recordingService.findById(recordingId)
                    .orElseThrow(() -> new RuntimeException("Recording not found"));

            Transcript transcript = transcriptService.createTranscript(
                    recording, recording.getRecordedBy(), content, speakerName, startTime, endTime);

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Transcript created",
                    "id", transcript.getId()
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @DeleteMapping("/transcripts/{id}")
    public ResponseEntity<?> deleteTranscript(@PathVariable Long id) {
        try {
            transcriptService.deleteTranscript(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Transcript deleted"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @GetMapping("/transcripts/search")
    public ResponseEntity<?> searchTranscripts(@RequestParam String query) {
        try {
            List<Transcript> transcripts = transcriptService.searchByContent(query);
            List<Map<String, Object>> result = transcripts.stream().map(t -> {
                Map<String, Object> item = new HashMap<>();
                item.put("id", t.getId());
                item.put("content", t.getContent());
                item.put("speakerName", t.getSpeakerName());
                item.put("createdAt", t.getCreatedAt() != null ? t.getCreatedAt().toString() : null);
                return item;
            }).collect(Collectors.toList());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    // ===== Schedule Management =====

    @GetMapping("/schedules")
    public ResponseEntity<?> getSchedules(@AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            User teacher = userDetails.getUser();
            List<Schedule> schedules = scheduleService.findByTeacher(teacher);
            List<Map<String, Object>> result = schedules.stream().map(s -> {
                Map<String, Object> item = new HashMap<>();
                item.put("id", s.getId());
                item.put("title", s.getTitle());
                item.put("description", s.getDescription());
                item.put("startTime", s.getScheduledStartTime().toString());
                item.put("endTime", s.getScheduledEndTime() != null ? s.getScheduledEndTime().toString() : null);
                item.put("active", s.isActive());
                item.put("notificationSent", s.isNotificationSent());
                item.put("createdAt", s.getCreatedAt().toString());
                return item;
            }).collect(Collectors.toList());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @PostMapping("/schedules")
    public ResponseEntity<?> createSchedule(@RequestBody Map<String, String> request,
                                            @AuthenticationPrincipal CustomUserDetails userDetails) {
        try {
            User teacher = userDetails.getUser();
            String title = request.get("title");
            String description = request.get("description");
            LocalDateTime startTime = LocalDateTime.parse(request.get("startTime"), DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            LocalDateTime endTime = request.get("endTime") != null ?
                    LocalDateTime.parse(request.get("endTime"), DateTimeFormatter.ISO_LOCAL_DATE_TIME) : null;

            Schedule schedule = scheduleService.createSchedule(teacher, title, description, startTime, endTime);

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Schedule created and students notified",
                    "id", schedule.getId()
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @PutMapping("/schedules/{id}")
    public ResponseEntity<?> updateSchedule(@PathVariable Long id,
                                            @RequestBody Map<String, String> request) {
        try {
            String title = request.get("title");
            String description = request.get("description");
            LocalDateTime startTime = LocalDateTime.parse(request.get("startTime"), DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            LocalDateTime endTime = request.get("endTime") != null ?
                    LocalDateTime.parse(request.get("endTime"), DateTimeFormatter.ISO_LOCAL_DATE_TIME) : null;

            scheduleService.updateSchedule(id, title, description, startTime, endTime);
            return ResponseEntity.ok(Map.of("success", true, "message", "Schedule updated"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @DeleteMapping("/schedules/{id}")
    public ResponseEntity<?> deleteSchedule(@PathVariable Long id) {
        try {
            scheduleService.deleteSchedule(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Schedule deleted"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }
}

