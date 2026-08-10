use crate::config::settings::Config;
use crate::error::AppError;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

#[tauri::command]
#[specta::specta]
pub async fn config_load(config_state: State<'_, Arc<RwLock<Config>>>) -> Result<Config, AppError> {
    let config = config_state.read().await.clone();
    Ok(config)
}

#[tauri::command]
#[specta::specta]
pub async fn config_save(
    new_config: Config,
    config_state: State<'_, Arc<RwLock<Config>>>,
) -> Result<(), AppError> {
    let mut config = config_state.write().await;
    *config = new_config.clone();

    if let Some(path) = Config::default_path() {
        config.save(&path)?;
    }

    Ok(())
}
