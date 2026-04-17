# AGENTS.md — Quick Start for AI Coding Agents

## 🎯 Project Overview

**Host Mtng**: A real-time video meeting platform for teachers (hosts) and students using WebRTC + Spring Boot 3.4 (Java 17). Built for role-based video conferencing with recordings, chat, and screen sharing.

**Key Tech Stack**: Spring Boot 3.4, Java 17, PostgreSQL/H2, WebRTC, WebSocket (STOMP), Thymeleaf, Spring Security, JPA/Hibernate

---

## 🏗️ Architecture & Data Flow

### Three-Layer Architecture

```
Controllers (MVC + WebSocket)
    ↓
Services (Business Logic, Transaction Boundary)
    ↓
Repositories + Models (Spring Data JPA)
    ↓
Database (PostgreSQL/H2)
```

### Critical Components & Responsibilities

| Component | Purpose | Key Files |
|-----------|---------|-----------|
| **Meeting Orchestration** | Create, start, end, manage participant limits | `MeetingService.java`, `Meeting.java` model |
| **WebSocket Signaling** | Peer-to-peer WebRTC offer/answer negotiation | `WebSocketController.java`, `@MessageMapping("/signal/{meetingCode}")` |
| **Security Layer** | Role-based access (HOST/STUDENT), custom auth | `SecurityConfig.java`, `CustomAuthenticationProvider.java` |
| **Recording Pipeline** | Capture audio/video, store on filesystem | `RecordingService.java`, uses `Base64` encoding in signals |
| **Chat System** | Broadcast messages to meeting participants | `ChatService.java`, `/topic/chat/{meetingCode}` |

### Data Flow: User Joins Meeting

1. **Login**: `AuthController` → `CustomAuthenticationProvider` (validates username + teacherName)
2. **Access Meeting**: `MeetingController.joinMeeting()` checks host/student role via `@PreAuthorize`
3. **WebSocket Connect**: Client connects to `/ws` endpoint, Spring STOMP broker registers session
4. **WebRTC Signaling**: `WebSocketController` handles `/app/signal/{meetingCode}` → broadcasts to `/topic/signal/{meetingCode}`
5. **Recording**: `RecordingService` receives Base64-encoded chunks, writes to `APP_RECORDING_DIR`

---

## 🔄 Multi-Environment Configuration Strategy

**Profile System** (`spring.profiles.active`): Switches database backend without code changes

| Profile | Database | Use Case | Startup Time |
|---------|----------|----------|--------------|
| `dev` | H2 (PostgreSQL mode) | Local dev, zero install | ~3 sec |
| `pgsql` | External PostgreSQL (Docker) | Full feature testing | ~5 sec |
| `prod` | PostgreSQL (env-var config) | Render.com cloud | ~8 sec |

**Key Property Files**:
- `application.properties` → base config + profile switcher
- `application-{profile}.properties` → profile-specific overrides
- **Environment Variables Override**: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (prod only)

**Critical for Agents**: When adding features with database impact, ensure all three profiles are tested. Use `@Conditionalbean` if profile-specific behavior needed.

---

## 🔐 Authentication & Authorization Patterns

### Custom Auth Provider Flow
```java
// Non-standard: username + teacherName (optional) for HOST role
CustomAuthenticationProvider.authenticate()
    ↓
UserDetails lookup by username + teacherName (if present)
    ↓
Password validation (BCrypt)
    ↓
Populate authorities (ROLE_HOST, ROLE_STUDENT, ROLE_ADMIN)
```

### Method-Level Security
```java
@PreAuthorize("hasRole('HOST')")  // Only hosts can create meetings
@PreAuthorize("hasRole('STUDENT')")  // Only students can join
@PreAuthorize("isAuthenticated()")  // Any authenticated user
```

**Important**: Authority strings are stored as `ROLE_*` in database but referenced without `ROLE_` prefix in annotations.

---

## 🔌 WebSocket Message Routing

**STOMP Broker Configuration** (`WebSocketConfig.java`):
- **Inbound**: `/app/*` → routed to `@MessageMapping` handlers
- **Outbound**: `/topic/*` (broadcast to all subscribers), `/queue/*` (private messages), `/user/*` (user-specific)

