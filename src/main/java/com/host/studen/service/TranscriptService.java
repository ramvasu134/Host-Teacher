package com.host.studen.service;

import com.host.studen.model.Recording;
import com.host.studen.model.Transcript;
import com.host.studen.model.User;
import com.host.studen.repository.TranscriptRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class TranscriptService {

    @Autowired
    private TranscriptRepository transcriptRepository;

    public List<Transcript> findByRecording(Recording recording) {
        return transcriptRepository.findByRecordingOrderByStartTimeSecondsAsc(recording);
    }

    public List<Transcript> findByRecordingId(Long recordingId) {
        return transcriptRepository.findByRecordingId(recordingId);
    }

    public List<Transcript> findByUser(User user) {
        return transcriptRepository.findByUser(user);
    }

    public Optional<Transcript> findById(Long id) {
        return transcriptRepository.findById(id);
    }

    public List<Transcript> searchByContent(String keyword) {
        return transcriptRepository.findByContentContainingIgnoreCase(keyword);
    }

    public List<Transcript> searchBySpeaker(String speakerName) {
        return transcriptRepository.findBySpeakerNameContainingIgnoreCase(speakerName);
    }

    @Transactional
    public Transcript saveTranscript(Transcript transcript) {
        return transcriptRepository.save(transcript);
    }

    @Transactional
    public Transcript createTranscript(Recording recording, User user, String content, String speakerName,
                                       Integer startTime, Integer endTime) {
        Transcript transcript = new Transcript(recording, user, content, speakerName);
        transcript.setStartTimeSeconds(startTime);
        transcript.setEndTimeSeconds(endTime);
        return transcriptRepository.save(transcript);
    }

    @Transactional
    public void deleteTranscript(Long id) {
        transcriptRepository.deleteById(id);
    }

    @Transactional
    public void deleteByRecording(Recording recording) {
        List<Transcript> transcripts = transcriptRepository.findByRecording(recording);
        transcriptRepository.deleteAll(transcripts);
    }

    /**
     * Generate transcript from audio content (placeholder for actual speech-to-text integration)
     */
    @Transactional
    public Transcript generateTranscript(Recording recording, User user, String audioContent) {
        // In a real implementation, this would call a speech-to-text API
        // For now, we create a placeholder transcript
        Transcript transcript = new Transcript();
        transcript.setRecording(recording);
        transcript.setUser(user);
        transcript.setSpeakerName(user.getDisplayName());
        transcript.setContent("[Audio recorded - transcript pending]");
        transcript.setLanguage("en");
        return transcriptRepository.save(transcript);
    }

    public List<Transcript> findAll() {
        return transcriptRepository.findAll();
    }

    /**
     * Get combined transcript text for a recording
     */
    public String getTranscriptTextForRecording(Long recordingId) {
        List<Transcript> transcripts = transcriptRepository.findByRecordingId(recordingId);
        if (transcripts == null || transcripts.isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (Transcript t : transcripts) {
            if (t.getContent() != null && !t.getContent().isBlank()) {
                if (sb.length() > 0) sb.append(" ");
                sb.append(t.getContent());
            }
        }
        return sb.length() > 0 ? sb.toString() : null;
    }
}

