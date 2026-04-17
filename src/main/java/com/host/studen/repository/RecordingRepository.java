package com.host.studen.repository;

import com.host.studen.model.Meeting;
import com.host.studen.model.Recording;
import com.host.studen.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RecordingRepository extends JpaRepository<Recording, Long> {
    List<Recording> findByMeeting(Meeting meeting);
    List<Recording> findByRecordedBy(User user);
    List<Recording> findByMeetingOrderByCreatedAtDesc(Meeting meeting);
    List<Recording> findByRecordedByOrderByCreatedAtDesc(User user);
    List<Recording> findByStatus(Recording.RecordingStatus status);
    List<Recording> findByRecordedByAndStatusNotOrderByCreatedAtDesc(User user, Recording.RecordingStatus status);
    List<Recording> findByMeetingAndStatusNotOrderByCreatedAtDesc(Meeting meeting, Recording.RecordingStatus status);
}

