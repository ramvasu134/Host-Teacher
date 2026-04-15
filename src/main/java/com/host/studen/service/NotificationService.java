package com.host.studen.service;

import com.host.studen.model.Notification;
import com.host.studen.model.NotificationType;
import com.host.studen.model.User;
import com.host.studen.repository.NotificationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class NotificationService {

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired(required = false)
    private SimpMessagingTemplate messagingTemplate;

    public List<Notification> findByUser(User user) {
        return notificationRepository.findByUserOrderByCreatedAtDesc(user);
    }

    public List<Notification> findUnreadByUser(User user) {
        return notificationRepository.findByUserAndReadFalseOrderByCreatedAtDesc(user);
    }

    public long countUnread(User user) {
        return notificationRepository.countByUserAndReadFalse(user);
    }

    public Optional<Notification> findById(Long id) {
        return notificationRepository.findById(id);
    }

    @Transactional
    public Notification createNotification(User user, String title, String message, NotificationType type) {
        Notification notification = new Notification(user, title, message, type);
        Notification saved = notificationRepository.save(notification);
        
        // Send real-time notification via WebSocket
        sendRealTimeNotification(user, saved);
        
        return saved;
    }

    @Transactional
    public Notification createMeetingStartedNotification(User user, String meetingCode, String teacherName) {
        String title = "Meeting Started!";
        String message = String.format("Teacher %s has started a meeting. Join now!", teacherName);
        
        Notification notification = new Notification(user, title, message, NotificationType.MEETING_STARTED);
        notification.setActionUrl("/meeting/room/" + meetingCode);
        notification.setRelatedEntityId(meetingCode);
        
        Notification saved = notificationRepository.save(notification);
        sendRealTimeNotification(user, saved);
        
        return saved;
    }

    @Transactional
    public Notification createScheduleNotification(User user, String title, String message, String scheduleId) {
        Notification notification = new Notification(user, title, message, NotificationType.SCHEDULE_CREATED);
        notification.setRelatedEntityId(scheduleId);
        
        Notification saved = notificationRepository.save(notification);
        sendRealTimeNotification(user, saved);
        
        return saved;
    }

    @Transactional
    public Notification createScheduleReminderNotification(User user, String title, String message, String scheduleId) {
        Notification notification = new Notification(user, title, message, NotificationType.SCHEDULE_REMINDER);
        notification.setRelatedEntityId(scheduleId);
        
        Notification saved = notificationRepository.save(notification);
        sendRealTimeNotification(user, saved);
        
        return saved;
    }

    @Transactional
    public Notification createRecordingNotification(User user, String title, String message, String recordingId) {
        Notification notification = new Notification(user, title, message, NotificationType.RECORDING_AVAILABLE);
        notification.setRelatedEntityId(recordingId);
        
        Notification saved = notificationRepository.save(notification);
        sendRealTimeNotification(user, saved);
        
        return saved;
    }

    @Transactional
    public Notification createTranscriptNotification(User user, String title, String message, String transcriptId) {
        Notification notification = new Notification(user, title, message, NotificationType.TRANSCRIPT_READY);
        notification.setRelatedEntityId(transcriptId);
        
        Notification saved = notificationRepository.save(notification);
        sendRealTimeNotification(user, saved);
        
        return saved;
    }

    @Transactional
    public void markAsRead(Long notificationId) {
        notificationRepository.findById(notificationId).ifPresent(notification -> {
            notification.setRead(true);
            notificationRepository.save(notification);
        });
    }

    @Transactional
    public void markAllAsRead(User user) {
        List<Notification> unread = notificationRepository.findByUserAndReadFalseOrderByCreatedAtDesc(user);
        for (Notification notification : unread) {
            notification.setRead(true);
        }
        notificationRepository.saveAll(unread);
    }

    @Transactional
    public void deleteNotification(Long id) {
        notificationRepository.deleteById(id);
    }

    @Transactional
    public void deleteAllByUser(User user) {
        notificationRepository.deleteByUser(user);
    }

    /**
     * Send real-time notification via WebSocket
     */
    private void sendRealTimeNotification(User user, Notification notification) {
        if (messagingTemplate != null) {
            Map<String, Object> payload = new HashMap<>();
            payload.put("id", notification.getId());
            payload.put("title", notification.getTitle());
            payload.put("message", notification.getMessage());
            payload.put("type", notification.getType().name());
            payload.put("actionUrl", notification.getActionUrl());
            payload.put("createdAt", notification.getCreatedAt().toString());
            
            // Send to user-specific channel
            messagingTemplate.convertAndSend("/topic/notifications/" + user.getId(), payload);
        }
    }

    /**
     * Broadcast meeting started notification to all students of a teacher
     */
    @Transactional
    public void notifyStudentsOfMeetingStart(List<User> students, String meetingCode, String teacherName) {
        for (User student : students) {
            createMeetingStartedNotification(student, meetingCode, teacherName);
        }
    }
}

