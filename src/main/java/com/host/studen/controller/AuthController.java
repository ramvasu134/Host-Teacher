package com.host.studen.controller;

import com.host.studen.dto.LoginRequest;
import com.host.studen.dto.RegisterRequest;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.UserService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class AuthController {

    @Autowired
    private UserService userService;

    private boolean isRealUser(Authentication authentication) {
        return authentication != null
                && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken)
                && authentication.getPrincipal() instanceof CustomUserDetails;
    }

    @GetMapping("/")
    public String home(Authentication authentication) {
        if (isRealUser(authentication)) {
            CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
            if ("HOST".equals(userDetails.getRole())) {
                return "redirect:/host/dashboard";
            } else {
                return "redirect:/student/room";
            }
        }
        return "redirect:/login";
    }

    @GetMapping("/login")
    public String loginPage(@RequestParam(value = "error", required = false) String error,
                            Model model, Authentication authentication) {
        if (isRealUser(authentication)) {
            CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
            if ("HOST".equals(userDetails.getRole())) {
                return "redirect:/host/dashboard";
            }
            return "redirect:/student/room";
        }

        if (error != null) {
            model.addAttribute("error", "Invalid teacher name, username, or password.");
        }
        // Note: logout message is shown via th:if="${param.logout}" in login.html — no duplicate needed here
        model.addAttribute("loginRequest", new LoginRequest());
        return "login";
    }

    @GetMapping("/register")
    public String registerPage(Model model) {
        model.addAttribute("registerRequest", new RegisterRequest());
        return "register";
    }

    @PostMapping("/register")
    public String register(@Valid @ModelAttribute("registerRequest") RegisterRequest request,
                           BindingResult result, Model model, RedirectAttributes redirectAttributes) {
        if (result.hasErrors()) {
            return "register";
        }

        try {
            userService.registerUser(request);
            redirectAttributes.addFlashAttribute("message", "Registration successful! Please login.");
            return "redirect:/login";
        } catch (RuntimeException e) {
            model.addAttribute("error", e.getMessage());
            return "register";
        }
    }
}

