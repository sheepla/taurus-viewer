CREATE TABLE IF NOT EXISTS library_folders (
    id            INTEGER PRIMARY KEY,
    path          TEXT    NOT NULL UNIQUE,
    added_at      INTEGER NOT NULL,
    last_scanned_at INTEGER
);

CREATE TABLE IF NOT EXISTS library_entries (
    id              INTEGER PRIMARY KEY,
    folder_id       INTEGER NOT NULL REFERENCES library_folders(id) ON DELETE CASCADE,
    path            TEXT    NOT NULL UNIQUE,
    format          TEXT    NOT NULL,   -- 'pdf' | 'epub'
    title           TEXT,
    size            INTEGER NOT NULL,
    mtime           INTEGER NOT NULL,   -- unix timestamp, used for change detection
    status          TEXT    NOT NULL,   -- 'ok' | 'error'
    error_message   TEXT,
    thumbnail_path  TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tab_sessions (
    id             INTEGER PRIMARY KEY,
    position_index INTEGER NOT NULL,
    file_path      TEXT    NOT NULL,
    format         TEXT    NOT NULL,
    view_state     TEXT    NOT NULL    -- JSON: {position, zoom, viewMode}
);
