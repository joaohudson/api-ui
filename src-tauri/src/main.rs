// Impede que uma janela de console adicional apareça no Windows em builds de release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    api_ui_lib::run();
}
