package com.host.studen.security;

import com.host.studen.model.User;
import com.host.studen.repository.UserRepository;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.LocalDateTime;

@Component
public class CustomAuthenticationSuccessHandler implements AuthenticationSuccessHandler {

    private final UserRepository userRepository;

    public CustomAuthenticationSuccessHandler(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        User user = userDetails.getUser();
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        // Redirect based on role
        String redirectUrl;
        if ("HOST".equals(userDetails.getRole())) {
            redirectUrl = "/host/dashboard";
        } else {
            redirectUrl = "/student/room";
        }

        response.sendRedirect(redirectUrl);
    }
}

