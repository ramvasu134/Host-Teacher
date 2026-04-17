# Speech-to-Text API Integration - Technical Reference

## Overview

This document provides technical details on how the Google Cloud Speech-to-Text API is integrated into the Host Mtng application.

---

## API Configuration

### RecognitionConfig Settings

The application is configured to:

```java
RecognitionConfig config = RecognitionConfig.newBuilder()
    .setEncoding(AudioEncoding.LINEAR16)      // PCM encoding
    .setSampleRateHertz(16000)                 // 16 kHz sample rate
    .setLanguageCode("en-US")                  // English (US)
    .setEnableAutomaticPunctuation(true)       // Add punctuation
    .build();
```

### Why These Settings?

| Setting | Value | Reason |
|---------|-------|--------|
| **Encoding** | LINEAR16 | Standard PCM format, best compatibility |
| **Sample Rate** | 16 kHz | Optimal balance: quality vs. API latency |
| **Language** | en-US | Default for English-speaking users |
| **Punctuation** | Enabled | Makes transcripts more readable |

### Making Settings Configurable

To allow users to change these settings:

```properties
# In application.properties
google.cloud.speech.language=en-US
google.cloud.speech.sample-rate=16000
google.cloud.speech.enable-punctuation=true
```

Then inject in service:

```java
@Value("${google.cloud.speech.language:en-US}")
private String languageCode;

@Value("${google.cloud.speech.sample-rate:16000}")
private int sampleRateHertz;

@Value("${google.cloud.speech.enable-punctuation:true}")
private boolean enablePunctuation;
```

---

## API Request/Response Flow

### Step 1: Authentication

The Google Cloud Speech client authenticates using the service account JSON:

```
GOOGLE_APPLICATION_CREDENTIALS env var
    ↓
~/path/to/service-account-key.json
    ↓
Contains credentials:
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "xxx",
  "private_key": "-----BEGIN PRIVATE KEY-----...",
  "client_email": "speech-sa@your-project-id.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

### Step 2: Audio File Processing

```java
// Read audio bytes from file
Path audioPath = Paths.get(filePath);
byte[] audioBytes = Files.readAllBytes(audioPath);

// Convert to ByteString for API
ByteString audioData = ByteString.copyFrom(audioBytes);

// Create RecognitionAudio object
RecognitionAudio audio = RecognitionAudio.newBuilder()
    .setContent(audioData)
    .build();
```

### Step 3: API Call

```java
// Create Speech client (handles authentication)
SpeechClient speechClient = SpeechClient.create();

// Send recognition request
RecognizeResponse response = speechClient.recognize(config, audio);

// Process response
for (SpeechRecognitionResult result : response.getResultsList()) {
    for (int i = 0; i < result.getAlternativesCount(); i++) {
        SpeechRecognitionAlternative alternative = result.getAlternatives(i);
        String transcript = alternative.getTranscript();
        float confidence = alternative.getConfidence();
    }
}
```

### Step 4: Response Parsing

```
Google Cloud Response:
{
  "results": [
    {
      "alternatives": [
        {
          "transcript": "Hello this is a test recording",
          "confidence": 0.95
        }
      ]
    }
  ]
}

Java Object:
RecognizeResponse {
  results: [
    SpeechRecognitionResult {
      alternatives: [
        SpeechRecognitionAlternative {
          transcript: "Hello this is a test recording"
          confidence: 0.95
        }
      ]
    }
  ]
}
```

---

## Supported Audio Formats

### Format Detection

The current implementation reads raw audio bytes. Ensure audio files are one of:

| Format | Extension | Encoding | Details |
|--------|-----------|----------|---------|
| WAV | .wav | PCM/LINEAR16 | Recommended for best quality |
| WebM | .webm | Vorbis or Opus | Default from browser recording |
| MP3 | .mp3 | MP3 | Requires encoding conversion |
| FLAC | .flac | FLAC | Lossless format |

### Audio Format Conversion (Future Enhancement)

If you need to convert formats, use FFmpeg:

```bash
# Convert WebM to WAV
ffmpeg -i input.webm -acodec pcm_s16le -ar 16000 output.wav

