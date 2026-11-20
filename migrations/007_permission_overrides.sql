ALTER TABLE users ADD COLUMN denied_permissions text[] NOT NULL DEFAULT '{}';
