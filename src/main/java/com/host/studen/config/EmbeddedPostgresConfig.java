package com.host.studen.config;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import javax.sql.DataSource;
import java.io.IOException;

/**
 * Starts a REAL embedded PostgreSQL server automatically.
 * Only active when profile = "embedded".
 * Usage:  mvn spring-boot:run -Dspring-boot.run.profiles=embedded
 */
@Configuration
@Profile("embedded")
public class EmbeddedPostgresConfig {

    private static final Logger log = LoggerFactory.getLogger(EmbeddedPostgresConfig.class);

    @Bean(destroyMethod = "close")
    public EmbeddedPostgres embeddedPostgres() throws IOException {
        log.info("Starting Embedded PostgreSQL Server (first run downloads ~50MB binary)...");
        EmbeddedPostgres pg = EmbeddedPostgres.builder().start();
        log.info("Embedded PostgreSQL READY — port={}, jdbc=jdbc:postgresql://localhost:{}/postgres",
                pg.getPort(), pg.getPort());
        return pg;
    }

    @Bean
    public DataSource dataSource(EmbeddedPostgres embeddedPostgres) {
        return embeddedPostgres.getPostgresDatabase();
    }
}
