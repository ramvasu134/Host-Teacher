package com.host.studen.controller;

import com.host.studen.model.Role;
import com.host.studen.model.User;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.List;

@Controller
@RequestMapping("/student")
public class StudentController {

    @Autowired
    private UserService userService;

    @GetMapping("/room")
    public String lobbyPage(@AuthenticationPrincipal CustomUserDetails userDetails, Model model) {
        User student = userDetails.getUser();
        model.addAttribute("user", student);
        
        // Find the teacher for this student (based on teacherName)
        String teacherName = student.getTeacherName();
        List<User> teachers = userService.findByRole(Role.HOST);
        User teacher = teachers.stream()
                .filter(t -> t.getTeacherName().equals(teacherName))
                .findFirst()
                .orElse(null);
        
        model.addAttribute("teacher", teacher);
        return "student/lobby";
    }
}
