-- DigitalReady database schema (no question data — run seed-questions.js after this)
-- Run against a MySQL database you've already created, e.g.:
--   CREATE DATABASE digitalready CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE digitalready;
--   SOURCE schema.sql;
--   node seed-questions.js

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS website_audits;
DROP TABLE IF EXISTS advisor_notes;
DROP TABLE IF EXISTS roadmaps;
DROP TABLE IF EXISTS responses;
DROP TABLE IF EXISTS assessments;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS sectors;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE sectors (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_sectors_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NULL,
  role ENUM('business', 'advisor', 'admin') NOT NULL DEFAULT 'business',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  business_name VARCHAR(255) NULL,
  sector_id INT UNSIGNED NULL,
  follow_up_status ENUM('needs_follow_up', 'on_track', 'resolved') NULL,
  advisor_code VARCHAR(20) NULL,
  advisor_id INT UNSIGNED NULL,
  claimed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_advisor_code (advisor_code),
  KEY idx_users_role (role),
  KEY idx_users_advisor (advisor_id),
  CONSTRAINT fk_users_sector
    FOREIGN KEY (sector_id) REFERENCES sectors(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_users_advisor
    FOREIGN KEY (advisor_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_categories_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE questions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  sector_id INT UNSIGNED NOT NULL,
  text VARCHAR(500) NOT NULL,
  tip VARCHAR(500) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_questions_category (category_id),
  KEY idx_questions_sector (sector_id),
  CONSTRAINT fk_questions_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_questions_sector
    FOREIGN KEY (sector_id) REFERENCES sectors(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assessments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  sector_id INT UNSIGNED NULL,
  total_score DECIMAL(5,2) NOT NULL,
  level VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_assessments_user_created (user_id, created_at),
  CONSTRAINT fk_assessments_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_assessments_sector
    FOREIGN KEY (sector_id) REFERENCES sectors(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE responses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assessment_id INT UNSIGNED NOT NULL,
  question_id INT UNSIGNED NOT NULL,
  answer TINYINT NOT NULL,
  KEY idx_responses_assessment (assessment_id),
  KEY idx_responses_question (question_id),
  CONSTRAINT fk_responses_assessment
    FOREIGN KEY (assessment_id) REFERENCES assessments(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_responses_question
    FOREIGN KEY (question_id) REFERENCES questions(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_responses_answer CHECK (answer IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roadmaps (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assessment_id INT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roadmaps_assessment (assessment_id),
  CONSTRAINT fk_roadmaps_assessment
    FOREIGN KEY (assessment_id) REFERENCES assessments(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE advisor_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_user_id INT UNSIGNED NOT NULL,
  advisor_user_id INT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notes_business (business_user_id),
  CONSTRAINT fk_notes_business
    FOREIGN KEY (business_user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_notes_advisor
    FOREIGN KEY (advisor_user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE website_audits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  url VARCHAR(500) NOT NULL,
  status ENUM('ok', 'unreachable') NOT NULL,
  error_message VARCHAR(255) NULL,
  https TINYINT(1) NULL,
  mobile_friendly TINYINT(1) NULL,
  has_title TINYINT(1) NULL,
  has_meta_description TINYINT(1) NULL,
  payment_detected TINYINT(1) NULL,
  social_links_found VARCHAR(255) NULL,
  response_time_ms INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audits_user_created (user_id, created_at),
  CONSTRAINT fk_audits_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed categories
INSERT INTO categories (`key`, label) VALUES
  ('online_presence', 'Online Presence'),
  ('digital_payments', 'Digital Payments'),
  ('marketing', 'Marketing'),
  ('operations', 'Operations'),
  ('data_use', 'Data Use');

-- Seed sectors
INSERT INTO sectors (`key`, label) VALUES
  ('retail', 'Retail & E-commerce'),
  ('hospitality', 'Food & Beverage'),
  ('trades', 'Trades & Home Services'),
  ('professional_services', 'Professional Services'),
  ('health_wellness', 'Health & Wellness'),
  ('entertainment', 'Entertainment & Recreation'),
  ('technology', 'Technology & Digital Services'),
  ('education', 'Education & Training'),
  ('other', 'General / Other');

-- Question data is seeded separately by seed-questions.js (uses parameterized
-- inserts so the question/tip text doesn't need manual SQL escaping).
