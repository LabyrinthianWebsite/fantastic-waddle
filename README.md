# CommissionDB

CommissionDB is a local-first web application for cataloging, browsing, and analyzing art commission records along with associated artists, characters, tags, collections, files, and metadata. It includes a rich browsing interface, statistics views, visual timelines, character relationship displays, and an admin panel for structured data entry and bulk import.

> Security Note: As reinforced in the setup flow, this application is designed to run locally only. Do not expose it directly to the public internet without adding proper authentication, authorization, and security hardening.

---

## Table of Contents
1. Project Goals
2. Core Features
3. Data Model Overview
4. UI / UX Highlights
5. Admin Capabilities
6. Installation & Setup
7. Running the Application
8. Directory Structure (Typical)
9. Backups & Data Management
10. Development Notes
11. Potential Future Improvements
12. Contributing
13. License

---

## 1. Project Goals
- Provide a personal/local archive of commissioned artwork with structured metadata.
- Make it easy to filter, sort, and explore commissions by multiple dimensions (artist, tags, characters, score/rating, etc.).
- Offer visualization aids: timelines, statistics, top entities, and simple relationship graphs.
- Support efficient bulk ingestion of existing datasets via CSV.
- Remain self-contained (SQLite + file system) and simple to run.

---

## 2. Core Features

### Public / Browsing
- Homepage with multi-criteria filtering:
  - Free-text query
  - Artist filter
  - Tag filtering (multi-select)
  - Character filtering (multi-select)
  - Score / rating range
  - Sort options (e.g., date descending)
  - Pagination support
- Commission detail pages (images/files + metadata).
- Character detail pages with:
  - Version timeline (character evolutions / variants)
  - Commission timeline (appearances across time)
  - Relationship visualization (co-appearances / defined relationships)
- Stats pages:
  - Aggregate counts
  - Top characters, tags, artists (ranking limits applied, e.g., top 20)
- File bundle download:
  - Zip export per commission (all attached files).
- Safe Mode / NSFW handling (toggle to hide sensitive media).
- Theme toggle (light/dark) with persistence in local storage.
- Keyboard shortcuts (search focus, help, closing modals, etc.).
- Lightbox / modal viewing for media.

### Admin
- Guided setup: Redirects to /setup if no users exist.
- Dashboard with quick actions (add artist, collection, bulk import, etc.).
- CRUD for:
  - Artists
  - Tags
  - Characters (with portraits & attributes)
  - Character relationships
  - Collections / series
  - Commissions (with associations to artist, tags, characters, collections, rating/score, dates, primary image)
- Bulk Import interface with documentation & tabs (CSV formats).
- Slug generation (unique URL fragments for entities).
- Thumbnail & auxiliary file handling for uploads.
- Basic error handling & form re-rendering on validation failure.

### Architecture / Stack
- Node.js + Express application.
- EJS templating for server-rendered pages.
- SQLite (inferred from SQL usage in route files) as embedded database.
- File system storage for uploads (including thumbnails & portraits).
- Client-side enhancements via vanilla JavaScript (public/js/app.js).

---

## 3. Data Model Overview (Inferred)
Key tables (based on queries in routes):
- users
- artists
- tags
- characters
- commissions
- commission_tags (junction)
- commission_characters (junction)
- collections
- commission_files
- character_relationships
- character_versions (implied by timeline usage)
Additional computed stats queries aggregate top usage across commissions.

---

## 4. UI / UX Highlights
- Responsive card/grid layouts.
- Gradient and theme-aware design tokens (CSS variables suggested).
- Accessible theme toggle and safe-mode toggle.
- Timeline & relationship visualization (simple grid/semantic structure, potentially upgradeable to graph libs).
- Progressive enhancement (works without JS for core browsing; JS improves interactions).
- Bulk import UI with tabbed format documentation to guide correct CSV structure.

---

## 5. Admin Capabilities (Detailed)
- Add/edit/remove artists with slug + optional links/description.
- Add/edit/remove tags with slug + description.
- Add/edit/remove characters (universe, role, dormitory, year level, age category, physical traits, external links, variants/versions).
- Define relationships between characters (directional entries).
- Create/update commissions:
  - Associate single artist
  - Attach multiple tags & characters
  - Link to a collection
  - Set date/month fields & rating/score
  - Upload main image + additional files
- Bulk import:
  - CSV ingestion for multiple entity types (format documentation displayed in the UI).
- Stats & dashboard quick view of recent commissions.

---

## 6. Installation & Setup

### Prerequisites
- Node.js (recommend LTS 18+ or 20+)
- npm (bundled with Node)
- Git (to clone repository)

### Steps
1. Clone the repository:
   git clone https://github.com/LabyrinthianWebsite/CommissionDB.git
   cd CommissionDB

2. Install dependencies:
   npm install

3. (Optional) Create an environment file (.env) if configurable values are supported. Common examples (verify against codebase before adding):
   PORT=3000
   SESSION_SECRET=change_this_value

4. Start the application:
   npm start

5. Open your browser:
   http://localhost:3000

6. First Run:
   - You should be redirected to /setup
   - Create the initial admin user
   - Proceed to admin panel to begin adding data

### Development Convenience
- Use nodemon for hot reload:
  npm install --save-dev nodemon
  npx nodemon server.js
  (Adjust entry file name if different.)

---

## 7. Running the Application

### Database Location
By default, the application creates SQLite databases in a `./data/` directory to persist data across code updates. This ensures that pulling new code or PRs won't overwrite your existing database.

**Configuration Options:**
- Default location: `./data/` (created automatically)
- Custom location: Set the `DATA_DIR` environment variable
  ```bash
  DATA_DIR=/path/to/your/data node server.js
  ```

