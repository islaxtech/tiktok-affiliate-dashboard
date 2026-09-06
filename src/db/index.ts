import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    -- Creator OAuth credentials. Single row keyed by open_id; a creator token
    -- and a seller token are different credentials and are never mixed.
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      open_id                 TEXT PRIMARY KEY,
      access_token            TEXT NOT NULL,
      access_token_expires_at INTEGER NOT NULL,
      refresh_token           TEXT NOT NULL,
      refresh_token_expires_at INTEGER NOT NULL,
      user_type               INTEGER,
      granted_scopes          TEXT NOT NULL DEFAULT '[]',
      seller_name             TEXT,
      seller_base_region      TEXT,
      obtained_at             INTEGER NOT NULL,
      updated_at              INTEGER NOT NULL
    );

    -- Hard constraint: every raw API response lands here before anything
    -- parses it, so the UI can be rebuilt without re-hitting the API.
    CREATE TABLE IF NOT EXISTS raw_responses (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      fetched_at     INTEGER NOT NULL,
      method         TEXT NOT NULL,
      path           TEXT NOT NULL,
      query          TEXT NOT NULL,
      request_body   TEXT,
      http_status    INTEGER NOT NULL,
      api_code       INTEGER,
      api_message    TEXT,
      tts_request_id TEXT,
      body           TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_raw_responses_path_time
      ON raw_responses (path, fetched_at DESC);
  `);
}
