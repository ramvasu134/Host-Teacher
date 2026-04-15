package com.host.studen.dto;

import jakarta.validation.constraints.NotBlank;

public class MeetingRequest {

    @NotBlank(message = "Meeting title is required")
    private String title;

    private String description;
    private String scheduledAt;
    private int maxParticipants = 50;
    private boolean recordingEnabled = true;
    private boolean chatEnabled = true;
    private boolean screenShareEnabled = true;

    public MeetingRequest() {}

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getScheduledAt() { return scheduledAt; }
    public void setScheduledAt(String scheduledAt) { this.scheduledAt = scheduledAt; }

    public int getMaxParticipants() { return maxParticipants; }
    public void setMaxParticipants(int maxParticipants) { this.maxParticipants = maxParticipants; }

    public boolean isRecordingEnabled() { return recordingEnabled; }
    public void setRecordingEnabled(boolean recordingEnabled) { this.recordingEnabled = recordingEnabled; }

    public boolean isChatEnabled() { return chatEnabled; }
    public void setChatEnabled(boolean chatEnabled) { this.chatEnabled = chatEnabled; }

    public boolean isScreenShareEnabled() { return screenShareEnabled; }
    public void setScreenShareEnabled(boolean screenShareEnabled) { this.screenShareEnabled = screenShareEnabled; }
}

