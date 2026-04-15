package com.host.studen.controller;

import com.host.studen.dto.MeetingRequest;
import com.host.studen.dto.RegisterRequest;
import com.host.studen.model.*;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.MeetingService;
import com.host.studen.service.RecordingService;
import com.host.studen.service.TranscriptService;
import com.host.studen.service.UserService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.*;

@Controller
@RequestMapping("/host")
public class HostController {

    @Autowired
    private MeetingService meetingService;

    @Autowired
    private UserService userService;

    @Autowired
    private RecordingService recordingService;

    @Autowired
    private TranscriptService transcriptService;

    @GetMapping("/dashboard")
    public String dashboard(@AuthenticationPrincipal CustomUserDetails userDetails, Model model) {
        User host = userDetails.getUser();
        List<Meeting> meetings = meetingService.findByHost(host);
        List<Meeting> liveMeetings = meetingService.findLiveMeetings();
        List<User> students = userService.findStudentsByTeacherName(host.getTeacherName());

        long totalMeetings = meetings.size();
        long activeMeetings = meetings.stream().filter(m -> m.getStatus() == MeetingStatus.LIVE).count();
        long totalStudents = students.size();

        // Get all recordings for this teacher's students, grouped by student name
        Map<String, List<Recording>> studentRecordings = new LinkedHashMap<>();
        Map<Long, List<Transcript>> recordingTranscripts = new HashMap<>();
        long totalRecordings = 0;
        
        for (User student : students) {
            List<Recording> recs = recordingService.findByUser(student);
            if (!recs.isEmpty()) {
                studentRecordings.put(student.getDisplayName(), recs);
                totalRecordings += recs.size();
                // Get transcripts for each recording
                for (Recording rec : recs) {
                    List<Transcript> transcripts = transcriptService.findByRecording(rec);
                    if (!transcripts.isEmpty()) {
                        recordingTranscripts.put(rec.getId(), transcripts);
                    }
                }
            }
        }

        model.addAttribute("user", host);
        model.addAttribute("meetings", meetings);
        model.addAttribute("liveMeetings", liveMeetings);
        model.addAttribute("students", students);
        model.addAttribute("totalMeetings", totalMeetings);
        model.addAttribute("activeMeetings", activeMeetings);
        model.addAttribute("totalStudents", totalStudents);
        model.addAttribute("totalRecordings", totalRecordings);
        model.addAttribute("studentRecordings", studentRecordings);
        model.addAttribute("recordingTranscripts", recordingTranscripts);

        return "host/teacher-dashboard";
    }

    @GetMapping("/meetings")
    public String meetings() {
        return "redirect:/host/dashboard";
    }

    @GetMapping("/meetings/create")
    public String createMeetingForm(Model model, @AuthenticationPrincipal CustomUserDetails userDetails) {
        model.addAttribute("meetingRequest", new MeetingRequest());
        model.addAttribute("user", userDetails.getUser());
        return "host/create-meeting";
    }

    @PostMapping("/meetings/create")
    public String createMeeting(@Valid @ModelAttribute("meetingRequest") MeetingRequest request,
                                BindingResult result,
                                @AuthenticationPrincipal CustomUserDetails userDetails,
                                RedirectAttributes redirectAttributes) {
        if (result.hasErrors()) {
            return "host/create-meeting";
        }

        User host = userDetails.getUser();
        Meeting meeting = meetingService.createMeeting(request, host);
        redirectAttributes.addFlashAttribute("success",
                "Meeting created! Code: " + meeting.getMeetingCode());
        return "redirect:/host/dashboard";
    }

    @PostMapping("/meetings/{id}/start")
    public String startMeeting(@PathVariable Long id,
                               @AuthenticationPrincipal CustomUserDetails userDetails,
                               RedirectAttributes redirectAttributes) {
        try {
            Meeting meeting = meetingService.startMeeting(id, userDetails.getUser());
            return "redirect:/meeting/room/" + meeting.getMeetingCode();
        } catch (RuntimeException e) {
            redirectAttributes.addFlashAttribute("error", e.getMessage());
            return "redirect:/host/dashboard";
        }
    }

    @PostMapping("/meetings/{id}/end")
    public String endMeeting(@PathVariable Long id,
                             @AuthenticationPrincipal CustomUserDetails userDetails,
                             RedirectAttributes redirectAttributes) {
        try {
            meetingService.endMeeting(id, userDetails.getUser());
            redirectAttributes.addFlashAttribute("success", "Meeting ended successfully.");
        } catch (RuntimeException e) {
            redirectAttributes.addFlashAttribute("error", e.getMessage());
        }
        return "redirect:/host/dashboard";
    }

    @GetMapping("/students")
    public String students() {
        return "redirect:/host/dashboard";
    }

    @PostMapping("/students/add")
    public String addStudent(@Valid @ModelAttribute("registerRequest") RegisterRequest request,
                             BindingResult result,
                             @AuthenticationPrincipal CustomUserDetails userDetails,
                             RedirectAttributes redirectAttributes) {
        if (result.hasErrors()) {
            redirectAttributes.addFlashAttribute("error", "Please fill all required fields.");
            return "redirect:/host/dashboard";
        }

        try {
            request.setTeacherName(userDetails.getTeacherName());
            request.setRole("STUDENT");
            userService.registerUser(request);
            redirectAttributes.addFlashAttribute("success", "Student added successfully.");
        } catch (RuntimeException e) {
            redirectAttributes.addFlashAttribute("error", e.getMessage());
        }
        return "redirect:/host/dashboard";
    }

    /**
     * Recordings page showing all recordings grouped by student
     * Each student has multiple clips with transcripts
     */
    @GetMapping("/recordings")
    public String recordings() {
        return "redirect:/host/dashboard";
    }
    
    /**
     * View recordings for a specific student
     */
    @GetMapping("/students/{studentId}/recordings")
    public String studentRecordings(@PathVariable Long studentId,
                                    @AuthenticationPrincipal CustomUserDetails userDetails,
                                    Model model,
                                    RedirectAttributes redirectAttributes) {
        User host = userDetails.getUser();
        Optional<User> studentOpt = userService.findById(studentId);
        
        if (studentOpt.isEmpty()) {
            redirectAttributes.addFlashAttribute("error", "Student not found");
            return "redirect:/host/dashboard";
        }
        
        User student = studentOpt.get();
        
        // Verify student belongs to this teacher
        if (!student.getTeacherName().equals(host.getTeacherName())) {
            redirectAttributes.addFlashAttribute("error", "Access denied");
            return "redirect:/host/dashboard";
        }
        
        List<Recording> recordings = recordingService.findByUser(student);
        Map<Long, List<Transcript>> recordingTranscripts = new HashMap<>();
        
        for (Recording rec : recordings) {
            List<Transcript> transcripts = transcriptService.findByRecording(rec);
            recordingTranscripts.put(rec.getId(), transcripts);
        }
        
        model.addAttribute("user", host);
        model.addAttribute("student", student);
        model.addAttribute("recordings", recordings);
        model.addAttribute("recordingTranscripts", recordingTranscripts);
        
        return "host/student-recordings";
    }
}

