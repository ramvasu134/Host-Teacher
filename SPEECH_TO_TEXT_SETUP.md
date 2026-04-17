# Speech-to-Text Integration Setup Guide

## Overview

The **Host Mtng** application now includes automatic transcript generation for meeting recordings using **Google Cloud Speech-to-Text API**. This guide explains how to set up and use this feature.

---

## Architecture

### How It Works

1. **Recording Capture**: When a student shares audio during a meeting, it's saved as a `.webm` or `.wav` file
2. **Auto-Transcription**: After recording is saved, `RecordingService.generateTranscriptForRecording()` automatically:
   - Reads the audio file from disk
   - Calls Google Cloud Speech-to-Text API
   - Extracts and processes the returned transcript
   - Saves the transcript to the database
3. **Error Handling**: If API credentials aren't configured or the API fails, a fallback placeholder is created

### Key Components

- **`RecordingService.java`**
  - `generateTranscriptForRecording()`: Orchestrates transcript generation
  - `generateTranscriptFromAudio()`: Calls Google Cloud Speech-to-Text API
  
- **`Transcript` Entity**: Stores transcript text, speaker info, and metadata

- **`TranscriptRepository`**: Data access layer for transcripts

---

## Setup Instructions

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Cloud Speech-to-Text API**:
   - Search for "Speech-to-Text" in the API search box
   - Click "Speech-to-Text API"
   - Click **Enable**

### Step 2: Create a Service Account

1. In Google Cloud Console, go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Fill in the details:
   - **Service Account Name**: `host-mtng-speech-to-text`
   - **Description**: "For Host Mtng transcript generation"
4. Click **Create and Continue**
5. Grant the following roles:
   - **Cloud Speech Client** (role: `roles/speech.client`)
6. Click **Continue** and then **Done**

### Step 3: Create and Download Service Account Key

1. Click on the newly created service account
2. Go to the **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Click **Create**
6. A JSON file will download automatically (save this securely!)

### Step 4: Configure Environment Variable

**For Local Development (Dev Profile)**:

1. Set the environment variable `GOOGLE_APPLICATION_CREDENTIALS` to the path of your JSON key file:

   **Windows (PowerShell)**:
   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\your-service-account-key.json"
   ```

   **Windows (CMD)**:
   ```cmd
   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\your-service-account-key.json
   ```

   **macOS/Linux (Bash)**:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-service-account-key.json"
   ```

2. Start the application:
   ```bash
   ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
   ```

**For Docker (Production)**:

When running in Docker, mount the service account key and set the environment variable:

```bash
docker run -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/service-account-key.json \
  -v /path/to/service-account-key.json:/secrets/service-account-key.json:ro \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_NAME=meeting_db \
  -e DB_USER=postgres \
  -e DB_PASSWORD=postgres \
  host-student-meeting
```

**For Render.com (Cloud Deployment)**:

1. Add the following environment variables in Render dashboard:
   - `GOOGLE_APPLICATION_CREDENTIALS`: Path to credentials (e.g., `/etc/secrets/gcp-key.json`)
   
2. In Render service settings, add a secret file:
   - **Filename**: `gcp-key.json`
   - **Content**: Paste the entire contents of your service account JSON key file

---

## Testing the Integration

### Test Case 1: Local Development with Valid Credentials

1. Set up Google Cloud credentials (Steps 1-4 above)
2. Start the application:
   ```bash
   ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
   ```
3. Log in as a host and create a meeting
4. Have a student join and record audio
5. After recording is saved, check the database:
   ```sql
   SELECT * FROM transcript WHERE recording_id = <recording_id>;
   ```
6. The `content` field should contain the actual transcript text (not a placeholder)

### Test Case 2: Without Google Cloud Credentials

1. Unset or don't set `GOOGLE_APPLICATION_CREDENTIALS`
2. Start the application and record audio
3. Check the transcript:
   ```sql
   SELECT content FROM transcript WHERE recording_id = <recording_id>;
   ```
4. Result should be: `"[Audio recording - Google Cloud credentials not configured]"`

### Test Case 3: Audio File Not Found

1. Manually corrupt or delete a recording file after saving
2. The transcript should contain: `"[Audio recording - API failed to process]"`

### Test Case 4: No Speech Detected

