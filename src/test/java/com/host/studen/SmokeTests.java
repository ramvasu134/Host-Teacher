package com.host.studen;

import com.host.studen.controller.AuthController;
import com.host.studen.controller.StudentController;
import com.host.studen.service.UserService;
import com.host.studen.service.MeetingService;
import com.host.studen.service.RecordingService;
import com.host.studen.service.ChatService;
import com.host.studen.repository.UserRepository;
import com.host.studen.repository.MeetingRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * SMOKE TESTS — verify the app boots and critical student-flow beans are wired.
 */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("Smoke Tests")
class SmokeTests {

    @Autowired private AuthController authController;
    @Autowired private StudentController studentController;

    @Autowired private UserService userService;
    @Autowired private MeetingService meetingService;
    @Autowired private RecordingService recordingService;
    @Autowired private ChatService chatService;

    @Autowired private UserRepository userRepository;
    @Autowired private MeetingRepository meetingRepository;

    @Test
    @DisplayName("Application context loads successfully")
    void contextLoads() {
    }

    @Test
    @DisplayName("Auth and Student controllers are wired")
    void controllersAreWired() {
        assertNotNull(authController,    "AuthController should be wired");
        assertNotNull(studentController, "StudentController should be wired");
    }

    @Test
    @DisplayName("All services are wired")
    void servicesAreWired() {
        assertNotNull(userService,      "UserService should be wired");
        assertNotNull(meetingService,   "MeetingService should be wired");
        assertNotNull(recordingService, "RecordingService should be wired");
        assertNotNull(chatService,      "ChatService should be wired");
    }

    @Test
    @DisplayName("All repositories are wired")
    void repositoriesAreWired() {
        assertNotNull(userRepository,    "UserRepository should be wired");
        assertNotNull(meetingRepository, "MeetingRepository should be wired");
    }
}