### Common Patterns

| Pattern | Handler | Broadcasts To | Use Case |
|---------|---------|---|----------|
| `/app/signal/{meetingCode}` | `handleSignal()` | `/topic/signal/{meetingCode}` | WebRTC offer/answer |
| `/app/chat/{meetingCode}` | `handleChat()` | `/topic/chat/{meetingCode}` | Meeting chat |
| `/app/participant/{meetingCode}` | `handleJoinParticipant()` | `/topic/participant/{meetingCode}` | Join/leave events |

**Debug Tip**: Enable STOMP logging → `logging.level.org.springframework.messaging=DEBUG`

---

## 📂 Project Structure & Conventions

```
src/main/java/com/host/studen/
├── config/          → @Configuration beans (Security, WebSocket, Data init)
├── controller/      → @Controller/@RestController, routing to services
├── controller/api/  → REST endpoints (if present)
├── dto/             → Transfer objects (requests/responses, no persistence)
├── model/           → @Entity classes, JPA persistence, getters/setters
├── repository/      → Spring Data JPA interfaces (CRUD + custom queries)
├── security/        → Auth providers, user details, success handlers
└── service/         → Business logic, @Transactional boundaries, complex queries

src/main/resources/
├── application*.properties     → Profile-specific configs
├── templates/                  → Thymeleaf HTML (server-side rendering)
└── static/                     → CSS, JS, WebRTC client scripts
```

**Naming Convention**: `*Service` classes contain business logic; `*Controller` handle routing; `*Repository` handle data access.

---

## 🎨 Branding & UI Conventions

