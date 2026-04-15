package com.host.studen.repository;

import com.host.studen.model.Schedule;
import com.host.studen.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface ScheduleRepository extends JpaRepository<Schedule, Long> {
    
    List<Schedule> findByTeacher(User teacher);
    
    List<Schedule> findByTeacherAndActiveTrue(User teacher);
    
    List<Schedule> findByTeacherOrderByScheduledStartTimeDesc(User teacher);
    
    @Query("SELECT s FROM Schedule s WHERE s.teacher.teacherName = :teacherName AND s.active = true ORDER BY s.scheduledStartTime ASC")
    List<Schedule> findActiveSchedulesByTeacherName(@Param("teacherName") String teacherName);
    
    @Query("SELECT s FROM Schedule s WHERE s.scheduledStartTime BETWEEN :start AND :end AND s.notificationSent = false")
    List<Schedule> findUpcomingSchedulesForNotification(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    
    @Query("SELECT s FROM Schedule s WHERE s.teacher = :teacher AND s.scheduledStartTime >= :now AND s.active = true ORDER BY s.scheduledStartTime ASC")
    List<Schedule> findUpcomingSchedules(@Param("teacher") User teacher, @Param("now") LocalDateTime now);
}

