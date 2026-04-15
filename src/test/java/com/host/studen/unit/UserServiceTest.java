package com.host.studen.unit;

import com.host.studen.dto.RegisterRequest;
import com.host.studen.model.Role;
import com.host.studen.model.User;
import com.host.studen.repository.UserRepository;
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
 * UNIT TESTS — UserService & UserRepository logic.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
@DisplayName("Unit · UserService")
class UserServiceTest {

    @Autowired private UserService userService;
    @Autowired private UserRepository userRepository;

    @BeforeEach
    void cleanDb() {
        userRepository.deleteAll();
    }

    // ── findByUsername ──────────────────────────────────────────

    @Test
    @DisplayName("findByUsername returns user when exists")
    void findByUsername_found() {
        userService.createUser("SHARMA", "rahul", "pass", "Rahul Sharma", Role.HOST);

        Optional<User> result = userService.findByUsername("rahul");
        assertTrue(result.isPresent());
        assertEquals("Rahul Sharma", result.get().getDisplayName());
    }

    @Test
    @DisplayName("findByUsername returns empty when not exists")
    void findByUsername_notFound() {
        assertTrue(userService.findByUsername("ghost").isEmpty());
    }

    // ── findByUsernameAndTeacherName ───────────────────────────

    @Test
    @DisplayName("findByUsernameAndTeacherName matches both fields")
    void findByUsernameAndTeacher() {
        userService.createUser("SHARMA", "priya", "pass", "Priya Reddy", Role.STUDENT);

        assertTrue(userService.findByUsernameAndTeacherName("priya", "SHARMA").isPresent());
        assertTrue(userService.findByUsernameAndTeacherName("priya", "KHAN").isEmpty());
    }

    // ── createUser ─────────────────────────────────────────────

    @Test
    @DisplayName("createUser persists and encodes password")
    void createUser_ok() {
        User user = userService.createUser("KHAN", "arjun", "raw123", "Arjun Mehta", Role.STUDENT);

        assertNotNull(user.getId());
        assertEquals("arjun", user.getUsername());
        assertEquals("KHAN", user.getTeacherName());
        assertEquals(Role.STUDENT, user.getRole());
        assertNotEquals("raw123", user.getPassword(), "Password must be encoded");
    }

    @Test
    @DisplayName("createUser rejects duplicate username")
    void createUser_duplicate() {
        userService.createUser("SHARMA", "rahul", "pass", "Rahul", Role.HOST);

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> userService.createUser("KHAN", "rahul", "pass2", "Other", Role.HOST));
        assertTrue(ex.getMessage().contains("already exists"));
    }

    // ── registerUser (via DTO) ─────────────────────────────────

    @Test
    @DisplayName("registerUser creates student from RegisterRequest")
    void registerUser_ok() {
        RegisterRequest req = new RegisterRequest();
        req.setTeacherName("SHARMA");
        req.setUsername("neha");
        req.setPassword("stu@123");
        req.setDisplayName("Neha Gupta");
        req.setRole("STUDENT");

        User user = userService.registerUser(req);
        assertNotNull(user.getId());
        assertEquals(Role.STUDENT, user.getRole());
    }

    // ── findStudentsByTeacherName ──────────────────────────────

    @Test
    @DisplayName("findStudentsByTeacherName returns only students of that teacher")
    void findStudentsByTeacherName() {
        userService.createUser("SHARMA", "rahul",  "p", "Rahul",  Role.HOST);
        userService.createUser("SHARMA", "priya",  "p", "Priya",  Role.STUDENT);
        userService.createUser("SHARMA", "vikas",  "p", "Vikas",  Role.STUDENT);
        userService.createUser("KHAN",   "arjun",  "p", "Arjun",  Role.STUDENT);

        List<User> sharma = userService.findStudentsByTeacherName("SHARMA");
        assertEquals(2, sharma.size());
        assertTrue(sharma.stream().allMatch(u -> u.getRole() == Role.STUDENT));
        assertTrue(sharma.stream().allMatch(u -> "SHARMA".equals(u.getTeacherName())));
    }

    // ── existsByUsername ───────────────────────────────────────

    @Test
    @DisplayName("existsByUsername returns correct boolean")
    void existsByUsername() {
        assertFalse(userService.existsByUsername("nobody"));
        userService.createUser("SHARMA", "vikas", "p", "Vikas", Role.STUDENT);
        assertTrue(userService.existsByUsername("vikas"));
    }

    // ── deactivateUser ────────────────────────────────────────

    @Test
    @DisplayName("deactivateUser sets active=false")
    void deactivateUser() {
        User user = userService.createUser("KHAN", "sana", "p", "Sana", Role.STUDENT);
        assertTrue(user.isActive());

        userService.deactivateUser(user.getId());

        User updated = userRepository.findById(user.getId()).orElseThrow();
        assertFalse(updated.isActive());
    }
}

