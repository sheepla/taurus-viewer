use crate::error::AppError;
use specta::Type;
use sqlx::{FromRow, SqlitePool};
use std::path::Path;

#[derive(Debug, serde::Serialize, serde::Deserialize, FromRow, Type)]
pub struct LibraryFolder {
    #[specta(type = i32)]
    pub id: i64,
    pub path: String,
    pub added_at: String,
    pub last_scanned_at: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, FromRow, Type)]
pub struct LibraryEntry {
    #[specta(type = i32)]
    pub id: i64,
    #[specta(type = i32)]
    pub folder_id: i64,
    pub path: String,
    pub format: String,
    pub title: String,
    #[specta(type = f64)]
    pub size: i64,
    #[specta(type = f64)]
    pub mtime: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub thumbnail_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone)]
pub struct DbCache {
    pool: SqlitePool,
}

/// A closed-tab entry popped via `tab_pop_closed`.
#[derive(Debug, serde::Serialize, serde::Deserialize, FromRow, Type)]
pub struct ClosedTabRecord {
    pub file_path: String,
    pub format: String,
    pub view_state: String,
}

/// A persisted tab session loaded via `tab_load_sessions`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, FromRow, Type)]
pub struct TabSessionRecord {
    #[specta(type = i32)]
    pub position_index: i64,
    pub file_path: String,
    pub format: String,
    pub view_state: String,
}

/// A bookmark entry (page-scoped, label-less toggle).
#[derive(Debug, serde::Serialize, serde::Deserialize, FromRow, Type)]
pub struct BookmarkRecord {
    #[specta(type = i32)]
    pub id: i64,
    pub file_path: String,
    pub format: String,
    pub page_position: String,
    pub created_at: String,
}

/// Result of an upsert; `changed` is true when a row was inserted or its
/// size/mtime/status changed (used to decide thumbnail regeneration).
#[derive(Debug)]
pub struct UpsertResult {
    pub entry_id: i64,
    pub changed: bool,
}

impl DbCache {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn add_folder(&self, path: &Path) -> Result<i64, AppError> {
        let path_str = path.to_string_lossy();
        let now = chrono::Utc::now().to_rfc3339();

        let res =
            sqlx::query("INSERT OR IGNORE INTO library_folders (path, added_at) VALUES (?, ?)")
                .bind(path_str.as_ref())
                .bind(now)
                .execute(&self.pool)
                .await?;

        Ok(res.last_insert_rowid())
    }

