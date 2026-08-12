use crate::error::AppError;
use crate::pdf::recolor::RenderTheme;
use crate::pdf::session::PdfSessionManager;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::{Notify, RwLock};

/// Render requests are bucketed so small zoom increments share cache entries
/// (detailed design 4.2).
const WIDTH_BUCKET_PX: u32 = 50;
/// LRU capacity per session (detailed design 4.2).
const MAX_ENTRIES_PER_SESSION: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct CacheKey {
    session_id: String,
    page_index: u16,
    width_bucket: u32,
    theme: RenderTheme,
    saturation: u32,
    contrast: u32,
}

impl CacheKey {
    fn new(
        session_id: &str,
        page_index: u16,
        width: u32,
        theme: RenderTheme,
        saturation: u32,
        contrast: u32,
    ) -> Self {
        Self {
            session_id: session_id.to_string(),
            page_index,
            width_bucket: (width / WIDTH_BUCKET_PX) * WIDTH_BUCKET_PX,
            theme,
            saturation: saturation.clamp(0, 100),
            contrast: contrast.clamp(0, 100),
        }
    }
}

struct Inner {
    cache: HashMap<CacheKey, Arc<Vec<u8>>>,
    /// LRU order per session; the last entry is the most recently used.
    order: HashMap<String, VecDeque<CacheKey>>,
    /// In-flight render requests so concurrent requests for the same page
    /// await one render instead of starting duplicates (detailed design 4.3).
    inflight: HashMap<CacheKey, Arc<Notify>>,
}

/// Render service layer holding the LRU bitmap cache. `protocol/page.rs` is a
/// thin dispatcher that only calls into this service (architecture 2.5.2).
pub struct PdfRenderService {
    inner: RwLock<Inner>,
    sessions: Arc<RwLock<PdfSessionManager>>,
}

impl PdfRenderService {
    pub fn new(sessions: Arc<RwLock<PdfSessionManager>>) -> Self {
        Self {
            inner: RwLock::new(Inner {
                cache: HashMap::new(),
                order: HashMap::new(),
                inflight: HashMap::new(),
            }),
            sessions,
        }
    }

    pub async fn get_or_render(
        &self,
        session_id: &str,
        page_index: u16,
        width: u32,
        theme: RenderTheme,
        saturation: u32,
        contrast: u32,
    ) -> Result<Vec<u8>, AppError> {
        let key = CacheKey::new(session_id, page_index, width, theme, saturation, contrast);

        if let Some(bytes) = self.touch(&key).await {
            return Ok((*bytes).clone());
        }

        // Register this request as in-flight; only the first requester renders.
        let should_render = {
            let mut inner = self.inner.write().await;
            if inner.cache.contains_key(&key) {
                return Ok((*(inner.cache.get(&key).unwrap())).to_vec());
            }
            if inner.inflight.contains_key(&key) {
                false
            } else {
                inner.inflight.insert(key.clone(), Arc::new(Notify::new()));
                true
            }
        };

        if should_render {
            let result = self.render(&key).await;
            let notify = {
                let mut inner = self.inner.write().await;
                if let Ok(bytes) = &result {
                    let entry = Arc::new(bytes.clone());
                    inner.cache.insert(key.clone(), entry);
                    let order = inner.order.entry(key.session_id.clone()).or_default();
                    order.retain(|k| k != &key);
                    order.push_back(key.clone());
                    let mut evicted = Vec::new();
                    while order.len() > MAX_ENTRIES_PER_SESSION {
                        if let Some(oldest) = order.pop_front() {
                            evicted.push(oldest);
                        }
                    }
                    let _ = order;
                    for oldest in evicted {
                        inner.cache.remove(&oldest);
                    }
                }
                inner.inflight.remove(&key)
            };
            if let Some(notify) = notify {
                notify.notify_waiters();
            }
            return result;
        }

        // Another request is already rendering this page; wait for it.
        loop {
            let notified = {
                let inner = self.inner.read().await;
                match inner.cache.get(&key) {
                    Some(bytes) => return Ok((*bytes).to_vec()),
                    None => inner.inflight.get(&key).cloned(),
                }
            };
            match notified {
                Some(notify) => notify.notified().await,
                None => return Err(AppError::Pdf("Render request was dropped".into())),
            }
        }
    }

    pub async fn clear_session(&self, session_id: &str) {
        let mut inner = self.inner.write().await;
        if let Some(order) = inner.order.remove(session_id) {
            for key in order {
                inner.cache.remove(&key);
            }
        }
        inner.inflight.retain(|key, _| key.session_id != session_id);
    }

    /// Returns the cached bytes and refreshes LRU order, if present.
    async fn touch(&self, key: &CacheKey) -> Option<Arc<Vec<u8>>> {
        let mut inner = self.inner.write().await;
        let bytes = inner.cache.get(key)?.clone();
        if let Some(order) = inner.order.get_mut(&key.session_id) {
            if let Some(pos) = order.iter().position(|k| k == key) {
                order.remove(pos);
                order.push_back(key.clone());
            }
        }
        Some(bytes)
    }

    async fn render(&self, key: &CacheKey) -> Result<Vec<u8>, AppError> {
        let sessions = self.sessions.read().await;
        let session = sessions
            .get_session(&key.session_id)
            .ok_or_else(|| AppError::Pdf(format!("No PDF session for id: {}", key.session_id)))?;
        session.render_page_recolored(
            key.page_index,
            key.width_bucket,
            key.theme,
            key.saturation,
            key.contrast,
        )
    }
}
