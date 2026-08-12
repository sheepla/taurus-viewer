-- Bookmarks (v0.5, design 3.x)
--   Page-scoped, label-less toggle. UNIQUE(file_path, page_position) prevents
--   duplicate bookmarks for the same page (requirements 5.8).

CREATE TABLE IF NOT EXISTS bookmarks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path     TEXT NOT NULL,
    format        TEXT NOT NULL,   -- 'pdf' | 'epub'
    page_position TEXT NOT NULL,   -- Position JSON: PDF = {format,page_index,...}, EPUB = {format,cfi}
    created_at    TEXT NOT NULL,
    UNIQUE (file_path, page_position)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_file_path ON bookmarks(file_path);
