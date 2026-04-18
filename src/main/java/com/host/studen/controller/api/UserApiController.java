package com.host.studen.controller.api;

import com.host.studen.model.User;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.RecordingService;
import com.host.studen.service.TranscriptService;
import com.host.studen.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;


@RestController
@RequestMapping("/api/user")
public class UserApiController {

    @Autowired
    private UserService userService;


    @Autowired
    private RecordingService recordingService;

    @Autowired
    private TranscriptService transcriptService;

    /**
     * Change password for the currently authenticated user.
     */
    @PostMapping("/change-password")
    public ResponseEntity<Map<String, Object>> changePassword(
            @RequestBody Map<String, String> request,
            @AuthenticationPrincipal CustomUserDetails userDetails) {

        Map<String, Object> response = new HashMap<>();
        try {
            String currentPassword = request.get("currentPassword");
            String newPassword     = request.get("newPassword");
            String confirmPassword = request.get("confirmPassword");

            if (currentPassword == null || currentPassword.isBlank()) {
                response.put("success", false);
                response.put("message", "Current password is required");
                return ResponseEntity.badRequest().body(response);
            }
            if (newPassword == null || newPassword.length() < 6) {
                response.put("success", false);
                response.put("message", "New password must be at least 6 characters");
                return ResponseEntity.badRequest().body(response);
            }
            if (!newPassword.equals(confirmPassword)) {
                response.put("success", false);
                response.put("message", "New passwords do not match");
                return ResponseEntity.badRequest().body(response);
            }

            User user = userDetails.getUser();
            userService.changePassword(user, currentPassword, newPassword);

            response.put("success", true);
            response.put("message", "Password changed successfully");
            return ResponseEntity.ok(response);

        } catch (RuntimeException e) {
            response.put("success", false);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    /**
     * Get recordings for the currently authenticated student (only their own clips).
     */
    @GetMapping("/recordings")
    public ResponseEntity<List<Map<String, Object>>> getMyRecordings(
            @AuthenticationPrincipal CustomUserDetails userDetails) {

        User user = userDetails.getUser();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");

        // Get recordings where this user is the actual recorder (not all meeting recordings)
        List<Map<String, Object>> result = recordingService.findByUser(user).stream()
                .map(r -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", r.getId());
                    map.put("fileName", r.getFileName());
                    map.put("meetingTitle", r.getMeeting() != null ? r.getMeeting().getTitle() : "");
                    map.put("createdAt", r.getCreatedAt() != null ? r.getCreatedAt().format(fmt) : "");
                    map.put("durationSeconds", r.getDurationSeconds());
                    map.put("fileSize", r.getFileSize());
                    // Include transcript content
                    String transcriptContent = transcriptService.getTranscriptTextForRecording(r.getId());
                    map.put("transcriptContent", transcriptContent);
                    return map;
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    /**
     * Delete a specific recording (only if the user owns it).
     */
    @DeleteMapping("/recordings/{id}")
    public ResponseEntity<Map<String, Object>> deleteRecording(
            @PathVariable Long id,
            @AuthenticationPrincipal CustomUserDetails userDetails) {

        Map<String, Object> response = new HashMap<>();
        try {
            recordingService.deleteRecording(id);
            response.put("success", true);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    /**
     * Upload profile photo for the currently authenticated teacher (HOST).
     */
    @PostMapping("/upload-profile-photo")
    public ResponseEntity<Map<String, Object>> uploadProfilePhoto(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal CustomUserDetails userDetails) {

        Map<String, Object> response = new HashMap<>();
        try {
            if (file.isEmpty()) {
                response.put("success", false);
                response.put("message", "Please select a file to upload");
                return ResponseEntity.badRequest().body(response);
            }

            // Validate image type
            String contentType = file.getContentType();
            if (contentType == null || !contentType.startsWith("image/")) {
                response.put("success", false);
                response.put("message", "Only image files are allowed");
                return ResponseEntity.badRequest().body(response);
            }

            User user = userDetails.getUser();
            String ext = getFileExtension(file.getOriginalFilename());
            String fileName = "profile-" + user.getId() + "-" + UUID.randomUUID().toString().substring(0, 8) + ext;

            // Save to profile-photos directory
            Path uploadDir = Paths.get("profile-photos");
            Files.createDirectories(uploadDir);
            Path filePath = uploadDir.resolve(fileName);
            Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);

            // Update user's teacherLogo to served URL
            String photoUrl = "/api/user/profile-photo/" + fileName;
            user.setTeacherLogo(photoUrl);
            userService.updateUser(user);

            response.put("success", true);
            response.put("photoUrl", photoUrl);
            response.put("message", "Profile photo updated successfully");
            return ResponseEntity.ok(response);

        } catch (IOException e) {
            response.put("success", false);
            response.put("message", "Failed to upload photo: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    /**
     * Serve profile photo files.
     */
    @GetMapping("/profile-photo/{fileName}")
    public ResponseEntity<org.springframework.core.io.Resource> getProfilePhoto(@PathVariable String fileName) {
        try {
            Path filePath = Paths.get("profile-photos").resolve(fileName);
            org.springframework.core.io.Resource resource = new org.springframework.core.io.UrlResource(filePath.toUri());
            if (!resource.exists()) {
                return ResponseEntity.notFound().build();
            }
            String contentType = Files.probeContentType(filePath);
            if (contentType == null) contentType = "image/jpeg";
            return ResponseEntity.ok()
                    .contentType(org.springframework.http.MediaType.parseMediaType(contentType))
                    .body(resource);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    private String getFileExtension(String filename) {
        if (filename == null) return ".jpg";
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(dot) : ".jpg";
    }
}
