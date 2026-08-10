use crate::error::AppError;
use crate::epub::EpubChapter;
use std::collections::HashMap;
use std::path::PathBuf;

pub struct EpubSession {
    pub id: String,
    pub file_path: PathBuf,
    pub title: String,
    pub author: String,
    pub chapters: Vec<EpubChapter>,
}

impl EpubSession {
    pub fn new(id: String, file_path: PathBuf) -> Result<Self, AppError> {
        println!("Creating EPUB session for file: {:?}", file_path);
        
        let metadata = crate::epub::extract_epub_metadata(&file_path)?;
        
        println!("EPUB metadata extracted: title={}, author={}, chapters={}", metadata.title, metadata.author, metadata.chapters.len());

        Ok(Self {
            id,
            file_path,
            title: metadata.title,
            author: metadata.author,
            chapters: metadata.chapters,
        })
    }

    pub fn get_chapter_count(&self) -> usize {
        self.chapters.len()
    }

    pub fn get_chapter_content(&self, chapter_index: usize) -> Result<String, AppError> {
        if let Some(chapter) = self.chapters.get(chapter_index) {
            Ok(chapter.content.clone())
        } else {
            Err(AppError::Epub(format!("Chapter index out of bounds: {}", chapter_index)))
        }
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

    pub fn get_session(&self, id: &str) -> Option<&EpubSession> {
        self.sessions.get(id)
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
