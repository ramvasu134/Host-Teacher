package com.host.studen.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "meetings")
public class Meeting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, unique = true)
    private String meetingCode;

    private String description;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "host_id", nullable = false)
    private User host;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MeetingStatus status = MeetingStatus.SCHEDULED;

    private LocalDateTime scheduledAt;
    private LocalDateTime startedAt;
    private LocalDateTime endedAt;

    private int maxParticipants = 50;
    private boolean recordingEnabled = true;
    private boolean chatEnabled = true;
    private boolean screenShareEnabled = true;

    @Column(updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "meeting", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<MeetingParticipant> participants = new HashSet<>();

    @OneToMany(mappedBy = "meeting", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<Recording> recordings = new HashSet<>();

    @OneToMany(mappedBy = "meeting", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<ChatMessage> chatMessages = new HashSet<>();

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (meetingCode == null || meetingCode.isEmpty()) {
            meetingCode = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        }
    }

    // Constructors
    public Meeting() {}

    public Meeting(String title, User host) {
        this.title = title;
        this.host = host;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getMeetingCode() { return meetingCode; }
    public void setMeetingCode(String meetingCode) { this.meetingCode = meetingCode; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public User getHost() { return host; }
    public void setHost(User host) { this.host = host; }

    public MeetingStatus getStatus() { return status; }
    public void setStatus(MeetingStatus status) { this.status = status; }

    public LocalDateTime getScheduledAt() { return scheduledAt; }
    public void setScheduledAt(LocalDateTime scheduledAt) { this.scheduledAt = scheduledAt; }

    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }

    public LocalDateTime getEndedAt() { return endedAt; }
    public void setEndedAt(LocalDateTime endedAt) { this.endedAt = endedAt; }

    public int getMaxParticipants() { return maxParticipants; }
    public void setMaxParticipants(int maxParticipants) { this.maxParticipants = maxParticipants; }

    public boolean isRecordingEnabled() { return recordingEnabled; }
    public void setRecordingEnabled(boolean recordingEnabled) { this.recordingEnabled = recordingEnabled; }

    public boolean isChatEnabled() { return chatEnabled; }
    public void setChatEnabled(boolean chatEnabled) { this.chatEnabled = chatEnabled; }

    public boolean isScreenShareEnabled() { return screenShareEnabled; }
    public void setScreenShareEnabled(boolean screenShareEnabled) { this.screenShareEnabled = screenShareEnabled; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public Set<MeetingParticipant> getParticipants() { return participants; }
    public void setParticipants(Set<MeetingParticipant> participants) { this.participants = participants; }

    public Set<Recording> getRecordings() { return recordings; }
    public void setRecordings(Set<Recording> recordings) { this.recordings = recordings; }

    public Set<ChatMessage> getChatMessages() { return chatMessages; }
    public void setChatMessages(Set<ChatMessage> chatMessages) { this.chatMessages = chatMessages; }
}

