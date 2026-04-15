package com.host.studen.repository;

import com.host.studen.model.Recording;
import com.host.studen.model.Transcript;
import com.host.studen.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TranscriptRepository extends JpaRepository<Transcript, Long> {
    
    List<Transcript> findByRecording(Recording recording);
    
    List<Transcript> findByRecordingId(Long recordingId);
    
    List<Transcript> findByUser(User user);
    
    List<Transcript> findByRecordingOrderByStartTimeSecondsAsc(Recording recording);
    
    List<Transcript> findBySpeakerNameContainingIgnoreCase(String speakerName);
    
    List<Transcript> findByContentContainingIgnoreCase(String keyword);
}

