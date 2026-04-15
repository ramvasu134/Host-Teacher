package com.host.studen.service;

import com.host.studen.dto.MeetingRequest;
import com.host.studen.model.*;
import com.host.studen.repository.MeetingParticipantRepository;
import com.host.studen.repository.MeetingRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class MeetingService {

    @Autowired
    private MeetingRepository meetingRepository;

    @Autowired
    private MeetingParticipantRepository participantRepository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private UserService userService;

    @Autowired(required = false)
    private SimpMessagingTemplate messagingTemplate;

    public Optional<Meeting> findById(Long id) {
        return meetingRepository.findById(id);
    }

    public Optional<Meeting> findByMeetingCode(String meetingCode) {
        return meetingRepository.findByMeetingCode(meetingCode);
    }

    public List<Meeting> findByHost(User host) {
        return meetingRepository.findByHostOrderByCreatedAtDesc(host);
    }

    public List<Meeting> findLiveMeetings() {
        return meetingRepository.findByStatus(MeetingStatus.LIVE);
    }

    public List<Meeting> findAllMeetingsForUser(User user) {
        return meetingRepository.findAllMeetingsForUser(user);
    }

    public List<Meeting> findMeetingsByParticipant(User user) {
        return meetingRepository.findMeetingsByParticipant(user);
    }

    @Transactional
    public Meeting createMeeting(MeetingRequest request, User host) {
        Meeting meeting = new Meeting();
        meeting.setTitle(request.getTitle());
        meeting.setDescription(request.getDescription());
        meeting.setHost(host);
        meeting.setMaxParticipants(request.getMaxParticipants());
        meeting.setRecordingEnabled(request.isRecordingEnabled());
        meeting.setChatEnabled(request.isChatEnabled());
        meeting.setScreenShareEnabled(request.isScreenShareEnabled());
        meeting.setStatus(MeetingStatus.SCHEDULED);

        if (request.getScheduledAt() != null && !request.getScheduledAt().isEmpty()) {
            meeting.setScheduledAt(LocalDateTime.parse(request.getScheduledAt(),
                    DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        }

        return meetingRepository.save(meeting);
    }

    @Transactional
    public Meeting startMeeting(Long meetingId, User host) {
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new RuntimeException("Meeting not found"));

        if (!meeting.getHost().getId().equals(host.getId())) {
            throw new RuntimeException("Only the host can start the meeting");
        }

        meeting.setStatus(MeetingStatus.LIVE);
        meeting.setStartedAt(LocalDateTime.now());
        Meeting savedMeeting = meetingRepository.save(meeting);

        // Notify all students of this teacher that meeting has started
        List<User> students = userService.findStudentsByTeacherName(host.getTeacherName());
        notificationService.notifyStudentsOfMeetingStart(students, meeting.getMeetingCode(), host.getDisplayName());

        // Broadcast live meeting event via WebSocket so student lobby is notified immediately
        if (messagingTemplate != null) {
            Map<String, Object> livePayload = new HashMap<>();
            livePayload.put("meetingCode", savedMeeting.getMeetingCode());
            livePayload.put("title", savedMeeting.getTitle());
            livePayload.put("teacherName", host.getTeacherName());
            messagingTemplate.convertAndSend("/topic/meeting/live", livePayload);
        }

        return savedMeeting;
    }

    @Transactional
    public Meeting endMeeting(Long meetingId, User host) {
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new RuntimeException("Meeting not found"));

        if (!meeting.getHost().getId().equals(host.getId())) {
            throw new RuntimeException("Only the host can end the meeting");
        }

        meeting.setStatus(MeetingStatus.ENDED);
        meeting.setEndedAt(LocalDateTime.now());

        // Mark all participants as left
        List<MeetingParticipant> activeParticipants =
                participantRepository.findByMeetingAndLeftAtIsNull(meeting);
        for (MeetingParticipant p : activeParticipants) {
            p.setLeftAt(LocalDateTime.now());
            participantRepository.save(p);
        }

        return meetingRepository.save(meeting);
    }

    @Transactional
    public MeetingParticipant joinMeeting(Meeting meeting, User user) {
        // Check if already in meeting
        Optional<MeetingParticipant> existing =
                participantRepository.findByMeetingAndUserAndLeftAtIsNull(meeting, user);
        if (existing.isPresent()) {
            return existing.get();
        }

        // Check max participants
        long activeCount = participantRepository.countByMeetingAndLeftAtIsNull(meeting);
        if (activeCount >= meeting.getMaxParticipants()) {
            throw new RuntimeException("Meeting is full");
        }

        Role roleInMeeting = meeting.getHost().getId().equals(user.getId()) ? Role.HOST : Role.STUDENT;
        MeetingParticipant participant = new MeetingParticipant(meeting, user, roleInMeeting);
        return participantRepository.save(participant);
    }

    @Transactional
    public void leaveMeeting(Meeting meeting, User user) {
        participantRepository.findByMeetingAndUserAndLeftAtIsNull(meeting, user)
                .ifPresent(participant -> {
                    participant.setLeftAt(LocalDateTime.now());
                    participantRepository.save(participant);
                });
    }

    public List<MeetingParticipant> getActiveParticipants(Meeting meeting) {
        return participantRepository.findByMeetingAndLeftAtIsNull(meeting);
    }

    public long getActiveParticipantCount(Meeting meeting) {
        return participantRepository.countByMeetingAndLeftAtIsNull(meeting);
    }

    public boolean isUserInMeeting(Meeting meeting, User user) {
        return participantRepository.existsByMeetingAndUserAndLeftAtIsNull(meeting, user);
    }
}

