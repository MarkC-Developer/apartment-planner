# Apartment Planner — Tauri Desktop App

A spatial and process planning tool. Developed as an experiment of using Claude to convert a web application into a Tauri-based deployment.

## Installation

**Installer**: Download latest installer from Releases on the sidebar:

* Windows: Use the `.msi`. Will show some warnings as unsigned (not something I would pay for).
* macOS: Use the `.dmg` file. See note below.

### macOS "damaged" warning

Because the app is unsigned, macOS may say it is "damaged and can't be opened" after installing. The app is not actually damaged — macOS blocks unsigned apps by default. After dragging the app to Applications, open Terminal and run:

```
xattr -cr /Applications/Apartment\\ Planner.app
```

The app will then open normally. This is a one-time step.

## How Data Storage Works

* **Plan files**: Saved as `.json` files wherever you choose on your filesystem
* **App config**: Stored in your OS config directory:

  * Windows: `%APPDATA%/apartment-planner/config.json`
  * macOS: `\~/Library/Application Support/apartment-planner/config.json`
* **Config tracks**: Recent files (up to 20), last-used directory, last-opened file, theme preference
* **Autosave**: Every 5 seconds to the active file (if one is open)
* **On launch**: Automatically reopens your last-used file

## Attribution

Icon design created by <a href="https://www.flaticon.com/free-icon/draw_13559003">Kerismaker</a>, recolored and used non-commercially.

