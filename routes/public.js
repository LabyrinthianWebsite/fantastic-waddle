const express = require('express');
const path = require('path');
const archiver = require('archiver');
const fs = require('fs-extra');
const SlugGenerator = require('../middleware/slugGenerator');

const router = express.Router();

// Demo page for autocomplete functionality
router.get('/autocomplete-demo.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../autocomplete-demo.html'));
});

// Utility function to format month-year for display
function formatMonthYear(dateMonth) {
  if (!dateMonth) return '';
  const [year, month] = dateMonth.split('-');
  const date = new Date(year, month - 1);
  return date.toLocaleDateString('en-AU', { year: 'numeric', month: 'long' });
}

// Home/Browse page
router.get('/', async (req, res) => {
  try {
    // Check if setup is needed
    const userCount = await req.db.get('SELECT COUNT(*) as count FROM users');
    if (userCount.count === 0) {
      return res.redirect('/setup');
    }

    const {
      q = '',
      artist_id = '',
      tags = [],
      character_ids = [],
      min_score = '',
      max_score = '',
      rating = '',
      sort = 'date_desc',
      page = 1,
      per_page = 24
    } = req.query;

    // Build the query
    let sql = `
      SELECT c.*, a.name as artist_name, a.slug as artist_slug
      FROM commissions c
      LEFT JOIN artists a ON c.artist_id = a.id
    `;

    let conditions = [];
    let params = [];

    // Text search in title and description
    if (q.trim()) {
      conditions.push('(c.title LIKE ? OR c.description LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    // Artist filter
    if (artist_id) {
      conditions.push('c.artist_id = ?');
      params.push(artist_id);
    }

    // Tags filter (ANY match)
    if (Array.isArray(tags) && tags.length > 0) {
      const tagPlaceholders = tags.map(() => '?').join(',');
      conditions.push(`c.id IN (
        SELECT ct.commission_id FROM commission_tags ct
        JOIN tags t ON ct.tag_id = t.id
        WHERE t.id IN (${tagPlaceholders})
      )`);
      params.push(...tags);
    }

    // Characters filter (ANY match)
    if (Array.isArray(character_ids) && character_ids.length > 0) {
      const charPlaceholders = character_ids.map(() => '?').join(',');
      conditions.push(`c.id IN (
        SELECT cc.commission_id FROM commission_characters cc
        WHERE cc.character_id IN (${charPlaceholders})
      )`);
      params.push(...character_ids);
    }

    // Score filters
    if (min_score) {
      conditions.push('c.score >= ?');
      params.push(parseInt(min_score));
    }
    if (max_score) {
      conditions.push('c.score <= ?');
      params.push(parseInt(max_score));
    }

    // Rating filter
    if (rating === 'sfw') {
      conditions.push('c.nsfw = 0');
    } else if (rating === 'nsfw') {
      conditions.push('c.nsfw = 1');
    }

    // Add conditions to query
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Add sorting
    switch (sort) {
      case 'date_asc':
        sql += ' ORDER BY c.date_month ASC, c.created_at ASC';
        break;
      case 'score_desc':
        sql += ' ORDER BY c.score DESC NULLS LAST, c.created_at DESC';
        break;
      case 'score_asc':
        sql += ' ORDER BY c.score ASC NULLS LAST, c.created_at DESC';
        break;
      case 'random':
        sql += ' ORDER BY RANDOM()';
        break;
      default: // date_desc
        sql += ' ORDER BY c.date_month DESC, c.created_at DESC';
    }

    // Get total count for pagination
    const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
    const countResult = await req.db.get(countSql, params);
    const total = countResult.total;

    // Add pagination
    const limit = parseInt(per_page);
    const offset = (parseInt(page) - 1) * limit;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const commissions = await req.db.all(sql, params);

    // Get filter options
    const [artists, allTags, characters] = await Promise.all([
      req.db.all('SELECT id, name, slug FROM artists ORDER BY name'),
      req.db.all('SELECT id, name, slug FROM tags ORDER BY name'),
      req.db.all('SELECT id, name, slug, portrait_thumb_path FROM characters ORDER BY name')
    ]);

    // Get statistics for home page
    const stats = await getHomeStats(req.db);

    // Format commissions for display
    const formattedCommissions = commissions.map(commission => ({
      ...commission,
      formatted_date: formatMonthYear(commission.date_month),
      thumb_url: commission.main_image_thumb ? `/uploads/${commission.main_image_thumb}` : '/public/images/placeholder.jpg'
    }));

    const totalPages = Math.ceil(total / limit);

    res.render('home', {
      commissions: formattedCommissions,
      artists,
      tags: allTags,
      characters,
      stats,
      filters: {
        q, artist_id, tags, character_ids, min_score, max_score, rating, sort
      },
      pagination: {
        current: parseInt(page),
        total: totalPages,
        per_page: limit,
        count: total
      },
      formatMonthYear
    });

  } catch (error) {
    console.error('Error loading home page:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Commission detail page
router.get('/c/:slug', async (req, res) => {
  try {
    const slugGenerator = new SlugGenerator(req.db);
    
    // Get commission
    const commission = await req.db.get(`
      SELECT c.*, a.name as artist_name, a.slug as artist_slug
      FROM commissions c
      LEFT JOIN artists a ON c.artist_id = a.id
      WHERE c.slug = ?
    `, [req.params.slug]);

    if (!commission) {
      return res.status(404).render('404', { url: req.url });
    }

    // Get tags for this commission
    const tags = await req.db.all(`
      SELECT t.* FROM tags t
      JOIN commission_tags ct ON t.id = ct.tag_id
      WHERE ct.commission_id = ?
      ORDER BY t.name
    `, [commission.id]);

    // Get characters for this commission
    const characters = await req.db.all(`
      SELECT ch.* FROM characters ch
      JOIN commission_characters cc ON ch.id = cc.character_id
      WHERE cc.commission_id = ?
      ORDER BY ch.name
    `, [commission.id]);

    // Format characters with dormitory info
    const formattedCharacters = characters.map(character => ({
      ...character,
      dormitory_color: getDormitoryColor(character.dormitory),
      dormitory_animal: getDormitoryAnimal(character.dormitory),
      is_upper_campus: isUpperCampus(character.dormitory),
      portrait_url: character.portrait_thumb_path ? `/uploads/${character.portrait_thumb_path}` : '/public/images/character-placeholder.jpg'
    }));

    // Get gallery images
    const galleryImages = await req.db.all(`
      SELECT * FROM commission_images
      WHERE commission_id = ?
      ORDER BY created_at
    `, [commission.id]);

    // Get draft images
    const draftImages = await req.db.all(`
      SELECT * FROM commission_draft_images
      WHERE commission_id = ?
      ORDER BY created_at
    `, [commission.id]);

    // Get files
    const files = await req.db.all(`
      SELECT * FROM commission_files
      WHERE commission_id = ?
      ORDER BY filename
    `, [commission.id]);

    // Format files with human-readable sizes
    const formattedFiles = files.map(file => ({
      ...file,
      formatted_size: formatFileSize(file.filesize)
    }));

    res.render('commission-detail', {
      commission: {
        ...commission,
        formatted_date: formatMonthYear(commission.date_month),
        main_image_url: commission.main_image_display ? `/uploads/${commission.main_image_display}` : null,
        color_palette: commission.color_palette ? JSON.parse(commission.color_palette) : [],
        key_colors: [commission.key_color_1, commission.key_color_2, commission.key_color_3].filter(Boolean)
      },
      tags,
      characters: formattedCharacters,
      galleryImages,
      draftImages,
      files: formattedFiles
    });

  } catch (error) {
    console.error('Error loading commission:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Character detail page with canonicalization
router.get('/char/:slug', async (req, res) => {
  try {
    const slugGenerator = new SlugGenerator(req.db);
    const inputSlug = req.params.slug;

    let character;

    // Check if slug is numeric (ID lookup)
    if (slugGenerator.isNumericSlug(inputSlug)) {
      character = await req.db.get('SELECT * FROM characters WHERE id = ?', [parseInt(inputSlug)]);
      if (character) {
        return res.redirect(301, `/char/${character.slug}`);
      }
    } else {
      // Try to find by approximate slug match
      character = await slugGenerator.findByApproximateSlug(inputSlug, 'characters');
      
      if (character && character.slug !== inputSlug) {
        return res.redirect(301, `/char/${character.slug}`);
      }
    }

    if (!character) {
      return res.status(404).render('404', { url: req.url });
    }

    // Get commissions featuring this character
    const commissions = await req.db.all(`
      SELECT c.*, a.name as artist_name
      FROM commissions c
      LEFT JOIN artists a ON c.artist_id = a.id
      JOIN commission_characters cc ON c.id = cc.commission_id
      WHERE cc.character_id = ?
      ORDER BY c.date_month DESC, c.created_at DESC
    `, [character.id]);

    // Get character relationships
    const relationships = await req.db.all(`
      SELECT cr.*, ch.name as related_character_name, ch.slug as related_character_slug
      FROM character_relationships cr
      JOIN characters ch ON cr.to_character_id = ch.id
      WHERE cr.from_character_id = ?
      ORDER BY cr.relationship_type, ch.name
    `, [character.id]);

    // Get character versions for timeline
    const versions = await req.db.all(`
      SELECT * FROM character_versions
      WHERE character_id = ?
      ORDER BY sort_order, created_at
    `, [character.id]);

    // Get co-appearance data for relationships graph
    const coAppearances = await req.db.all(`
      SELECT ch.id, ch.name, ch.slug, COUNT(*) as count
      FROM characters ch
      JOIN commission_characters cc1 ON ch.id = cc1.character_id
      JOIN commission_characters cc2 ON cc1.commission_id = cc2.commission_id
      WHERE cc2.character_id = ? AND ch.id != ?
      GROUP BY ch.id, ch.name, ch.slug
      ORDER BY count DESC, ch.name
      LIMIT 20
    `, [character.id, character.id]);

    // Group commissions by month for timeline
    const timeline = groupCommissionsByMonth(commissions);

    res.render('character-detail', {
      character: {
        ...character,
        portrait_url: character.portrait_thumb_path ? `/uploads/${character.portrait_thumb_path}` : '/public/images/character-placeholder.jpg',
        dormitory_color: getDormitoryColor(character.dormitory),
        dormitory_animal: getDormitoryAnimal(character.dormitory)
      },
      commissions: commissions.map(c => ({
        ...c,
        formatted_date: formatMonthYear(c.date_month),
        thumb_url: c.main_image_thumb ? `/uploads/${c.main_image_thumb}` : '/public/images/placeholder.jpg'
      })),
      relationships,
      versions,
      coAppearances,
      timeline
    });

  } catch (error) {
    console.error('Error loading character:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Artists page
router.get('/artists', async (req, res) => {
  try {
    const artists = await req.db.all(`
      SELECT a.*, COUNT(c.id) as commission_count
      FROM artists a
      LEFT JOIN commissions c ON a.id = c.artist_id
      GROUP BY a.id, a.name, a.slug
      ORDER BY a.name
    `);

    res.render('artists', { artists });
  } catch (error) {
    console.error('Error loading artists:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Individual artist page
router.get('/artists/:slug', async (req, res) => {
  try {
    // Get artist details
    const artist = await req.db.get(`
      SELECT a.*, COUNT(c.id) as commission_count
      FROM artists a
      LEFT JOIN commissions c ON a.id = c.artist_id
      WHERE a.slug = ?
      GROUP BY a.id, a.name, a.slug
    `, [req.params.slug]);

    if (!artist) {
      return res.status(404).render('404', { url: req.originalUrl });
    }

    // Get paginated commissions by this artist
    const page = parseInt(req.query.page) || 1;
    const perPage = 24;
    const offset = (page - 1) * perPage;

    const commissions = await req.db.all(`
      SELECT c.*, a.name as artist_name, a.slug as artist_slug
      FROM commissions c
      LEFT JOIN artists a ON c.artist_id = a.id
      WHERE c.artist_id = ?
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `, [artist.id, perPage, offset]);

    // Format commissions for display
    const formattedCommissions = commissions.map(commission => ({
      ...commission,
      thumb_url: commission.main_image_thumb ? `/uploads/${commission.main_image_thumb}` : '/public/images/placeholder.jpg',
      formatted_date: formatMonthYear(commission.date_month)
    }));

    // Get total count for pagination
    const totalCount = await req.db.get(`
      SELECT COUNT(*) as count FROM commissions WHERE artist_id = ?
    `, [artist.id]);

    const pagination = {
      currentPage: page,
      totalPages: Math.ceil(totalCount.count / perPage),
      hasNext: page < Math.ceil(totalCount.count / perPage),
      hasPrev: page > 1,
      count: totalCount.count
    };

    // Get recent activity/stats
    const recentCommissions = await req.db.all(`
      SELECT c.title, c.slug, c.date_month, c.score
      FROM commissions c
      WHERE c.artist_id = ?
      ORDER BY c.created_at DESC
      LIMIT 5
    `, [artist.id]);

    const stats = {
      totalCommissions: totalCount.count,
      avgScore: 0,
      recentCommissions
    };

    // Calculate average score if there are commissions
    if (totalCount.count > 0) {
      const avgResult = await req.db.get(`
        SELECT AVG(score) as avg_score
        FROM commissions 
        WHERE artist_id = ? AND score IS NOT NULL
      `, [artist.id]);
      stats.avgScore = avgResult.avg_score ? Math.round(avgResult.avg_score * 10) / 10 : 0;
    }

    res.render('artist-detail', {
      artist,
      commissions: formattedCommissions,
      pagination,
      stats
    });

  } catch (error) {
    console.error('Error loading artist:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Tags page
router.get('/tags', async (req, res) => {
  try {
    const tags = await req.db.all(`
      SELECT t.*, COUNT(ct.commission_id) as commission_count
      FROM tags t
      LEFT JOIN commission_tags ct ON t.id = ct.tag_id
      GROUP BY t.id, t.name, t.slug
      ORDER BY t.name
    `);

    res.render('tags', { tags });
  } catch (error) {
    console.error('Error loading tags:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Characters page with search and filtering
router.get('/characters', async (req, res) => {
  try {
    const { q = '', dormitory = '', age_category = '', hair_color = '', eye_color = '' } = req.query;

    let sql = 'SELECT * FROM characters';
    let conditions = [];
    let params = [];

    // Search filter
    if (q.trim()) {
      conditions.push('name LIKE ?');
      params.push(`%${q}%`);
    }

    // Dormitory filter
    if (dormitory) {
      conditions.push('dormitory = ?');
      params.push(dormitory);
    }

    // Age category filter
    if (age_category) {
      conditions.push('age_category = ?');
      params.push(age_category);
    }

    // Hair color filter
    if (hair_color) {
      conditions.push('hair_color LIKE ?');
      params.push(`%${hair_color}%`);
    }

    // Eye color filter
    if (eye_color) {
      conditions.push('eye_color LIKE ?');
      params.push(`%${eye_color}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY name';

    const characters = await req.db.all(sql, params);

    // Get filter options
    const [dormitories, ageCategories, hairColors, eyeColors] = await Promise.all([
      req.db.all('SELECT DISTINCT dormitory FROM characters WHERE dormitory IS NOT NULL ORDER BY dormitory'),
      req.db.all('SELECT DISTINCT age_category FROM characters WHERE age_category IS NOT NULL ORDER BY age_category'),
      req.db.all('SELECT DISTINCT hair_color FROM characters WHERE hair_color IS NOT NULL ORDER BY hair_color'),
      req.db.all('SELECT DISTINCT eye_color FROM characters WHERE eye_color IS NOT NULL ORDER BY eye_color')
    ]);

    const formattedCharacters = characters.map(character => ({
      ...character,
      portrait_url: character.portrait_thumb_path ? `/uploads/${character.portrait_thumb_path}` : '/public/images/character-placeholder.jpg',
      dormitory_color: getDormitoryColor(character.dormitory),
      dormitory_animal: getDormitoryAnimal(character.dormitory)
    }));

    res.render('characters', {
      characters: formattedCharacters,
      filters: { q, dormitory, age_category, hair_color, eye_color },
      filterOptions: {
        dormitories: dormitories.map(d => d.dormitory),
        ageCategories: ageCategories.map(a => a.age_category),
        hairColors: hairColors.map(h => h.hair_color),
        eyeColors: eyeColors.map(e => e.eye_color)
      }
    });

  } catch (error) {
    console.error('Error loading characters:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Upper Campus characters page
router.get('/upper-campus', async (req, res) => {
  try {
    const { q = '', dormitory = '', age_category = '', hair_color = '', eye_color = '', grade = '' } = req.query;

    let sql = 'SELECT * FROM upper_campus_characters';
    let conditions = [];
    let params = [];

    // Search filter
    if (q.trim()) {
      conditions.push('name LIKE ?');
      params.push(`%${q}%`);
    }

    // Dormitory filter
    if (dormitory) {
      conditions.push('dormitory = ?');
      params.push(dormitory);
    }

    // Age category filter
    if (age_category) {
      conditions.push('age_category = ?');
      params.push(age_category);
    }

    // Hair color filter
    if (hair_color) {
      conditions.push('hair_color LIKE ?');
      params.push(`%${hair_color}%`);
    }

    // Eye color filter
    if (eye_color) {
      conditions.push('eye_color LIKE ?');
      params.push(`%${eye_color}%`);
    }

    // Grade filter (specific to Upper Campus)
    if (grade) {
      conditions.push('grade LIKE ?');
      params.push(`%${grade}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY name';

    const characters = await req.db.all(sql, params);

    // Get filter options (only Upper Campus dormitories)
    const [dormitories, ageCategories, hairColors, eyeColors, grades] = await Promise.all([
      req.db.all('SELECT DISTINCT dormitory FROM upper_campus_characters WHERE dormitory IS NOT NULL ORDER BY dormitory'),
      req.db.all('SELECT DISTINCT age_category FROM upper_campus_characters WHERE age_category IS NOT NULL ORDER BY age_category'),
      req.db.all('SELECT DISTINCT hair_color FROM upper_campus_characters WHERE hair_color IS NOT NULL ORDER BY hair_color'),
      req.db.all('SELECT DISTINCT eye_color FROM upper_campus_characters WHERE eye_color IS NOT NULL ORDER BY eye_color'),
      req.db.all('SELECT DISTINCT grade FROM upper_campus_characters WHERE grade IS NOT NULL ORDER BY grade')
    ]);

    const formattedCharacters = characters.map(character => ({
      ...character,
      portrait_url: character.portrait_thumb_path ? `/uploads/${character.portrait_thumb_path}` : '/public/images/character-placeholder.jpg',
      dormitory_color: getDormitoryColor(character.dormitory),
      dormitory_animal: getDormitoryAnimal(character.dormitory)
    }));

    res.render('upper-campus', {
      characters: formattedCharacters,
      filters: { q, dormitory, age_category, hair_color, eye_color, grade },
      filterOptions: {
        dormitories: dormitories.map(d => d.dormitory),
        ageCategories: ageCategories.map(a => a.age_category),
        hairColors: hairColors.map(h => h.hair_color),
        eyeColors: eyeColors.map(e => e.eye_color),
        grades: grades.map(g => g.grade)
      }
    });

  } catch (error) {
    console.error('Error loading Upper Campus characters:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Collections page
router.get('/collections', async (req, res) => {
  try {
    const collections = await req.db.all(`
      SELECT c.*, COUNT(co.id) as commission_count
      FROM collections c
      LEFT JOIN commissions co ON c.id = co.collection_id
      GROUP BY c.id, c.name, c.slug, c.description, c.cover_image_path, c.created_at
      ORDER BY c.name
    `);

    const formattedCollections = collections.map(collection => ({
      ...collection,
      cover_url: collection.cover_image_path ? `/uploads/${collection.cover_image_path}` : '/public/images/collection-placeholder.jpg'
    }));

    res.render('collections', { collections: formattedCollections });
  } catch (error) {
    console.error('Error loading collections:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Collection detail page
router.get('/collections/:slug', async (req, res) => {
  try {
    const collection = await req.db.get('SELECT * FROM collections WHERE slug = ?', [req.params.slug]);
    
    if (!collection) {
      return res.status(404).render('404', { url: req.url });
    }

    // Get commissions in this collection
    const commissions = await req.db.all(`
      SELECT c.*, a.name as artist_name
      FROM commissions c
      LEFT JOIN artists a ON c.artist_id = a.id
      WHERE c.collection_id = ?
      ORDER BY c.date_month DESC, c.created_at DESC
    `, [collection.id]);

    res.render('collection-detail', {
      collection: {
        ...collection,
        cover_url: collection.cover_image_path ? `/uploads/${collection.cover_image_path}` : '/public/images/collection-placeholder.jpg'
      },
      commissions: commissions.map(c => ({
        ...c,
        formatted_date: formatMonthYear(c.date_month),
        thumb_url: c.main_image_thumb ? `/uploads/${c.main_image_thumb}` : '/public/images/placeholder.jpg'
      }))
    });

  } catch (error) {
    console.error('Error loading collection:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Stats page
router.get('/stats', async (req, res) => {
  try {
    const stats = await getDetailedStats(req.db);
    res.render('stats', { stats });
  } catch (error) {
    console.error('Error loading stats:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Download all files for a commission
router.get('/c/:slug/files.zip', async (req, res) => {
  try {
    const commission = await req.db.get('SELECT * FROM commissions WHERE slug = ?', [req.params.slug]);
    if (!commission) {
      return res.status(404).send('Commission not found');
    }

    const files = await req.db.all('SELECT * FROM commission_files WHERE commission_id = ?', [commission.id]);
    
    if (files.length === 0) {
      return res.status(404).send('No files found for this commission');
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${commission.slug}-files.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const file of files) {
      const filePath = path.join(__dirname, '..', file.file_path);
      if (await fs.pathExists(filePath)) {
        archive.file(filePath, { name: `files/${file.original_filename}` });
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error creating zip:', error);
    res.status(500).send('Error creating zip file');
  }
});

// Utility functions
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDormitoryColor(dormitory) {
  const colors = {
    // Thornfield Academy dormitories
    'Wren House': '#1E88E5',        // Blue
    'Thorne House': '#FBC02D',      // Yellow
    'Clover Hall': '#43A047',       // Green
    'Marlowe Wing': '#EC407A',      // Pink
    'Briar House': '#E53935',       // Red
    'Slate Row': '#FB8C00',         // Orange
    'Ashgate Hall': '#8E24AA',      // Purple
    'Rowan Hearth': '#00897B',      // Teal
    'Obscurité House': '#666666',   // Iridescent Black (readability)
    'Burrow Lodge': '#B87333',      // Copper
    
    // Upper Campus dormitories
    'Chastelle Hall': '#F5F5DC',      // Ivory White (darkened for readability)
    'Ophion Tower': '#2C2C2C',        // Midnight Black (lightened for readability)
    'Pandora\'s Landing': '#FFD700',  // Gold
    'Valence Court': '#0F52BA',       // Sapphire Blue
    'Lux Remorae': '#00FFFF',         // Neon Aqua
    'Briarspire House': '#DC143C',    // Crimson
    'Lacuna Gate': '#8A2BE2',         // Violet
    'Fetterleigh Sanctum': '#00A86B', // Jade Green
    'Verity\'s Pinnacle': '#C0C0C0',  // Steel Silver
    'Tessellate Keep': '#708090'      // Cloud Grey
  };
  return colors[dormitory] || '#666666';
}

function getDormitoryAnimal(dormitory) {
  const animals = {
    // Thornfield Academy dormitories
    'Wren House': '🐦',              // Wren (Whisper)
    'Thorne House': '🐱',            // Golden Cat (Inkwell)
    'Clover Hall': '🐿️',             // Clover Spirit/Squirrel (Sprig/Thistle)
    'Marlowe Wing': '🦢',            // Swan (Veloria)
    'Briar House': '🦁',             // Lion (Ember)
    'Slate Row': '🦊',               // Mechanical Fox (Tinker)
    'Ashgate Hall': '🦉',            // Owl (Nova)
    'Rowan Hearth': '🐕',            // Dog (Kindle)
    'Obscurité House': '🐺',         // Shadow-Wolf (Mire)
    'Burrow Lodge': '🐰',            // Rabbit (Pip)
    
    // Upper Campus dormitories
    'Chastelle Hall': '🐆',          // Leopard
    'Ophion Tower': '🐍',            // Python
    'Pandora\'s Landing': '🦌',       // Gazelle
    'Valence Court': '🐼',           // Panda
    'Lux Remorae': '🐟',             // Lanternfish
    'Briarspire House': '🦔',        // Porcupine
    'Lacuna Gate': '🐷',             // Pig
    'Fetterleigh Sanctum': '🦎',     // Axolotl (using lizard as closest)
    'Verity\'s Pinnacle': '🦅',       // Falcon
    'Tessellate Keep': '🦎'          // Salamander
  };
  return animals[dormitory] || '';
}

function isUpperCampus(dormitory) {
  const upperCampusDorms = [
    'Chastelle Hall', 'Ophion Tower', 'Pandora\'s Landing', 'Valence Court',
    'Lux Remorae', 'Briarspire House', 'Lacuna Gate', 'Fetterleigh Sanctum',
    'Verity\'s Pinnacle', 'Tessellate Keep'
  ];
  return upperCampusDorms.includes(dormitory);
}

function groupCommissionsByMonth(commissions) {
  const grouped = {};
  commissions.forEach(commission => {
    const month = commission.date_month;
    if (!grouped[month]) {
      grouped[month] = [];
    }
    grouped[month].push(commission);
  });

  return Object.keys(grouped)
    .sort()
    .reverse()
    .map(month => ({
      month,
      formatted_month: formatMonthYear(month),
      commissions: grouped[month],
      count: grouped[month].length
    }));
}

async function getHomeStats(db) {
  const [totalCommissions, totalPrice, mostCommonMonth, topCharacters, topTags, topArtists] = await Promise.all([
    db.get('SELECT COUNT(*) as total FROM commissions'),
    db.get('SELECT SUM(price) as total FROM commissions WHERE price IS NOT NULL'),
    db.get(`
      SELECT date_month, COUNT(*) as count 
      FROM commissions 
      GROUP BY date_month 
      ORDER BY count DESC, date_month DESC 
      LIMIT 1
    `),
    db.all(`
      SELECT ch.name, ch.slug, COUNT(cc.commission_id) as count
      FROM characters ch
      JOIN commission_characters cc ON ch.id = cc.character_id
      GROUP BY ch.id, ch.name, ch.slug
      ORDER BY count DESC, ch.name
      LIMIT 10
    `),
    db.all(`
      SELECT t.name, t.slug, COUNT(ct.commission_id) as count
      FROM tags t
      JOIN commission_tags ct ON t.id = ct.tag_id
      GROUP BY t.id, t.name, t.slug
      ORDER BY count DESC, t.name
      LIMIT 10
    `),
    db.all(`
      SELECT a.name, a.slug, COUNT(c.id) as count
      FROM artists a
      JOIN commissions c ON a.id = c.artist_id
      GROUP BY a.id, a.name, a.slug
      ORDER BY count DESC, a.name
      LIMIT 10
    `)
  ]);

  return {
    totalCommissions: totalCommissions.total,
    totalPrice: totalPrice.total || 0,
    mostCommonMonth: mostCommonMonth ? {
      month: mostCommonMonth.date_month,
      formatted: formatMonthYear(mostCommonMonth.date_month),
      count: mostCommonMonth.count
    } : null,
    topCharacters,
    topTags,
    topArtists
  };
}

async function getDetailedStats(db) {
  const baseStats = await getHomeStats(db);

  const [topCharacters, topTags, topArtists] = await Promise.all([
    db.all(`
      SELECT ch.name, ch.slug, COUNT(cc.commission_id) as count
      FROM characters ch
      JOIN commission_characters cc ON ch.id = cc.character_id
      GROUP BY ch.id, ch.name, ch.slug
      ORDER BY count DESC, ch.name
      LIMIT 20
    `),
    db.all(`
      SELECT t.name, t.slug, COUNT(ct.commission_id) as count
      FROM tags t
      JOIN commission_tags ct ON t.id = ct.tag_id
      GROUP BY t.id, t.name, t.slug
      ORDER BY count DESC, t.name
      LIMIT 20
    `),
    db.all(`
      SELECT a.name, a.slug, COUNT(c.id) as count
      FROM artists a
      JOIN commissions c ON a.id = c.artist_id
      GROUP BY a.id, a.name, a.slug
      ORDER BY count DESC, a.name
      LIMIT 20
    `)
  ]);

  return {
    ...baseStats,
    topCharacters,
    topTags,
    topArtists
  };
}

// =============================================
// DRAFTS (PUBLIC VIEW)
// =============================================

// Drafts list page (public view of active drafts)
router.get('/drafts', async (req, res) => {
  try {
    // Only show non-canceled drafts for public view
    const drafts = await req.db.all(`
      SELECT d.*, a.name as artist_name, a.slug as artist_slug
      FROM drafts d
      LEFT JOIN artists a ON d.artist_id = a.id
      WHERE d.status != 'canceled'
      ORDER BY d.updated_at DESC
    `);

    res.render('drafts', { 
      drafts: drafts.map(draft => ({
        ...draft,
        formatted_date: formatMonthYear(draft.date_month)
      }))
    });
  } catch (error) {
    console.error('Error loading drafts:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// Draft detail page
router.get('/d/:slug', async (req, res) => {
  try {
    // Get draft with artist info
    const draft = await req.db.get(`
      SELECT d.*, a.name as artist_name, a.slug as artist_slug, a.website_url as artist_website
      FROM drafts d
      LEFT JOIN artists a ON d.artist_id = a.id
      WHERE d.slug = ?
    `, [req.params.slug]);

    if (!draft) {
      return res.status(404).render('404', { url: req.originalUrl });
    }

    // Don't show canceled drafts in public view
    if (draft.status === 'canceled') {
      return res.status(404).render('404', { url: req.originalUrl });
    }

    // Get draft images
    const draftImages = await req.db.all(`
      SELECT * FROM draft_images 
      WHERE draft_id = ? 
      ORDER BY sort_order
    `, [draft.id]);

    // Get associated tags
    const tags = await req.db.all(`
      SELECT t.name, t.slug 
      FROM tags t 
      JOIN draft_tags dt ON t.id = dt.tag_id 
      WHERE dt.draft_id = ?
      ORDER BY t.name
    `, [draft.id]);

    // Get associated characters
    const characters = await req.db.all(`
      SELECT c.name, c.slug, c.portrait_thumb_path 
      FROM characters c 
      JOIN draft_characters dc ON c.id = dc.character_id 
      WHERE dc.draft_id = ?
      ORDER BY c.name
    `, [draft.id]);

    // Get collection info if applicable
    let collection = null;
    if (draft.collection_id) {
      collection = await req.db.get('SELECT * FROM collections WHERE id = ?', [draft.collection_id]);
    }

    res.render('draft-detail', {
      draft: {
        ...draft,
        formatted_date: formatMonthYear(draft.date_month)
      },
      draftImages,
      tags,
      characters,
      collection
    });

  } catch (error) {
    console.error('Error loading draft:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// ============================
// NOVEL ROUTES
// ============================

// Browse novels
router.get('/novels', async (req, res) => {
  try {
    const {
      q = '',
      artist_id = '',
      tags = [],
      character_ids = [],
      language = '',
      min_score = '',
      max_score = '',
      rating = '',
      sort = 'date_desc',
      page = 1,
      per_page = 24
    } = req.query;

    // Build the query
    let sql = `
      SELECT n.*, a.name as artist_name, a.slug as artist_slug
      FROM novels n
      LEFT JOIN artists a ON n.artist_id = a.id
    `;

    let conditions = [];
    let params = [];

    // Only show published novels to public
    conditions.push('n.status = ?');
    params.push('published');

    // Text search in title and description
    if (q.trim()) {
      conditions.push('(n.title LIKE ? OR n.description LIKE ? OR n.original_content LIKE ? OR n.translated_content LIKE ?)');
      const searchTerm = `%${q.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Filter by artist
    if (artist_id) {
      conditions.push('n.artist_id = ?');
      params.push(artist_id);
    }

    // Filter by language
    if (language) {
      conditions.push('(n.original_language = ? OR n.translated_language = ?)');
      params.push(language, language);
    }

    // Filter by score range
    if (min_score) {
      conditions.push('n.score >= ?');
      params.push(parseInt(min_score));
    }
    if (max_score) {
      conditions.push('n.score <= ?');
      params.push(parseInt(max_score));
    }

    // Filter by NSFW rating
    if (rating === 'sfw') {
      conditions.push('n.nsfw = 0');
    } else if (rating === 'nsfw') {
      conditions.push('n.nsfw = 1');
    }

    // Add WHERE clause if conditions exist
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Handle tag filtering with subquery
    if (tags.length > 0) {
      const tagConditions = tags.map(() => '?').join(',');
      sql += ` AND n.id IN (
        SELECT DISTINCT nt.novel_id 
        FROM novel_tags nt 
        JOIN tags t ON nt.tag_id = t.id 
        WHERE t.name IN (${tagConditions})
        GROUP BY nt.novel_id 
        HAVING COUNT(DISTINCT t.id) = ?
      )`;
      params.push(...tags, tags.length);
    }

    // Handle character filtering with subquery
    if (character_ids.length > 0) {
      const characterConditions = character_ids.map(() => '?').join(',');
      sql += ` AND n.id IN (
        SELECT DISTINCT nc.novel_id 
        FROM novel_characters nc 
        WHERE nc.character_id IN (${characterConditions})
      )`;
      params.push(...character_ids);
    }

    // Add sorting
    switch (sort) {
      case 'date_asc':
        sql += ' ORDER BY n.date_month ASC, n.created_at ASC';
        break;
      case 'date_desc':
        sql += ' ORDER BY n.date_month DESC, n.created_at DESC';
        break;
      case 'title_asc':
        sql += ' ORDER BY n.title ASC';
        break;
      case 'title_desc':
        sql += ' ORDER BY n.title DESC';
        break;
      case 'score_asc':
        sql += ' ORDER BY n.score ASC, n.created_at DESC';
        break;
      case 'score_desc':
        sql += ' ORDER BY n.score DESC, n.created_at DESC';
        break;
      case 'words_asc':
        sql += ' ORDER BY n.word_count ASC, n.created_at DESC';
        break;
      case 'words_desc':
        sql += ' ORDER BY n.word_count DESC, n.created_at DESC';
        break;
      default:
        sql += ' ORDER BY n.date_month DESC, n.created_at DESC';
    }

    // Add pagination
    const offset = (page - 1) * per_page;
    sql += ' LIMIT ? OFFSET ?';
    params.push(per_page, offset);

    const novels = await req.db.all(sql, params);

    // Get total count for pagination
    let countSql = `
      SELECT COUNT(*) as total
      FROM novels n
      LEFT JOIN artists a ON n.artist_id = a.id
    `;
    let countParams = [];
    
    // Apply same filters for count
    let countConditions = ['n.status = ?'];
    countParams.push('published');

    if (q.trim()) {
      countConditions.push('(n.title LIKE ? OR n.description LIKE ? OR n.original_content LIKE ? OR n.translated_content LIKE ?)');
      const searchTerm = `%${q.trim()}%`;
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (artist_id) {
      countConditions.push('n.artist_id = ?');
      countParams.push(artist_id);
    }

    if (language) {
      countConditions.push('(n.original_language = ? OR n.translated_language = ?)');
      countParams.push(language, language);
    }

    if (min_score) {
      countConditions.push('n.score >= ?');
      countParams.push(parseInt(min_score));
    }
    if (max_score) {
      countConditions.push('n.score <= ?');
      countParams.push(parseInt(max_score));
    }

    if (rating === 'sfw') {
      countConditions.push('n.nsfw = 0');
    } else if (rating === 'nsfw') {
      countConditions.push('n.nsfw = 1');
    }

    if (countConditions.length > 0) {
      countSql += ' WHERE ' + countConditions.join(' AND ');
    }

    if (tags.length > 0) {
      const tagConditions = tags.map(() => '?').join(',');
      countSql += ` AND n.id IN (
        SELECT DISTINCT nt.novel_id 
        FROM novel_tags nt 
        JOIN tags t ON nt.tag_id = t.id 
        WHERE t.name IN (${tagConditions})
        GROUP BY nt.novel_id 
        HAVING COUNT(DISTINCT t.id) = ?
      )`;
      countParams.push(...tags, tags.length);
    }

    if (character_ids.length > 0) {
      const characterConditions = character_ids.map(() => '?').join(',');
      countSql += ` AND n.id IN (
        SELECT DISTINCT nc.novel_id 
        FROM novel_characters nc 
        WHERE nc.character_id IN (${characterConditions})
      )`;
      countParams.push(...character_ids);
    }

    const { total } = await req.db.get(countSql, countParams);

    // Get filter options
    const [artists, allTags, allCharacters] = await Promise.all([
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name')
    ]);

    // Calculate pagination
    const totalPages = Math.ceil(total / per_page);

    res.render('novels', {
      novels: novels.map(novel => ({
        ...novel,
        formatted_date: formatMonthYear(novel.date_month)
      })),
      filters: {
        q,
        artist_id,
        tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
        character_ids: Array.isArray(character_ids) ? character_ids : (character_ids ? [character_ids] : []),
        language,
        min_score,
        max_score,
        rating,
        sort
      },
      artists,
      allTags,
      allCharacters,
      pagination: {
        current: parseInt(page),
        total: totalPages,
        per_page: parseInt(per_page),
        total_items: total
      }
    });
  } catch (error) {
    console.error('Error loading novels:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

// View specific novel
router.get('/novels/:slug', async (req, res) => {
  try {
    // Get novel by slug
    const novel = await req.db.get(`
      SELECT n.*, a.name as artist_name, a.slug as artist_slug,
             col.name as collection_name, col.slug as collection_slug
      FROM novels n
      LEFT JOIN artists a ON n.artist_id = a.id
      LEFT JOIN collections col ON n.collection_id = col.id
      WHERE n.slug = ? AND n.status = 'published'
    `, [req.params.slug]);

    if (!novel) {
      return res.status(404).render('404', { url: req.url });
    }

    // Get associated tags
    const tags = await req.db.all(`
      SELECT t.name, t.slug 
      FROM tags t 
      JOIN novel_tags nt ON t.id = nt.tag_id 
      WHERE nt.novel_id = ?
      ORDER BY t.name
    `, [novel.id]);

    // Get associated characters
    const characters = await req.db.all(`
      SELECT c.name, c.slug, c.portrait_thumb_path 
      FROM characters c 
      JOIN novel_characters nc ON c.id = nc.character_id 
      WHERE nc.novel_id = ?
      ORDER BY c.name
    `, [novel.id]);

    // Get collection info if applicable
    let collection = null;
    if (novel.collection_id) {
      collection = await req.db.get('SELECT * FROM collections WHERE id = ?', [novel.collection_id]);
    }

    // Get other novels in the same collection
    let relatedNovels = [];
    if (novel.collection_id) {
      relatedNovels = await req.db.all(`
        SELECT n.*, a.name as artist_name, a.slug as artist_slug
        FROM novels n
        LEFT JOIN artists a ON n.artist_id = a.id
        WHERE n.collection_id = ? AND n.id != ? AND n.status = 'published'
        ORDER BY n.date_month ASC
        LIMIT 5
      `, [novel.collection_id, novel.id]);
    }

    res.render('novel-detail', {
      novel: {
        ...novel,
        formatted_date: formatMonthYear(novel.date_month)
      },
      tags,
      characters,
      collection,
      relatedNovels: relatedNovels.map(n => ({
        ...n,
        formatted_date: formatMonthYear(n.date_month)
      }))
    });

  } catch (error) {
    console.error('Error loading novel:', error);
    res.status(500).render('error', { error: error.message, status: 500 });
  }
});

module.exports = router;