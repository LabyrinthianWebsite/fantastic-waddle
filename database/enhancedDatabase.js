const Database = require('./database');

class EnhancedDatabase extends Database {
  constructor() {
    super();
  }

  async createTables() {
    // Call parent method first
    await super.createTables();
    
    // Run color migration to add key_color columns
    await this.runColorMigration();
    
    // Create FTS5 virtual tables for full-text search
    await this.createFullTextSearchTables();
    
    // Create additional tables for enhanced features
    await this.createEnhancedTables();
    
    // Create additional indexes for performance
    await this.createAdditionalIndexes();
  }

  async runColorMigration() {
    try {
      console.log('Running color migration...');
      
      // Add three key color fields to commissions table
      const alterStatements = [
        'ALTER TABLE commissions ADD COLUMN key_color_1 TEXT DEFAULT NULL',
        'ALTER TABLE commissions ADD COLUMN key_color_2 TEXT DEFAULT NULL', 
        'ALTER TABLE commissions ADD COLUMN key_color_3 TEXT DEFAULT NULL'
      ];

      for (const statement of alterStatements) {
        try {
          await this.run(statement);
        } catch (err) {
          // Ignore errors for columns that already exist
          if (!err.message.includes('duplicate column name')) {
            console.warn('Warning during color migration:', err.message);
          }
        }
      }

      // Create index for better color search performance
      try {
        await this.run(`
          CREATE INDEX IF NOT EXISTS idx_commissions_key_colors 
          ON commissions(key_color_1, key_color_2, key_color_3)
        `);
      } catch (err) {
        console.warn('Warning creating color index:', err.message);
      }

      console.log('Color migration completed successfully');
    } catch (error) {
      console.error('Error running color migration:', error);
      throw error;
    }
  }

  async createFullTextSearchTables() {
    const ftsTables = [
      // Full-text search for commissions
      `CREATE VIRTUAL TABLE IF NOT EXISTS commissions_fts USING fts5(
        id UNINDEXED,
        title,
        description,
        content='commissions',
        content_rowid='id'
      )`,

      // Full-text search for artists
      `CREATE VIRTUAL TABLE IF NOT EXISTS artists_fts USING fts5(
        id UNINDEXED,
        name,
        description,
        content='artists',
        content_rowid='id'
      )`,

      // Full-text search for characters
      `CREATE VIRTUAL TABLE IF NOT EXISTS characters_fts USING fts5(
        id UNINDEXED,
        name,
        description,
        content='characters',
        content_rowid='id'
      )`,

      // Full-text search for tags
      `CREATE VIRTUAL TABLE IF NOT EXISTS tags_fts USING fts5(
        id UNINDEXED,
        name,
        description,
        content='tags',
        content_rowid='id'
      )`
    ];

    for (const table of ftsTables) {
      await this.run(table);
    }

    // Create triggers to keep FTS tables in sync
    await this.createFTSTriggers();
  }

  async createFTSTriggers() {
    const triggers = [
      // Commission FTS triggers
      `CREATE TRIGGER IF NOT EXISTS commissions_fts_insert AFTER INSERT ON commissions BEGIN
        INSERT INTO commissions_fts(id, title, description) 
        VALUES (new.id, new.title, new.description);
      END`,

      `CREATE TRIGGER IF NOT EXISTS commissions_fts_update AFTER UPDATE ON commissions BEGIN
        UPDATE commissions_fts SET title = new.title, description = new.description 
        WHERE id = new.id;
      END`,

      `CREATE TRIGGER IF NOT EXISTS commissions_fts_delete AFTER DELETE ON commissions BEGIN
        DELETE FROM commissions_fts WHERE id = old.id;
      END`,

      // Artist FTS triggers
      `CREATE TRIGGER IF NOT EXISTS artists_fts_insert AFTER INSERT ON artists BEGIN
        INSERT INTO artists_fts(id, name, description) 
        VALUES (new.id, new.name, new.description);
      END`,

      `CREATE TRIGGER IF NOT EXISTS artists_fts_update AFTER UPDATE ON artists BEGIN
        UPDATE artists_fts SET name = new.name, description = new.description 
        WHERE id = new.id;
      END`,

      `CREATE TRIGGER IF NOT EXISTS artists_fts_delete AFTER DELETE ON artists BEGIN
        DELETE FROM artists_fts WHERE id = old.id;
      END`,

      // Character FTS triggers
      `CREATE TRIGGER IF NOT EXISTS characters_fts_insert AFTER INSERT ON characters BEGIN
        INSERT INTO characters_fts(id, name, description) 
        VALUES (new.id, new.name, new.description);
      END`,

      `CREATE TRIGGER IF NOT EXISTS characters_fts_update AFTER UPDATE ON characters BEGIN
        UPDATE characters_fts SET name = new.name, description = new.description 
        WHERE id = new.id;
      END`,

      `CREATE TRIGGER IF NOT EXISTS characters_fts_delete AFTER DELETE ON characters BEGIN
        DELETE FROM characters_fts WHERE id = old.id;
      END`,

      // Tag FTS triggers
      `CREATE TRIGGER IF NOT EXISTS tags_fts_insert AFTER INSERT ON tags BEGIN
        INSERT INTO tags_fts(id, name, description) 
        VALUES (new.id, new.name, new.description);
      END`,

      `CREATE TRIGGER IF NOT EXISTS tags_fts_update AFTER UPDATE ON tags BEGIN
        UPDATE tags_fts SET name = new.name, description = new.description 
        WHERE id = new.id;
      END`,

      `CREATE TRIGGER IF NOT EXISTS tags_fts_delete AFTER DELETE ON tags BEGIN
        DELETE FROM tags_fts WHERE id = old.id;
      END`
    ];

    for (const trigger of triggers) {
      await this.run(trigger);
    }
  }

