mod commands;
mod config;
mod epub;
mod error;
mod library;
mod pdf;
mod protocol;

use config::settings::Config;
use epub::session::EpubSessionManager;
use library::cache::DbCache;
use pdf::render_cache::PdfRenderService;
use pdf::session::PdfSessionManager;
use specta_typescript::Typescript;
use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Arc;
use tauri::Manager;
use tauri_specta::{collect_commands, Builder};
use tokio::sync::RwLock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pdf_session_manager = Arc::new(RwLock::new(PdfSessionManager::new()));
    let epub_session_manager = Arc::new(RwLock::new(EpubSessionManager::new()));
    let render_service = PdfRenderService::new(pdf_session_manager.clone());

    let config_path = Config::default_path();
    let initial_config = config_path
        .as_ref()
        .map(|p| Config::load(p))
        .unwrap_or_default();
    let config_state = Arc::new(RwLock::new(initial_config));

    let builder = Builder::<tauri::Wry>::new().commands(collect_commands![
        commands::pdf::pdf_open,
        commands::pdf::pdf_close,
        commands::pdf::pdf_get_page_dimensions,
        commands::pdf::pdf_get_outline,
        commands::pdf::pdf_search,
        commands::pdf::pdf_get_text_layer,
        commands::epub::epub_open,
        commands::epub::epub_close,
        commands::library::library_add_folder,
        commands::library::library_remove_folder,
        commands::library::library_list_folders,
        commands::library::library_list_entries,
        commands::library::library_scan_folder,
        commands::library::palette_search_library,
        commands::config::config_load,
        commands::config::config_save,
        commands::tabs::tab_push_closed,
        commands::tabs::tab_pop_closed,
        commands::tabs::tab_save_sessions,
        commands::tabs::tab_load_sessions,
        commands::bookmarks::bookmark_toggle,
        commands::bookmarks::bookmark_list,
    ]);

    #[cfg(debug_assertions)]
    builder
        .export(Typescript::default(), "../src/shared/bindings.ts")
        .expect("Failed to export specta bindings");

    let mut tauri_builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::default().build());
    tauri_builder = protocol::page::register(tauri_builder);
    tauri_builder = protocol::thumb::register(tauri_builder);
    tauri_builder = protocol::epub::register(tauri_builder);

    let invoke_handler = builder.invoke_handler();

    tauri_builder
        .plugin(tauri_plugin_opener::init())
        .manage(pdf_session_manager)
        .manage(epub_session_manager)
        .manage(config_state)
        .manage(render_service)
        .setup(move |app| {
            builder.mount_events(app);

            // Initialize SQLite DB in app data dir
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let app_dir = app_handle
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."));
                std::fs::create_dir_all(&app_dir).ok();
                let db_path = app_dir.join("library.db");

                let pool = SqlitePoolOptions::new()
                    .connect_with(
                        sqlx::sqlite::SqliteConnectOptions::new()
                            .filename(db_path)
                            .create_if_missing(true),
                    )
                    .await
                    .expect("Failed to connect to SQLite database");

                sqlx::migrate!("./migrations")
                    .run(&pool)
                    .await
                    .expect("Failed to run database migrations");

                let db_cache = DbCache::new(pool);
                app_handle.manage(db_cache);
            });

            Ok(())
        })
        .invoke_handler(invoke_handler)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