**Current Branding** (as of Apr 17, 2026):
- **App Name**: "Host Mtng" (changed from "AiR Voices")
- **Icon**: Video symbol 🎥
- **Color Scheme**: Coffee Brown (#3E2723) + Lemon Orange (#FFB84D)
- **Hero Profile**: He-Man cartoon SVG (`/static/images/heman-profile.svg`)

**When Updating UI**:
1. Always search for old brand names (may appear in comments/strings)
2. Use existing color variables (avoid hardcoding hex)
3. Update both HTML templates AND CSS files
4. Test across all three profiles (dev/pgsql/prod)

---

## 🛠️ Essential Build & Run Commands

### Development (H2, instant start)
```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
# App ready at http://localhost:8080
# H2 console at http://localhost:8080/h2-console
# Credentials: username=postgres, password=postgres (in application-dev.properties)
```

### Testing (Real PostgreSQL via Docker)
```bash
docker-compose up -d                # Start PostgreSQL + pgAdmin
./mvnw spring-boot:run -Dspring-boot.run.profiles=pgsql
# pgAdmin: http://localhost:5050 (admin@meeting.com / admin123)
```

### Production Build (JAR)
```bash
./mvnw clean package -DskipTests    # Builds target/*.jar (~47 MB)
java -jar target/Host-Student-Meeting-0.0.1-SNAPSHOT.jar
```

### Docker Build (for Render.com)
```bash
docker build -t host-student-meeting .
docker run -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e DB_HOST=localhost -e DB_PORT=5432 \
  -e DB_NAME=meeting_db -e DB_USER=postgres -e DB_PASSWORD=postgres \
  host-student-meeting
```

---

## 🧪 Testing Strategy

### Test Profiles
- **Dev**: H2 in-memory (unit tests, fast)
- **Test**: `application-test.properties` (integration tests, isolated DB)
- **Prod**: Only for pre-deployment smoke tests (use staging DB)

**JUnit Dependency**: `spring-boot-starter-test` + `spring-security-test` included in pom.xml

---

## ⚠️ Critical Developer Gotchas

1. **Package Name Typo**: Java package is `com.host.studen` (not `student` — missing 't'). Affects all imports & file paths.

2. **Profile-Specific Beans**: H2 requires different Hibernate dialect than PostgreSQL. Don't assume all SQL works across profiles.

3. **WebSocket Sessions**: STOMP message headers require explicit extraction via `SimpMessageHeaderAccessor`. Security context not auto-populated.

4. **Recordings on Ephemeral Disk**: Production containers (Render free tier) lose files on redeploy. Store persistently via S3/Cloudinary or accept data loss.

5. **JWT Secret in Properties**: Hardcoded fallback in `application-prod.properties`. MUST override with env var `JWT_SECRET` in production.

6. **Role Prefix**: Spring Security adds `ROLE_` prefix internally but annotations use unprefixed names (`@PreAuthorize("hasRole('HOST')")` works).

---

## 📊 Database Schema Quick Reference

### Key Entities
- **User**: username, password, role (HOST/STUDENT/ADMIN), teacherName
- **Meeting**: title, meetingCode (unique), host_id, status, scheduledAt, recordingEnabled
- **MeetingParticipant**: user_id, meeting_id, joinedAt, leftAt
- **ChatMessage**: sender_id, meeting_id, content, timestamp
- **Recording**: meeting_id, filename, duration, createdAt
- **Schedule**: host_id, recurrence rules (if applicable)

**Relationship Patterns**: 
- User → Meeting (1:many, host_id FK)
- User → MeetingParticipant → Meeting (many-to-many join table)
- Meeting → ChatMessage (1:many)
- Meeting → Recording (1:many)

---

## 🎯 Common Tasks for Agents

### Adding a New Feature
1. **Create Entity** in `model/` → add `@Entity`, `@Table`, FK relationships
2. **Create Repository** in `repository/` → extend `JpaRepository<Entity, ID>`
3. **Create Service** in `service/` → add `@Service`, `@Transactional`, inject repository
4. **Create Controller** in `controller/` → `@PostMapping`, `@GetMapping`, inject service
5. **Test Across Profiles**: Run with `dev` (fast) then `pgsql` (real DB)
6. **Update UI** if needed: Templates in `templates/`, static assets in `static/`

### Debugging WebSocket Issues
1. Enable STOMP logging: `logging.level.org.springframework.messaging=DEBUG`
2. Check broker routes in `WebSocketConfig.configureMessageBroker()`
3. Verify `@MessageMapping` path syntax (e.g., `/signal/{meetingCode}` expects path variable)
4. Remember: STOMP adds `/app` prefix before sending to handlers

### Changing Database
1. Update active profile in `application.properties` or use `-Dspring-boot.run.profiles={profile}`
2. Ensure all three profiles have valid datasource configs
3. Test data initialization via `DataInitializer.java` runs on startup

---

## 📚 Documentation Index

- **README.md** → Deployment & local setup
- **PROJECT_DOCUMENTATION_INDEX.md** → Complete project history & branding
- **IMPLEMENTATION_COMPLETE.md** → Feature details & He-Man profile
- **COLOR_SCHEME_IMPLEMENTATION.md** → Color palette & CSS classes
- **SMOKE_TEST_REPORT.md** → QA test results
- **REBRANDING_SUMMARY.md** → Branding changes from "AiR Voices"

---

## 🚀 Deployment Checklist (Before Going to Render)

- [ ] All profiles tested locally (dev, pgsql, prod)
- [ ] JAR builds without errors: `mvn clean package -DskipTests`
- [ ] Docker image builds: `docker build -t host-student-meeting .`
- [ ] Environment variables validated (DB_*, JWT_SECRET)
- [ ] Recording/upload directories writable (or use S3)
- [ ] Render.yaml matches pom.xml Java version (17)
- [ ] Security config allows CORS if needed
- [ ] Test user credentials work (vk99/123456 for host, priya/123456 for student)

---

## 🤖 Agent Guidelines

**Before Code Changes**:
- Read the relevant service & model classes
- Check existing patterns in the codebase
- Test locally with `dev` profile first
- Verify changes across all three profiles

**Focus Areas**:
- Security: Role checks, SQL injection prevention, XSS protection
- Performance: Connection pooling tuned for Render free tier
- UX: Consistency with coffee brown & lemon orange branding
- Data Integrity: JPA relationships, cascade rules, transaction boundaries

---

**Last Updated**: April 17, 2026 | **Status**: Production Ready ✅

