# Host Student Meeting — WebRTC App

A real-time video meeting platform for teachers (hosts) and students, built with:
- **Spring Boot 3.4** (Java 17)
- **WebRTC + WebSocket** for peer-to-peer video
- **Thymeleaf** for server-side rendering
- **Spring Security** for role-based auth
- **PostgreSQL** for persistence

---

## 🚀 Deploy to Render.com (One-Click)

### Option A — Render Blueprint (Recommended)

1. Push your code to GitHub / GitLab.
2. Go to [https://dashboard.render.com/select-repo](https://dashboard.render.com/select-repo).
3. Select your repository — Render will detect `render.yaml` automatically.
4. Click **Apply** — Render creates the PostgreSQL database and web service for you.
5. ✅ Done. Visit the service URL once the build finishes (~5 min on first deploy).

### Option B — Manual Deploy

1. **Create a PostgreSQL database** on Render → note the internal connection details.
2. **Create a new Web Service** → connect your repo → choose **Docker** environment.
3. Set these **Environment Variables** in the Render dashboard:

| Variable | Value |
|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` |
| `DB_HOST` | *(from Render Postgres → Internal Hostname)* |
| `DB_PORT` | `5432` |
| `DB_NAME` | *(your database name)* |
| `DB_USER` | *(your database user)* |
| `DB_PASSWORD` | *(your database password)* |
| `JWT_SECRET` | *(run `openssl rand -hex 64`)* |

4. Leave `PORT` unset — Render injects it automatically.

---

## 🔑 Default Demo Credentials

> **Change these passwords** after first login in production!

| Role | Teacher Name | Username | Password |
|---|---|---|---|
| Teacher (Host) | — | `vk99` | `123456` |
| Teacher (Host) | — | `rahul` | `pass@123` |
| Student | `VK2` | `priya` | `123456` |
| Student | `VK2` | `hyd` | `123456` |
| Student | `VK2` | `sha` | `123456` |
| Admin | — | `admin` | `admin123` |

---

## 🏗️ Local Development

```bash
# Option 1 – H2 in-memory (zero setup)
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# Option 2 – Real PostgreSQL via Docker Compose
docker-compose up -d
./mvnw spring-boot:run -Dspring-boot.run.profiles=pgsql

# Option 3 – Build & run the Docker image locally
docker build -t host-student-meeting .
docker run -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e DB_HOST=localhost -e DB_PORT=5432 \
  -e DB_NAME=meeting_db -e DB_USER=postgres -e DB_PASSWORD=postgres \
  host-student-meeting
```

App URL: http://localhost:8080

---

## 📁 Project Structure

```
src/main/java/com/host/studen/
├── config/          # Security, WebSocket, JPA configs
├── controller/      # MVC + REST controllers
├── dto/             # Data transfer objects
├── model/           # JPA entities
├── repository/      # Spring Data JPA repos
├── security/        # JWT + Spring Security filters
└── service/         # Business logic

src/main/resources/
├── application.properties              # Base config (profile = dev by default)
├── application-dev.properties          # H2 in-memory dev profile
├── application-pgsql.properties        # External PostgreSQL (local/Docker)
├── application-embedded.properties     # Embedded PostgreSQL (no install)
├── application-prod.properties         # Production / Render.com
├── templates/                          # Thymeleaf HTML templates
└── static/                             # CSS, JS, WebRTC scripts
```

---

## ⚠️ Render Free Tier Notes

- The web service **spins down after 15 min of inactivity** — first request after sleep takes ~30 s.
- The PostgreSQL free tier is limited to **1 GB storage** and is deleted after 90 days.
- File uploads and recordings are stored on **ephemeral disk** (lost on redeploy). For persistent storage, integrate with **AWS S3** or **Cloudinary**.
- Upgrade to the **Starter plan** ($7/mo) to avoid spin-down and get a persistent disk.

