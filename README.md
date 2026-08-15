<div align="center">

# TaurusViewer

TaurusViewer is a lightweight, keyboard-driven e-book viewer built with Rust and Tauri.

</div>

## Core Concepts

- ⌨ Keyboard-driven: Frequently used actions such as library navigation, scrolling, page turning, and the command palette can be operated quickly using only the keyboard.
- 🖱 Mouse support: Mouse operations are also fully supported.
- ⚡ Lightweight and fast: TaurusViewer is designed to enhance everyday reading comfort and reduce the stress caused by the feature bloat and sluggish performance common in existing document viewers. Built with Tauri and powered by native WebViews, it minimizes startup overhead and memory usage.

## Features

- 📖 EPUB Support: Supports the EPUB format, a standard distribution format for e-books. It is rendered on the front end using foliate.js.
- 📝 PDF Support: PDF documents are rendered using PDFium, the PDF rendering engine used inside Chromium, and controlled by the Rust backend.
- 🌳 Outline Tree: Parses the hierarchical headings included in the document to display an outline tree, allowing you to easily jump to the relevant chapter. Navigation can be done via the keyboard, eliminating the need to reach for the mouse.
- 🔍 Search: You can open the search panel with the `/` key. It allows you to search for text within the document and jump to the matching locations.
- 🔖 Bookmarks: By registering bookmarks on any page, you can resume reading from where you left off.
- 📚 Library: By pre-scanning folders you use on a daily basis, you can easily find your favorite documents from a menu with thumbnails. Since the list and thumbnails are cached, there is no overhead when starting the application.
- 🚀 Command Palette: Pressing `Ctrl+K` opens a VS Code-like command palette. You can easily find documents open in tabs or included in your library to start reading right away.
- 💻 Command Mode: Pressing the `:` key enables a Vim or less-like command mode.
- 🎨 Document Recolor and Font Customization: Achieves eye-friendly color tones by adjusting the saturation and contrast of documents, allowing them to harmonize with dark mode. (Planned)

## Platform

- [x] Windows
- [ ] Linux (Planning)

## Installation

Requires the toolchains below:

- Rust
- Node.js
- pnpm (`npm install -g pnpm`)

To build from source, run: 

```
git clone https:///github.com/sheepla/taurus-viewer
cd taurus-viewer
pnpm install
pnpm tauri build
```

## Thanks

- [Tauri](https://tauri.app): Cross-platform Web-based desktop app framework
- [foliate.js](https://github.com/johnfactotum/foliate-js): The E-Books renderer library for the browser (for EPUB support)
- [PDFium](https://pdfium.googlesource.com/pdfium/): PDF rendering engine by the Chromium project

