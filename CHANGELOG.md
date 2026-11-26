# Changelog

## [Unreleased]

### Added

- Add badges to `README.md`.

### Changed

- Update packages from `commitment-graph` to `commitment`.

### Fixed

- Fix version in `package-lock.json` to match `package.json`.

## [1.0.0] - 2026-11-26

### Added

- Add core commands:
    -  `Commitment: View graph`
    -  `Commitment: Update graph`
    -  `Commitment: Doctor`
- Show the commitment graph as plain `JSON` or interactive `HTML` tree
- Filter tree projects and programs by state and hide inactive areas.
- Add configurable tree defaults for system states.
- Create missing area, program, and project files from tree rows.
- Add settings for the view mode, accent colors, and creation fields.
- Report various graph diagnostics with affected file paths.
