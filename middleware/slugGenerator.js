const slugify = require('slugify');

class SlugGenerator {
  constructor(db) {
    this.db = db;
  }

  // Generate a base slug from text
  generateBaseSlug(text) {
    // Ensure text is a string before passing to slugify
    if (typeof text !== 'string') {
      text = text ? String(text) : '';
    }
    
    return slugify(text, {
      replacement: '-',
      remove: /[*+~.()'"!:@]/g,
      lower: true,
      strict: true
    });
  }

  // Generate unique slug for artists
  async generateArtistSlug(name) {
    const baseSlug = this.generateBaseSlug(name);
    return await this.ensureUniqueSlug(baseSlug, 'artists');
  }

  // Generate unique slug for tags
  async generateTagSlug(name) {
    const baseSlug = this.generateBaseSlug(name);
    return await this.ensureUniqueSlug(baseSlug, 'tags');
  }

  // Generate unique slug for characters
  async generateCharacterSlug(name) {
    const baseSlug = this.generateBaseSlug(name);
    return await this.ensureUniqueSlug(baseSlug, 'characters');
  }

  // Generate unique slug for commissions (includes title and date)
  async generateCommissionSlug(title, dateMonth) {
    const titleSlug = this.generateBaseSlug(title);
    // Use 'untitled' as fallback if title generates empty slug
    const safeTitleSlug = titleSlug || 'untitled';
    const dateSlug = dateMonth; // dateMonth is already in the correct format
    const baseSlug = `${safeTitleSlug}-${dateSlug}`;
    return await this.ensureUniqueSlug(baseSlug, 'commissions');
  }

  // Generate unique slug for drafts
  async generateDraftSlug(title) {
    const baseSlug = this.generateBaseSlug(title);
    return await this.ensureUniqueSlug(baseSlug, 'drafts');
  }

  // Generate unique slug for novels (includes title and date)
  async generateNovelSlug(title, dateMonth) {
    const titleSlug = this.generateBaseSlug(title);
    // Use 'untitled' as fallback if title generates empty slug
    const safeTitleSlug = titleSlug || 'untitled';
    const dateSlug = dateMonth; // dateMonth is already in the correct format
    const baseSlug = `${safeTitleSlug}-${dateSlug}`;
    return await this.ensureUniqueSlug(baseSlug, 'novels');
  }

  // Generate unique slug for collections
  async generateCollectionSlug(name) {
    const baseSlug = this.generateBaseSlug(name);
    return await this.ensureUniqueSlug(baseSlug, 'collections');
  }

  // Ensure slug is unique by adding numerical suffix if needed
  async ensureUniqueSlug(baseSlug, tableName, excludeId = null) {
    let slug = baseSlug;
    let counter = 1;

    while (await this.slugExists(slug, tableName, excludeId)) {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  // Check if slug exists in table
  async slugExists(slug, tableName, excludeId = null) {
    let sql = `SELECT id FROM ${tableName} WHERE slug = ?`;
    let params = [slug];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const result = await this.db.get(sql, params);
    return !!result;
  }

  // Normalize incoming slug for canonicalization
  normalizeSlug(slug) {
    return this.generateBaseSlug(slug);
  }

  // Check if a slug is numeric (for character canonicalization)
  isNumericSlug(slug) {
    return /^\d+$/.test(slug);
  }

  // Find canonical slug by ID (for redirects)
  async getCanonicalSlug(id, tableName) {
    const result = await this.db.get(
      `SELECT slug FROM ${tableName} WHERE id = ?`,
      [id]
    );
    return result ? result.slug : null;
  }

  // Find entity by approximate slug match
  async findByApproximateSlug(inputSlug, tableName) {
    const normalizedInput = this.normalizeSlug(inputSlug);
    
    // First try exact match
    let result = await this.db.get(
      `SELECT * FROM ${tableName} WHERE slug = ?`,
      [normalizedInput]
    );

    if (result) {
      return result;
    }

    // Then try finding by original input
    result = await this.db.get(
      `SELECT * FROM ${tableName} WHERE slug = ?`,
      [inputSlug]
    );

    if (result) {
      return result;
    }

    // Finally, try fuzzy matching (remove common variations)
    const fuzzySlug = normalizedInput
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const results = await this.db.all(
      `SELECT * FROM ${tableName} WHERE slug LIKE ?`,
      [`%${fuzzySlug}%`]
    );

    return results.length > 0 ? results[0] : null;
  }
}

module.exports = SlugGenerator;