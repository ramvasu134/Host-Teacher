package com.host.studen.unit;

import com.host.studen.dto.MeetingRequest;
import com.host.studen.model.*;
import com.host.studen.repository.MeetingRepository;
import com.host.studen.repository.UserRepository;
import com.host.studen.service.MeetingService;
import com.host.studen.service.UserService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * UNIT TESTS — MeetingService logic.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
@DisplayName("Unit · MeetingService")
class MeetingServiceTest {

    @Autowired private MeetingService meetingService;
    @Autowired private UserService userService;
    @Autowired private MeetingRepository meetingRepository;
    @Autowired private UserRepository userRepository;

    private User host;
    private User student;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
        meetingRepository.deleteAll();

        host    = userService.createUser("SHARMA", "rahul", "p", "Rahul Sharma", Role.HOST);
        student = userService.createUser("SHARMA", "priya", "p", "Priya Reddy",  Role.STUDENT);
    }

    private MeetingRequest makeRequest(String title) {
        MeetingRequest req = new MeetingRequest();
        req.setTitle(title);
        req.setDescription("Test meeting");
        req.setMaxParticipants(10);
        req.setRecordingEnabled(true);
        req.setChatEnabled(true);
        req.setScreenShareEnabled(true);
        return req;
    }

    // ── createMeeting ─────────────────────────────────────────

    @Test
    @DisplayName("createMeeting persists with generated code and SCHEDULED status")
    void createMeeting_ok() {
        Meeting m = meetingService.createMeeting(makeRequest("Math Class"), host);

        assertNotNull(m.getId());
        assertNotNull(m.getMeetingCode());
        assertFalse(m.getMeetingCode().isBlank());
        assertEquals("Math Class", m.getTitle());
        assertEquals(MeetingStatus.SCHEDULED, m.getStatus());
        assertEquals(host.getId(), m.getHost().getId());
    }

    // ── findByMeetingCode ─────────────────────────────────────

    @Test
    @DisplayName("findByMeetingCode returns correct meeting")
    void findByCode() {
        Meeting m = meetingService.createMeeting(makeRequest("Physics"), host);
        Optional<Meeting> found = meetingService.findByMeetingCode(m.getMeetingCode());

        assertTrue(found.isPresent());
        assertEquals("Physics", found.get().getTitle());
    }

    @Test
    @DisplayName("findByMeetingCode returns empty for unknown code")
    void findByCode_notFound() {
        assertTrue(meetingService.findByMeetingCode("NOPE").isEmpty());
    }

    // ── startMeeting / endMeeting ─────────────────────────────

    @Test
    @DisplayName("startMeeting moves status to LIVE")
    void startMeeting() {
        Meeting m = meetingService.createMeeting(makeRequest("English"), host);
        Meeting started = meetingService.startMeeting(m.getId(), host);

        assertEquals(MeetingStatus.LIVE, started.getStatus());
        assertNotNull(started.getStartedAt());
    }

    @Test
    @DisplayName("endMeeting moves status to ENDED")
    void endMeeting() {
        Meeting m = meetingService.createMeeting(makeRequest("History"), host);
        meetingService.startMeeting(m.getId(), host);
        Meeting ended = meetingService.endMeeting(m.getId(), host);

        assertEquals(MeetingStatus.ENDED, ended.getStatus());
        assertNotNull(ended.getEndedAt());
    }

    @Test
    @DisplayName("non-host cannot start meeting")
    void startMeeting_nonHost() {
        Meeting m = meetingService.createMeeting(makeRequest("Science"), host);
        assertThrows(RuntimeException.class, () -> meetingService.startMeeting(m.getId(), student));
    }

    // ── joinMeeting / leaveMeeting ────────────────────────────

    @Test
    @DisplayName("student can join a live meeting")
    void joinMeeting_ok() {
        Meeting m = meetingService.createMeeting(makeRequest("Art"), host);
        meetingService.startMeeting(m.getId(), host);

        MeetingParticipant p = meetingService.joinMeeting(m, student);
        assertNotNull(p.getId());
        assertEquals(student.getId(), p.getUser().getId());
        assertNull(p.getLeftAt());
    }

    @Test
    @DisplayName("joining same meeting twice returns existing participant")
    void joinMeeting_idempotent() {
        Meeting m = meetingService.createMeeting(makeRequest("Music"), host);
        meetingService.startMeeting(m.getId(), host);

        MeetingParticipant p1 = meetingService.joinMeeting(m, student);
        MeetingParticipant p2 = meetingService.joinMeeting(m, student);
        assertEquals(p1.getId(), p2.getId());
    }

    @Test
    @DisplayName("leaveMeeting sets leftAt timestamp")
    void leaveMeeting() {
        Meeting m = meetingService.createMeeting(makeRequest("PE"), host);
        meetingService.startMeeting(m.getId(), host);
        meetingService.joinMeeting(m, student);

        meetingService.leaveMeeting(m, student);
        assertEquals(0, meetingService.getActiveParticipantCount(m));
    }

    // ── findLiveMeetings ──────────────────────────────────────

    @Test
    @DisplayName("findLiveMeetings returns only LIVE meetings")
    void findLiveMeetings() {
        Meeting m1 = meetingService.createMeeting(makeRequest("Live1"), host);
        meetingService.createMeeting(makeRequest("Scheduled"), host);
        meetingService.startMeeting(m1.getId(), host);

        List<Meeting> live = meetingService.findLiveMeetings();
        assertEquals(1, live.size());
        assertEquals(MeetingStatus.LIVE, live.get(0).getStatus());
    }

    // ── findByHost ────────────────────────────────────────────

    @Test
    @DisplayName("findByHost returns only that host's meetings")
    void findByHost() {
        User host2 = userService.createUser("KHAN", "ayesha", "p", "Ayesha", Role.HOST);
        meetingService.createMeeting(makeRequest("H1"), host);
        meetingService.createMeeting(makeRequest("H2"), host);
        meetingService.createMeeting(makeRequest("K1"), host2);

        assertEquals(2, meetingService.findByHost(host).size());
        assertEquals(1, meetingService.findByHost(host2).size());
    }
}

