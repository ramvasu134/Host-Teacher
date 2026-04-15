package com.host.studen.repository;

import com.host.studen.model.ChatMessage;
import com.host.studen.model.Meeting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    List<ChatMessage> findByMeetingOrderBySentAtAsc(Meeting meeting);
    List<ChatMessage> findByMeetingOrderBySentAtDesc(Meeting meeting);
}

