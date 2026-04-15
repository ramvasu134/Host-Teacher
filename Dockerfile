# ===== Multi-stage build for production =====
FROM eclipse-temurin:17-jdk-alpine AS builder

WORKDIR /app
COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .
RUN chmod +x mvnw

# Download dependencies (cached layer)
RUN ./mvnw dependency:go-offline -B

# Copy source and build
COPY src src
RUN ./mvnw clean package -DskipTests -B

# ===== Runtime image =====
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Create directories for recordings & uploads
RUN mkdir -p /app/recordings /app/uploads

COPY --from=builder /app/target/*.jar app.jar

# Cloud-friendly defaults
ENV PORT=8080
ENV SPRING_PROFILES_ACTIVE=prod
# Tuned for Render free tier (512 MB RAM):
#   - SerialGC uses least memory overhead for single-core containers
#   - MaxRAMPercentage lets JVM self-tune if memory limit changes
ENV JAVA_OPTS="-server \
  -XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=70.0 \
  -XX:InitialRAMPercentage=30.0 \
  -XX:+UseSerialGC \
  -Djava.security.egd=file:/dev/./urandom \
  -Dspring.backgroundpreinitializer.ignore=true"

EXPOSE ${PORT}

ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -Dserver.port=${PORT} -jar app.jar"]
