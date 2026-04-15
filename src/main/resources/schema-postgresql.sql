-- =====================================================
--  Host Student Meeting — PostgreSQL Schema
--  (Reference only — Hibernate ddl-auto=update creates tables automatically)
--  Use this script when deploying to cloud PgSQL manually.
-- =====================================================

-- Users (hosts & students)
CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    teacher_name    VARCHAR(255) NOT NULL,
    username        VARCHAR(255) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    raw_password    VARCHAR(255),               -- Plain-text for teacher credential sharing
    display_name    VARCHAR(255) NOT NULL,
    role            VARCHAR(20)  NOT NULL,       -- HOST or STUDENT
    email           VARCHAR(255),
    phone           VARCHAR(50),
    profile_image   VARCHAR(500),
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at   TIMESTAMP
);

-- Add raw_password column if upgrading existing database
ALTER TABLE users ADD COLUMN IF NOT EXISTS raw_password VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_teacher  ON users(teacher_name);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);

-- Meetings
CREATE TABLE IF NOT EXISTS meetings (
    id                    BIGSERIAL PRIMARY KEY,
    title                 VARCHAR(255) NOT NULL,
    meeting_code          VARCHAR(20)  NOT NULL UNIQUE,
    description           TEXT,
    host_id               BIGINT NOT NULL REFERENCES users(id),
    status                VARCHAR(20)  NOT NULL DEFAULT 'SCHEDULED',  -- SCHEDULED, LIVE, ENDED, CANCELLED
    scheduled_at          TIMESTAMP,
    started_at            TIMESTAMP,
    ended_at              TIMESTAMP,
    max_participants      INT DEFAULT 50,
    recording_enabled     BOOLEAN DEFAULT TRUE,
    chat_enabled          BOOLEAN DEFAULT TRUE,
    screen_share_enabled  BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meetings_code   ON meetings(meeting_code);
CREATE INDEX IF NOT EXISTS idx_meetings_host   ON meetings(host_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

-- Meeting Participants
CREATE TABLE IF NOT EXISTS meeting_participants (
    id               BIGSERIAL PRIMARY KEY,
    meeting_id       BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id          BIGINT NOT NULL REFERENCES users(id),
    role_in_meeting  VARCHAR(20),
    mic_enabled      BOOLEAN DEFAULT TRUE,
    camera_enabled   BOOLEAN DEFAULT TRUE,
    hand_raised      BOOLEAN DEFAULT FALSE,
    joined_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at          TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_participants_user    ON meeting_participants(user_id);

-- Recordings
CREATE TABLE IF NOT EXISTS recordings (
    id               BIGSERIAL PRIMARY KEY,
    meeting_id       BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    recorded_by      BIGINT NOT NULL REFERENCES users(id),
    file_name        VARCHAR(500) NOT NULL,
    file_path        VARCHAR(1000) NOT NULL,
    content_type     VARCHAR(100),
    file_size        BIGINT DEFAULT 0,
    duration_seconds BIGINT DEFAULT 0,
    status           VARCHAR(20) DEFAULT 'PROCESSING',   -- PROCESSING, READY, FAILED, DELETED
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recordings_meeting ON recordings(meeting_id);

-- Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id          BIGSERIAL PRIMARY KEY,
    meeting_id  BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    sender_id   BIGINT NOT NULL REFERENCES users(id),
    message     TEXT NOT NULL,
    sent_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_meeting ON chat_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_chat_sent    ON chat_messages(sent_at);

