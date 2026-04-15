package com.host.studen.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "transcripts")
public class Transcript {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recording_id")
    private Recording recording;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(columnDefinition = "TEXT")
    private String content;

    private String speakerName;
    
    private Integer startTimeSeconds;
    
    private Integer endTimeSeconds;

    private String language;

    @Column(updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    // Constructors
    public Transcript() {}

    public Transcript(Recording recording, User user, String content, String speakerName) {
        this.recording = recording;
        this.user = user;
        this.content = content;
        this.speakerName = speakerName;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Recording getRecording() { return recording; }
    public void setRecording(Recording recording) { this.recording = recording; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getSpeakerName() { return speakerName; }
    public void setSpeakerName(String speakerName) { this.speakerName = speakerName; }

    public Integer getStartTimeSeconds() { return startTimeSeconds; }
    public void setStartTimeSeconds(Integer startTimeSeconds) { this.startTimeSeconds = startTimeSeconds; }

    public Integer getEndTimeSeconds() { return endTimeSeconds; }
    public void setEndTimeSeconds(Integer endTimeSeconds) { this.endTimeSeconds = endTimeSeconds; }

    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}

