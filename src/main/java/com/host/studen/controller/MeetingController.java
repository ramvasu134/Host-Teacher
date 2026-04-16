package com.host.studen.controller;

import com.host.studen.model.ChatMessage;
import com.host.studen.model.Meeting;
import com.host.studen.model.MeetingParticipant;
import com.host.studen.model.MeetingStatus;
import com.host.studen.model.User;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.ChatService;
import com.host.studen.service.MeetingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.List;

@Controller
@RequestMapping("/meeting")
public class MeetingController {

    @Autowired
    private MeetingService meetingService;

    @Autowired
    private ChatService chatService;

    @GetMapping("/room/{meetingCode}")
    public String meetingRoom(@PathVariable String meetingCode,
                              @AuthenticationPrincipal CustomUserDetails userDetails,
                              Model model,
                              RedirectAttributes redirectAttributes) {
        Meeting meeting = meetingService.findByMeetingCode(meetingCode)
                .orElse(null);

        if (meeting == null) {
            redirectAttributes.addFlashAttribute("error", "Meeting not found.");
            return redirectByRole(userDetails);
        }

        if (meeting.getStatus() == MeetingStatus.ENDED) {
            redirectAttributes.addFlashAttribute("error", "This meeting has already ended.");
            return redirectByRole(userDetails);
        }

        User user = userDetails.getUser();
        boolean isHost = meeting.getHost().getId().equals(user.getId());

        // Auto-start if host is entering and meeting is scheduled
        if (isHost && meeting.getStatus() == MeetingStatus.SCHEDULED) {
            meeting = meetingService.startMeeting(meeting.getId(), user);
        }

        // Students cannot enter until teacher has started the meeting (status = LIVE)
        if (!isHost && meeting.getStatus() != MeetingStatus.LIVE) {
            redirectAttributes.addFlashAttribute("error", "Meeting has not started yet. Please wait for the teacher to start the session.");
            return "redirect:/student/room";
        }

        // Join meeting
        meetingService.joinMeeting(meeting, user);

        List<MeetingParticipant> participants = meetingService.getActiveParticipants(meeting);
        List<ChatMessage> chatMessages = chatService.getMessagesByMeeting(meeting);


        model.addAttribute("meeting", meeting);
        model.addAttribute("user", user);
        model.addAttribute("isHost", isHost);
        model.addAttribute("participants", participants);
        model.addAttribute("chatMessages", chatMessages);
        model.addAttribute("meetingCode", meetingCode);
        model.addAttribute("teacher", meeting.getHost());  // Pass teacher info for logo

        // Students get a dedicated student room UI
        if (!isHost) {
            return "meeting/student-room";
        }
        return "meeting/room";
    }

    @PostMapping("/leave/{meetingCode}")
    public String leaveMeeting(@PathVariable String meetingCode,
                               @AuthenticationPrincipal CustomUserDetails userDetails,
                               RedirectAttributes redirectAttributes) {
        Meeting meeting = meetingService.findByMeetingCode(meetingCode)
                .orElse(null);

        if (meeting != null) {
            meetingService.leaveMeeting(meeting, userDetails.getUser());
        }

        return redirectByRole(userDetails);
    }

    private String redirectByRole(CustomUserDetails userDetails) {
        if (userDetails != null && "HOST".equals(userDetails.getRole())) {
            return "redirect:/host/dashboard";
        }
        return "redirect:/student/room";
    }
}

