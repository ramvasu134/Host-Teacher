package com.host.studen.repository;

import com.host.studen.model.User;
import com.host.studen.model.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsernameAndTeacherName(String username, String teacherName);
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
    List<User> findByRole(Role role);
    List<User> findByTeacherName(String teacherName);
    List<User> findByTeacherNameAndRole(String teacherName, Role role);
    List<User> findByActiveTrue();
}

