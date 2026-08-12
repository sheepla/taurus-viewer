use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize, specta::Type)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("PDF error: {0}")]
    Pdf(String),

    #[error("EPUB error: {0}")]
    Epub(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("IO error: {0}")]
    Io(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        Self::Database(e.to_string())
    }
}
