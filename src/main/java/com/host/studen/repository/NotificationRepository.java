package com.host.studen.repository;

import com.host.studen.model.Notification;
import com.host.studen.model.NotificationType;
import com.host.studen.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {
    
    List<Notification> findByUserOrderByCreatedAtDesc(User user);
    
    List<Notification> findByUserAndReadFalseOrderByCreatedAtDesc(User user);
    
    List<Notification> findByUserAndTypeOrderByCreatedAtDesc(User user, NotificationType type);
    
    long countByUserAndReadFalse(User user);
    
    void deleteByUser(User user);
}