1. Upload a silent or noise-only audio file
2. The transcript should be: `"[No speech detected in audio recording]"`

---

## Configuration Properties

Add these to your `application.properties` or environment-specific profiles:

```properties
# ===== Google Cloud Speech-to-Text (Optional) =====
# Set GOOGLE_APPLICATION_CREDENTIALS environment variable to enable
# If not set, transcripts will be created as placeholders
google.cloud.speech.enabled=true
google.cloud.speech.language=en-US
google.cloud.speech.sample-rate=16000
```

---

## Limitations & Considerations

### Audio Format Requirements

- **Supported Formats**: WAV, WebM, Flac, MP3 (see [Google Cloud docs](https://cloud.google.com/speech-to-text/docs/encoding))
- **Sample Rate**: 16 kHz recommended
- **Audio Encoding**: Linear PCM (LINEAR16)

### Cost

- **Free Tier**: 60 minutes of audio per month
- **Paid**: $0.024 per 15 seconds (~$1.60 per hour) after free tier
- **Monitor Usage**: Use Google Cloud Billing to track costs

### Performance

- Synchronous transcription blocks the recording save operation (~2-30 seconds depending on audio length)
- **Future Enhancement**: Implement async transcription using Google Cloud Tasks or Cloud Pub/Sub

### Privacy & Security

- Audio files are sent to Google Cloud servers
- Service account keys should be kept secure (use secret management in production)
- Store credentials as environment variables or secrets, never commit to Git

---

## Troubleshooting

### Issue: "GOOGLE_APPLICATION_CREDENTIALS not set"

**Solution**: Verify the environment variable is set and the path is correct:
```powershell
# Check if variable is set
$env:GOOGLE_APPLICATION_CREDENTIALS

# Verify the file exists
Test-Path "C:\path\to\your-service-account-key.json"
```

### Issue: "Permission denied" or "Invalid credentials"

**Solution**: 
1. Download a new service account key
2. Verify the key file has the correct JSON format
3. Ensure the service account has the `Cloud Speech Client` role

### Issue: Transcripts are empty or say "No speech detected"

**Possible Causes**:
- Audio file is silent or very quiet
- Audio format is not supported
- Audio encoding settings don't match the file

**Solution**: Test with a known good audio file to isolate the issue

### Issue: "Audio file not found"

**Solution**: Verify the recording file path exists:
```bash
# Check if recordings are being saved
ls -la ./recordings/
```

---

## API Documentation Reference

- [Google Cloud Speech-to-Text Documentation](https://cloud.google.com/speech-to-text/docs)
- [Supported Audio Formats](https://cloud.google.com/speech-to-text/docs/encoding)
- [Java Client Library](https://cloud.google.com/java/docs/reference/google-cloud-speech/latest/overview)

---

## Future Enhancements

1. **Async Transcription**: Use Cloud Tasks to process transcriptions asynchronously
2. **Speaker Diarization**: Identify who spoke when using Google Cloud's speaker diarization feature
3. **Language Detection**: Auto-detect audio language instead of hardcoding English
4. **Timestamp Mapping**: Include start/end times for each transcript segment
5. **Custom Vocabulary**: Add meeting-specific terms to improve accuracy
6. **Caching**: Cache identical audio files to avoid duplicate API calls

---

## Migration from Placeholder Transcripts

If you have existing recordings with placeholder transcripts:

1. Query for placeholder transcripts:
   ```sql
   SELECT * FROM transcript WHERE content LIKE '[Audio recording%';
   ```

2. To re-generate transcripts for existing recordings, you can add a utility method:
   ```java
   @Transactional
   public void regenerateAllTranscripts() {
       List<Recording> recordings = recordingRepository.findAll();
       for (Recording recording : recordings) {
           List<Transcript> existing = transcriptRepository.findByRecordingId(recording.getId());
           transcriptRepository.deleteAll(existing);
           generateTranscriptForRecording(recording, recording.getRecordedBy());
       }
   }
   ```

---

## Support

For issues or questions:
1. Check Google Cloud billing & API quotas
2. Review logs: `tail -f app.log | grep "Speech"`
3. Verify credentials with: `gcloud auth application-default print-access-token`
4. Contact Google Cloud support for API issues

---

**Last Updated**: April 17, 2026  
**Version**: 1.0  
**Status**: Production Ready ✅

