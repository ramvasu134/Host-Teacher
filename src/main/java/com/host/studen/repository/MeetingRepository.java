package com.host.studen.repository;

import com.host.studen.model.Meeting;
import com.host.studen.model.MeetingStatus;
import com.host.studen.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MeetingRepository extends JpaRepository<Meeting, Long> {
    Optional<Meeting> findByMeetingCode(String meetingCode);
    List<Meeting> findByHost(User host);
    List<Meeting> findByHostOrderByCreatedAtDesc(User host);
    List<Meeting> findByStatus(MeetingStatus status);
    List<Meeting> findByHostAndStatus(User host, MeetingStatus status);

    @Query("SELECT m FROM Meeting m JOIN m.participants p WHERE p.user = :user ORDER BY m.createdAt DESC")
    List<Meeting> findMeetingsByParticipant(@Param("user") User user);

    @Query("SELECT m FROM Meeting m WHERE m.host = :user OR m.id IN (SELECT p.meeting.id FROM MeetingParticipant p WHERE p.user = :user) ORDER BY m.createdAt DESC")
    List<Meeting> findAllMeetingsForUser(@Param("user") User user);

    @Query("SELECT COUNT(p) FROM MeetingParticipant p WHERE p.meeting = :meeting AND p.leftAt IS NULL")
    long countActiveParticipants(@Param("meeting") Meeting meeting);
}

