# Apartment Planner — Tauri Desktop App

A local-first spatial and process planning tool. Your data lives as `.json` files on your own filesystem — no cloud, no localStorage, no browser dependency.

## Installation
- **Installer**: Download latest release installer from Releases on the sidebar:
  - Windows: Recommended to use the msi. Will show some warnings as unsigned (not something I would pay for)
  - macOS: Use the .dmg file.

## How Data Storage Works

- **Plan files**: Saved as `.json` files wherever you choose on your filesystem
- **App config**: Stored in your OS config directory:
  - Windows: `%APPDATA%/apartment-planner/config.json`
  - macOS: `~/Library/Application Support/apartment-planner/config.json`
- **Config tracks**: Recent files (up to 20), last-used directory, last-opened file, theme preference
- **Autosave**: Every 5 seconds to the active file (if one is open)
- **On launch**: Automatically reopens your last-used file
