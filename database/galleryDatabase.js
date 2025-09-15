const Database = require('./database');

class GalleryDatabase extends Database {
  constructor() {
    super();
    // Use DATA_DIR environment variable or default to './data' directory
    const dataDir = process.env.DATA_DIR || require('path').join(__dirname, '../data');
    // Update the database path for the gallery
    this.dbPath = require('path').join(dataDir, 'gallery.db');
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

      // Studios table - top level organizational unit
      `CREATE TABLE IF NOT EXISTS studios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        logo_path TEXT,
        logo_thumb_path TEXT,
        website_url TEXT,
        location TEXT,
        established_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Models table - can be associated with studios
      `CREATE TABLE IF NOT EXISTS models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        studio_id INTEGER,
        profile_image_path TEXT,
        profile_thumb_path TEXT,
        age INTEGER,
        measurements TEXT,
        height TEXT,
        eye_color TEXT,
        hair_color TEXT,
        nationality TEXT,
        instagram_url TEXT,
        twitter_url TEXT,
        website_url TEXT,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL
      )`,

      // Sets table - must be assigned to a model
      `CREATE TABLE IF NOT EXISTS sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        model_id INTEGER NOT NULL,
        release_date TEXT,
        location TEXT,
        photographer TEXT,
        outfit_description TEXT,
        theme TEXT,
        cover_image_path TEXT,
        cover_thumb_path TEXT,
        image_count INTEGER DEFAULT 0,
        video_count INTEGER DEFAULT 0,
        total_size_bytes BIGINT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
      )`,

      // Media table - images and videos belonging to sets
      `CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        set_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_path TEXT NOT NULL,
        display_path TEXT,
        thumb_path TEXT,
        file_type TEXT NOT NULL CHECK(file_type IN ('image', 'video')),
        mime_type TEXT,
        filesize BIGINT,
        width INTEGER,
        height INTEGER,
        duration REAL, -- For videos, in seconds
        sort_order INTEGER DEFAULT 0,
        hash TEXT, -- For duplicate detection
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
      )`,

      // Tags table for categorization
      `CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#6366f1',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Set tags junction table
      `CREATE TABLE IF NOT EXISTS set_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        set_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(set_id, tag_id)
      )`,

      // Media tags junction table
      `CREATE TABLE IF NOT EXISTS media_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(media_id, tag_id)
      )`,

      // Upload sessions for tracking large uploads
      `CREATE TABLE IF NOT EXISTS upload_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        set_id INTEGER NOT NULL,
        total_files INTEGER DEFAULT 0,
        uploaded_files INTEGER DEFAULT 0,
        total_size_bytes BIGINT DEFAULT 0,
        uploaded_size_bytes BIGINT DEFAULT 0,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'failed', 'cancelled')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
      )`
    ];

    // Create all tables
    for (const table of tables) {
      await this.run(table);
    }

    // Create indexes for performance
    await this.createIndexes();
    
    console.log('Gallery database tables created successfully');
  }

  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_models_studio_id ON models(studio_id)',
      'CREATE INDEX IF NOT EXISTS idx_models_slug ON models(slug)',
      'CREATE INDEX IF NOT EXISTS idx_sets_model_id ON sets(model_id)',
      'CREATE INDEX IF NOT EXISTS idx_sets_slug ON sets(slug)',
      'CREATE INDEX IF NOT EXISTS idx_media_set_id ON media(set_id)',
      'CREATE INDEX IF NOT EXISTS idx_media_file_type ON media(file_type)',
      'CREATE INDEX IF NOT EXISTS idx_media_hash ON media(hash)',
      'CREATE INDEX IF NOT EXISTS idx_set_tags_set_id ON set_tags(set_id)',
      'CREATE INDEX IF NOT EXISTS idx_set_tags_tag_id ON set_tags(tag_id)',
      'CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON media_tags(media_id)',
      'CREATE INDEX IF NOT EXISTS idx_media_tags_tag_id ON media_tags(tag_id)',
      'CREATE INDEX IF NOT EXISTS idx_upload_sessions_session_id ON upload_sessions(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_studios_slug ON studios(slug)',
      'CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug)'
    ];

    for (const index of indexes) {
      await this.run(index);
    }
  }

  // Gallery-specific methods

  // Studio methods
  async getStudios() {
    return this.all(`
      SELECT s.*, 
             COUNT(DISTINCT m.id) as model_count,
             COUNT(DISTINCT sets.id) as set_count
      FROM studios s
      LEFT JOIN models m ON m.studio_id = s.id
      LEFT JOIN sets ON sets.model_id = m.id
      GROUP BY s.id
      ORDER BY s.name
    `);
  }

  async getStudioBySlug(slug) {
    return this.get('SELECT * FROM studios WHERE slug = ?', [slug]);
  }

  async getStudioById(id) {
    return this.get('SELECT * FROM studios WHERE id = ?', [id]);
  }

  async createStudio(data) {
    const result = await this.run(`
      INSERT INTO studios (name, slug, description, logo_path, logo_thumb_path, website_url, location, established_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.name, data.slug, data.description, data.logo_path, data.logo_thumb_path, data.website_url, data.location, data.established_date]);
    
    return result.lastID;
  }

  // Model methods
  async getModels(studioId = null) {
    let query = `
      SELECT m.*, 
             COALESCE(s.name, 'One-Shot Studio') as studio_name,
             s.slug as studio_slug,
             COUNT(DISTINCT sets.id) as set_count
      FROM models m
      LEFT JOIN studios s ON m.studio_id = s.id
      LEFT JOIN sets ON sets.model_id = m.id
    `;
    
    const params = [];
    if (studioId) {
      query += ' WHERE m.studio_id = ?';
      params.push(studioId);
    }
    
    query += ' GROUP BY m.id ORDER BY m.name';
    
    return this.all(query, params);
  }

  async getModelBySlug(slug) {
    return this.get(`
      SELECT m.*, 
             COALESCE(s.name, 'One-Shot Studio') as studio_name,
             s.slug as studio_slug
      FROM models m
      LEFT JOIN studios s ON m.studio_id = s.id
      WHERE m.slug = ?
    `, [slug]);
  }

  async getModelById(id) {
    return this.get(`
      SELECT m.*, 
             COALESCE(s.name, 'One-Shot Studio') as studio_name,
             s.slug as studio_slug
      FROM models m
      LEFT JOIN studios s ON m.studio_id = s.id
      WHERE m.id = ?
    `, [id]);
  }

  async createModel(data) {
    const result = await this.run(`
      INSERT INTO models (name, slug, description, studio_id, profile_image_path, profile_thumb_path, 
                         age, measurements, height, eye_color, hair_color, nationality, 
                         instagram_url, twitter_url, website_url, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.name, data.slug, data.description, data.studio_id, data.profile_image_path, data.profile_thumb_path,
        data.age, data.measurements, data.height, data.eye_color, data.hair_color, data.nationality,
        data.instagram_url, data.twitter_url, data.website_url, data.active]);
    
    return result.lastID;
  }

  // Set methods
  async getSets(modelId = null) {
    let query = `
      SELECT s.*, 
             m.name as model_name,
             m.slug as model_slug,
             COALESCE(st.name, 'One-Shot Studio') as studio_name,
             st.slug as studio_slug
      FROM sets s
      JOIN models m ON s.model_id = m.id
      LEFT JOIN studios st ON m.studio_id = st.id
    `;
    
    const params = [];
    if (modelId) {
      query += ' WHERE s.model_id = ?';
      params.push(modelId);
    }
    
    query += ' ORDER BY s.release_date DESC, s.created_at DESC';
    
    return this.all(query, params);
  }

  async getSetBySlug(slug) {
    return this.get(`
      SELECT s.*, 
             m.name as model_name,
             m.slug as model_slug,
             st.name as studio_name,
             st.slug as studio_slug
      FROM sets s
      JOIN models m ON s.model_id = m.id
      LEFT JOIN studios st ON m.studio_id = st.id
      WHERE s.slug = ?
    `, [slug]);
  }

  async getSetById(id) {
    return this.get(`
      SELECT s.*, 
             m.name as model_name,
             m.slug as model_slug,
             st.name as studio_name,
             st.slug as studio_slug
      FROM sets s
      JOIN models m ON s.model_id = m.id
      LEFT JOIN studios st ON m.studio_id = st.id
      WHERE s.id = ?
    `, [id]);
  }

  async createSet(data) {
    const result = await this.run(`
      INSERT INTO sets (name, slug, description, model_id, release_date, location, photographer, 
                       outfit_description, theme, cover_image_path, cover_thumb_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.name, data.slug, data.description, data.model_id, data.release_date, data.location, 
        data.photographer, data.outfit_description, data.theme, data.cover_image_path, data.cover_thumb_path]);
    
    return result.id;
  }

  // Media methods
  async getMediaBySet(setId) {
    return this.all(`
      SELECT * FROM media 
      WHERE set_id = ? 
      ORDER BY sort_order, filename
    `, [setId]);
  }

  async createMedia(data) {
    const result = await this.run(`
      INSERT INTO media (set_id, filename, original_path, display_path, thumb_path, file_type, 
                        mime_type, filesize, width, height, duration, sort_order, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.set_id, data.filename, data.original_path, data.display_path, data.thumb_path, 
        data.file_type, data.mime_type, data.filesize, data.width, data.height, data.duration, 
        data.sort_order, data.hash]);
    
    return result.lastID;
  }

  // Update set statistics after media upload
  async updateSetStats(setId) {
    await this.run(`
      UPDATE sets 
      SET image_count = (SELECT COUNT(*) FROM media WHERE set_id = ? AND file_type = 'image'),
          video_count = (SELECT COUNT(*) FROM media WHERE set_id = ? AND file_type = 'video'),
          total_size_bytes = (SELECT COALESCE(SUM(filesize), 0) FROM media WHERE set_id = ?)
      WHERE id = ?
    `, [setId, setId, setId, setId]);
  }

  // Auto-thumbnailing methods
  async updateStudioThumbnail(studioId, logoPath, logoThumbPath) {
    await this.run(`
      UPDATE studios 
      SET logo_path = ?, logo_thumb_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [logoPath, logoThumbPath, studioId]);
  }

  async updateModelThumbnail(modelId, profileImagePath, profileThumbPath) {
    await this.run(`
      UPDATE models 
      SET profile_image_path = ?, profile_thumb_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [profileImagePath, profileThumbPath, modelId]);
  }

  async updateSetThumbnail(setId, coverImagePath, coverThumbPath) {
    await this.run(`
      UPDATE sets 
      SET cover_image_path = ?, cover_thumb_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [coverImagePath, coverThumbPath, setId]);
  }

  // Get first uploaded media for auto-thumbnailing
  async getFirstMediaForSet(setId) {
    return this.get(`
      SELECT * FROM media 
      WHERE set_id = ? 
      ORDER BY sort_order ASC, created_at ASC 
      LIMIT 1
    `, [setId]);
  }

  async getFirstMediaForModel(modelId) {
    return this.get(`
      SELECT m.* FROM media m
      JOIN sets s ON m.set_id = s.id
      WHERE s.model_id = ?
      ORDER BY s.created_at ASC, m.sort_order ASC, m.created_at ASC
      LIMIT 1
    `, [modelId]);
  }

  async getFirstMediaForStudio(studioId) {
    return this.get(`
      SELECT m.* FROM media m
      JOIN sets s ON m.set_id = s.id
      JOIN models mo ON s.model_id = mo.id
      WHERE mo.studio_id = ?
      ORDER BY s.created_at ASC, m.sort_order ASC, m.created_at ASC
      LIMIT 1
    `, [studioId]);
  }
}

module.exports = GalleryDatabase;