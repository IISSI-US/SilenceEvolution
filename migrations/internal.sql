-- SilenceEvolution
-- Copyright (C) 2026 Oscar Alvarez Gonzalez

-- NOTE: Each statement is executed in different queries.

CREATE TABLE IF NOT EXISTS silence_users (
    user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(32) NOT NULL UNIQUE,
    password VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS silence_sessions (
    token_id VARCHAR(128) PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL REFERENCES silence_users (user_id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS silence_roles (
    user_id INT UNSIGNED PRIMARY KEY REFERENCES silence_users (user_id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL
);
