package com.host.studen.config;

import com.host.studen.model.*;
import com.host.studen.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Random;

@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private MeetingRepository meetingRepository;

    @Autowired
    private RecordingRepository recordingRepository;

    @Autowired
    private TranscriptRepository transcriptRepository;

    @Autowired
    private ScheduleRepository scheduleRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    private Random random = new Random();

    @Override
    public void run(String... args) {

        // ══════════════════════════════════════════════════════════════
        // TEACHER / HOST users (login with 2 fields: username, password)
        // ══════════════════════════════════════════════════════════════
        
        // Primary teacher account (as per user request) with IPL logo
        User vk2Teacher = createUserIfAbsent("VK2", "vk99", "123456", "VK", Role.HOST,
                "https://documents.iplt20.com/ipl/IPL_LOGO_CORPORATE.png");
        
        // Additional demo teachers (with default logos)
        User sharmaTeacher = createUserIfAbsent("SHARMA", "rahul", "pass@123", "Rahul Sharma", Role.HOST, null);
        User khanTeacher = createUserIfAbsent("KHAN", "ayesha", "pass@123", "Ayesha Khan", Role.HOST, null);
        createUserIfAbsent("ADMIN", "admin", "admin123", "Administrator", Role.HOST, null);

        // ══════════════════════════════════════════════════════════════
        // STUDENT users (login with 3 fields: teacherName, username, password)
        // ══════════════════════════════════════════════════════════════
        
        // Students under teacher VK2 (primary demo)
        User priya = createUserIfAbsent("VK2", "priya", "123456", "Priya Reddy", Role.STUDENT, null);
        User hyd = createUserIfAbsent("VK2", "hyd", "123456", "Hyd Student", Role.STUDENT, null);
        User vikas = createUserIfAbsent("VK2", "vikas", "123456", "Vikas Patel", Role.STUDENT, null);
        User neha = createUserIfAbsent("VK2", "neha", "123456", "Neha Gupta", Role.STUDENT, null);
        User sha = createUserIfAbsent("VK2", "sha", "123456", "Sha", Role.STUDENT, null);
        User ramesh = createUserIfAbsent("VK2", "ramesh", "123456", "Ramesh", Role.STUDENT, null);
        User kish = createUserIfAbsent("VK2", "kish", "123456", "Kish", Role.STUDENT, null);
        User vamsi = createUserIfAbsent("VK2", "vamsi", "123456", "Vamsi", Role.STUDENT, null);
        User mm = createUserIfAbsent("VK2", "mm", "123456", "MM", Role.STUDENT, null);
        User student888 = createUserIfAbsent("VK2", "888", "123456", "888", Role.STUDENT, null);
        User student22 = createUserIfAbsent("VK2", "22l", "123456", "22", Role.STUDENT, null);
        
        // Students under teacher SHARMA
        User student1 = createUserIfAbsent("SHARMA", "student1", "stu@123", "Student One", Role.STUDENT, null);
        User student2 = createUserIfAbsent("SHARMA", "student2", "stu@123", "Student Two", Role.STUDENT, null);

        // Students under teacher KHAN
        User arjun = createUserIfAbsent("KHAN", "arjun", "stu@123", "Arjun Mehta", Role.STUDENT, null);
        User sana = createUserIfAbsent("KHAN", "sana", "stu@123", "Sana Shaikh", Role.STUDENT, null);
        
        // ══════════════════════════════════════════════════════════════
        // SEED MEETINGS, RECORDINGS, AND TRANSCRIPTS
        // ══════════════════════════════════════════════════════════════
        
        if (vk2Teacher != null && meetingRepository.count() == 0) {
            log.info("Seeding meetings, recordings, and transcripts...");
            
            // Create meetings for VK2 teacher
            Meeting meeting1 = createMeeting(vk2Teacher, "English Speaking Session 1", "Daily practice session");
            Meeting meeting2 = createMeeting(vk2Teacher, "English Speaking Session 2", "Advanced conversation");
            Meeting meeting3 = createMeeting(vk2Teacher, "Grammar Workshop", "Focus on tenses");
            
            // Create recordings for each student under VK2
            List<User> vk2Students = List.of(priya, hyd, vikas, neha, sha, ramesh, kish, vamsi, mm, student888, student22);
            
            for (User student : vk2Students) {
                if (student != null) {
                    // Create 3-5 recordings per student
                    int recordingCount = 3 + random.nextInt(3);
                    for (int i = 1; i <= recordingCount; i++) {
                        Recording recording = createRecording(meeting1, student, i);
                        if (recording != null) {
                            // Create transcript for each recording
                            createTranscript(recording, student, i);
                        }
                    }
                }
            }
            
            // Create recordings for SHARMA's students
            if (sharmaTeacher != null) {
                Meeting sharmaMeeting = createMeeting(sharmaTeacher, "Math Tutorial", "Algebra basics");
                if (student1 != null) {
                    for (int i = 1; i <= 2; i++) {
                        Recording rec = createRecording(sharmaMeeting, student1, i);
                        if (rec != null) createTranscript(rec, student1, i);
                    }
                }
                if (student2 != null) {
                    for (int i = 1; i <= 2; i++) {
                        Recording rec = createRecording(sharmaMeeting, student2, i);
                        if (rec != null) createTranscript(rec, student2, i);
                    }
                }
            }
            
            // Create schedules for VK2
            createSchedule(vk2Teacher, "Daily English Class", 
                    "Regular speaking practice session for all students",
                    LocalDateTime.now().plusDays(1).withHour(10).withMinute(0),
                    LocalDateTime.now().plusDays(1).withHour(11).withMinute(0));
            
            createSchedule(vk2Teacher, "Grammar Workshop",
                    "Special focus on verb tenses and sentence structure",
                    LocalDateTime.now().plusDays(2).withHour(14).withMinute(0),
                    LocalDateTime.now().plusDays(2).withHour(15).withMinute(30));
            
            createSchedule(vk2Teacher, "Speaking Test Preparation",
                    "Mock test and evaluation",
                    LocalDateTime.now().plusDays(3).withHour(9).withMinute(0),
                    LocalDateTime.now().plusDays(3).withHour(10).withMinute(30));
            
            // Create notifications for students
            for (User student : vk2Students) {
                if (student != null) {
                    createNotification(student, "Welcome!", 
                            "Welcome to AiR Voices. Your teacher is VK2.",
                            NotificationType.SYSTEM);
                    
                    createNotification(student, "New Schedule Posted",
                            "Your teacher has posted a new class schedule.",
                            NotificationType.SCHEDULE_CREATED);
                }
            }
            
            log.info("Seed data created successfully!");
        }
        
        log.info("=================================================");
        log.info("Demo Credentials Initialized:");
        log.info("-------------------------------------------------");
        log.info("TEACHER LOGIN (2 fields):");
        log.info("  Username: vk99, Password: 123456");
        log.info("-------------------------------------------------");
        log.info("STUDENT LOGIN (3 fields):");
        log.info("  Teacher Name: VK2, Username: priya, Password: 123456");
        log.info("  Teacher Name: VK2, Username: hyd, Password: 123456");
        log.info("  Teacher Name: VK2, Username: sha, Password: 123456");
        log.info("=================================================");
    }

    private User createUserIfAbsent(String teacherName, String username,
                                     String rawPassword, String displayName, Role role, String teacherLogo) {
        User existing = userRepository.findByUsername(username).orElse(null);
        if (existing != null) {
            // Backfill rawPassword for existing users if not set
            if (existing.getRawPassword() == null || existing.getRawPassword().isEmpty()) {
                existing.setRawPassword(rawPassword);
                userRepository.save(existing);
            }
            return existing;
        }

        User user = new User();
        user.setTeacherName(teacherName);
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(rawPassword));
        user.setRawPassword(rawPassword);
        user.setDisplayName(displayName);
        user.setRole(role);
        user.setActive(true);
        user.setTeacherLogo(teacherLogo);  // Set the teacher logo
        user.setLastLoginAt(LocalDateTime.now().minusDays(random.nextInt(7)));
        User saved = userRepository.save(user);
        log.info("Seeded {} user: {} (teacher={})", role, username, teacherName);
        return saved;
    }

    private Meeting createMeeting(User host, String title, String description) {
        Meeting meeting = new Meeting();
        meeting.setTitle(title);
        meeting.setDescription(description);
        meeting.setHost(host);
        meeting.setStatus(MeetingStatus.ENDED);
        meeting.setStartedAt(LocalDateTime.now().minusDays(random.nextInt(7) + 1));
        meeting.setEndedAt(meeting.getStartedAt().plusMinutes(30 + random.nextInt(60)));
        meeting.setRecordingEnabled(true);
        meeting.setChatEnabled(true);
        return meetingRepository.save(meeting);
    }

    private Recording createRecording(Meeting meeting, User student, int index) {
        try {
            Recording recording = new Recording();
            recording.setMeeting(meeting);
            recording.setRecordedBy(student);
            recording.setFileName("recording_" + student.getUsername() + "_" + index + ".webm");
            recording.setFilePath("/recordings/" + student.getUsername() + "/clip_" + index + ".webm");
            recording.setContentType("audio/webm");
            recording.setFileSize(50000 + random.nextInt(200000)); // 50KB - 250KB
            recording.setDurationSeconds(5 + random.nextInt(25)); // 5-30 seconds
            recording.setStatus(Recording.RecordingStatus.READY);
            Recording saved = recordingRepository.save(recording);
            log.info("Created recording for student: {} - clip {}", student.getDisplayName(), index);
            return saved;
        } catch (Exception e) {
            log.error("Error creating recording: {}", e.getMessage());
            return null;
        }
    }

    private void createTranscript(Recording recording, User student, int index) {
        try {
            String[] sampleTranscripts = {
                "Hello, my name is " + student.getDisplayName() + ". Today I want to talk about my favorite hobby.",
                "Good morning everyone. I would like to share my experience about learning English.",
                "The weather is very nice today. I think it's a good day for outdoor activities.",
                "I believe education is very important for our future. We should study hard.",
                "My family consists of four members. We live in a beautiful house.",
                "I enjoy reading books in my free time. My favorite author is Shakespeare.",
                "Technology has changed our lives significantly. We use smartphones every day.",
                "Exercise is important for maintaining good health. I go jogging every morning.",
                "Travel broadens our mind. I have visited many interesting places.",
                "Cooking is one of my hobbies. I like to prepare traditional dishes."
            };
            
            Transcript transcript = new Transcript();
            transcript.setRecording(recording);
            transcript.setUser(student);
            transcript.setContent(sampleTranscripts[random.nextInt(sampleTranscripts.length)]);
            transcript.setSpeakerName(student.getDisplayName());
            transcript.setStartTimeSeconds(0);
            transcript.setEndTimeSeconds((int) recording.getDurationSeconds());
            transcript.setLanguage("en");
            transcriptRepository.save(transcript);
            log.info("Created transcript for recording of student: {}", student.getDisplayName());
        } catch (Exception e) {
            log.error("Error creating transcript: {}", e.getMessage());
        }
    }

    private void createSchedule(User teacher, String title, String description,
                                LocalDateTime startTime, LocalDateTime endTime) {
        try {
            Schedule schedule = new Schedule();
            schedule.setTeacher(teacher);
            schedule.setTitle(title);
            schedule.setDescription(description);
            schedule.setScheduledStartTime(startTime);
            schedule.setScheduledEndTime(endTime);
            schedule.setActive(true);
            schedule.setNotificationSent(false);
            scheduleRepository.save(schedule);
            log.info("Created schedule: {} for teacher: {}", title, teacher.getDisplayName());
        } catch (Exception e) {
            log.error("Error creating schedule: {}", e.getMessage());
        }
    }

    private void createNotification(User user, String title, String message, NotificationType type) {
        try {
            Notification notification = new Notification();
            notification.setUser(user);
            notification.setTitle(title);
            notification.setMessage(message);
            notification.setType(type);
            notification.setRead(false);
            notificationRepository.save(notification);
        } catch (Exception e) {
            log.error("Error creating notification: {}", e.getMessage());
        }
    }
}
