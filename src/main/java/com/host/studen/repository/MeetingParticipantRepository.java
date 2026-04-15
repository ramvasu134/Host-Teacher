package com.host.studen.repository;

import com.host.studen.model.Meeting;
import com.host.studen.model.MeetingParticipant;
import com.host.studen.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MeetingParticipantRepository extends JpaRepository<MeetingParticipant, Long> {
    List<MeetingParticipant> findByMeeting(Meeting meeting);
    List<MeetingParticipant> findByMeetingAndLeftAtIsNull(Meeting meeting);
    Optional<MeetingParticipant> findByMeetingAndUser(Meeting meeting, User user);
    Optional<MeetingParticipant> findByMeetingAndUserAndLeftAtIsNull(Meeting meeting, User user);
    boolean existsByMeetingAndUserAndLeftAtIsNull(Meeting meeting, User user);
    long countByMeetingAndLeftAtIsNull(Meeting meeting);
}

