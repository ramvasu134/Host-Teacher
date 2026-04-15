package com.host.studen.e2e;

import com.host.studen.model.Role;
import com.host.studen.model.User;
import com.host.studen.repository.UserRepository;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.UserService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * END-TO-END TESTS — full student login → dashboard → meetings → recordings flow.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("E2E · Student Login & Navigation")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class StudentLoginE2ETest {

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

    /** Build a real CustomUserDetails for MockMvc — matches what @AuthenticationPrincipal expects */
    private CustomUserDetails studentPrincipal() {
        User priya = userRepository.findByUsername("priya").orElseThrow();
        return new CustomUserDetails(priya);
    }

    private CustomUserDetails hostPrincipal() {
        User rahul = userRepository.findByUsername("rahul").orElseThrow();
        return new CustomUserDetails(rahul);
    }

    // ── 1. Login renders correctly ────────────────────────────

    @Test
    @Order(1)
    @DisplayName("Step 1 · Login page loads with three fields")
    void loginPage_renders() throws Exception {
        mockMvc.perform(get("/login"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("teacherName")))
                .andExpect(content().string(containsString("username")))
                .andExpect(content().string(containsString("password")))
                .andExpect(content().string(containsString("Sign In")));
    }

    // ── 2. Bad credentials → error page ───────────────────────

    @Test
    @Order(2)
    @DisplayName("Step 2 · Wrong password redirects to /login?error")
    void login_badPassword() throws Exception {
        mockMvc.perform(post("/login")
                        .param("username", "priya")
                        .param("password", "WRONG")
                        .with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login?error=true"));
    }

    @Test
    @Order(3)
    @DisplayName("Step 3 · Unknown user redirects to /login?error")
    void login_unknownUser() throws Exception {
        mockMvc.perform(post("/login")
                        .param("username", "ghost")
                        .param("password", "nope")
                        .with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login?error=true"));
    }

    // ── 4. Successful student login → student dashboard ───────

    @Test
    @Order(4)
    @DisplayName("Step 4 · Valid student login redirects to /student/dashboard")
    void login_studentSuccess() throws Exception {
        mockMvc.perform(post("/login")
                        .param("username", "priya")
                        .param("password", "stu@123")
                        .with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/student/dashboard"));
    }

    // ── 5. Authenticated student can access all student pages ─

    @Test
    @Order(5)
    @DisplayName("Step 5 · Student dashboard renders with user info")
    void studentDashboard_renders() throws Exception {
        mockMvc.perform(get("/student/dashboard")
                        .with(user(studentPrincipal())))
                .andExpect(status().isOk())
                .andExpect(view().name("student/dashboard"))
                .andExpect(model().attributeExists("user"))
                .andExpect(model().attributeExists("liveMeetings"));
    }

    @Test
    @Order(6)
    @DisplayName("Step 6 · Student meetings page renders")
    void studentMeetings_renders() throws Exception {
        mockMvc.perform(get("/student/meetings")
                        .with(user(studentPrincipal())))
                .andExpect(status().isOk())
                .andExpect(view().name("student/meetings"))
                .andExpect(model().attributeExists("liveMeetings"));
    }

    @Test
    @Order(7)
    @DisplayName("Step 7 · Student recordings page renders")
    void studentRecordings_renders() throws Exception {
        mockMvc.perform(get("/student/recordings")
                        .with(user(studentPrincipal())))
                .andExpect(status().isOk())
                .andExpect(view().name("student/recordings"))
                .andExpect(model().attributeExists("recordings"));
    }

    // ── 8. Student CANNOT access host pages ───────────────────

    @Test
    @Order(8)
    @DisplayName("Step 8 · Student is FORBIDDEN from /host/dashboard")
    void student_cannotAccessHost() throws Exception {
        mockMvc.perform(get("/host/dashboard")
                        .with(user(studentPrincipal())))
                .andExpect(status().isForbidden());
    }

    // ── 9. Host login goes to host dashboard ──────────────────

    @Test
    @Order(9)
    @DisplayName("Step 9 · Host login redirects to /host/dashboard")
    void login_hostSuccess() throws Exception {
        mockMvc.perform(post("/login")
                        .param("username", "rahul")
                        .param("password", "pass@123")
                        .with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/host/dashboard"));
    }

    // ── 10. Logout works ──────────────────────────────────────

    @Test
    @Order(10)
    @DisplayName("Step 10 · Logout redirects to /login?logout")
    void logout_ok() throws Exception {
        mockMvc.perform(post("/logout")
                        .with(user(studentPrincipal()))
                        .with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login?logout=true"));
    }
}