# Convert MP3 to WAV
ffmpeg -i input.mp3 -acodec pcm_s16le -ar 16000 output.wav
```

---

## Error Handling & Edge Cases

### Case 1: API Credentials Missing

```java
String credentialsPath = System.getenv("GOOGLE_APPLICATION_CREDENTIALS");
if (credentialsPath == null || credentialsPath.isEmpty()) {
    return "[Audio recording - Google Cloud credentials not configured]";
}
```

**Result**: Graceful fallback, app doesn't crash

### Case 2: Audio File Not Found

```java
Path audioPath = Paths.get(filePath);
if (!Files.exists(audioPath)) {
    throw new IOException("Audio file not found: " + filePath);
}
```

**Result**: Exception caught, placeholder saved, error logged

### Case 3: No Speech Detected

```java
String finalTranscript = transcript.toString().trim();
if (finalTranscript.isEmpty()) {
    return "[No speech detected in audio recording]";
}
```

**Result**: Clear message indicating silent/empty audio

### Case 4: API Rate Limit Exceeded

```
Google Cloud will throw: 
com.google.api.gax.rpc.ResourceExhaustedException: 
Resource exhausted (RESOURCE_EXHAUSTED): The service has exhausted its quota
```

**Handling**:
```java
catch (ResourceExhaustedException e) {
    log.error("Speech API rate limit exceeded: {}", e.getMessage());
    transcriptContent = "[Audio recording - API rate limit exceeded]";
}
```

### Case 5: Invalid API Key

```
Google Cloud will throw:
com.google.api.gax.rpc.UnauthenticatedException: 
UNAUTHENTICATED: unauthenticated
```

**Handling**: Same catch-all exception handler creates placeholder

---

## Performance Characteristics

### Latency

| Audio Length | Expected Latency | Notes |
|--------------|------------------|-------|
| 10 seconds | 2-3 seconds | Near-real-time |
| 60 seconds | 4-6 seconds | Fast processing |
| 5 minutes | 15-20 seconds | Most recordings |
| 30 minutes | 60-90 seconds | Long meeting |

### File Size Impact

| Format | Bitrate | 1 Min | 10 Min | 60 Min |
|--------|---------|-------|--------|--------|
| WAV (16-bit, 16kHz) | 256 kbps | 1.9 MB | 19 MB | 115 MB |
| WebM (Opus) | 64 kbps | 0.5 MB | 5 MB | 30 MB |
| MP3 (128 kbps) | 128 kbps | 1 MB | 10 MB | 60 MB |

**Google Cloud Limit**: 480 MB per request (no issue for typical meetings)

---

## Cost Breakdown

### Pricing Model

- **Free Tier**: 60 minutes/month at no cost
- **Standard Rate**: $0.024 per 15 seconds after free tier
- **Bulk Discount**: Available for > 1M minutes/month

### Cost Calculation

```
Example: 100 hours of transcription/month

Minutes: 100 hours × 60 = 6,000 minutes
Beyond free: 6,000 - 60 = 5,940 minutes
Billable seconds: 5,940 × 60 = 356,400 seconds
Billable units: 356,400 ÷ 15 = 23,760 units
Cost: 23,760 × $0.024 = $570/month
```

### Cost Optimization Strategies

1. **Async Processing**: Don't block recording save
   - Saves: Parallelize transcriptions
   - Cost: No change, but better UX

2. **Audio Compression**: Pre-compress before sending
   - Saves: ~50% in some formats
   - Cost: ~$300/month for 100 hours

3. **Batch Processing**: Group transcriptions
   - Saves: Better resource utilization
   - Cost: ~10-15% savings

4. **Cache Duplicates**: Don't re-transcribe same audio
   - Saves: Depends on duplicate rate
   - Cost: Could save 5-20%

---

## Monitoring & Logging

### Log Output Examples

**Successful Transcription**:
```
[INFO] Successfully generated transcript from audio file: /recordings/meeting-abc/xyz.webm
[DEBUG] Transcript content: "Hello everyone, welcome to today's meeting..."
[INFO] Transcript generated for recording: 42
```

**Credentials Not Configured**:
```
[WARN] GOOGLE_APPLICATION_CREDENTIALS not set. Returning placeholder transcript.
[INFO] Transcript generated for recording: 42
```

**API Error**:
```
[ERROR] Error calling Google Cloud Speech-to-Text API: 
com.google.api.gax.rpc.UnauthenticatedException: UNAUTHENTICATED
[WARN] Failed to generate transcript from audio for recording 42: 
com.google.api.gax.rpc.UnauthenticatedException
[INFO] Transcript generated for recording: 42
```

### Monitoring Queries

**Check transcription status**:
```sql
-- Count successful transcriptions
SELECT COUNT(*) FROM transcript 
WHERE content NOT LIKE '[Audio recording%' 
AND DATE(created_at) = CURDATE();

