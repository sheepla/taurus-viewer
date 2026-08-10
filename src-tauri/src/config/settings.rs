use crate::error::AppError;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::{Path, PathBuf};

const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Config {
    pub schema_version: u32,
    pub ui: UiConfig,
    pub document: DocumentConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct UiConfig {
    pub theme: Theme,
    pub sidebar_open: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DocumentConfig {
    pub default_layout: DefaultLayout,
    pub default_zoom: f32,
    pub invert_colors: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum DefaultLayout {
    Scroll,
    Pages,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            ui: UiConfig {
                theme: Theme::System,
                sidebar_open: true,
            },
            document: DocumentConfig {
                default_layout: DefaultLayout::Scroll,
                default_zoom: 1.0,
                invert_colors: false,
            },
        }
    }
}

impl Config {
    pub fn load(path: &Path) -> Self {
        fs::read_to_string(path)
            .ok()
            .and_then(|content| toml::from_str(&content).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), AppError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = toml::to_string_pretty(self).map_err(|e| AppError::Config(e.to_string()))?;
        fs::write(path, content)?;
        Ok(())
    }

    pub fn default_path() -> Option<PathBuf> {
        dirs::config_dir().map(|p| p.join("taurus-viewer").join("config.toml"))
    }
}
