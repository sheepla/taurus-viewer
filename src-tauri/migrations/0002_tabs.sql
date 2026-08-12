-- Tab persistence (v0.5)
--   closed_tabs : persistent stack of closed document tabs (max 10, prune oldest)
--   tab_sessions: tab set restored on startup (document tabs only)

CREATE TABLE IF NOT EXISTS closed_tabs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path  TEXT NOT NULL,
    format     TEXT NOT NULL,   -- 'pdf' | 'epub'
    view_state TEXT NOT NULL,   -- JSON: {position, zoom, viewMode}
    closed_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tab_sessions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    position_index INTEGER NOT NULL,
    file_path      TEXT NOT NULL,
    format         TEXT NOT NULL,   -- 'pdf' | 'epub'
    view_state     TEXT NOT NULL    -- JSON: {position, zoom, viewMode}
);
