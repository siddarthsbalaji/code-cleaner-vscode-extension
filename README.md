# CodeCleaner

**CodeCleaner** is a fast, efficient, and lightweight Visual Studio Code extension that formats, minifies, and cleans up code directly within the editor or across your entire workspace.

Powered by **Web Tree-Sitter** and **Terser**, it intelligently trims trailing whitespaces, removes consecutive spaces, removes blank lines, and tightens operators to make your code as compact and clean as possible, all while preserving the logic and syntax of your language.

## Features

- **Multiple Cleaning Profiles**: Choose how aggressively you want to clean your code via default settings (`codeCleaner.profile`) or pick one on the fly:
  - `Format`: Safely standardizes spacing without aggressive minification.
  - `Clean` (Default): Trims whitespaces, removes comments, and tightens operators while keeping structure readable.
  - `Minify`: Aggressively strips all unnecessary whitespace, empty lines, and indentation for maximum compactness.
  - `Obfuscate`: Mangles variable names and drops console logs (JavaScript only).
- **Core Developer Scopes**:
  - **Selection**: Clean highlighted code snippets with your default profile or an on-the-fly profile.
  - **File**: Clean current open files or right-click any file in the Explorer.
  - **Folder / Workspace**: Clean entire directories with progress reporting and concurrency control.
- **Clean with Profile...**: Choose a profile on the fly for your selection or file without modifying your default settings.
- **Clean with Preview (Diff)**: Inspect changes side-by-side in a split diff viewer before applying them.
- **Self-Documenting Profiles**: View rich descriptions directly in the profile selector, status bar tooltip, and settings UI—no need to look up documentation.
- **VS Code Document Formatter**: Registered as an official formatting provider. Use `Format Document` (`Shift+Alt+F`) or enable `editor.formatOnSave` with CodeCleaner.
- **Status Bar Profile Switcher**: Quickly view your active default profile and click to toggle it right from the VS Code status bar.
- **Clean Entire Folders & Single Files**: Right-click any folder or individual file in the Explorer sidebar to clean directly without opening it.
- **Smart Legal Header & Docstring Preservation**: Keeps license banners (`/*!`, `//!`, `@license`, `SPDX`, `Copyright`) intact and optionally preserves JSDoc comments (`codeCleaner.preserveDocstrings`).
- **Clean on Save**: Enable `codeCleaner.cleanOnSave` to automatically tidy your files every time you hit save.
- **Safe JSON Handling**: Automatically validates and cleanly formats or minifies JSON/JSONC documents.
- **CSS Math Safety**: Protects spaces in `calc()`, `clamp()`, `min()`, and `max()` to prevent invalid CSS syntax.
- **Language Aware**: 
  - Uses robust AST (Abstract Syntax Tree) parsing via Web Tree-Sitter.
  - Smart string and regex literal protection ensures multi-line strings or regexes are untouched.
  - Dynamically disables operator tightening for languages like Bash/Shell where spaces are syntactically required.

## Usage

### Commands & Shortcuts
1. **Clean Current Selection / File**: `Alt+Shift+C` (or Command Palette: **CodeCleaner: Clean**).
2. **Clean Selection**: **CodeCleaner: Clean Selection** (cleans highlighted code using default profile).
3. **Clean File**: **CodeCleaner: Clean File** (cleans entire active file using default profile).
4. **Clean with Profile...**: **CodeCleaner: Clean with Profile...** (prompts with interactive profile selector to clean on the fly).
5. **Clean with Preview**: **CodeCleaner: Clean with Preview (Diff)**.
6. **Switch Default Profile**: Click the status bar item (`$(sparkle) Clean: <Profile>`) or run **CodeCleaner: Switch Default Profile...**.

### Context Menus
- **Editor:** Right-click anywhere in an open file to access the **CodeCleaner** submenu:
  - If text is selected: **Clean Selection**
  - If no text is selected: **Clean File**
  - **Clean with Profile...** (choose Format, Clean, Minify, or Obfuscate on the fly)
  - **Clean with Preview (Diff)**
  - **Switch Default Profile...**
- **Explorer:** Right-click any folder to **Clean Folder**, or any file to **Clean File**.

## Configuration Options
All settings can be customized per language (e.g. `"[python]": { "codeCleaner.profile": "Clean" }`):
- `codeCleaner.profile` (`Format` | `Clean` | `Minify` | `Obfuscate`, default: `Clean`)
- `codeCleaner.removeComments` (boolean, default: `true`)
- `codeCleaner.preserveLegalHeaders` (boolean, default: `true`)
- `codeCleaner.preserveDocstrings` (boolean, default: `false`)
- `codeCleaner.removeBlankLines` (boolean, default: `true`)
- `codeCleaner.removeSpacesAroundOperators` (boolean, default: `true`)
- `codeCleaner.removeIndentation` (boolean, default: `false`)
- `codeCleaner.cleanOnSave` (boolean, default: `false`)

## Supported Languages
Fully tested and configured for JavaScript, TypeScript, Python, Ruby, C, C++, C#, Java, Rust, Go, PHP, Kotlin, Swift, Solidity, Vue, TOML, Zig, Elixir, Elm, OCaml, HTML, CSS, SCSS, LESS, JSON, Bash, Shell, PowerShell, YAML, Lua, SQL, and more!

## License
MIT