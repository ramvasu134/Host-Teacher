package com.host.studen.controller;

import com.host.studen.model.Meeting;
import com.host.studen.security.CustomUserDetails;
import com.host.studen.service.MeetingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Component
public class WebSocketEventListener {

    private static final Logger log = LoggerFactory.getLogger(WebSocketEventListener.class);
    // Grace period (seconds) before auto-ending — allows page refresh without killing meeting
    private static final int GRACE_SECONDS = 20;

    @Autowired
    private MeetingService meetingService;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    // hostId → pending auto-end task (cancelled if teacher reconnects within grace period)
    private final ConcurrentHashMap<Long, ScheduledFuture<?>> pendingEnd = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    /**
     * When teacher reconnects within the grace period, cancel the pending auto-end.
     */
    @EventListener
    public void handleWebSocketConnect(SessionConnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        Authentication auth = (Authentication) accessor.getUser();
        if (auth == null || !(auth.getPrincipal() instanceof CustomUserDetails)) return;

        CustomUserDetails userDetails = (CustomUserDetails) auth.getPrincipal();
        if (!"HOST".equals(userDetails.getRole())) return;

        Long hostId = userDetails.getUserId();
        ScheduledFuture<?> pending = pendingEnd.remove(hostId);
        if (pending != null && !pending.isDone()) {
            pending.cancel(false);
            log.info("[WS Connect] Cancelled pending meeting auto-end for host ID {} (reconnected)", hostId);
        }
    }

    /**
     * When any WebSocket session disconnects (browser close, navigation, timeout):
     * - If the disconnected user is a HOST and has a LIVE meeting →
     *   schedule auto-end after GRACE_SECONDS (allows page refresh to reconnect).
     * - Broadcast end-meeting control event so all students get redirected.
     */
    @EventListener
    public void handleWebSocketDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        Authentication auth = (Authentication) accessor.getUser();

        if (auth == null || !(auth.getPrincipal() instanceof CustomUserDetails)) return;

        CustomUserDetails userDetails = (CustomUserDetails) auth.getPrincipal();
        if (!"HOST".equals(userDetails.getRole())) return;

        Long hostId = userDetails.getUserId();

        // Find any LIVE meeting hosted by this teacher
        List<Meeting> liveMeetings = meetingService.findLiveMeetings();
        for (Meeting meeting : liveMeetings) {
            if (!meeting.getHost().getId().equals(hostId)) continue;

            final Long meetingId = meeting.getId();
            final String code    = meeting.getMeetingCode();

            // Cancel any pre-existing scheduled end for this host
            ScheduledFuture<?> existing = pendingEnd.remove(hostId);
            if (existing != null) existing.cancel(false);

            // Schedule auto-end after grace period
            ScheduledFuture<?> task = scheduler.schedule(() -> {
                pendingEnd.remove(hostId);
                try {
                    meetingService.endMeetingByHostId(meetingId, hostId);
                    log.info("[WS Disconnect] Auto-ended meeting {} for host ID {} after {}s grace",
                            code, hostId, GRACE_SECONDS);

                    Map<String, Object> endEvent = new HashMap<>();
                    endEvent.put("event", "end-meeting");
                    endEvent.put("reason", "Teacher disconnected");
                    messagingTemplate.convertAndSend("/topic/control/" + code, endEvent);

                } catch (Exception e) {
                    log.error("[WS Disconnect] Failed to auto-end meeting {}: {}", code, e.getMessage());
                }
            }, GRACE_SECONDS, TimeUnit.SECONDS);

            pendingEnd.put(hostId, task);
            log.info("[WS Disconnect] Scheduled meeting {} auto-end in {}s for host ID {}",
                    code, GRACE_SECONDS, hostId);
        }
    }
}
