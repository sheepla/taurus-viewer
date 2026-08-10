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
    ) -> Result<i64, AppError> {
        let path_str = path.to_string_lossy();
        let now = chrono::Utc::now().to_rfc3339();

        let res = sqlx::query(
            "INSERT INTO library_entries (folder_id, path, format, title, size, mtime, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?)
             ON CONFLICT(path) DO UPDATE SET
               size=excluded.size,
               mtime=excluded.mtime,
               updated_at=excluded.updated_at",
        )
        .bind(folder_id)
        .bind(path_str.as_ref())
        .bind(format)
        .bind(title)
        .bind(size)
        .bind(mtime)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(res.last_insert_rowid())
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
}
