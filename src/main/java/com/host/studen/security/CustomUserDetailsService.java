package com.host.studen.security;

import com.host.studen.model.User;
import com.host.studen.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    @Autowired
    private UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
        return new CustomUserDetails(user);
    }

    public UserDetails loadUserByUsernameAndTeacherName(String username, String teacherName)
            throws UsernameNotFoundException {
        User user = userRepository.findByUsernameAndTeacherName(username, teacherName)
                .orElseThrow(() -> new UsernameNotFoundException(
                        "User not found with username: " + username + " and teacher: " + teacherName));
        return new CustomUserDetails(user);
    }
}

