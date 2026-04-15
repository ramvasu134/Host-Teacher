package com.host.studen.service;

import com.host.studen.model.ChatMessage;
import com.host.studen.model.Meeting;
import com.host.studen.model.User;
import com.host.studen.repository.ChatMessageRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ChatService {

    @Autowired
    private ChatMessageRepository chatMessageRepository;

    public List<ChatMessage> getMessagesByMeeting(Meeting meeting) {
        return chatMessageRepository.findByMeetingOrderBySentAtAsc(meeting);
    }

    @Transactional
    public ChatMessage saveMessage(Meeting meeting, User sender, String message) {
        ChatMessage chatMessage = new ChatMessage(meeting, sender, message);
        return chatMessageRepository.save(chatMessage);
    }
}

