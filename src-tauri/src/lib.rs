mod collections;
mod commands;
mod environments;
mod export;
mod http_engine;
mod models;
mod persistence;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::execute_http_request,
            commands::create_collection,
            commands::list_collections,
            commands::get_collection,
            commands::rename_collection,
            commands::delete_collection,
            commands::create_request,
            commands::list_requests,
            commands::update_request,
            commands::delete_request,
            commands::create_environment,
            commands::list_environments,
            commands::get_environment,
            commands::update_environment,
            commands::delete_environment,
            commands::set_active_environment,
            commands::get_active_environment,
            commands::export_collection_to_json,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicacao Tauri");
}
