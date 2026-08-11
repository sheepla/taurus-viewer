use crate::error::AppError;
use epub::doc::EpubDoc;
use std::collections::HashMap;
use std::path::PathBuf;

pub struct EpubSession {
    // TODO add more metadata properties for general use
    pub id: String,
    pub file_path: PathBuf,
    pub title: Option<String>,
    pub author: Option<String>,
}

impl EpubSession {
    pub fn new(id: String, file_path: PathBuf) -> Result<Self, AppError> {
        println!("Creating EPUB session for file: {:?}", file_path);

        let doc = EpubDoc::new(&file_path)
            .map_err(|e| AppError::Epub(format!("Failed to parse EPUB with epub crate: {}", e)))?;

        let title = doc.mdata("title").map(|m| m.value.clone());
        let author = doc.mdata("creator").map(|m| m.value.clone());

        println!(
            "EPUB successfully loaded via epub crate: title={:?}, author={:?}",
            title, author
        );

        Ok(Self {
            id,
            file_path,
            title,
            author,
        })
    }
}

pub struct EpubSessionManager {
    sessions: HashMap<String, EpubSession>,
    next_id: u64,
}

impl EpubSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            next_id: 1,
        }
    }

    pub fn open_session(&mut self, file_path: &std::path::Path) -> Result<&EpubSession, AppError> {
        let id = format!("epub_session_{}", self.next_id);
        self.next_id += 1;

        let session = EpubSession::new(id.clone(), file_path.to_path_buf())?;
        self.sessions.insert(id.clone(), session);

        Ok(self.sessions.get(&id).unwrap())
    }

    pub fn close_session(&mut self, id: &str) {
        self.sessions.remove(id);
    }
}

impl Default for EpubSessionManager {
    fn default() -> Self {
        Self::new()
    }
}
