package com.host.studen.service;

import com.host.studen.dto.RegisterRequest;
import com.host.studen.model.Recording;
import com.host.studen.model.Role;
import com.host.studen.model.Transcript;
import com.host.studen.model.User;
import com.host.studen.repository.NotificationRepository;
import com.host.studen.repository.RecordingRepository;
import com.host.studen.repository.TranscriptRepository;
import com.host.studen.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private RecordingRepository recordingRepository;

    @Autowired
    private TranscriptRepository transcriptRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    public Optional<User> findByUsernameAndTeacherName(String username, String teacherName) {
        return userRepository.findByUsernameAndTeacherName(username, teacherName);
    }

    public Optional<User> findById(Long id) {
        return userRepository.findById(id);
    }

    public List<User> findByRole(Role role) {
        return userRepository.findByRole(role);
    }

    public List<User> findByTeacherName(String teacherName) {
        return userRepository.findByTeacherName(teacherName);
    }

    public List<User> findStudentsByTeacherName(String teacherName) {
        return userRepository.findByTeacherNameAndRole(teacherName, Role.STUDENT);
    }

    public List<User> findAllActive() {
        return userRepository.findByActiveTrue();
    }

    @Transactional
    public User registerUser(RegisterRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new RuntimeException("Username already exists: " + request.getUsername());
        }

        User user = new User();
        user.setTeacherName(request.getTeacherName());
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRawPassword(request.getPassword());
        user.setDisplayName(request.getDisplayName());
        user.setRole(Role.valueOf(request.getRole().toUpperCase()));
        user.setEmail(request.getEmail());
        user.setPhone(request.getPhone());
        user.setActive(true);

        return userRepository.save(user);
    }

    @Transactional
    public User createUser(String teacherName, String username, String password, String displayName, Role role) {
        if (userRepository.existsByUsername(username)) {
            throw new RuntimeException("Username already exists: " + username);
        }

        User user = new User(teacherName, username, passwordEncoder.encode(password), displayName, role);
        user.setRawPassword(password);
        return userRepository.save(user);
    }

    @Transactional
    public void changePassword(User user, String currentPassword, String newPassword) {
        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new RuntimeException("Current password is incorrect");
        }
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    @Transactional
    public void updateLastLogin(User user) {
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);
    }

    @Transactional
    public User updateUser(User user) {
        return userRepository.save(user);
    }

    @Transactional
    public void deactivateUser(Long userId) {
        userRepository.findById(userId).ifPresent(user -> {
            user.setActive(false);
            userRepository.save(user);
        });
    }

    @Transactional
    public void blockStudent(Long studentId) {
        userRepository.findById(studentId).ifPresent(user -> {
            user.setActive(false);
            userRepository.save(user);
        });
    }

    @Transactional
    public void unblockStudent(Long studentId) {
        userRepository.findById(studentId).ifPresent(user -> {
            user.setActive(true);
            userRepository.save(user);
        });
    }

    @Transactional
    public void deleteStudent(Long studentId) {
        User user = userRepository.findById(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        // 1. Delete transcripts directly linked to this user
        List<Transcript> userTranscripts = transcriptRepository.findByUser(user);
        if (!userTranscripts.isEmpty()) {
            transcriptRepository.deleteAll(userTranscripts);
        }

        // 2. Delete transcripts linked to this student's recordings, then recordings
        List<Recording> recordings = recordingRepository.findByRecordedBy(user);
        for (Recording recording : recordings) {
            List<Transcript> recTranscripts = transcriptRepository.findByRecording(recording);
            if (!recTranscripts.isEmpty()) {
                transcriptRepository.deleteAll(recTranscripts);
            }
        }
        if (!recordings.isEmpty()) {
            recordingRepository.deleteAll(recordings);
        }

        // 3. Delete notifications
        notificationRepository.deleteByUser(user);

        // 4. Delete the user — MeetingParticipant cascades automatically via @OneToMany(cascade=ALL)
        userRepository.deleteById(studentId);
    }

    @Transactional
    public User updateStudentName(Long studentId, String displayName) {
        User user = userRepository.findById(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));
        user.setDisplayName(displayName);
        return userRepository.save(user);
    }

    @Transactional
    public User resetStudentPassword(Long studentId, String newPassword) {
        User user = userRepository.findById(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setRawPassword(newPassword);
        return userRepository.save(user);
    }

    public boolean existsByUsername(String username) {
        return userRepository.existsByUsername(username);
    }
}

