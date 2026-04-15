package com.host.studen.sanity;

import com.host.studen.model.Role;
import com.host.studen.repository.UserRepository;
import com.host.studen.service.UserService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * SANITY TESTS — verify core student pages render and security rules work.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("Sanity · Student Pages & Security")
class StudentPageSanityTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserService userService;
    @Autowired private UserRepository userRepository;

    @BeforeEach
    void seed() {
        if (!userRepository.existsByUsername("priya")) {
            userService.createUser("SHARMA", "priya", "stu@123", "Priya Reddy", Role.STUDENT);
        }
        if (!userRepository.existsByUsername("rahul")) {
            userService.createUser("SHARMA", "rahul", "pass@123", "Rahul Sharma", Role.HOST);
        }
    }

    // ── Public pages render ───────────────────────────────────

    @Test
    @DisplayName("GET /login returns 200 with login form")
    void loginPage_ok() throws Exception {
        mockMvc.perform(get("/login"))
                .andExpect(status().isOk())
                .andExpect(view().name("login"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Teacher Name")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Username")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Password")));
    }

    @Test
    @DisplayName("GET /register returns 200 with register form")
    void registerPage_ok() throws Exception {
        mockMvc.perform(get("/register"))
                .andExpect(status().isOk())
                .andExpect(view().name("register"));
    }

    @Test
    @DisplayName("GET / redirects unauthenticated user to /login")
    void root_redirectsToLogin() throws Exception {
        mockMvc.perform(get("/"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login"));
    }

    // ── Protected pages redirect when unauthenticated ─────────

    @Test
    @DisplayName("GET /student/dashboard requires auth → redirect to login")
    void studentDashboard_requiresAuth() throws Exception {
        mockMvc.perform(get("/student/dashboard"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("**/login"));
    }

    @Test
    @DisplayName("GET /student/meetings requires auth → redirect to login")
    void studentMeetings_requiresAuth() throws Exception {
        mockMvc.perform(get("/student/meetings"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("**/login"));
    }

    @Test
    @DisplayName("GET /student/recordings requires auth → redirect to login")
    void studentRecordings_requiresAuth() throws Exception {
        mockMvc.perform(get("/student/recordings"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("**/login"));
    }

    // ── Login with error/logout params ────────────────────────

    @Test
    @DisplayName("GET /login?error shows error message")
    void loginPage_errorParam() throws Exception {
        mockMvc.perform(get("/login").param("error", "true"))
                .andExpect(status().isOk())
                .andExpect(model().attributeExists("error"));
    }

    @Test
    @DisplayName("GET /login?logout shows logout message")
    void loginPage_logoutParam() throws Exception {
        mockMvc.perform(get("/login").param("logout", "true"))
                .andExpect(status().isOk())
                .andExpect(model().attributeExists("message"));
    }
}

