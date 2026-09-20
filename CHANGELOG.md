# Changelog

## 1.0.1 (2026-09-20) — hotfix

### Fixed
- **Seeking.** Dragging the position slider (or seeking from the Now Playing widget) snapped back to the start of the track. The `flaccer://` media handler served every file as a single plain response, so Chromium treated tracks as unseekable. It now answers byte-range requests with `206 Partial Content`, `Content-Range` and `Accept-Ranges`, so any position in a track can be reached immediately.

### Internal
- `--exec <js>` flag for the screenshot harness, and the debug dump now reports the media element's seekable and buffered ranges.
- `scripts/make-test-flac.js` takes a duration argument for longer test files.
- The release workflow no longer replaces a DMG that was uploaded by hand.

## 1.0.0 (2026-09-20)

First release: Winamp-style FLAC player for macOS with FLAC metadata on the LCD, 10-band EQ with presets, spectrum and oscilloscope visualiser, playlist with folder import, four colour themes, compact and double-size modes, always-on-top, media keys and Now Playing, and a drag-to-Applications DMG.