    pub async fn remove_folder(&self, path: &Path) -> Result<(), AppError> {
        let path_str = path.to_string_lossy();
        sqlx::query("DELETE FROM library_folders WHERE path = ?")
            .bind(path_str.as_ref())
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn list_folders(&self) -> Result<Vec<LibraryFolder>, AppError> {
        let rows = sqlx::query_as::<_, LibraryFolder>(
            "SELECT id, path, added_at, last_scanned_at FROM library_folders",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn list_entries(&self) -> Result<Vec<LibraryEntry>, AppError> {
        let rows = sqlx::query_as::<_, LibraryEntry>(
            "SELECT id, folder_id, path, format, title, size, mtime, status, error_message, thumbnail_path, created_at, updated_at FROM library_entries ORDER BY updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn upsert_entry(
        &self,
        folder_id: i64,
        path: &Path,
        format: &str,
        title: &str,
        size: i64,
        mtime: i64,
        error_message: Option<&str>,
    ) -> Result<UpsertResult, AppError> {
        let path_str = path.to_string_lossy();
        let now = chrono::Utc::now().to_rfc3339();
        let status = if error_message.is_some() {
            "error"
        } else {
            "ok"
        };

        let res = sqlx::query(
            "INSERT INTO library_entries (folder_id, path, format, title, size, mtime, status, error_message, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(path) DO UPDATE SET
               folder_id=excluded.folder_id,
               size=excluded.size,
               mtime=excluded.mtime,
               status=excluded.status,
               error_message=excluded.error_message,
               updated_at=excluded.updated_at
             WHERE library_entries.size != excluded.size
                OR library_entries.mtime != excluded.mtime
                OR library_entries.status != excluded.status
                OR library_entries.folder_id != excluded.folder_id",
        )
        .bind(folder_id)
        .bind(path_str.as_ref())
        .bind(format)
        .bind(title)
        .bind(size)
        .bind(mtime)
        .bind(status)
        .bind(error_message)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        let changed = res.rows_affected() == 1;

        let entry_id =
            sqlx::query_scalar::<_, i64>("SELECT id FROM library_entries WHERE path = ?")
                .bind(path_str.as_ref())
                .fetch_one(&self.pool)
                .await?;

        Ok(UpsertResult { entry_id, changed })
    }

    /// Deletes entries of a folder whose files no longer exist on disk (6.5).
    pub async fn delete_entries_not_in(
        &self,
        folder_id: i64,
        keep_paths: &[String],
    ) -> Result<(), AppError> {
        if keep_paths.is_empty() {
            sqlx::query("DELETE FROM library_entries WHERE folder_id = ?")
                .bind(folder_id)
                .execute(&self.pool)
                .await?;
        } else {
            let mut query =
                String::from("DELETE FROM library_entries WHERE folder_id = ? AND path NOT IN (");
            let placeholders: Vec<String> = (0..keep_paths.len()).map(|_| "?".into()).collect();
            query.push_str(&placeholders.join(", "));
            query.push(')');

            let mut q = sqlx::query(&query).bind(folder_id);
            for path in keep_paths {
                q = q.bind(path);
            }
            q.execute(&self.pool).await?;
        }
        Ok(())
    }

    pub async fn update_folder_scanned_at(&self, folder_id: i64) -> Result<(), AppError> {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query("UPDATE library_folders SET last_scanned_at = ? WHERE id = ?")
            .bind(now)
            .bind(folder_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_thumbnail(
        &self,
        entry_id: i64,
        thumbnail_path: &Path,
    ) -> Result<(), AppError> {
        let path_str = thumbnail_path.to_string_lossy();
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query("UPDATE library_entries SET thumbnail_path = ?, updated_at = ? WHERE id = ?")
            .bind(path_str.as_ref())
            .bind(now)
            .bind(entry_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn search_library(&self, query: &str) -> Result<Vec<LibraryEntry>, AppError> {
        let pattern = format!("%{}%", query);
        let rows = sqlx::query_as::<_, LibraryEntry>(
            "SELECT id, folder_id, path, format, title, size, mtime, status, error_message, thumbnail_path, created_at, updated_at 
             FROM library_entries 
             WHERE title LIKE ? OR path LIKE ? 
             ORDER BY updated_at DESC LIMIT 50",
        )
        .bind(&pattern)
        .bind(&pattern)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Pushes a tab onto the closed-tab stack, pruning to the 10 most recent.
    pub async fn push_closed_tab(
        &self,
        file_path: &str,
        format: &str,
        view_state: &str,
    ) -> Result<(), AppError> {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO closed_tabs (file_path, format, view_state, closed_at) VALUES (?, ?, ?, ?)",
        )
        .bind(file_path)
        .bind(format)
        .bind(view_state)
        .bind(now)
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "DELETE FROM closed_tabs WHERE id NOT IN (SELECT id FROM closed_tabs ORDER BY id DESC LIMIT 10)",
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Pops and deletes the most recently closed tab, if any.
    pub async fn pop_closed_tab(&self) -> Result<Option<ClosedTabRecord>, AppError> {
        let record = sqlx::query_as::<_, ClosedTabRecord>(
            "SELECT file_path, format, view_state FROM closed_tabs ORDER BY id DESC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await?;

        if record.is_some() {
            sqlx::query(
                "DELETE FROM closed_tabs WHERE id = (SELECT id FROM closed_tabs ORDER BY id DESC LIMIT 1)",
            )
            .execute(&self.pool)
            .await?;
        }

        Ok(record)
    }

    /// Replaces the persisted tab set with the given sessions.
    pub async fn save_tab_sessions(&self, sessions: &[TabSessionRecord]) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM tab_sessions")
            .execute(&mut *tx)
            .await?;
        for session in sessions {
            sqlx::query(
                "INSERT INTO tab_sessions (position_index, file_path, format, view_state) VALUES (?, ?, ?, ?)",
            )
            .bind(session.position_index)
            .bind(&session.file_path)
            .bind(&session.format)
            .bind(&session.view_state)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// Loads the persisted tab set ordered by position.
    pub async fn load_tab_sessions(&self) -> Result<Vec<TabSessionRecord>, AppError> {
        let rows = sqlx::query_as::<_, TabSessionRecord>(
            "SELECT position_index, file_path, format, view_state FROM tab_sessions ORDER BY position_index",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Toggles a bookmark for a page. Returns `true` if the bookmark now
    /// exists (was added), `false` if it was removed. The existence check and
    /// the insert share the `UNIQUE(file_path, page_position)` constraint.
    pub async fn toggle_bookmark(
        &self,
        file_path: &str,
        format: &str,
        page_position: &str,
    ) -> Result<bool, AppError> {
        let now = chrono::Utc::now().to_rfc3339();
        let result = sqlx::query(
            "INSERT OR IGNORE INTO bookmarks (file_path, format, page_position, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(file_path)
        .bind(format)
        .bind(page_position)
        .bind(now)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 1 {
            return Ok(true);
        }

        sqlx::query("DELETE FROM bookmarks WHERE file_path = ? AND page_position = ?")
            .bind(file_path)
            .bind(page_position)
            .execute(&self.pool)
            .await?;
        Ok(false)
    }

    /// Lists bookmarks for a document in creation order.
    pub async fn list_bookmarks(&self, file_path: &str) -> Result<Vec<BookmarkRecord>, AppError> {
        let rows = sqlx::query_as::<_, BookmarkRecord>(
            "SELECT id, file_path, format, page_position, created_at FROM bookmarks WHERE file_path = ? ORDER BY id",
        )
        .bind(file_path)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_cache() -> DbCache {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("failed to connect to in-memory sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("failed to run migrations");
        DbCache::new(pool)
    }

    #[tokio::test]
    async fn toggle_bookmark_adds_then_removes() {
        let cache = test_cache().await;

        let added = cache
            .toggle_bookmark("/doc.pdf", "pdf", r#"{"format":"pdf","page_index":3}"#)
            .await
            .expect("toggle should succeed");
        assert!(added, "first toggle should add the bookmark");

        let list = cache.list_bookmarks("/doc.pdf").await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].format, "pdf");

        let removed = cache
            .toggle_bookmark("/doc.pdf", "pdf", r#"{"format":"pdf","page_index":3}"#)
            .await
            .expect("toggle should succeed");
        assert!(!removed, "second toggle should remove the bookmark");

        assert!(cache.list_bookmarks("/doc.pdf").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn bookmarks_are_scoped_per_document() {
        let cache = test_cache().await;

        cache
            .toggle_bookmark("/a.pdf", "pdf", r#"{"format":"pdf","page_index":0}"#)
            .await
            .unwrap();
        cache
            .toggle_bookmark("/b.pdf", "pdf", r#"{"format":"pdf","page_index":0}"#)
            .await
            .unwrap();

        assert_eq!(cache.list_bookmarks("/a.pdf").await.unwrap().len(), 1);
        assert_eq!(cache.list_bookmarks("/b.pdf").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn closed_tab_stack_prunes_to_ten() {
        let cache = test_cache().await;

        for i in 0..12 {
            cache
                .push_closed_tab(
                    &format!("/doc-{i}.pdf"),
                    "pdf",
                    r#"{"position":{},"zoom":1,"viewMode":"scroll"}"#,
                )
                .await
                .unwrap();
        }

        let mut popped = Vec::new();
        while let Some(record) = cache.pop_closed_tab().await.unwrap() {
            popped.push(record.file_path);
        }

        assert_eq!(popped.len(), 10, "stack should be pruned to 10 entries");
        assert_eq!(
            popped[0], "/doc-11.pdf",
            "most recently closed tab should be popped first"
        );
        assert!(!popped.contains(&"/doc-0.pdf".to_string()));
    }

    #[tokio::test]
    async fn tab_sessions_save_and_load_roundtrip() {
        let cache = test_cache().await;
        let sessions = vec![
            TabSessionRecord {
                position_index: 0,
                file_path: "/a.pdf".into(),
                format: "pdf".into(),
                view_state: r#"{"position":{},"zoom":1,"viewMode":"pages"}"#.into(),
            },
            TabSessionRecord {
                position_index: 1,
                file_path: "/b.epub".into(),
                format: "epub".into(),
                view_state: r#"{"position":{},"zoom":1,"viewMode":"pages"}"#.into(),
            },
        ];

        cache.save_tab_sessions(&sessions).await.unwrap();
        let loaded = cache.load_tab_sessions().await.unwrap();

        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].file_path, "/a.pdf");
        assert_eq!(loaded[1].file_path, "/b.epub");

        // A second save replaces the previous set entirely.
        cache
            .save_tab_sessions(&[sessions[0].clone()])
            .await
            .unwrap();
        assert_eq!(cache.load_tab_sessions().await.unwrap().len(), 1);
    }
}
