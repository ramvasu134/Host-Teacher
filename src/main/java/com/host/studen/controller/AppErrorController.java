package com.host.studen.controller;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
public class AppErrorController implements ErrorController {

    @RequestMapping("/error")
    public String handleError(HttpServletRequest request, Model model) {
        Object status = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        Object message = request.getAttribute(RequestDispatcher.ERROR_MESSAGE);
        Object exception = request.getAttribute(RequestDispatcher.ERROR_EXCEPTION);

        int statusCode = status != null ? Integer.parseInt(status.toString()) : 500;
        String errorMsg = message != null && !message.toString().isEmpty()
                ? message.toString()
                : HttpStatus.valueOf(statusCode).getReasonPhrase();

        if (exception instanceof Throwable t && t.getMessage() != null) {
            errorMsg = t.getMessage();
        }

        model.addAttribute("statusCode", statusCode);
        model.addAttribute("errorMessage", errorMsg);

        // Redirect authenticated users to their dashboard on 403/404
        if (statusCode == 403 || statusCode == 404) {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated()
                    && !"anonymousUser".equals(auth.getPrincipal())) {
                String role = auth.getAuthorities().stream()
                        .findFirst()
                        .map(a -> a.getAuthority())
                        .orElse("");
                if (role.contains("HOST")) {
                    return "redirect:/host/meetings";
                } else if (role.contains("STUDENT")) {
                    return "redirect:/student/room";
                }
            }
        }

        return "error";
    }
}

