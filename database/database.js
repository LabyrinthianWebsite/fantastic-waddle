const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, '../database/commissions.db');
    this.db = null;
  }

  async init() {
    await fs.ensureDir(path.dirname(this.dbPath));
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const tables = [
      // Users table for admin access
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Artists table
      `CREATE TABLE IF NOT EXISTS artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        website_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Tags table
      `CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Characters table with expanded fields
      `CREATE TABLE IF NOT EXISTS characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        universe TEXT,
        role TEXT,
        year_level TEXT,
        dormitory TEXT,
        age_category TEXT CHECK(age_category IN ('Toddler', 'Kid', 'Teen', 'Adult')),
        age INTEGER, -- Actual age in years
        hair_color TEXT,
        eye_color TEXT,
        portrait_path TEXT,
        portrait_thumb_path TEXT,
        description TEXT,
        wiki_page TEXT,
        external_profile_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Character relationships table
      `CREATE TABLE IF NOT EXISTS character_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_character_id INTEGER NOT NULL,
        to_character_id INTEGER NOT NULL,
        relationship_type TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_character_id) REFERENCES characters(id) ON DELETE CASCADE,
        FOREIGN KEY (to_character_id) REFERENCES characters(id) ON DELETE CASCADE,
        UNIQUE(from_character_id, to_character_id, relationship_type)
      )`,

      // Character versions table for timeline
      `CREATE TABLE IF NOT EXISTS character_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        version_name TEXT NOT NULL,
        portrait_path TEXT,
        description TEXT,
        date_period TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      )`,

      // Collections/Series table
      `CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        cover_image_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Commissions table
      `CREATE TABLE IF NOT EXISTS commissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        date_month TEXT NOT NULL, -- YYYY-MM format
        price DECIMAL(10,2),
        score INTEGER CHECK(score >= 0 AND score <= 100),
        nsfw BOOLEAN DEFAULT 0,
        artist_id INTEGER,
        collection_id INTEGER,
        main_image_original TEXT,
        main_image_display TEXT,
        main_image_thumb TEXT,
        color_palette TEXT, -- JSON array of dominant colors
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
      )`,

      // Commission images (gallery) table
      `CREATE TABLE IF NOT EXISTS commission_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commission_id INTEGER NOT NULL,
        original_path TEXT NOT NULL,
        display_path TEXT,
        thumb_path TEXT,
        filename TEXT NOT NULL,
        filesize INTEGER,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE
      )`,

      // Commission draft images table
      `CREATE TABLE IF NOT EXISTS commission_draft_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commission_id INTEGER NOT NULL,
        original_path TEXT NOT NULL,
        display_path TEXT,
        thumb_path TEXT,
        filename TEXT NOT NULL,
        filesize INTEGER,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE
      )`,

      // Commission files table
      `CREATE TABLE IF NOT EXISTS commission_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commission_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        filesize INTEGER,
        mime_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE
      )`,

      // Commission-Tag junction table
      `CREATE TABLE IF NOT EXISTS commission_tags (
        commission_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (commission_id, tag_id),
        FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )`,

      // Commission-Character junction table
      `CREATE TABLE IF NOT EXISTS commission_characters (
        commission_id INTEGER NOT NULL,
        character_id INTEGER NOT NULL,
        PRIMARY KEY (commission_id, character_id),
        FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      )`,

      // Collection-Commission junction table
      `CREATE TABLE IF NOT EXISTS collection_commissions (
        collection_id INTEGER NOT NULL,
        commission_id INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (collection_id, commission_id),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE
      )`,

      // Upper Campus characters table (separate from regular characters)
      `CREATE TABLE IF NOT EXISTS upper_campus_characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        dormitory TEXT,
        grade TEXT, -- Academic grade/year level (e.g., "9th Grade", "Sophomore", etc.)
        age_category TEXT CHECK(age_category IN ('Toddler', 'Kid', 'Teen', 'Adult')),
        age INTEGER, -- Actual age in years
        hair_color TEXT,
        eye_color TEXT,
        portrait_path TEXT,
        portrait_thumb_path TEXT,
        
        -- Extended fields specific to Upper Campus
        aliases TEXT, -- Comma-separated nicknames & alternate names
        measurements TEXT, -- Height, Weight, Bust-Waist-Hips
        birthday TEXT, -- DD Month or MM/DD
        hair_attributes TEXT, -- Comma-separated hair attributes
        eye_attributes TEXT, -- Comma-separated eye attributes
        body_features TEXT, -- Comma-separated body features
        clothing_accessories TEXT, -- Comma-separated clothing/accessory items
        personal_items TEXT, -- Comma-separated personal items
        personality_traits TEXT, -- Comma-separated personality traits & quirks
        character_roles TEXT, -- Comma-separated character roles & relationships
        activities_hobbies TEXT, -- Comma-separated activities & hobbies
        story_events TEXT, -- Comma-separated story events/experiences
        sexual_activities TEXT, -- Comma-separated sexual activities
        sexual_themes TEXT, -- Comma-separated sexual themes/experiences
        description TEXT, -- Long text paragraph/bio
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Upper Campus character images table (for gallery)
      `CREATE TABLE IF NOT EXISTS upper_campus_character_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        original_path TEXT NOT NULL,
        display_path TEXT,
        thumb_path TEXT,
        filename TEXT NOT NULL,
        filesize INTEGER,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES upper_campus_characters(id) ON DELETE CASCADE
      )`,

      // Upper Campus character works table (manga/anime/game references)
      `CREATE TABLE IF NOT EXISTS upper_campus_character_works (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        work_name TEXT NOT NULL,
        work_type TEXT CHECK(work_type IN ('manga', 'anime', 'game', 'other')),
        icon_path TEXT,
        external_url TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES upper_campus_characters(id) ON DELETE CASCADE
      )`,

      // Drafts table for tracking work in progress
      `CREATE TABLE IF NOT EXISTS drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested', 'accepted', 'in_progress', 'completed', 'delivered', 'canceled')),
        date_month TEXT, -- YYYY-MM format when draft was started
        price DECIMAL(10,2),
        artist_id INTEGER,
        collection_id INTEGER,
        notes TEXT, -- Internal notes about the draft progress
        client_name TEXT, -- Client or requester name
        deadline_date TEXT, -- Expected completion date
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
      )`,

      // Draft images table
      `CREATE TABLE IF NOT EXISTS draft_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        draft_id INTEGER NOT NULL,
        original_path TEXT NOT NULL,
        display_path TEXT,
        thumb_path TEXT,
        filename TEXT NOT NULL,
        filesize INTEGER,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
      )`,

      // Draft-Tag junction table
      `CREATE TABLE IF NOT EXISTS draft_tags (
        draft_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (draft_id, tag_id),
        FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )`,

      // Draft-Character junction table
      `CREATE TABLE IF NOT EXISTS draft_characters (
        draft_id INTEGER NOT NULL,
        character_id INTEGER NOT NULL,
        PRIMARY KEY (draft_id, character_id),
        FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      )`,

      // Novels table for text-based commissions
      `CREATE TABLE IF NOT EXISTS novels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        date_month TEXT NOT NULL, -- YYYY-MM format
        price DECIMAL(10,2),
        score INTEGER CHECK(score >= 0 AND score <= 100),
        nsfw BOOLEAN DEFAULT 0,
        artist_id INTEGER,
        collection_id INTEGER,
        
        -- Original text content
        original_language TEXT NOT NULL DEFAULT 'en',
        original_title TEXT,
        original_content TEXT,
        
        -- Translated text content
        translated_language TEXT,
        translated_title TEXT,
        translated_content TEXT,
        
        -- Publication status
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
        word_count INTEGER DEFAULT 0,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
      )`,

      // Novel-Tag junction table
      `CREATE TABLE IF NOT EXISTS novel_tags (
        novel_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (novel_id, tag_id),
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )`,

      // Novel-Character junction table
      `CREATE TABLE IF NOT EXISTS novel_characters (
        novel_id INTEGER NOT NULL,
        character_id INTEGER NOT NULL,
        PRIMARY KEY (novel_id, character_id),
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      )`
    ];

    for (const table of tables) {
      await this.run(table);
    }

    // Add new columns to existing tables
    const alterTables = [
      // Add age column to characters table if it doesn't exist
      `ALTER TABLE characters ADD COLUMN age INTEGER`,
      
      // Add grade and age columns to upper_campus_characters table if they don't exist
      `ALTER TABLE upper_campus_characters ADD COLUMN grade TEXT`,
      `ALTER TABLE upper_campus_characters ADD COLUMN age INTEGER`
    ];

    for (const alter of alterTables) {
      try {
        await this.run(alter);
      } catch (err) {
        // Ignore errors for columns that already exist
        if (!err.message.includes('duplicate column name')) {
          console.warn('Warning during table alteration:', err.message);
        }
      }
    }

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_commissions_date ON commissions(date_month)',
      'CREATE INDEX IF NOT EXISTS idx_commissions_score ON commissions(score)',
      'CREATE INDEX IF NOT EXISTS idx_commissions_nsfw ON commissions(nsfw)',
      'CREATE INDEX IF NOT EXISTS idx_commissions_artist ON commissions(artist_id)',
      'CREATE INDEX IF NOT EXISTS idx_characters_universe ON characters(universe)',
      'CREATE INDEX IF NOT EXISTS idx_characters_role ON characters(role)',
      'CREATE INDEX IF NOT EXISTS idx_characters_dormitory ON characters(dormitory)',
      'CREATE INDEX IF NOT EXISTS idx_characters_age ON characters(age_category)',
      'CREATE INDEX IF NOT EXISTS idx_commission_tags_tag ON commission_tags(tag_id)',
      'CREATE INDEX IF NOT EXISTS idx_commission_characters_character ON commission_characters(character_id)',
      'CREATE INDEX IF NOT EXISTS idx_upper_campus_characters_dormitory ON upper_campus_characters(dormitory)',
      'CREATE INDEX IF NOT EXISTS idx_upper_campus_characters_age ON upper_campus_characters(age_category)',
      'CREATE INDEX IF NOT EXISTS idx_upper_campus_character_images_character ON upper_campus_character_images(character_id)',
      'CREATE INDEX IF NOT EXISTS idx_upper_campus_character_works_character ON upper_campus_character_works(character_id)',
      'CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status)',
      'CREATE INDEX IF NOT EXISTS idx_drafts_date ON drafts(date_month)',
      'CREATE INDEX IF NOT EXISTS idx_drafts_artist ON drafts(artist_id)',
      'CREATE INDEX IF NOT EXISTS idx_draft_images_draft ON draft_images(draft_id)',
      'CREATE INDEX IF NOT EXISTS idx_draft_tags_tag ON draft_tags(tag_id)',
      'CREATE INDEX IF NOT EXISTS idx_draft_characters_character ON draft_characters(character_id)',
      'CREATE INDEX IF NOT EXISTS idx_novels_date ON novels(date_month)',
      'CREATE INDEX IF NOT EXISTS idx_novels_score ON novels(score)',
      'CREATE INDEX IF NOT EXISTS idx_novels_nsfw ON novels(nsfw)',
      'CREATE INDEX IF NOT EXISTS idx_novels_artist ON novels(artist_id)',
      'CREATE INDEX IF NOT EXISTS idx_novels_status ON novels(status)',
      'CREATE INDEX IF NOT EXISTS idx_novel_tags_tag ON novel_tags(tag_id)',
      'CREATE INDEX IF NOT EXISTS idx_novel_characters_character ON novel_characters(character_id)'
    ];

    for (const index of indexes) {
      await this.run(index);
    }

    console.log('Database tables created successfully');
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('Database connection closed');
        }
        resolve();
      });
    });
  }
}

module.exports = Database;