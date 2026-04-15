package com.host.studen.service;

import com.host.studen.model.Schedule;
import com.host.studen.model.User;
import com.host.studen.repository.ScheduleRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class ScheduleService {

    @Autowired
    private ScheduleRepository scheduleRepository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private UserService userService;

    public List<Schedule> findByTeacher(User teacher) {
        return scheduleRepository.findByTeacherOrderByScheduledStartTimeDesc(teacher);
    }

    public List<Schedule> findActiveByTeacher(User teacher) {
        return scheduleRepository.findByTeacherAndActiveTrue(teacher);
    }

    public List<Schedule> findActiveByTeacherName(String teacherName) {
        return scheduleRepository.findActiveSchedulesByTeacherName(teacherName);
    }

    public List<Schedule> findUpcoming(User teacher) {
        return scheduleRepository.findUpcomingSchedules(teacher, LocalDateTime.now());
    }

    public Optional<Schedule> findById(Long id) {
        return scheduleRepository.findById(id);
    }

    @Transactional
    public Schedule createSchedule(User teacher, String title, String description,
                                   LocalDateTime startTime, LocalDateTime endTime) {
        Schedule schedule = new Schedule(teacher, title, description, startTime, endTime);
        Schedule saved = scheduleRepository.save(schedule);

        // Send notification to all students of this teacher
        notifyStudentsAboutSchedule(teacher, saved);

        return saved;
    }

    @Transactional
    public Schedule updateSchedule(Long id, String title, String description,
                                   LocalDateTime startTime, LocalDateTime endTime) {
        Schedule schedule = scheduleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Schedule not found"));
        
        schedule.setTitle(title);
        schedule.setDescription(description);
        schedule.setScheduledStartTime(startTime);
        schedule.setScheduledEndTime(endTime);
        
        return scheduleRepository.save(schedule);
    }

    @Transactional
    public void deleteSchedule(Long id) {
        scheduleRepository.deleteById(id);
    }

    @Transactional
    public void deactivateSchedule(Long id) {
        scheduleRepository.findById(id).ifPresent(schedule -> {
            schedule.setActive(false);
            scheduleRepository.save(schedule);
        });
    }

    /**
     * Notify all students of a teacher about a new schedule
     */
    private void notifyStudentsAboutSchedule(User teacher, Schedule schedule) {
        List<User> students = userService.findStudentsByTeacherName(teacher.getTeacherName());
        
        String title = "New Schedule: " + schedule.getTitle();
        String message = String.format("Your teacher %s has scheduled a class on %s. %s",
                teacher.getDisplayName(),
                schedule.getScheduledStartTime().toString(),
                schedule.getDescription() != null ? schedule.getDescription() : "");

        for (User student : students) {
            notificationService.createScheduleNotification(student, title, message, schedule.getId().toString());
        }
    }

    /**
     * Check for upcoming schedules and send reminders (called by scheduler)
     */
    @Transactional
    public void sendScheduleReminders() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime reminderWindow = now.plusMinutes(15);
        
        List<Schedule> upcomingSchedules = scheduleRepository.findUpcomingSchedulesForNotification(now, reminderWindow);
        
        for (Schedule schedule : upcomingSchedules) {
            User teacher = schedule.getTeacher();
            List<User> students = userService.findStudentsByTeacherName(teacher.getTeacherName());
            
            String title = "Reminder: Class starting soon!";
            String message = String.format("Class '%s' by %s is starting in 15 minutes.",
                    schedule.getTitle(), teacher.getDisplayName());
            
            for (User student : students) {
                notificationService.createScheduleReminderNotification(student, title, message, schedule.getId().toString());
            }
            
            schedule.setNotificationSent(true);
            scheduleRepository.save(schedule);
        }
    }
}

