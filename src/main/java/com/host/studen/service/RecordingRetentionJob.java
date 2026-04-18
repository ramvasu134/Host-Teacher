package com.host.studen.service;

import com.host.studen.model.Recording;
import com.host.studen.repository.RecordingRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Nightly job that permanently deletes recordings (and their disk files) that are
 * older than {@code app.recording.retention.days} days.
 *
 * Runs every day at 02:00 server time.
 */
@Service
public class RecordingRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(RecordingRetentionJob.class);

    @Value("${app.recording.retention.days:10}")
    private int retentionDays;

    @Autowired
    private RecordingRepository recordingRepository;

    @Autowired
    private RecordingService recordingService;

    @PostConstruct
    void validate() {
        if (retentionDays < 1) {
            throw new IllegalStateException(
                    "app.recording.retention.days must be >= 1, but was: " + retentionDays);
        }
    }

    /**
     * Runs daily at 02:00 UTC.
     * Finds all non-deleted recordings created more than {@code retentionDays} days ago,
     * deletes the physical file from disk, removes associated transcripts, and marks
     * the DB row as DELETED — freeing server storage automatically.
     */
    @Scheduled(cron = "0 0 2 * * *", zone = "UTC")
    public void purgeExpiredRecordings() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(retentionDays);
        List<Recording> expired = recordingRepository
                .findByStatusNotAndCreatedAtBefore(Recording.RecordingStatus.DELETED, cutoff);

        if (expired.isEmpty()) {
            log.info("Recording retention job: no expired recordings found (cutoff = {}).", cutoff);
            return;
        }

        log.info("Recording retention job: found {} recording(s) older than {} days. Purging...",
                expired.size(), retentionDays);

        int deleted = 0;
        int failed = 0;
        for (Recording recording : expired) {
            try {
                recordingService.deleteRecording(recording.getId());
                deleted++;
            } catch (Exception e) {
                log.error("Retention job: failed to delete recording id={}: {}", recording.getId(), e.getMessage(), e);
                failed++;
            }
        }

        log.info("Recording retention job complete: deleted={}, failed={}", deleted, failed);
    }
}
