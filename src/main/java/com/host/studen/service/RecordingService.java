package com.host.studen.service;

import com.host.studen.model.Meeting;
import com.host.studen.model.Recording;
import com.host.studen.model.Transcript;
import com.host.studen.model.User;
import com.host.studen.repository.RecordingRepository;
import com.host.studen.repository.TranscriptRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class RecordingService {

    private static final Logger log = LoggerFactory.getLogger(RecordingService.class);

    @Value("${app.recording.dir:./recordings}")
    private String recordingDir;

    @Autowired
    private RecordingRepository recordingRepository;

    @Autowired
    private TranscriptRepository transcriptRepository;

    public Optional<Recording> findById(Long id) {
        return recordingRepository.findById(id);
    }

    public List<Recording> findByMeeting(Meeting meeting) {
        return recordingRepository.findByMeetingOrderByCreatedAtDesc(meeting);
    }

    public List<Recording> findByUser(User user) {
        return recordingRepository.findByRecordedByOrderByCreatedAtDesc(user);
    }

    /**
     * Auto-save recording with automatic transcript generation
     * This is called when student unmutes and records audio
     */
    @Transactional
    public Recording saveRecording(MultipartFile file, Meeting meeting, User recordedBy, long durationSeconds) throws IOException {
        // Create recording directory if it doesn't exist
        Path uploadPath = Paths.get(recordingDir, meeting.getMeetingCode());
        if (!Files.exists(uploadPath)) {
            Files.createDirectories(uploadPath);
        }

        // Generate unique filename
        String originalFilename = file.getOriginalFilename();
        String extension = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        }
        if (extension.isEmpty()) {
            extension = ".webm";
        }
        String uniqueFileName = UUID.randomUUID().toString() + extension;
        Path filePath = uploadPath.resolve(uniqueFileName);

        // Save file automatically - no user confirmation needed
        Files.copy(file.getInputStream(), filePath);
        log.info("Recording auto-saved: {} for student: {}", uniqueFileName, recordedBy.getDisplayName());

        // Create recording entity
        Recording recording = new Recording();
        recording.setMeeting(meeting);
        recording.setRecordedBy(recordedBy);
        recording.setFileName(originalFilename != null ? originalFilename : uniqueFileName);
        recording.setFilePath(filePath.toString());
        recording.setContentType(file.getContentType());
        recording.setFileSize(file.getSize());
        recording.setDurationSeconds(durationSeconds);
        recording.setStatus(Recording.RecordingStatus.READY);

        Recording savedRecording = recordingRepository.save(recording);
        
        // Auto-generate transcript placeholder
        generateTranscriptForRecording(savedRecording, recordedBy);
        
        return savedRecording;
    }

    /**
     * Save recording from raw bytes (for WebSocket/real-time recording)
     */
    @Transactional
    public Recording saveRecordingFromBytes(byte[] audioData, Meeting meeting, User recordedBy, 
                                            long durationSeconds, String contentType) throws IOException {
        // Create recording directory
        Path uploadPath = Paths.get(recordingDir, meeting.getMeetingCode());
        if (!Files.exists(uploadPath)) {
            Files.createDirectories(uploadPath);
        }

        // Generate filename
        String extension = contentType != null && contentType.contains("webm") ? ".webm" : ".wav";
        String uniqueFileName = UUID.randomUUID().toString() + extension;
        Path filePath = uploadPath.resolve(uniqueFileName);

        // Auto-save without confirmation
        Files.write(filePath, audioData);
        log.info("Recording auto-saved from bytes: {} for student: {}", uniqueFileName, recordedBy.getDisplayName());

        // Create and save recording entity
        Recording recording = new Recording();
        recording.setMeeting(meeting);
        recording.setRecordedBy(recordedBy);
        recording.setFileName(uniqueFileName);
        recording.setFilePath(filePath.toString());
        recording.setContentType(contentType != null ? contentType : "audio/webm");
        recording.setFileSize(audioData.length);
        recording.setDurationSeconds(durationSeconds);
        recording.setStatus(Recording.RecordingStatus.READY);

        Recording savedRecording = recordingRepository.save(recording);
        
        // Auto-generate transcript
        generateTranscriptForRecording(savedRecording, recordedBy);
        
        return savedRecording;
    }

    /**
     * Generate transcript for a recording
     * In production, this would call a speech-to-text API
     */
    private void generateTranscriptForRecording(Recording recording, User student) {
        try {
            Transcript transcript = new Transcript();
            transcript.setRecording(recording);
            transcript.setUser(student);
            transcript.setSpeakerName(student.getDisplayName());
            transcript.setContent("[Audio recording - " + recording.getDurationSeconds() + " seconds - Transcript pending processing]");
            transcript.setStartTimeSeconds(0);
            transcript.setEndTimeSeconds((int) recording.getDurationSeconds());
            transcript.setLanguage("en");
            transcriptRepository.save(transcript);
            log.info("Transcript placeholder created for recording: {}", recording.getId());
        } catch (Exception e) {
            log.error("Error generating transcript for recording: {}", e.getMessage());
        }
    }

    @Transactional
    public void deleteRecording(Long recordingId) {
        recordingRepository.findById(recordingId).ifPresent(recording -> {
            // Delete associated transcripts first
            List<Transcript> transcripts = transcriptRepository.findByRecordingId(recordingId);
            transcriptRepository.deleteAll(transcripts);
            
            // Delete file from disk
            try {
                Path filePath = Paths.get(recording.getFilePath());
                Files.deleteIfExists(filePath);
            } catch (IOException e) {
                log.error("Error deleting recording file: {}", e.getMessage());
            }
            recording.setStatus(Recording.RecordingStatus.DELETED);
            recordingRepository.save(recording);
            log.info("Recording deleted: {}", recordingId);
        });
    }

    public Path getRecordingPath(Recording recording) {
        return Paths.get(recording.getFilePath());
    }
    
    public long countByUser(User user) {
        return recordingRepository.findByRecordedByOrderByCreatedAtDesc(user).size();
    }
}

