-- Lebanon Sports Hub — Full Schema for Aiven
-- Run this in Aiven Query Editor

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- 1. sports_categories
CREATE TABLE IF NOT EXISTS sports_categories (
    id          INT           AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL UNIQUE,
    description TEXT,
    icon        VARCHAR(100),
    created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- 2. venues
CREATE TABLE IF NOT EXISTS venues (
    id          INT           AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(150)  NOT NULL,
    address     VARCHAR(255),
    city        VARCHAR(100)  DEFAULT 'Beirut',
    latitude    DECIMAL(10,7),
    longitude   DECIMAL(10,7),
    capacity    INT,
    created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- 3. users
CREATE TABLE IF NOT EXISTS users (
    id              INT           AUTO_INCREMENT PRIMARY KEY,
    full_name       VARCHAR(150)  NOT NULL,
    email           VARCHAR(255)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255)  NOT NULL,
    phone           VARCHAR(30),
    sport_interest  VARCHAR(100),
    status          ENUM('pending','approved','rejected') DEFAULT 'pending',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- 4. admins
CREATE TABLE IF NOT EXISTS admins (
    id            INT           AUTO_INCREMENT PRIMARY KEY,
    full_name     VARCHAR(150)  NOT NULL,
    email         VARCHAR(255)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- 5. events
CREATE TABLE IF NOT EXISTS events (
    id               INT           AUTO_INCREMENT PRIMARY KEY,
    title            VARCHAR(200)  NOT NULL,
    description      TEXT,
    sport_category   VARCHAR(100),
    venue_id         INT,
    event_date       DATE          NOT NULL,
    event_time       TIME,
    max_participants INT           DEFAULT 50,
    status           ENUM('upcoming','ongoing','completed','cancelled') DEFAULT 'upcoming',
    image_url        VARCHAR(500),
    created_by       INT,
    created_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id)   REFERENCES venues(id)  ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES admins(id)  ON DELETE SET NULL
);

-- 6. event_registrations
CREATE TABLE IF NOT EXISTS event_registrations (
    id              INT           AUTO_INCREMENT PRIMARY KEY,
    event_id        INT           NULL,
    event_ref       VARCHAR(50),
    event_title     VARCHAR(200),
    user_id         INT,
    guest_name      VARCHAR(150),
    guest_email     VARCHAR(255),
    guest_phone     VARCHAR(30),
    status          ENUM('pending','approved','rejected') DEFAULT 'pending',
    registered_at   DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE SET NULL
);

-- 7. activity_log
CREATE TABLE IF NOT EXISTS activity_log (
    id          INT           AUTO_INCREMENT PRIMARY KEY,
    admin_id    INT,
    action      VARCHAR(255)  NOT NULL,
    target_type VARCHAR(50),
    target_id   INT,
    created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- 8. notifications (used by App.py)
CREATE TABLE IF NOT EXISTS notifications (
    id          INT           AUTO_INCREMENT PRIMARY KEY,
    user_id     INT,
    message     TEXT          NOT NULL,
    is_read     TINYINT(1)    DEFAULT 0,
    created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS=1;

-- Seed: Sports Categories
INSERT IGNORE INTO sports_categories (name, description, icon) VALUES
('Football',   'Outdoor team sport',        'fa-futbol'),
('Basketball', 'Indoor/outdoor team sport', 'fa-basketball'),
('Tennis',     'Racket sport',              'fa-table-tennis-paddle-ball'),
('Swimming',   'Aquatic sport',             'fa-person-swimming'),
('Running',    'Track and road racing',     'fa-person-running'),
('Volleyball', 'Net team sport',            'fa-volleyball'),
('Cycling',    'Road and mountain cycling', 'fa-bicycle'),
('Boxing',     'Combat sport',              'fa-hand-fist');

-- Seed: Venues
INSERT IGNORE INTO venues (name, address, city, latitude, longitude, capacity) VALUES
('Beirut Sports Complex',   'Corniche Mazraa, Beirut',  'Beirut',  33.8869, 35.5131, 500),
('Sports City Stadium',     'Sports City, Beirut',      'Beirut',  33.8833, 35.4942, 2000),
('Hamra Community Court',   'Hamra St, Beirut',         'Beirut',  33.8938, 35.4865, 100),
('Jounieh Beach Arena',     'Marina Jounieh',           'Jounieh', 33.9810, 35.6178, 300),
('Tripoli Sports Hall',     'Al-Mina Rd, Tripoli',      'Tripoli', 34.4368, 35.8498, 400),
('Saida Municipal Stadium', 'Sidon city center',        'Saida',   33.5571, 35.3729, 1500);

-- Seed: Admin account (password: TAML7677)
INSERT IGNORE INTO admins (full_name, email, password_hash) VALUES
('Tamer Nasr', 'tamernasr1717@gmail.com', 'pbkdf2:sha256:600000$placeholder$placeholder');