  async createEnhancedTables() {
    const enhancedTables = [
      // Image metadata table
      `CREATE TABLE IF NOT EXISTS image_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        filename TEXT NOT NULL,
        format TEXT,
        width INTEGER,
        height INTEGER,
        file_size INTEGER,
        perceptual_hash TEXT,
        dominant_colors TEXT, -- JSON array of colors
        has_exif BOOLEAN DEFAULT FALSE,
        exif_data TEXT, -- JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // User preferences table
      `CREATE TABLE IF NOT EXISTS user_preferences (
        user_id INTEGER PRIMARY KEY,
        theme TEXT DEFAULT 'light',
        items_per_page INTEGER DEFAULT 20,
        default_sort TEXT DEFAULT 'created_at',
        nsfw_filter BOOLEAN DEFAULT TRUE,
        preferences_json TEXT, -- JSON string for additional preferences
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      // Saved searches table
      `CREATE TABLE IF NOT EXISTS saved_searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        search_query TEXT,
        filters_json TEXT, -- JSON string for filter parameters
        is_public BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      // View history table
      `CREATE TABLE IF NOT EXISTS view_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        commission_id INTEGER,
        viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE
      )`,

      // Commission ratings/favorites
      `CREATE TABLE IF NOT EXISTS commission_ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        commission_id INTEGER,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        is_favorite BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, commission_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE
      )`,

      // System analytics table
      `CREATE TABLE IF NOT EXISTS system_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        metric_value REAL,
        metric_data TEXT, -- JSON string for complex data
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const table of enhancedTables) {
      await this.run(table);
    }
  }

  async createAdditionalIndexes() {
    const indexes = [
      // Performance indexes
      'CREATE INDEX IF NOT EXISTS idx_commissions_created_at ON commissions(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_commissions_updated_at ON commissions(updated_at)',
      'CREATE INDEX IF NOT EXISTS idx_commissions_score ON commissions(score)',
      'CREATE INDEX IF NOT EXISTS idx_commissions_nsfw ON commissions(nsfw)',
      
      // Image metadata indexes
      'CREATE INDEX IF NOT EXISTS idx_image_metadata_perceptual_hash ON image_metadata(perceptual_hash)',
      'CREATE INDEX IF NOT EXISTS idx_image_metadata_format ON image_metadata(format)',
      'CREATE INDEX IF NOT EXISTS idx_image_metadata_file_size ON image_metadata(file_size)',
      
      // User activity indexes
      'CREATE INDEX IF NOT EXISTS idx_view_history_user_id ON view_history(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_view_history_commission_id ON view_history(commission_id)',
      'CREATE INDEX IF NOT EXISTS idx_view_history_viewed_at ON view_history(viewed_at)',
      
      // Rating indexes
      'CREATE INDEX IF NOT EXISTS idx_commission_ratings_user_id ON commission_ratings(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_commission_ratings_commission_id ON commission_ratings(commission_id)',
      'CREATE INDEX IF NOT EXISTS idx_commission_ratings_rating ON commission_ratings(rating)',
      'CREATE INDEX IF NOT EXISTS idx_commission_ratings_is_favorite ON commission_ratings(is_favorite)',
      
      // Analytics indexes
      'CREATE INDEX IF NOT EXISTS idx_system_analytics_metric_name ON system_analytics(metric_name)',
      'CREATE INDEX IF NOT EXISTS idx_system_analytics_recorded_at ON system_analytics(recorded_at)'
    ];

    for (const index of indexes) {
      await this.run(index);
    }
  }

  // Full-text search methods
  async searchCommissions(query, options = {}) {
    const { limit = 20, offset = 0, sortBy = 'rank', includeSnippets = true } = options;
    
    let sql = `
      SELECT c.*, a.name as artist_name, a.slug as artist_slug,
             ${includeSnippets ? "snippet(commissions_fts, -1, '<mark>', '</mark>', '...', 30) as snippet," : ''}
             rank
      FROM commissions_fts 
      JOIN commissions c ON commissions_fts.id = c.id
      LEFT JOIN artists a ON c.artist_id = a.id
      WHERE commissions_fts MATCH ?
    `;

    if (sortBy === 'rank') {
      sql += ' ORDER BY rank';
    } else if (sortBy === 'date') {
      sql += ' ORDER BY c.created_at DESC';
    } else if (sortBy === 'score') {
      sql += ' ORDER BY c.score DESC';
    }

    sql += ' LIMIT ? OFFSET ?';

    const results = await this.all(sql, [query, limit, offset]);
    const total = await this.get('SELECT COUNT(*) as count FROM commissions_fts WHERE commissions_fts MATCH ?', [query]);

    return {
      results,
      total: total.count,
      hasMore: offset + limit < total.count
    };
  }

  async searchAll(query, options = {}) {
    const { limit = 10, includeSnippets = true } = options;
    const results = {};

    // Search commissions
    const commissions = await this.all(`
      SELECT 'commission' as type, c.id, c.title as name, c.slug,
             ${includeSnippets ? "snippet(commissions_fts, -1, '<mark>', '</mark>', '...', 30) as snippet," : ''}
             rank
      FROM commissions_fts 
      JOIN commissions c ON commissions_fts.id = c.id
      WHERE commissions_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `, [query, limit]);

    // Search artists
    const artists = await this.all(`
      SELECT 'artist' as type, a.id, a.name, a.slug,
             ${includeSnippets ? "snippet(artists_fts, -1, '<mark>', '</mark>', '...', 30) as snippet," : ''}
             rank
      FROM artists_fts 
      JOIN artists a ON artists_fts.id = a.id
      WHERE artists_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `, [query, limit]);

    // Search characters
    const characters = await this.all(`
      SELECT 'character' as type, ch.id, ch.name, ch.slug,
             ${includeSnippets ? "snippet(characters_fts, -1, '<mark>', '</mark>', '...', 30) as snippet," : ''}
             rank
      FROM characters_fts 
      JOIN characters ch ON characters_fts.id = ch.id
      WHERE characters_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `, [query, limit]);

    // Search tags
    const tags = await this.all(`
      SELECT 'tag' as type, t.id, t.name, t.slug,
             ${includeSnippets ? "snippet(tags_fts, -1, '<mark>', '</mark>', '...', 30) as snippet," : ''}
             rank
      FROM tags_fts 
      JOIN tags t ON tags_fts.id = t.id
      WHERE tags_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `, [query, limit]);

    return {
      commissions,
      artists,
      characters,
      tags,
      total: commissions.length + artists.length + characters.length + tags.length
    };
  }

  // Enhanced analytics methods
  async recordAnalytic(metricName, value, data = null) {
    return await this.run(
      'INSERT INTO system_analytics (metric_name, metric_value, metric_data) VALUES (?, ?, ?)',
      [metricName, value, data ? JSON.stringify(data) : null]
    );
  }

  async getAnalytics(metricName, timeRange = '30 days') {
    return await this.all(`
      SELECT * FROM system_analytics 
      WHERE metric_name = ? 
      AND recorded_at >= datetime('now', '-${timeRange}')
      ORDER BY recorded_at DESC
    `, [metricName]);
  }

  // User preference methods
  async getUserPreferences(userId) {
    return await this.get('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
  }

  async setUserPreferences(userId, preferences) {
    const existing = await this.getUserPreferences(userId);
    
    if (existing) {
      return await this.run(`
        UPDATE user_preferences 
        SET theme = ?, items_per_page = ?, default_sort = ?, nsfw_filter = ?, 
            preferences_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `, [
        preferences.theme, preferences.itemsPerPage, preferences.defaultSort,
        preferences.nsfwFilter, JSON.stringify(preferences.extra || {}), userId
      ]);
    } else {
      return await this.run(`
        INSERT INTO user_preferences 
        (user_id, theme, items_per_page, default_sort, nsfw_filter, preferences_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        userId, preferences.theme, preferences.itemsPerPage, preferences.defaultSort,
        preferences.nsfwFilter, JSON.stringify(preferences.extra || {})
      ]);
    }
  }

  // Rebuild FTS indexes (useful for maintenance)
  async rebuildFTSIndexes() {
    const tables = ['commissions_fts', 'artists_fts', 'characters_fts', 'tags_fts'];
    
    for (const table of tables) {
      await this.run(`INSERT INTO ${table}(${table}) VALUES('rebuild')`);
    }
    
    console.log('FTS indexes rebuilt successfully');
  }
}

module.exports = EnhancedDatabase;