-- Find failed transcriptions
SELECT id, content FROM transcript 
WHERE content LIKE '[Audio recording%' 
AND DATE(created_at) = CURDATE();

-- Average transcript length
SELECT 
    ROUND(AVG(LENGTH(content))) as avg_length,
    ROUND(AVG(LENGTH(content))/16.0) as avg_words
FROM transcript 
WHERE content NOT LIKE '[Audio recording%';
```

---

## Future Enhancements

### 1. Speaker Diarization

Identify who spoke when:

```java
SpeakerDiarizationConfig speakerDiarizationConfig = 
    SpeakerDiarizationConfig.newBuilder()
        .setEnableSpeakerDiarization(true)
        .setMinSpeakerCount(1)
        .setMaxSpeakerCount(10)
        .build();

config = RecognitionConfig.newBuilder()
    .setDiarizationConfig(speakerDiarizationConfig)
    .build();
```

### 2. Real-time Streaming

Transcribe as audio is being recorded:

```java
// Instead of RecognizeRequest
StreamingRecognizeRequest request = StreamingRecognizeRequest.newBuilder()
    .setAudioContent(ByteString.copyFrom(audioChunk))
    .build();

// Use streaming API instead of synchronous
apiClient.streamingRecognize(request);
```

### 3. Custom Vocabulary

Improve accuracy for domain-specific terms:

```java
CustomClass customClass = CustomClass.newBuilder()
    .setName("Meeting Terms")
    .addItems(ClassItem.newBuilder()
        .setValue("WebRTC")
        .build())
    .build();

PhraseSet phraseSet = PhraseSet.newBuilder()
    .setName("Meeting Phrases")
    .addPhrases(Phrase.newBuilder()
        .setValue("Host meeting")
        .setBoost(20)
        .build())
    .build();
```

### 4. Language Detection

Auto-detect language:

```java
RecognizeResponse response = speechClient.recognize(
    RecognitionConfig.newBuilder()
        .setLanguageCode("und")  // Undefined - auto-detect
        .build(),
    audio
);

// Access detected language
String detectedLanguage = response.getResults(0)
    .getLanguageCode();  // e.g., "en-US", "es-ES"
```

---

## Troubleshooting Guide

### Problem: "401 Unauthorized"

**Cause**: Invalid or expired credentials

**Solution**:
1. Download new service account key
2. Update `GOOGLE_APPLICATION_CREDENTIALS`
3. Restart application

### Problem: "400 Bad Request - Invalid encoding"

**Cause**: Audio file format not supported

**Solution**:
1. Verify audio encoding is LINEAR16
2. Use FFmpeg to convert: `ffmpeg -i input.webm -acodec pcm_s16le output.wav`
3. Try again

### Problem: Long transcription latency

**Cause**: Large audio file or API overload

**Solution** (Short term):
1. Reduce file size
2. Implement caching

**Solution** (Long term):
1. Implement async transcription
2. Use streaming API for real-time processing

### Problem: Transcript quality is poor

**Cause**: Low audio quality or background noise

**Solution**:
1. Use custom vocabulary for domain terms
2. Use speaker diarization if multiple speakers
3. Pre-process audio to remove background noise

---

## API Rate Limits

Google Cloud Speech-to-Text quotas:

| Limit | Default | Notes |
|-------|---------|-------|
| Requests/minute | 1,500 | Per project |
| Concurrent requests | 100 | Per project |
| Requests/day | Unlimited | Pay-as-you-go |
| Max audio file size | 480 MB | Per request |
| Max audio duration | Unlimited | Streaming API only |

**Increasing Quotas**: Contact Google Cloud support for enterprise plans

---

## References

- [Google Cloud Speech-to-Text API](https://cloud.google.com/speech-to-text/docs)
- [Java Client Library Documentation](https://cloud.google.com/java/docs/reference/google-cloud-speech/latest/overview)
- [Audio Encoding Formats](https://cloud.google.com/speech-to-text/docs/encoding)
- [Best Practices](https://cloud.google.com/speech-to-text/docs/best-practices)
- [Troubleshooting Guide](https://cloud.google.com/speech-to-text/docs/troubleshooting)

---

**Last Updated**: April 17, 2026  
**Version**: 1.0  
**Status**: Production Ready ✅

