package com.host.studen.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "meeting_participants")
public class MeetingParticipant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "meeting_id", nullable = false)
    private Meeting meeting;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    private Role roleInMeeting;

    private boolean micEnabled = true;
    private boolean cameraEnabled = true;
    private boolean handRaised = false;

    private LocalDateTime joinedAt;
    private LocalDateTime leftAt;

    @PrePersist
    protected void onCreate() {
        joinedAt = LocalDateTime.now();
    }

    // Constructors
    public MeetingParticipant() {}

    public MeetingParticipant(Meeting meeting, User user, Role roleInMeeting) {
        this.meeting = meeting;
        this.user = user;
        this.roleInMeeting = roleInMeeting;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Meeting getMeeting() { return meeting; }
    public void setMeeting(Meeting meeting) { this.meeting = meeting; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public Role getRoleInMeeting() { return roleInMeeting; }
    public void setRoleInMeeting(Role roleInMeeting) { this.roleInMeeting = roleInMeeting; }

    public boolean isMicEnabled() { return micEnabled; }
    public void setMicEnabled(boolean micEnabled) { this.micEnabled = micEnabled; }

    public boolean isCameraEnabled() { return cameraEnabled; }
    public void setCameraEnabled(boolean cameraEnabled) { this.cameraEnabled = cameraEnabled; }

    public boolean isHandRaised() { return handRaised; }
    public void setHandRaised(boolean handRaised) { this.handRaised = handRaised; }

    public LocalDateTime getJoinedAt() { return joinedAt; }
    public void setJoinedAt(LocalDateTime joinedAt) { this.joinedAt = joinedAt; }

    public LocalDateTime getLeftAt() { return leftAt; }
    public void setLeftAt(LocalDateTime leftAt) { this.leftAt = leftAt; }
}

