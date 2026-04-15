package com.host.studen.controller.api;

import com.host.studen.model.Transcript;
import com.host.studen.service.TranscriptService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/transcript")
public class TranscriptApiController {

    @Autowired
    private TranscriptService transcriptService;

    /**
     * Get transcripts for a recording
     */
    @GetMapping("/recording/{recordingId}")
    public ResponseEntity<List<Map<String, Object>>> getTranscriptsForRecording(@PathVariable Long recordingId) {
        List<Transcript> transcripts = transcriptService.findByRecordingId(recordingId);
        
        List<Map<String, Object>> result = transcripts.stream()
                .map(t -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", t.getId());
                    map.put("content", t.getContent());
                    map.put("speakerName", t.getSpeakerName());
                    map.put("startTimeSeconds", t.getStartTimeSeconds());
                    map.put("endTimeSeconds", t.getEndTimeSeconds());
                    map.put("language", t.getLanguage());
                    map.put("createdAt", t.getCreatedAt() != null ? t.getCreatedAt().toString() : null);
                    return map;
                })
                .collect(Collectors.toList());
        
        return ResponseEntity.ok(result);
    }

    /**
     * Search transcripts by keyword
     */
    @GetMapping("/search")
    public ResponseEntity<List<Map<String, Object>>> searchTranscripts(@RequestParam String keyword) {
        List<Transcript> transcripts = transcriptService.searchByContent(keyword);
        
        List<Map<String, Object>> result = transcripts.stream()
                .map(t -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", t.getId());
                    map.put("content", t.getContent());
                    map.put("speakerName", t.getSpeakerName());
                    map.put("recordingId", t.getRecording() != null ? t.getRecording().getId() : null);
                    map.put("userId", t.getUser() != null ? t.getUser().getId() : null);
                    map.put("userDisplayName", t.getUser() != null ? t.getUser().getDisplayName() : null);
                    return map;
                })
                .collect(Collectors.toList());
        
        return ResponseEntity.ok(result);
    }
}

