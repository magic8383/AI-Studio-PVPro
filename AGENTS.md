# Agent Guidelines & Project Instructions (PV-Planung Pro)

> 🚨 **MANDATORY DIRECTIVE FOR ALL ASSISTANTS & AGENTS:**
> **YOU MUST ALWAYS READ `DEVELOPMENT_GUIDELINES.md` FIRST BEFORE PROPOSING OR IMPLEMENTING ANY CODE CHANGES.**

## Core Directives

1. **Read Guidelines First:**  
   Always inspect `/DEVELOPMENT_GUIDELINES.md` as the primary source of truth for architecture, standards, and workflow.

2. **Increment Version on Every Single Change:**  
   Every time any code or logic is modified, you **MUST** increment the version number (`MAJOR.MINOR.PATCH`). Never keep the version unchanged across edits.
   - Synchronize the version across `package.json`, `index.html` (title, og:title, script tags), `sw.js` (`CACHE_NAME`), `DEVELOPMENT_GUIDELINES.md`, and `content.js`.

3. **Maintain Changelog with Newest on Top:**  
   Whenever a version is incremented, add the full release notes at the **very top** of `CHANGELOG.md` (chronologically descending).

4. **Modular Architecture & Anti-Bloat:**  
   Respect the file division:
   - `index.html`: DOM shell & styling
   - `app.js`: Core state, 8,760h PVGIS simulation, physics engine & finance
   - `wiring.js`: DC string wiring, obstacle logic, Leap-Frog & VDE 0100-712 cable physics
   - `dossier.js`: Structured PDF & print dossier generator (DIN VDE 0100-712)
   - `database.js`: Master hardware catalog
   - `content.js`: In-app guide, documentation & changelog text
   Do not allow files to bloat into unmaintainable monoliths.

5. **No Island Solutions (Keine Insellösungen):**  
   - Logic must have a Single Source of Truth (no duplicated formulas in UI vs. Export).
   - Layout & Design must strictly follow Material Design 3 Expressive with Google Material Symbols Rounded (`.material-symbols-rounded`).

6. **Professional Print & PDF Standards:**  
   Never produce raw screen captures or dark-mode app dumps for printing. All printable output must go through `dossier.js` with structured sections, crisp vector SVGs, and complete VDE handover documentation.
