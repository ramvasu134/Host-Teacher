package com.host.studen.controller;

import com.host.studen.model.Meeting;
import com.host.studen.model.MeetingStatus;
import com.host.studen.model.Recording;
import com.host.studen.model.Role;
import com.host.studen.model.User;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.MeetingService;
import com.host.studen.service.RecordingService;
import com.host.studen.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.List;

@Controller
@RequestMapping("/student")
public class StudentController {

    @Autowired
    private UserService userService;

    @Autowired
    private MeetingService meetingService;

    @Autowired
    private RecordingService recordingService;

    /** Lobby / waiting room — primary student landing page after login */
    @GetMapping("/room")
    public String lobbyPage(@AuthenticationPrincipal CustomUserDetails userDetails, Model model) {
        User student = userDetails.getUser();
        model.addAttribute("user", student);

        // Find the teacher for this student (based on teacherName)
        String teacherName = student.getTeacherName();
        List<User> teachers = userService.findByRole(Role.HOST);
        User teacher = teachers.stream()
                .filter(t -> t.getTeacherName().equals(teacherName))
                .findFirst()
                .orElse(null);

        model.addAttribute("teacher", teacher);
        return "student/lobby";
    }

    /** Student dashboard overview */
    @GetMapping("/dashboard")
    public String dashboardPage(@AuthenticationPrincipal CustomUserDetails userDetails, Model model) {
        User student = userDetails.getUser();
        model.addAttribute("user", student);

        // Find the teacher for this student
        String teacherName = student.getTeacherName();
        List<User> teachers = userService.findByRole(Role.HOST);
        User teacher = teachers.stream()
                .filter(t -> t.getTeacherName().equals(teacherName))
                .findFirst()
                .orElse(null);
        model.addAttribute("teacher", teacher);

        List<Meeting> allMeetings = meetingService.findMeetingsByParticipant(student);
        long totalJoined = allMeetings.size();
        List<Meeting> liveMeetings = meetingService.findLiveMeetings().stream()
                .filter(m -> m.getHost().getTeacherName().equals(student.getTeacherName()))
                .toList();
        long activeMeetings = liveMeetings.size();

        model.addAttribute("totalJoined", totalJoined);
        model.addAttribute("activeMeetings", activeMeetings);
        model.addAttribute("liveMeetings", liveMeetings);
        model.addAttribute("meetings", allMeetings);
        return "student/dashboard";
    }

    /** Student meetings list */
    @GetMapping("/meetings")
    public String meetingsPage(@AuthenticationPrincipal CustomUserDetails userDetails, Model model) {
        User student = userDetails.getUser();
        model.addAttribute("user", student);

        List<Meeting> liveMeetings = meetingService.findLiveMeetings().stream()
                .filter(m -> m.getHost().getTeacherName().equals(student.getTeacherName()))
                .toList();
        List<Meeting> participatedMeetings = meetingService.findMeetingsByParticipant(student);

        model.addAttribute("liveMeetings", liveMeetings);
        model.addAttribute("participatedMeetings", participatedMeetings);
        return "student/meetings";
    }

    /** Student recordings list */
    @GetMapping("/recordings")
    public String recordingsPage(@AuthenticationPrincipal CustomUserDetails userDetails, Model model) {
        User student = userDetails.getUser();
        model.addAttribute("user", student);

        List<Recording> recordings = recordingService.findByUser(student);
        model.addAttribute("recordings", recordings);
        return "student/recordings";
    }

    /**
     * Join a meeting by code — used by both the dashboard modal and the meetings page form.
     * POST /student/meetings/join
     */
    @PostMapping("/meetings/join")
    public String joinMeetingPost(@RequestParam String meetingCode,
                                  @AuthenticationPrincipal CustomUserDetails userDetails,
                                  RedirectAttributes redirectAttributes) {
        return doJoin(meetingCode.trim().toUpperCase(), redirectAttributes);
    }

    /**
     * Join from the dedicated join page.
     * POST /student/join
     */
    @PostMapping("/join")
    public String joinMeetingFromPage(@RequestParam String meetingCode,
                                      @AuthenticationPrincipal CustomUserDetails userDetails,
                                      Model model,
                                      RedirectAttributes redirectAttributes) {
        String code = meetingCode.trim().toUpperCase();
        var meeting = meetingService.findByMeetingCode(code);
        if (meeting.isEmpty()) {
            model.addAttribute("user", userDetails.getUser());
            model.addAttribute("error", "Meeting not found. Please check the code and try again.");
            return "student/join";
        }
        if (meeting.get().getStatus() == MeetingStatus.ENDED) {
            model.addAttribute("user", userDetails.getUser());
            model.addAttribute("error", "This meeting has already ended.");
            return "student/join";
        }
        return "redirect:/meeting/room/" + code;
    }

    /**
     * Redirect from notification action URL → meeting room.
     * GET /student/meeting/join/{meetingCode}
     */
    @GetMapping("/meeting/join/{meetingCode}")
    public String joinMeetingFromNotification(@PathVariable String meetingCode,
                                               RedirectAttributes redirectAttributes) {
        return doJoin(meetingCode.trim().toUpperCase(), redirectAttributes);
    }

    /** Show the manual join page */
    @GetMapping("/join")
    public String joinPage(@AuthenticationPrincipal CustomUserDetails userDetails, Model model) {
        model.addAttribute("user", userDetails.getUser());
        return "student/join";
    }

    // ── helper ──────────────────────────────────────────────────────────────

    private String doJoin(String code, RedirectAttributes redirectAttributes) {
        var meeting = meetingService.findByMeetingCode(code);
        if (meeting.isEmpty()) {
            redirectAttributes.addFlashAttribute("error", "Meeting not found. Please check the code.");
            return "redirect:/student/room";
        }
        if (meeting.get().getStatus() == MeetingStatus.ENDED) {
            redirectAttributes.addFlashAttribute("error", "This meeting has already ended.");
            return "redirect:/student/room";
        }
        return "redirect:/meeting/room/" + code;
    }
}