### Production-Style (local hardened):
- Ensure SESSION_SECRET (if implemented) is set.
- Run with:
  NODE_ENV=production PORT=3000 node server.js

Optional Tools:
- pm2 for process management:
  npm install -g pm2
  pm2 start server.js --name commissiondb

---

## 8. Directory Structure (Typical / Inferred)

(Adjust if actual layout differs.)

.
├─ public/               # Static assets (JS, CSS, images)
│  └─ js/app.js          # Client-side interaction logic (theme, safe mode, modals, etc.)
├─ uploads/              # User-uploaded files & thumbnails (auto-created)
├─ views/                # EJS templates
│  ├─ admin/             # Admin interface templates
│  ├─ partials/          # Shared partials (headers, footers)
│  ├─ character-detail.ejs
│  ├─ setup.ejs
│  └─ ...
├─ routes/
│  ├─ public.js          # Public / browsing routes
│  └─ admin.js           # Admin / CRUD & import routes
├─ middleware/           # Slug generator, auth helpers (inferred)
├─ data/                  # SQLite database files (persistent storage)
│  ├─ gallery.db          # Main gallery database
│  └─ commissions.db      # Commission data (if using base Database class)
├─ README.md
├─ package.json
└─ server.js / app.js    # Express bootstrap (check actual entry file)

---

## 9. Backups & Data Management

Because this is a local-first app:
- **Database**: Backup the SQLite database files in the `./data/` directory regularly. The application creates:
  - `data/gallery.db` - Main gallery database
  - `data/commissions.db` - Commission data (if using base Database class)
- **Uploads**: Mirror the entire `/uploads` directory to preserve images and attachments.
- **Version Control**: Database files are excluded from Git to prevent overwrites during code updates.
- **Recommended backup strategy**:
  - Daily incremental copy of the entire `data/` directory
  - Weekly full compressed archive of `data/` + `uploads/`
  - Use the built-in backup manager accessible through the admin interface

---

## 10. Development Notes

- Slug Consistency: Slugs are programmatically generated; altering existing slugs may break inbound links.
- File Handling: Ensure unique filenames or deterministic hashing to avoid collisions (future enhancement).
- Validation: Some server-side validation exists; more can be added for robustness.
- Performance: For large datasets, consider indexing frequently filtered columns (artist_id, date fields, rating, score).
- Security: Currently trust-based (local). Do not deploy as-is to the open web.

---

## 11. Potential Future Improvements

Data & Model:
- Add soft-deletes with audit logging.
- Introduce tag hierarchy (parent/child) or synonyms/aliases.
- Character trait taxonomy & dynamic attribute definitions.

Search & Retrieval:
- Full-text search indexing (e.g., SQLite FTS5) across descriptions and notes.
- Fuzzy matching & suggestion ranking.

UI / UX:
- Drag-and-drop reordering of images/files within a commission.
- Batch editing for multi-select commission updates.
- Infinite scroll option for browsing.
- Advanced filter builder with saved searches.

Visualization:
- Richer relationship graph (D3 force layout, clustering).
- Temporal heatmaps (commissions per month/year).
- Tag co-occurrence network graph.

Media Handling:
- Automatic thumbnail & responsive image generation pipeline.
- Duplicate image detection (hash comparison).
- EXIF stripping & metadata embedding for archive consistency.

Integrations:
- Importers for external platforms (e.g., Patreon export, DeviantArt scrap, etc.).
- REST / GraphQL API endpoints for programmatic access.
- Webhooks or plugin architecture for post-save events (e.g., push to cloud backup).

Authentication & Security:
- Multi-user roles (admin/editor/viewer).
- OAuth or local password hashing with configurable policies.
- CSRF protection, rate limiting, session hardening.
- Optional private mode requiring login for all routes.

Scalability:
- Optional Postgres adapter for larger datasets.
- Caching layer for stats and top lists.

Automation & Intelligence:
- AI-assisted tagging / character recognition (opt-in local model or external API).
- Smart suggestion ranking for tags & characters based on prior usage.

Internationalization:
- i18n framework for multi-language UI and localized date formatting.

DevOps:
- Dockerfile + docker-compose for reproducible deployments.
- CI pipeline with linting, tests, vulnerability scanning.

Testing:
- Comprehensive unit tests for slug generation & import parsing.
- Integration tests for route handlers.
- E2E tests (Playwright/Cypress) for key flows (setup, add commission, search).

Accessibility:
- ARIA roles, improved keyboard navigation, high-contrast theme variant.
- Image alt text management for uploaded files.

Backup & Archival:
- Built-in export (JSON + media bundle).
- Scheduled internal backup snapshots.

Performance:
- Lazy-loading images & intersection observer for galleries.
- Pre-computed denormalized tables for stats.

---

## 12. Contributing

Contributions are welcome. Suggested workflow:
1. Fork repository
2. Create feature branch: git checkout -b feature/your-feature
3. Commit changes with clear messages
4. Run lint/tests (if configured)
5. Open Pull Request describing changes & rationale

Please consider:
- Keeping code style consistent
- Avoiding large unrelated refactors in a single PR
- Documenting new environment variables or migration steps

---

## 13. License

(Repository currently lacks an explicit license in this README. Add a LICENSE file to clarify usage rights—e.g., MIT, Apache-2.0, or a custom local-only license.)

---

## Quick Start (TL;DR)

git clone https://github.com/LabyrinthianWebsite/CommissionDB.git
cd CommissionDB
npm install
npm start
Open http://localhost:3000 and complete setup.

---

If you need additional sections (API reference, CSV format specifics, or migration guide), feel free to request an expansion.

Happy archiving!
