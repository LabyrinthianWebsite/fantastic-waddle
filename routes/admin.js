const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const ImageProcessor = require('../middleware/imageProcessor');
const SlugGenerator = require('../middleware/slugGenerator');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB
    files: 60 // Sufficient to accommodate all file types: 1 + 20 + 20 + 10 = 51 files max
  }
});

// Utility functions for dormitory colors and animals
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

// Utility function to extract relative path from uploads directory
// This handles cross-platform path issues (Windows vs Unix)
function extractRelativePathFromUploads(fullPath) {
  // First replace all backslashes with forward slashes to normalize
  const normalizedPath = fullPath.replace(/\\/g, '/');
  
  // Split by forward slash to get consistent parts
  const parts = normalizedPath.split('/');
  
  // Find the 'uploads' directory in the path
  const uploadsIndex = parts.findIndex(part => part === 'uploads');
  
  if (uploadsIndex !== -1 && uploadsIndex < parts.length - 1) {
    // Return everything after 'uploads' using forward slashes for web URLs
    return parts.slice(uploadsIndex + 1).join('/');
  }
  
  // Fallback: if no uploads directory found, return the original path
  console.warn('Could not find uploads directory in path:', fullPath);
  return fullPath;
}

// Helper function to handle artist ID (create new if needed)
async function handleArtistId(db, artistId) {
  if (!artistId) return null;
  
  // Check if this is a "create new" request
  if (typeof artistId === 'string' && artistId.startsWith('new:')) {
    const artistName = artistId.substring(4); // Remove 'new:' prefix
    const slugGenerator = new SlugGenerator(db);
    const slug = await slugGenerator.generateArtistSlug(artistName);
    
    // Create new artist with minimal information
    const result = await db.run(
      'INSERT INTO artists (name, slug, description) VALUES (?, ?, ?)',
      [artistName, slug, `Artist created automatically when adding commission.`]
    );
    
    return result.id;
  }
  
  // Return existing artist ID
  return parseInt(artistId);
}

// Helper function to handle character IDs (create new if needed)
async function handleCharacterIds(db, characterIds) {
  if (!characterIds) return [];
  
  // Ensure characterIds is always an array
  const characterIdsArray = Array.isArray(characterIds) ? characterIds : [characterIds];
  
  const processedIds = [];
  
  for (const characterId of characterIdsArray) {
    if (typeof characterId === 'string' && characterId.startsWith('new:')) {
      const characterName = characterId.substring(4); // Remove 'new:' prefix
      const slugGenerator = new SlugGenerator(db);
      const slug = await slugGenerator.generateCharacterSlug(characterName);
      
      // Create new character with minimal information
      const result = await db.run(
        'INSERT INTO characters (name, slug, description) VALUES (?, ?, ?)',
        [characterName, slug, `Character created automatically when adding commission.`]
      );
      
      processedIds.push(result.id);
    } else {
      processedIds.push(parseInt(characterId));
    }
  }
  
  return processedIds;
}

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

// Login page
router.get('/login', async (req, res) => {
  try {
    // Check if any users exist
    const userCount = await req.db.get('SELECT COUNT(*) as count FROM users');
    
    if (userCount.count === 0) {
      return res.redirect('/setup');
    }

    res.render('admin/login', { error: null });
  } catch (error) {
    console.error('Error checking users:', error);
    res.render('admin/login', { error: 'Database error' });
  }
});

// Login handler
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await req.db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.render('admin/login', { error: 'Invalid username or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.render('admin/login', { error: 'Invalid username or password' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    res.redirect('/admin');
  } catch (error) {
    console.error('Login error:', error);
    res.render('admin/login', { error: 'An error occurred during login' });
  }
});

// Logout handler
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Admin dashboard
router.get('/', requireAuth, async (req, res) => {
  try {
    const [commissionCount, draftCount, novelCount, artistCount, tagCount, characterCount, collectionCount, upperCampusCount] = await Promise.all([
      req.db.get('SELECT COUNT(*) as count FROM commissions'),
      req.db.get('SELECT COUNT(*) as count FROM drafts'),
      req.db.get('SELECT COUNT(*) as count FROM novels'),
      req.db.get('SELECT COUNT(*) as count FROM artists'),
      req.db.get('SELECT COUNT(*) as count FROM tags'),
      req.db.get('SELECT COUNT(*) as count FROM characters'),
      req.db.get('SELECT COUNT(*) as count FROM collections'),
      req.db.get('SELECT COUNT(*) as count FROM upper_campus_characters')
    ]);

    const recentCommissions = await req.db.all(`
      SELECT c.*, a.name as artist_name
      FROM commissions c
      LEFT JOIN artists a ON c.artist_id = a.id
      ORDER BY c.created_at DESC
      LIMIT 10
    `);

    res.render('admin/dashboard', {
      user: req.session.user,
      stats: {
        commissions: commissionCount.count,
        drafts: draftCount.count,
        novels: novelCount.count,
        artists: artistCount.count,
        tags: tagCount.count,
        characters: characterCount.count,
        collections: collectionCount.count,
        upperCampusCharacters: upperCampusCount.count
      },
      recentCommissions
    });
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
    res.render('admin/error', { error: error.message });
  }
});

// Artists management
router.get('/artists', requireAuth, async (req, res) => {
  try {
    const artists = await req.db.all('SELECT * FROM artists ORDER BY name');
    res.render('admin/artists', { user: req.session.user, artists });
  } catch (error) {
    console.error('Error loading artists:', error);
    res.render('admin/error', { error: error.message });
  }
});

router.get('/artists/new', requireAuth, (req, res) => {
  res.render('admin/artist-form', { user: req.session.user, artist: null, error: null });
});

router.get('/artists/:id/edit', requireAuth, async (req, res) => {
  try {
    const artist = await req.db.get('SELECT * FROM artists WHERE id = ?', [req.params.id]);
    if (!artist) {
      return res.status(404).render('admin/error', { error: 'Artist not found' });
    }
    res.render('admin/artist-form', { user: req.session.user, artist, error: null });
  } catch (error) {
    console.error('Error loading artist:', error);
    res.render('admin/error', { error: error.message });
  }
});

router.post('/artists', requireAuth, async (req, res) => {
  try {
    const { name, description, website_url } = req.body;
    
    if (!name || !name.trim()) {
      throw new Error('Artist name is required');
    }
    
    const slugGenerator = new SlugGenerator(req.db);
    const slug = await slugGenerator.generateArtistSlug(name);

    const result = await req.db.run(
      'INSERT INTO artists (name, slug, description, website_url) VALUES (?, ?, ?, ?)',
      [name, slug, description, website_url]
    );

    res.redirect('/admin/artists');
  } catch (error) {
    console.error('Error creating artist:', error);
    res.render('admin/artist-form', { 
      user: req.session.user, 
      artist: req.body, 
      error: error.message 
    });
  }
});

router.post('/artists/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, website_url } = req.body;
    
    if (!name || !name.trim()) {
      throw new Error('Artist name is required');
    }
    
    const slugGenerator = new SlugGenerator(req.db);
    const slug = await slugGenerator.ensureUniqueSlug(
      slugGenerator.generateBaseSlug(name), 
      'artists', 
      req.params.id
    );

    await req.db.run(
      'UPDATE artists SET name = ?, slug = ?, description = ?, website_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, slug, description, website_url, req.params.id]
    );

    res.redirect('/admin/artists');
  } catch (error) {
    console.error('Error updating artist:', error);
    const artist = await req.db.get('SELECT * FROM artists WHERE id = ?', [req.params.id]);
    res.render('admin/artist-form', { 
      user: req.session.user, 
      artist: { ...artist, ...req.body }, 
      error: error.message 
    });
  }
});

// Delete artist
router.post('/artists/:id/delete', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM artists WHERE id = ?', [req.params.id]);
    res.redirect('/admin/artists');
  } catch (error) {
    console.error('Error deleting artist:', error);
    res.redirect('/admin/artists?error=' + encodeURIComponent(error.message));
  }
});

// Tags management
router.get('/tags', requireAuth, async (req, res) => {
  try {
    const tags = await req.db.all('SELECT * FROM tags ORDER BY name');
    res.render('admin/tags', { user: req.session.user, tags });
  } catch (error) {
    console.error('Error loading tags:', error);
    res.render('admin/error', { error: error.message });
  }
});

router.get('/tags/new', requireAuth, (req, res) => {
  res.render('admin/tag-form', { user: req.session.user, tag: null, error: null });
});

router.post('/tags', requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const slugGenerator = new SlugGenerator(req.db);
    const slug = await slugGenerator.generateTagSlug(name);

    await req.db.run(
      'INSERT INTO tags (name, slug, description) VALUES (?, ?, ?)',
      [name, slug, description]
    );

    res.redirect('/admin/tags');
  } catch (error) {
    console.error('Error creating tag:', error);
    res.render('admin/tag-form', { 
      user: req.session.user, 
      tag: req.body, 
      error: error.message 
    });
  }
});

// Delete tag
router.post('/tags/:id/delete', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM tags WHERE id = ?', [req.params.id]);
    res.redirect('/admin/tags');
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.redirect('/admin/tags?error=' + encodeURIComponent(error.message));
  }
});

// Characters management
router.get('/characters', requireAuth, async (req, res) => {
  try {
    const characters = await req.db.all('SELECT * FROM characters ORDER BY name');
    res.render('admin/characters', { user: req.session.user, characters });
  } catch (error) {
    console.error('Error loading characters:', error);
    res.render('admin/error', { error: error.message });
  }
});

router.get('/characters/new', requireAuth, (req, res) => {
  res.render('admin/character-form', { user: req.session.user, character: null, error: null });
});

router.get('/characters/:id/edit', requireAuth, async (req, res) => {
  try {
    const character = await req.db.get('SELECT * FROM characters WHERE id = ?', [req.params.id]);
    if (!character) {
      return res.status(404).render('admin/error', { error: 'Character not found' });
    }
    res.render('admin/character-form', { user: req.session.user, character, error: null });
  } catch (error) {
    console.error('Error loading character:', error);
    res.render('admin/error', { error: error.message });
  }
});

router.post('/characters', requireAuth, upload.single('portrait'), async (req, res) => {
  try {
    const { 
      name, universe, role, year_level, dormitory, age_category, age,
      hair_color, eye_color, description, wiki_page, external_profile_url 
    } = req.body;

    // Validate business rules
    if (universe === 'Wonderland' && !['Pet', 'Master'].includes(role)) {
      throw new Error('Wonderland characters must be Pet or Master');
    }
    if (universe === 'Thornfield' && !['Teacher', 'Student'].includes(role)) {
      throw new Error('Thornfield characters must be Teacher or Student');
    }
    if (universe === 'Thornfield' && role === 'Student' && !year_level) {
      throw new Error('Thornfield students must have a year level');
    }

    const slugGenerator = new SlugGenerator(req.db);
    const slug = await slugGenerator.generateCharacterSlug(name);

    let portraitPath = null;
    let portraitThumbPath = null;

    // Process portrait if uploaded
    if (req.file) {
      const imageProcessor = new ImageProcessor();
      await imageProcessor.validateImage(req.file);

      const characterDir = path.join(__dirname, '../uploads/images/characters');
      const processed = await imageProcessor.processImageSet(req.file, characterDir, 'character');
      
      portraitPath = extractRelativePathFromUploads(processed.original);
      portraitThumbPath = await imageProcessor.createCharacterPortrait(
        processed.original,
        path.join(characterDir, 'portraits', `${processed.filename}`)
      );
      portraitThumbPath = extractRelativePathFromUploads(portraitThumbPath);
    }

    const result = await req.db.run(`
      INSERT INTO characters (
        name, slug, universe, role, year_level, dormitory, age_category, age,
        hair_color, eye_color, portrait_path, portrait_thumb_path,
        description, wiki_page, external_profile_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, slug, universe, role, year_level, dormitory, age_category, age || null,
      hair_color, eye_color, portraitPath, portraitThumbPath,
      description, wiki_page, external_profile_url
    ]);

    res.redirect('/admin/characters');
  } catch (error) {
    console.error('Error creating character:', error);
    res.render('admin/character-form', { 
      user: req.session.user, 
      character: req.body, 
      error: error.message 
    });
  }
});

// Update character
router.post('/characters/:id', requireAuth, upload.single('portrait'), async (req, res) => {
  try {
    const { 
      name, universe, role, year_level, dormitory, age_category, age,
      hair_color, eye_color, description, wiki_page, external_profile_url 
    } = req.body;

    // Validate business rules
    if (universe === 'Wonderland' && !['Pet', 'Master'].includes(role)) {
      throw new Error('Wonderland characters must be Pet or Master');
    }
    if (universe === 'Thornfield' && !['Teacher', 'Student'].includes(role)) {
      throw new Error('Thornfield characters must be Teacher or Student');
    }
    if (universe === 'Thornfield' && role === 'Student' && !year_level) {
      throw new Error('Thornfield students must have a year level');
    }

    const existingCharacter = await req.db.get('SELECT * FROM characters WHERE id = ?', [req.params.id]);
    if (!existingCharacter) {
      throw new Error('Character not found');
    }

    let portraitPath = existingCharacter.portrait_path;
    let portraitThumbPath = existingCharacter.portrait_thumb_path;

    // Process new portrait if uploaded
    if (req.file) {
      const imageProcessor = new ImageProcessor();
      await imageProcessor.validateImage(req.file);

      const characterDir = path.join(__dirname, '../uploads/images/characters');
      const processed = await imageProcessor.processImageSet(req.file, characterDir, 'character');
      
      portraitPath = extractRelativePathFromUploads(processed.original);
      portraitThumbPath = await imageProcessor.createCharacterPortrait(
        processed.original,
        path.join(characterDir, 'portraits', `${processed.filename}`)
      );
      portraitThumbPath = extractRelativePathFromUploads(portraitThumbPath);
    }

    await req.db.run(`
      UPDATE characters SET
        name = ?, universe = ?, role = ?, year_level = ?, dormitory = ?, age_category = ?, age = ?,
        hair_color = ?, eye_color = ?, portrait_path = ?, portrait_thumb_path = ?,
        description = ?, wiki_page = ?, external_profile_url = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name, universe, role, year_level, dormitory, age_category, age || null,
      hair_color, eye_color, portraitPath, portraitThumbPath,
      description, wiki_page, external_profile_url,
      req.params.id
    ]);

    res.redirect('/admin/characters');
  } catch (error) {
    console.error('Error updating character:', error);
    const character = await req.db.get('SELECT * FROM characters WHERE id = ?', [req.params.id]);
    res.render('admin/character-form', { 
      user: req.session.user, 
      character: { ...character, ...req.body }, 
      error: error.message 
    });
  }
});

// Delete character
router.post('/characters/:id/delete', requireAuth, async (req, res) => {
  try {
    // Get character details to clean up files
    const character = await req.db.get('SELECT * FROM characters WHERE id = ?', [req.params.id]);
    
    if (character) {
      // Delete portrait files if they exist
      if (character.portrait_path) {
        const fullPath = path.join(__dirname, '../uploads', character.portrait_path);
        try {
          await fs.remove(fullPath);
        } catch (err) {
          console.warn('Could not delete character portrait file:', err.message);
        }
      }
      
      if (character.portrait_thumb_path) {
        const fullThumbPath = path.join(__dirname, '../uploads', character.portrait_thumb_path);
        try {
          await fs.remove(fullThumbPath);
        } catch (err) {
          console.warn('Could not delete character portrait thumbnail file:', err.message);
        }
      }
    }

    await req.db.run('DELETE FROM characters WHERE id = ?', [req.params.id]);
    res.redirect('/admin/characters');
  } catch (error) {
    console.error('Error deleting character:', error);
    res.redirect('/admin/characters?error=' + encodeURIComponent(error.message));
  }
});

// Collections management
router.get('/collections', requireAuth, async (req, res) => {
  try {
    const collections = await req.db.all('SELECT * FROM collections ORDER BY name');
    res.render('admin/collections', { user: req.session.user, collections });
  } catch (error) {
    console.error('Error loading collections:', error);
    res.render('admin/error', { error: error.message });
  }
});

router.get('/collections/new', requireAuth, (req, res) => {
  res.render('admin/collection-form', { user: req.session.user, collection: null, error: null });
});

router.post('/collections', requireAuth, upload.single('cover_image'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const slugGenerator = new SlugGenerator(req.db);
    const slug = await slugGenerator.generateCollectionSlug(name);

    let coverImagePath = null;

    // Process cover image if uploaded
    if (req.file) {
      const imageProcessor = new ImageProcessor();
      await imageProcessor.validateImage(req.file);

      const collectionsDir = path.join(__dirname, '../uploads/images/collections');
      const processed = await imageProcessor.processImageSet(req.file, collectionsDir, 'collection');
      coverImagePath = extractRelativePathFromUploads(processed.display);
    }

    await req.db.run(
      'INSERT INTO collections (name, slug, description, cover_image_path) VALUES (?, ?, ?, ?)',
      [name, slug, description, coverImagePath]
    );

    res.redirect('/admin/collections');
  } catch (error) {
    console.error('Error creating collection:', error);
    res.render('admin/collection-form', { 
      user: req.session.user, 
      collection: req.body, 
      error: error.message 
    });
  }
});

// Delete collection
router.post('/collections/:id/delete', requireAuth, async (req, res) => {
  try {
    // Get collection details to clean up files
    const collection = await req.db.get('SELECT * FROM collections WHERE id = ?', [req.params.id]);
    
    if (collection && collection.cover_image_path) {
      // Delete cover image file if it exists
      const fullPath = path.join(__dirname, '../uploads', collection.cover_image_path);
      try {
        await fs.remove(fullPath);
      } catch (err) {
        console.warn('Could not delete collection cover image file:', err.message);
      }
    }

    await req.db.run('DELETE FROM collections WHERE id = ?', [req.params.id]);
    res.redirect('/admin/collections');
  } catch (error) {
    console.error('Error deleting collection:', error);
    res.redirect('/admin/collections?error=' + encodeURIComponent(error.message));
  }
});

// Commissions management
router.get('/commissions', requireAuth, async (req, res) => {
  try {
    const commissions = await req.db.all(`
      SELECT c.*, a.name as artist_name
      FROM commissions c
      LEFT JOIN artists a ON c.artist_id = a.id
      ORDER BY c.created_at DESC
    `);
    res.render('admin/commissions', { user: req.session.user, commissions });
  } catch (error) {
    console.error('Error loading commissions:', error);
    res.render('admin/error', { error: error.message });
  }
});

router.get('/commissions/new', requireAuth, async (req, res) => {
  try {
    const [artists, tags, characters, collections] = await Promise.all([
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    res.render('admin/commission-form', { 
      user: req.session.user, 
      commission: null, 
      artists, 
      tags, 
      characters, 
      collections,
      error: null 
    });
  } catch (error) {
    console.error('Error loading commission form:', error);
    res.render('admin/error', { error: error.message });
  }
});

router.get('/commissions/:id/edit', requireAuth, async (req, res) => {
  try {
    const [commission, artists, tags, characters, collections] = await Promise.all([
      req.db.get('SELECT * FROM commissions WHERE id = ?', [req.params.id]),
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    if (!commission) {
      return res.status(404).render('admin/error', { error: 'Commission not found' });
    }

    // Get existing tags, characters, and images for this commission
    const [existingTags, existingCharacters, galleryImages, draftImages, commissionFiles] = await Promise.all([
      req.db.all(`
        SELECT t.name 
        FROM tags t 
        JOIN commission_tags ct ON t.id = ct.tag_id 
        WHERE ct.commission_id = ?
      `, [req.params.id]),
      req.db.all(`
        SELECT c.id 
        FROM characters c 
        JOIN commission_characters cc ON c.id = cc.character_id 
        WHERE cc.commission_id = ?
      `, [req.params.id]),
      req.db.all(`
        SELECT * FROM commission_images 
        WHERE commission_id = ? 
        ORDER BY sort_order, created_at
      `, [req.params.id]),
      req.db.all(`
        SELECT * FROM commission_draft_images 
        WHERE commission_id = ? 
        ORDER BY sort_order, created_at
      `, [req.params.id]),
      req.db.all(`
        SELECT * FROM commission_files 
        WHERE commission_id = ? 
        ORDER BY created_at
      `, [req.params.id])
    ]);

    // Add existing relationships to commission object
    commission.tag_names = existingTags.map(t => t.name).join(', ');
    commission.character_ids = existingCharacters.map(c => c.id);
    commission.existing_gallery_images = galleryImages;
    commission.existing_draft_images = draftImages;
    commission.existing_files = commissionFiles;

    res.render('admin/commission-form', { 
      user: req.session.user, 
      commission, 
      artists, 
      tags, 
      characters, 
      collections,
      error: null 
    });
  } catch (error) {
    console.error('Error loading commission for edit:', error);
    res.render('admin/error', { error: error.message });
  }
});

router.post('/commissions', requireAuth, upload.fields([
  { name: 'main_image', maxCount: 1 },
  { name: 'gallery_images', maxCount: 20 },
  { name: 'draft_images', maxCount: 20 },
  { name: 'files', maxCount: 10 }
]), async (req, res) => {
  try {
    const { 
      title, description, date_month, price, score, nsfw, 
      artist_id, collection_id, tag_names, character_ids 
    } = req.body;

    const slugGenerator = new SlugGenerator(req.db);
    const imageProcessor = new ImageProcessor();

    // Validate date format
    if (!/^\d{4}-\d{2}$/.test(date_month)) {
      throw new Error('Invalid date format. Use YYYY-MM.');
    }

    const slug = await slugGenerator.generateCommissionSlug(title, date_month);

    // Handle artist ID (create new if needed)
    const processedArtistId = await handleArtistId(req.db, artist_id);

    // Handle character IDs (create new if needed)
    const processedCharacterIds = await handleCharacterIds(req.db, character_ids);

    let mainImageOriginal = null;
    let mainImageDisplay = null;
    let mainImageThumb = null;
    let colorPalette = null;
    let keyColor1 = null;
    let keyColor2 = null;
    let keyColor3 = null;

    // Process main image
    if (req.files && req.files.main_image && req.files.main_image[0]) {
      const mainImage = req.files.main_image[0];
      await imageProcessor.validateImage(mainImage);

      const mainDir = path.join(__dirname, '../uploads/images/main');
      const processed = await imageProcessor.processImageSet(mainImage, mainDir, 'main');
      
      mainImageOriginal = extractRelativePathFromUploads(processed.original);
      mainImageDisplay = extractRelativePathFromUploads(processed.display);
      mainImageThumb = extractRelativePathFromUploads(processed.thumb);
      colorPalette = JSON.stringify(processed.colorPalette || []);
      
      // Store key colors
      if (processed.keyColors && processed.keyColors.length > 0) {
        keyColor1 = processed.keyColors[0]?.name || null;
        keyColor2 = processed.keyColors[1]?.name || null;
        keyColor3 = processed.keyColors[2]?.name || null;
      }
    }

    // Create commission
    const result = await req.db.run(`
      INSERT INTO commissions (
        title, slug, description, date_month, price, score, nsfw,
        artist_id, collection_id, main_image_original, main_image_display, 
        main_image_thumb, color_palette, key_color_1, key_color_2, key_color_3
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      title, slug, description, date_month, 
      price ? parseFloat(price) : null,
      score ? parseInt(score) : null,
      nsfw === 'on' ? 1 : 0,
      processedArtistId,
      collection_id || null,
      mainImageOriginal, mainImageDisplay, mainImageThumb, colorPalette,
      keyColor1, keyColor2, keyColor3
    ]);

    const commissionId = result.id;

    // Process tags (auto-create if needed)
    if (tag_names) {
      const tagNamesList = tag_names.split(',').map(name => name.trim()).filter(name => name);
      for (const tagName of tagNamesList) {
        let tag = await req.db.get('SELECT * FROM tags WHERE name = ?', [tagName]);
        if (!tag) {
          const tagSlug = await slugGenerator.generateTagSlug(tagName);
          const tagResult = await req.db.run(
            'INSERT INTO tags (name, slug) VALUES (?, ?)',
            [tagName, tagSlug]
          );
          tag = { id: tagResult.id };
        }
        
        await req.db.run(
          'INSERT OR IGNORE INTO commission_tags (commission_id, tag_id) VALUES (?, ?)',
          [commissionId, tag.id]
        );
      }
    }

    // Process character associations
    if (processedCharacterIds && processedCharacterIds.length > 0) {
      for (const characterId of processedCharacterIds) {
        await req.db.run(
          'INSERT OR IGNORE INTO commission_characters (commission_id, character_id) VALUES (?, ?)',
          [commissionId, characterId]
        );
      }
    }

    // Process gallery images
    if (req.files && req.files.gallery_images) {
      const galleryDir = path.join(__dirname, '../uploads/images/gallery');
      for (let i = 0; i < req.files.gallery_images.length; i++) {
        const file = req.files.gallery_images[i];
        await imageProcessor.validateImage(file);
        
        const processed = await imageProcessor.processImageSet(file, galleryDir, 'gallery');
        
        await req.db.run(`
          INSERT INTO commission_images (
            commission_id, original_path, display_path, thumb_path, 
            filename, filesize, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          commissionId,
          extractRelativePathFromUploads(processed.original),
          extractRelativePathFromUploads(processed.display),
          extractRelativePathFromUploads(processed.thumb),
          processed.filename,
          processed.filesize,
          i
        ]);
      }
    }

    // Process draft images
    if (req.files && req.files.draft_images) {
      const draftsDir = path.join(__dirname, '../uploads/images/drafts');
      for (let i = 0; i < req.files.draft_images.length; i++) {
        const file = req.files.draft_images[i];
        await imageProcessor.validateImage(file);
        
        const processed = await imageProcessor.processImageSet(file, draftsDir, 'draft');
        
        await req.db.run(`
          INSERT INTO commission_draft_images (
            commission_id, original_path, display_path, thumb_path, 
            filename, filesize, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          commissionId,
          extractRelativePathFromUploads(processed.original),
          extractRelativePathFromUploads(processed.display),
          extractRelativePathFromUploads(processed.thumb),
          processed.filename,
          processed.filesize,
          i
        ]);
      }
    }

    // Process files
    if (req.files && req.files.files) {
      const filesDir = path.join(__dirname, '../uploads/files');
      await fs.ensureDir(filesDir);
      
      for (const file of req.files.files) {
        const safeFilename = imageProcessor.generateSafeFilename(file.originalname);
        const filePath = path.join(filesDir, safeFilename);
        
        await fs.writeFile(filePath, file.buffer);
        
        await req.db.run(`
          INSERT INTO commission_files (
            commission_id, filename, original_filename, file_path, 
            filesize, mime_type
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          commissionId,
          safeFilename,
          file.originalname,
          `uploads/files/${safeFilename}`,
          file.size,
          file.mimetype
        ]);
      }
    }

    res.redirect('/admin/commissions');
  } catch (error) {
    console.error('Error creating commission:', error);
    
    // Reload form data
    const [artists, tags, characters, collections] = await Promise.all([
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    res.render('admin/commission-form', { 
      user: req.session.user, 
      commission: null, // Don't pass form data as commission object to avoid edit mode
      formData: req.body, // Pass form data separately for field population
      artists, 
      tags, 
      characters, 
      collections,
      error: error.message 
    });
  }
});

router.post('/commissions/:id/edit', requireAuth, upload.fields([
  { name: 'main_image', maxCount: 1 },
  { name: 'gallery_images', maxCount: 20 },
  { name: 'draft_images', maxCount: 20 },
  { name: 'files', maxCount: 10 }
]), async (req, res) => {
  try {
    const commissionId = req.params.id;
    const { 
      title, description, date_month, price, score, nsfw, 
      artist_id, collection_id, tag_names, character_ids 
    } = req.body;

    // Get existing commission
    const existingCommission = await req.db.get('SELECT * FROM commissions WHERE id = ?', [commissionId]);
    if (!existingCommission) {
      return res.status(404).render('admin/error', { error: 'Commission not found' });
    }

    const slugGenerator = new SlugGenerator(req.db);
    const imageProcessor = new ImageProcessor();

    // Validate date format
    if (!/^\d{4}-\d{2}$/.test(date_month)) {
      throw new Error('Invalid date format. Use YYYY-MM.');
    }

    // Handle artist ID (create new if needed)
    const processedArtistId = await handleArtistId(req.db, artist_id);

    // Handle character IDs (create new if needed)
    const processedCharacterIds = await handleCharacterIds(req.db, character_ids);

    // Regenerate slug if title changed
    let slug = existingCommission.slug;
    if (title !== existingCommission.title) {
      slug = await slugGenerator.generateCommissionSlug(title, date_month);
    }

    let mainImageOriginal = existingCommission.main_image_original;
    let mainImageDisplay = existingCommission.main_image_display;
    let mainImageThumb = existingCommission.main_image_thumb;
    let colorPalette = existingCommission.color_palette;
    let keyColor1 = existingCommission.key_color_1;
    let keyColor2 = existingCommission.key_color_2;
    let keyColor3 = existingCommission.key_color_3;

    // Process main image if uploaded
    if (req.files && req.files.main_image && req.files.main_image[0]) {
      const mainImage = req.files.main_image[0];
      await imageProcessor.validateImage(mainImage);

      const mainDir = path.join(__dirname, '../uploads/images/main');
      const processed = await imageProcessor.processImageSet(mainImage, mainDir, 'main');
      
      // Clean up old main image files
      if (existingCommission.main_image_original) {
        try {
          await fs.remove(path.join(__dirname, '../uploads', existingCommission.main_image_original));
          await fs.remove(path.join(__dirname, '../uploads', existingCommission.main_image_display));
          await fs.remove(path.join(__dirname, '../uploads', existingCommission.main_image_thumb));
        } catch (err) {
          console.warn('Could not delete old main image files:', err.message);
        }
      }
      
      mainImageOriginal = extractRelativePathFromUploads(processed.original);
      mainImageDisplay = extractRelativePathFromUploads(processed.display);
      mainImageThumb = extractRelativePathFromUploads(processed.thumb);
      colorPalette = JSON.stringify(processed.colorPalette || []);
      
      // Update key colors
      if (processed.keyColors && processed.keyColors.length > 0) {
        keyColor1 = processed.keyColors[0]?.name || null;
        keyColor2 = processed.keyColors[1]?.name || null;
        keyColor3 = processed.keyColors[2]?.name || null;
      }
    }

    // Update commission
    await req.db.run(`
      UPDATE commissions SET
        title = ?, slug = ?, description = ?, date_month = ?, price = ?, score = ?, nsfw = ?,
        artist_id = ?, collection_id = ?, main_image_original = ?, main_image_display = ?, 
        main_image_thumb = ?, color_palette = ?, key_color_1 = ?, key_color_2 = ?, key_color_3 = ?, 
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title, slug, description, date_month, 
      price ? parseFloat(price) : null,
      score ? parseInt(score) : null,
      nsfw === 'on' ? 1 : 0,
      processedArtistId,
      collection_id || null,
      mainImageOriginal, mainImageDisplay, mainImageThumb, colorPalette,
      keyColor1, keyColor2, keyColor3,
      commissionId
    ]);

    // Update tags - remove existing and add new ones
    await req.db.run('DELETE FROM commission_tags WHERE commission_id = ?', [commissionId]);
    if (tag_names) {
      const tagNamesList = tag_names.split(',').map(name => name.trim()).filter(name => name);
      for (const tagName of tagNamesList) {
        let tag = await req.db.get('SELECT * FROM tags WHERE name = ?', [tagName]);
        if (!tag) {
          const tagSlug = await slugGenerator.generateTagSlug(tagName);
          const tagResult = await req.db.run(
            'INSERT INTO tags (name, slug) VALUES (?, ?)',
            [tagName, tagSlug]
          );
          tag = { id: tagResult.id };
        }
        
        await req.db.run(
          'INSERT OR IGNORE INTO commission_tags (commission_id, tag_id) VALUES (?, ?)',
          [commissionId, tag.id]
        );
      }
    }

    // Update character associations - remove existing and add new ones
    await req.db.run('DELETE FROM commission_characters WHERE commission_id = ?', [commissionId]);
    if (processedCharacterIds && processedCharacterIds.length > 0) {
      for (const characterId of processedCharacterIds) {
        await req.db.run(
          'INSERT OR IGNORE INTO commission_characters (commission_id, character_id) VALUES (?, ?)',
          [commissionId, characterId]
        );
      }
    }

    // Process gallery images (append to existing)
    if (req.files && req.files.gallery_images) {
      const galleryDir = path.join(__dirname, '../uploads/images/gallery');
      for (let i = 0; i < req.files.gallery_images.length; i++) {
        const file = req.files.gallery_images[i];
        await imageProcessor.validateImage(file);
        
        const processed = await imageProcessor.processImageSet(file, galleryDir, 'gallery');
        
        await req.db.run(`
          INSERT INTO commission_images (
            commission_id, original_path, display_path, thumb_path, 
            filename, filesize, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          commissionId,
          extractRelativePathFromUploads(processed.original),
          extractRelativePathFromUploads(processed.display),
          extractRelativePathFromUploads(processed.thumb),
          processed.filename,
          processed.filesize,
          i
        ]);
      }
    }

    // Process draft images (append to existing)
    if (req.files && req.files.draft_images) {
      const draftsDir = path.join(__dirname, '../uploads/images/drafts');
      for (let i = 0; i < req.files.draft_images.length; i++) {
        const file = req.files.draft_images[i];
        await imageProcessor.validateImage(file);
        
        const processed = await imageProcessor.processImageSet(file, draftsDir, 'draft');
        
        await req.db.run(`
          INSERT INTO commission_draft_images (
            commission_id, original_path, display_path, thumb_path, 
            filename, filesize, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          commissionId,
          extractRelativePathFromUploads(processed.original),
          extractRelativePathFromUploads(processed.display),
          extractRelativePathFromUploads(processed.thumb),
          processed.filename,
          processed.filesize,
          i
        ]);
      }
    }

    // Process files (append to existing)
    if (req.files && req.files.files) {
      const filesDir = path.join(__dirname, '../uploads/files');
      await fs.ensureDir(filesDir);
      
      for (const file of req.files.files) {
        const safeFilename = imageProcessor.generateSafeFilename(file.originalname);
        const filePath = path.join(filesDir, safeFilename);
        
        await fs.writeFile(filePath, file.buffer);
        
        await req.db.run(`
          INSERT INTO commission_files (
            commission_id, filename, original_filename, file_path, 
            filesize, mime_type
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          commissionId,
          safeFilename,
          file.originalname,
          `uploads/files/${safeFilename}`,
          file.size,
          file.mimetype
        ]);
      }
    }

    res.redirect('/admin/commissions');
  } catch (error) {
    console.error('Error updating commission:', error);
    
    // Reload form data and existing commission
    const [commission, artists, tags, characters, collections] = await Promise.all([
      req.db.get('SELECT * FROM commissions WHERE id = ?', [req.params.id]),
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    res.render('admin/commission-form', { 
      user: req.session.user, 
      commission: { ...commission, ...req.body }, // Merge existing with form data
      artists, 
      tags, 
      characters, 
      collections,
      error: error.message 
    });
  }
});

// Delete commission
router.post('/commissions/:id/delete', requireAuth, async (req, res) => {
  try {
    // Get commission details to clean up files
    const commission = await req.db.get('SELECT * FROM commissions WHERE id = ?', [req.params.id]);
    
    if (commission) {
      // Get all related images and files
      const [images, draftImages, files] = await Promise.all([
        req.db.all('SELECT * FROM commission_images WHERE commission_id = ?', [req.params.id]),
        req.db.all('SELECT * FROM commission_draft_images WHERE commission_id = ?', [req.params.id]),
        req.db.all('SELECT * FROM commission_files WHERE commission_id = ?', [req.params.id])
      ]);

      // Delete main image files
      if (commission.main_image_original) {
        try {
          await fs.remove(path.join(__dirname, '../uploads', commission.main_image_original));
        } catch (err) {
          console.warn('Could not delete main image original:', err.message);
        }
      }
      if (commission.main_image_display) {
        try {
          await fs.remove(path.join(__dirname, '../uploads', commission.main_image_display));
        } catch (err) {
          console.warn('Could not delete main image display:', err.message);
        }
      }
      if (commission.main_image_thumb) {
        try {
          await fs.remove(path.join(__dirname, '../uploads', commission.main_image_thumb));
        } catch (err) {
          console.warn('Could not delete main image thumb:', err.message);
        }
      }

      // Delete gallery images
      for (const image of images) {
        try {
          if (image.original_path) await fs.remove(path.join(__dirname, '../uploads', image.original_path));
          if (image.display_path) await fs.remove(path.join(__dirname, '../uploads', image.display_path));
          if (image.thumb_path) await fs.remove(path.join(__dirname, '../uploads', image.thumb_path));
        } catch (err) {
          console.warn('Could not delete gallery image:', err.message);
        }
      }

      // Delete draft images
      for (const image of draftImages) {
        try {
          if (image.original_path) await fs.remove(path.join(__dirname, '../uploads', image.original_path));
          if (image.display_path) await fs.remove(path.join(__dirname, '../uploads', image.display_path));
          if (image.thumb_path) await fs.remove(path.join(__dirname, '../uploads', image.thumb_path));
        } catch (err) {
          console.warn('Could not delete draft image:', err.message);
        }
      }

      // Delete files
      for (const file of files) {
        try {
          if (file.file_path) await fs.remove(path.join(__dirname, '../uploads', file.file_path));
        } catch (err) {
          console.warn('Could not delete commission file:', err.message);
        }
      }
    }

    await req.db.run('DELETE FROM commissions WHERE id = ?', [req.params.id]);
    res.redirect('/admin/commissions');
  } catch (error) {
    console.error('Error deleting commission:', error);
    res.redirect('/admin/commissions?error=' + encodeURIComponent(error.message));
  }
});

// Image management endpoints
router.post('/commissions/:id/images/reorder', requireAuth, async (req, res) => {
  try {
    const { imageIds } = req.body; // Array of image IDs in new order
    const commissionId = req.params.id;

    // Verify commission exists and user has access
    const commission = await req.db.get('SELECT id FROM commissions WHERE id = ?', [commissionId]);
    if (!commission) {
      return res.status(404).json({ error: 'Commission not found' });
    }

    // Update sort order for gallery images
    if (imageIds && imageIds.length > 0) {
      for (let i = 0; i < imageIds.length; i++) {
        await req.db.run(
          'UPDATE commission_images SET sort_order = ? WHERE id = ? AND commission_id = ?',
          [i, imageIds[i], commissionId]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering images:', error);
    res.status(500).json({ error: 'Failed to reorder images' });
  }
});

router.post('/commissions/:id/draft-images/reorder', requireAuth, async (req, res) => {
  try {
    const { imageIds } = req.body; // Array of image IDs in new order
    const commissionId = req.params.id;

    // Verify commission exists and user has access
    const commission = await req.db.get('SELECT id FROM commissions WHERE id = ?', [commissionId]);
    if (!commission) {
      return res.status(404).json({ error: 'Commission not found' });
    }

    // Update sort order for draft images
    if (imageIds && imageIds.length > 0) {
      for (let i = 0; i < imageIds.length; i++) {
        await req.db.run(
          'UPDATE commission_draft_images SET sort_order = ? WHERE id = ? AND commission_id = ?',
          [i, imageIds[i], commissionId]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering draft images:', error);
    res.status(500).json({ error: 'Failed to reorder draft images' });
  }
});

router.delete('/commissions/:id/images/:imageId', requireAuth, async (req, res) => {
  try {
    const { id: commissionId, imageId } = req.params;

    // Get image details for file cleanup
    const image = await req.db.get(
      'SELECT * FROM commission_images WHERE id = ? AND commission_id = ?',
      [imageId, commissionId]
    );

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Delete image files
    const filesToDelete = [image.original_path, image.display_path, image.thumb_path].filter(Boolean);
    for (const filePath of filesToDelete) {
      try {
        await fs.remove(path.join(__dirname, '../uploads', filePath));
      } catch (err) {
        console.warn('Could not delete image file:', err.message);
      }
    }

    // Delete database record
    await req.db.run('DELETE FROM commission_images WHERE id = ?', [imageId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

router.delete('/commissions/:id/draft-images/:imageId', requireAuth, async (req, res) => {
  try {
    const { id: commissionId, imageId } = req.params;

    // Get image details for file cleanup
    const image = await req.db.get(
      'SELECT * FROM commission_draft_images WHERE id = ? AND commission_id = ?',
      [imageId, commissionId]
    );

    if (!image) {
      return res.status(404).json({ error: 'Draft image not found' });
    }

    // Delete image files
    const filesToDelete = [image.original_path, image.display_path, image.thumb_path].filter(Boolean);
    for (const filePath of filesToDelete) {
      try {
        await fs.remove(path.join(__dirname, '../uploads', filePath));
      } catch (err) {
        console.warn('Could not delete draft image file:', err.message);
      }
    }

    // Delete database record
    await req.db.run('DELETE FROM commission_draft_images WHERE id = ?', [imageId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting draft image:', error);
    res.status(500).json({ error: 'Failed to delete draft image' });
  }
});

router.delete('/commissions/:id/files/:fileId', requireAuth, async (req, res) => {
  try {
    const { id: commissionId, fileId } = req.params;

    // Get file details for cleanup
    const file = await req.db.get(
      'SELECT * FROM commission_files WHERE id = ? AND commission_id = ?',
      [fileId, commissionId]
    );

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete file
    try {
      await fs.remove(path.join(__dirname, '../uploads', file.file_path));
    } catch (err) {
      console.warn('Could not delete file:', err.message);
    }

    // Delete database record
    await req.db.run('DELETE FROM commission_files WHERE id = ?', [fileId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Draft image management endpoints
router.post('/drafts/:id/images/reorder', requireAuth, async (req, res) => {
  try {
    const { imageIds } = req.body; // Array of image IDs in new order
    const draftId = req.params.id;

    // Verify draft exists and user has access
    const draft = await req.db.get('SELECT id FROM drafts WHERE id = ?', [draftId]);
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    // Update sort order for draft images
    if (imageIds && imageIds.length > 0) {
      for (let i = 0; i < imageIds.length; i++) {
        await req.db.run(
          'UPDATE draft_images SET sort_order = ? WHERE id = ? AND draft_id = ?',
          [i, imageIds[i], draftId]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering draft images:', error);
    res.status(500).json({ error: 'Failed to reorder draft images' });
  }
});

router.delete('/drafts/:id/images/:imageId', requireAuth, async (req, res) => {
  try {
    const { id: draftId, imageId } = req.params;

    // Get image details for file cleanup
    const image = await req.db.get(
      'SELECT * FROM draft_images WHERE id = ? AND draft_id = ?',
      [imageId, draftId]
    );

    if (!image) {
      return res.status(404).json({ error: 'Draft image not found' });
    }

    // Delete image files
    const filesToDelete = [image.original_path, image.display_path, image.thumb_path].filter(Boolean);
    for (const filePath of filesToDelete) {
      try {
        await fs.remove(path.join(__dirname, '../uploads', filePath));
      } catch (err) {
        console.warn('Could not delete draft image file:', err.message);
      }
    }

    // Delete database record
    await req.db.run('DELETE FROM draft_images WHERE id = ?', [imageId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting draft image:', error);
    res.status(500).json({ error: 'Failed to delete draft image' });
  }
});

// Character relationships management
router.get('/characters/:id/relationships', requireAuth, async (req, res) => {
  try {
    const character = await req.db.get('SELECT * FROM characters WHERE id = ?', [req.params.id]);
    if (!character) {
      return res.status(404).render('admin/error', { error: 'Character not found' });
    }

    const relationships = await req.db.all(`
      SELECT cr.*, ch.name as related_character_name
      FROM character_relationships cr
      JOIN characters ch ON cr.to_character_id = ch.id
      WHERE cr.from_character_id = ?
      ORDER BY cr.relationship_type, ch.name
    `, [character.id]);

    const availableCharacters = await req.db.all(
      'SELECT * FROM characters WHERE id != ? ORDER BY name',
      [character.id]
    );

    res.render('admin/character-relationships', { 
      user: req.session.user, 
      character, 
      relationships,
      availableCharacters,
      error: null 
    });
  } catch (error) {
    console.error('Error loading character relationships:', error);
    res.render('admin/error', { error: error.message });
  }
});

router.post('/characters/:id/relationships', requireAuth, async (req, res) => {
  try {
    const { to_character_id, relationship_type, description } = req.body;

    await req.db.run(`
      INSERT INTO character_relationships (from_character_id, to_character_id, relationship_type, description)
      VALUES (?, ?, ?, ?)
    `, [req.params.id, to_character_id, relationship_type, description]);

    res.redirect(`/admin/characters/${req.params.id}/relationships`);
  } catch (error) {
    console.error('Error creating relationship:', error);
    res.redirect(`/admin/characters/${req.params.id}/relationships?error=${encodeURIComponent(error.message)}`);
  }
});

// Bulk import page
router.get('/import', requireAuth, (req, res) => {
  res.render('admin/bulk-import', { user: req.session.user, error: null, success: null });
});

// Bulk import handler
router.post('/import', requireAuth, upload.single('import_file'), async (req, res) => {
  try {
    const { import_type, create_missing_artists, create_missing_tags } = req.body;
    
    if (!req.file) {
      return res.render('admin/bulk-import', { 
        user: req.session.user, 
        error: 'Please select a file to import', 
        success: null 
      });
    }

    // Parse CSV file
    const csvData = req.file.buffer.toString('utf-8');
    const lines = csvData.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return res.render('admin/bulk-import', { 
        user: req.session.user, 
        error: 'The CSV file appears to be empty', 
        success: null 
      });
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      // Simple CSV parsing - this could be enhanced with a proper CSV library
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    let imported = 0;
    let errors = [];
    const slugGenerator = new SlugGenerator(req.db);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        if (import_type === 'commissions') {
          await importCommission(req.db, row, create_missing_artists, create_missing_tags, slugGenerator);
        } else if (import_type === 'characters') {
          await importCharacter(req.db, row, slugGenerator);
        } else if (import_type === 'artists') {
          await importArtist(req.db, row, slugGenerator);
        }
        imported++;
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    const message = `Successfully imported ${imported} ${import_type}`;
    const errorMessage = errors.length > 0 ? `Errors: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? ` (and ${errors.length - 5} more)` : ''}` : null;

    res.render('admin/bulk-import', {
      user: req.session.user,
      success: message,
      error: errorMessage
    });

  } catch (error) {
    console.error('Error in bulk import:', error);
    res.render('admin/bulk-import', {
      user: req.session.user,
      error: error.message,
      success: null
    });
  }
});

// Helper function to import a commission
async function importCommission(db, row, createMissingArtists, createMissingTags, slugGenerator) {
  const { title, artist_name, date_month, description, price, score, nsfw, tags } = row;
  
  if (!title) {
    throw new Error('Title is required');
  }

  // Find or create artist
  let artistId = null;
  if (artist_name) {
    let artist = await db.get('SELECT id FROM artists WHERE name = ?', [artist_name]);
    
    if (!artist && createMissingArtists) {
      const artistSlug = await slugGenerator.generateArtistSlug(artist_name);
      const result = await db.run(
        'INSERT INTO artists (name, slug) VALUES (?, ?)',
        [artist_name, artistSlug]
      );
      artistId = result.id;
    } else if (artist) {
      artistId = artist.id;
    }
  }

  // Generate slug for commission
  const slug = await slugGenerator.generateCommissionSlug(title);

  // Insert commission
  const result = await db.run(`
    INSERT INTO commissions (
      title, slug, artist_id, date_month, description, 
      price, score, nsfw, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `, [
    title, slug, artistId, date_month || null, description || null,
    price ? parseFloat(price) : null, score ? parseInt(score) : null,
    nsfw === 'true' || nsfw === '1' ? 1 : 0
  ]);

  const commissionId = result.id;

  // Process tags
  if (tags && createMissingTags) {
    const tagNames = tags.split(';').map(t => t.trim()).filter(t => t);
    
    for (const tagName of tagNames) {
      let tag = await db.get('SELECT id FROM tags WHERE name = ?', [tagName]);
      
      if (!tag) {
        const tagSlug = await slugGenerator.generateTagSlug(tagName);
        const tagResult = await db.run(
          'INSERT INTO tags (name, slug) VALUES (?, ?)',
          [tagName, tagSlug]
        );
        tag = { id: tagResult.id };
      }
      
      await db.run(
        'INSERT OR IGNORE INTO commission_tags (commission_id, tag_id) VALUES (?, ?)',
        [commissionId, tag.id]
      );
    }
  }
}

// Helper function to import a character
async function importCharacter(db, row, slugGenerator) {
  const { 
    name, universe, role, year_level, dormitory, age_category,
    hair_color, eye_color, description, wiki_page, external_profile_url
  } = row;
  
  if (!name) {
    throw new Error('Name is required');
  }

  const slug = await slugGenerator.generateCharacterSlug(name);

  await db.run(`
    INSERT INTO characters (
      name, slug, universe, role, year_level, dormitory, age_category,
      hair_color, eye_color, description, wiki_page, external_profile_url,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `, [
    name, slug, universe || null, role || null, year_level || null,
    dormitory || null, age_category || null, hair_color || null,
    eye_color || null, description || null, wiki_page || null,
    external_profile_url || null
  ]);
}

// Helper function to import an artist
async function importArtist(db, row, slugGenerator) {
  const { name, description, website_url } = row;
  
  if (!name) {
    throw new Error('Name is required');
  }

  const slug = await slugGenerator.generateArtistSlug(name);

  await db.run(`
    INSERT INTO artists (name, slug, description, website_url, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `, [name, slug, description || null, website_url || null]);
}

// =============================================
// UPPER CAMPUS CHARACTER MANAGEMENT
// =============================================

// Upper Campus characters list
router.get('/upper-campus', requireAuth, async (req, res) => {
  try {
    const characters = await req.db.all('SELECT * FROM upper_campus_characters ORDER BY name');
    
    // Format characters with dormitory colors and animals
    const formattedCharacters = characters.map(character => ({
      ...character,
      dormitory_color: getDormitoryColor(character.dormitory),
      dormitory_animal: getDormitoryAnimal(character.dormitory)
    }));
    
    res.render('admin/upper-campus/characters', { user: req.session.user, characters: formattedCharacters });
  } catch (error) {
    console.error('Error loading Upper Campus characters:', error);
    res.render('admin/error', { error: error.message });
  }
});

// Upper Campus character form (new)
router.get('/upper-campus/new', requireAuth, (req, res) => {
  res.render('admin/upper-campus/character-form', { user: req.session.user, character: null, error: null });
});

// Upper Campus character form (edit)
router.get('/upper-campus/:id/edit', requireAuth, async (req, res) => {
  try {
    const character = await req.db.get('SELECT * FROM upper_campus_characters WHERE id = ?', [req.params.id]);
    if (!character) {
      return res.status(404).render('admin/error', { error: 'Upper Campus character not found' });
    }
    res.render('admin/upper-campus/character-form', { user: req.session.user, character, error: null });
  } catch (error) {
    console.error('Error loading Upper Campus character:', error);
    res.render('admin/error', { error: error.message });
  }
});

// Create/Update Upper Campus character
router.post('/upper-campus', requireAuth, upload.single('portrait'), async (req, res) => {
  try {
    const { 
      name, dormitory, grade, age_category, age, hair_color, eye_color, 
      aliases, measurements, birthday, hair_attributes, eye_attributes,
      body_features, clothing_accessories, personal_items, personality_traits,
      character_roles, activities_hobbies, story_events, sexual_activities,
      sexual_themes, description
    } = req.body;

    if (!name) {
      throw new Error('Character name is required');
    }

    const slugGenerator = new SlugGenerator(req.db);
    const slug = await slugGenerator.generateCharacterSlug(name);

    let portraitPath = null;
    let portraitThumbPath = null;

    // Process portrait if uploaded
    if (req.file) {
      const imageProcessor = new ImageProcessor();
      await imageProcessor.validateImage(req.file);

      const characterDir = path.join(__dirname, '../uploads/images/upper-campus');
      await fs.ensureDir(characterDir);
      await fs.ensureDir(path.join(characterDir, 'portraits'));
      
      const processed = await imageProcessor.processImageSet(req.file, characterDir, 'character');
      
      portraitPath = extractRelativePathFromUploads(processed.original);
      portraitThumbPath = await imageProcessor.createCharacterPortrait(
        processed.original,
        path.join(characterDir, 'portraits', `${processed.filename}`)
      );
      portraitThumbPath = extractRelativePathFromUploads(portraitThumbPath);
    }

    const result = await req.db.run(`
      INSERT INTO upper_campus_characters (
        name, slug, dormitory, grade, age_category, age, hair_color, eye_color,
        portrait_path, portrait_thumb_path, aliases, measurements, birthday,
        hair_attributes, eye_attributes, body_features, clothing_accessories,
        personal_items, personality_traits, character_roles, activities_hobbies,
        story_events, sexual_activities, sexual_themes, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, slug, dormitory, grade, age_category, age || null, hair_color, eye_color,
      portraitPath, portraitThumbPath, aliases, measurements, birthday,
      hair_attributes, eye_attributes, body_features, clothing_accessories,
      personal_items, personality_traits, character_roles, activities_hobbies,
      story_events, sexual_activities, sexual_themes, description
    ]);

    res.redirect('/admin/upper-campus');
  } catch (error) {
    console.error('Error creating Upper Campus character:', error);
    res.render('admin/upper-campus/character-form', { 
      user: req.session.user, 
      character: req.body, 
      error: error.message 
    });
  }
});

// Update Upper Campus character
router.post('/upper-campus/:id', requireAuth, upload.single('portrait'), async (req, res) => {
  try {
    const { 
      name, dormitory, grade, age_category, age, hair_color, eye_color, 
      aliases, measurements, birthday, hair_attributes, eye_attributes,
      body_features, clothing_accessories, personal_items, personality_traits,
      character_roles, activities_hobbies, story_events, sexual_activities,
      sexual_themes, description
    } = req.body;

    if (!name) {
      throw new Error('Character name is required');
    }

    const existingCharacter = await req.db.get('SELECT * FROM upper_campus_characters WHERE id = ?', [req.params.id]);
    if (!existingCharacter) {
      throw new Error('Upper Campus character not found');
    }

    let portraitPath = existingCharacter.portrait_path;
    let portraitThumbPath = existingCharacter.portrait_thumb_path;

    // Process new portrait if uploaded
    if (req.file) {
      const imageProcessor = new ImageProcessor();
      await imageProcessor.validateImage(req.file);

      const characterDir = path.join(__dirname, '../uploads/images/upper-campus');
      await fs.ensureDir(characterDir);
      await fs.ensureDir(path.join(characterDir, 'portraits'));
      
      const processed = await imageProcessor.processImageSet(req.file, characterDir, 'character');
      
      portraitPath = extractRelativePathFromUploads(processed.original);
      portraitThumbPath = await imageProcessor.createCharacterPortrait(
        processed.original,
        path.join(characterDir, 'portraits', `${processed.filename}`)
      );
      portraitThumbPath = extractRelativePathFromUploads(portraitThumbPath);
    }

    await req.db.run(`
      UPDATE upper_campus_characters SET
        name = ?, dormitory = ?, grade = ?, age_category = ?, age = ?, hair_color = ?, eye_color = ?,
        portrait_path = ?, portrait_thumb_path = ?, aliases = ?, measurements = ?, birthday = ?,
        hair_attributes = ?, eye_attributes = ?, body_features = ?, clothing_accessories = ?,
        personal_items = ?, personality_traits = ?, character_roles = ?, activities_hobbies = ?,
        story_events = ?, sexual_activities = ?, sexual_themes = ?, description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name, dormitory, grade, age_category, age || null, hair_color, eye_color,
      portraitPath, portraitThumbPath, aliases, measurements, birthday,
      hair_attributes, eye_attributes, body_features, clothing_accessories,
      personal_items, personality_traits, character_roles, activities_hobbies,
      story_events, sexual_activities, sexual_themes, description,
      req.params.id
    ]);

    res.redirect('/admin/upper-campus');
  } catch (error) {
    console.error('Error updating Upper Campus character:', error);
    const character = await req.db.get('SELECT * FROM upper_campus_characters WHERE id = ?', [req.params.id]);
    res.render('admin/upper-campus/character-form', { 
      user: req.session.user, 
      character: { ...character, ...req.body }, 
      error: error.message 
    });
  }
});

// Delete Upper Campus character
router.delete('/upper-campus/:id', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM upper_campus_characters WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting Upper Campus character:', error);
    res.status(500).json({ error: error.message });
  }
});

// Works management for Upper Campus characters (must come before general detail route)
router.get('/upper-campus/:id/works', requireAuth, async (req, res) => {
  try {
    const character = await req.db.get('SELECT * FROM upper_campus_characters WHERE id = ?', [req.params.id]);
    if (!character) {
      return res.status(404).render('admin/error', { error: 'Upper Campus character not found' });
    }

    const works = await req.db.all('SELECT * FROM upper_campus_character_works WHERE character_id = ? ORDER BY sort_order, id', [req.params.id]);

    res.render('admin/upper-campus/character-works', { 
      user: req.session.user, 
      character, 
      works,
      error: null 
    });
  } catch (error) {
    console.error('Error loading character works:', error);
    res.render('admin/error', { error: error.message });
  }
});

// Add work to Upper Campus character
router.post('/upper-campus/:id/works', requireAuth, upload.single('icon'), async (req, res) => {
  try {
    const { work_name, work_type, external_url, sort_order } = req.body;

    if (!work_name) {
      throw new Error('Work name is required');
    }

    const character = await req.db.get('SELECT * FROM upper_campus_characters WHERE id = ?', [req.params.id]);
    if (!character) {
      throw new Error('Upper Campus character not found');
    }

    let iconPath = null;

    // Process icon if uploaded
    if (req.file) {
      const imageProcessor = new ImageProcessor();
      await imageProcessor.validateImage(req.file);

      const worksDir = path.join(__dirname, '../uploads/images/upper-campus/works');
      await fs.ensureDir(worksDir);
      
      const processed = await imageProcessor.processImageSet(req.file, worksDir, 'work-icon');
      iconPath = extractRelativePathFromUploads(processed.original);
    }

    await req.db.run(`
      INSERT INTO upper_campus_character_works (
        character_id, work_name, work_type, icon_path, external_url, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      req.params.id, work_name, work_type || 'other', iconPath, external_url, sort_order || 0
    ]);

    res.redirect(`/admin/upper-campus/${req.params.id}/works`);
  } catch (error) {
    console.error('Error adding work:', error);
    const character = await req.db.get('SELECT * FROM upper_campus_characters WHERE id = ?', [req.params.id]);
    const works = await req.db.all('SELECT * FROM upper_campus_character_works WHERE character_id = ? ORDER BY sort_order, id', [req.params.id]);
    
    res.render('admin/upper-campus/character-works', { 
      user: req.session.user, 
      character, 
      works,
      error: error.message 
    });
  }
});

// Delete work from Upper Campus character
router.delete('/upper-campus/:characterId/works/:workId', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM upper_campus_character_works WHERE id = ? AND character_id = ?', [req.params.workId, req.params.characterId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting work:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upper Campus character detail view
router.get('/upper-campus/:id', requireAuth, async (req, res) => {
  try {
    const [character, images, works] = await Promise.all([
      req.db.get('SELECT * FROM upper_campus_characters WHERE id = ?', [req.params.id]),
      req.db.all('SELECT * FROM upper_campus_character_images WHERE character_id = ? ORDER BY sort_order, id', [req.params.id]),
      req.db.all('SELECT * FROM upper_campus_character_works WHERE character_id = ? ORDER BY sort_order, id', [req.params.id])
    ]);

    if (!character) {
      return res.status(404).render('admin/error', { error: 'Upper Campus character not found' });
    }

    res.render('admin/upper-campus/character-detail', { 
      user: req.session.user, 
      character: {
        ...character,
        dormitory_color: getDormitoryColor(character.dormitory),
        dormitory_animal: getDormitoryAnimal(character.dormitory)
      }, 
      images, 
      works 
    });
  } catch (error) {
    console.error('Error loading Upper Campus character:', error);
    res.render('admin/error', { error: error.message });
  }
});

// Character versions routes
router.post('/upper-campus/:id/versions', requireAuth, upload.single('portrait'), async (req, res) => {
  try {
    const { version_name, date_period, description } = req.body;
    
    if (!version_name) {
      return res.status(400).send('Version name is required');
    }

    const character = await req.db.get('SELECT * FROM upper_campus_characters WHERE id = ?', [req.params.id]);
    if (!character) {
      return res.status(404).send('Character not found');
    }

    let portraitPath = null;

    // Process portrait if uploaded
    if (req.file) {
      const imageProcessor = new ImageProcessor();
      await imageProcessor.validateImage(req.file);

      const versionsDir = path.join(__dirname, '../uploads/images/upper-campus/versions');
      await fs.ensureDir(versionsDir);

      portraitPath = await imageProcessor.processImage(req.file, versionsDir, {
        resize: { width: 300, height: 300 }
      });
      
      // Convert to relative path
      portraitPath = extractRelativePathFromUploads(portraitPath);
    }

    // Get next sort order
    const maxSort = await req.db.get(
      'SELECT MAX(sort_order) as max_sort FROM character_versions WHERE character_id = ?',
      [req.params.id]
    );
    const sortOrder = (maxSort?.max_sort || 0) + 1;

    await req.db.run(`
      INSERT INTO character_versions (character_id, version_name, portrait_path, description, date_period, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.params.id, version_name, portraitPath, description, date_period, sortOrder]);

    res.redirect(`/admin/upper-campus/${req.params.id}`);
  } catch (error) {
    console.error('Error creating character version:', error);
    res.status(500).send('Error creating character version: ' + error.message);
  }
});

// Get character versions
router.get('/upper-campus/:id/versions', requireAuth, async (req, res) => {
  try {
    const versions = await req.db.all(
      'SELECT * FROM character_versions WHERE character_id = ? ORDER BY sort_order ASC',
      [req.params.id]
    );
    
    res.json(versions);
  } catch (error) {
    console.error('Error fetching character versions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete character version
router.delete('/upper-campus/:id/versions/:versionId', requireAuth, async (req, res) => {
  try {
    const version = await req.db.get(
      'SELECT * FROM character_versions WHERE id = ? AND character_id = ?',
      [req.params.versionId, req.params.id]
    );
    
    if (!version) {
      return res.status(404).send('Version not found');
    }

    // Delete portrait file if exists
    if (version.portrait_path) {
      const fullPath = path.join(__dirname, '../uploads', version.portrait_path);
      try {
        await fs.remove(fullPath);
      } catch (err) {
        console.warn('Could not delete version portrait file:', err.message);
      }
    }

    await req.db.run('DELETE FROM character_versions WHERE id = ?', [req.params.versionId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting character version:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// DRAFTS MANAGEMENT
// =============================================

// Drafts list
router.get('/drafts', requireAuth, async (req, res) => {
  try {
    const drafts = await req.db.all(`
      SELECT d.*, a.name as artist_name, a.slug as artist_slug
      FROM drafts d
      LEFT JOIN artists a ON d.artist_id = a.id
      ORDER BY d.updated_at DESC
    `);

    res.render('admin/drafts', { user: req.session.user, drafts });
  } catch (error) {
    console.error('Error loading drafts:', error);
    res.render('admin/error', { error: error.message });
  }
});

// Draft form (new)
router.get('/drafts/new', requireAuth, async (req, res) => {
  try {
    const [artists, tags, characters, collections] = await Promise.all([
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    res.render('admin/draft-form', { 
      user: req.session.user, 
      draft: null, 
      artists, 
      tags, 
      characters, 
      collections,
      error: null 
    });
  } catch (error) {
    console.error('Error loading draft form:', error);
    res.render('admin/error', { error: error.message });
  }
});

// Draft form (edit)
router.get('/drafts/:id/edit', requireAuth, async (req, res) => {
  try {
    const [draft, artists, tags, characters, collections] = await Promise.all([
      req.db.get('SELECT * FROM drafts WHERE id = ?', [req.params.id]),
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    if (!draft) {
      return res.status(404).render('admin/error', { error: 'Draft not found' });
    }

    // Get associated tags and characters and images
    const [draftTags, draftCharacters, draftImages] = await Promise.all([
      req.db.all(`
        SELECT t.name 
        FROM tags t 
        JOIN draft_tags dt ON t.id = dt.tag_id 
        WHERE dt.draft_id = ?
      `, [req.params.id]),
      req.db.all(`
        SELECT character_id 
        FROM draft_characters 
        WHERE draft_id = ?
      `, [req.params.id]),
      req.db.all(`
        SELECT * FROM draft_images 
        WHERE draft_id = ? 
        ORDER BY sort_order, created_at
      `, [req.params.id])
    ]);
    
    draft.tag_names = draftTags.map(t => t.name).join(', ');
    draft.character_ids = draftCharacters.map(dc => dc.character_id);
    draft.existing_draft_images = draftImages;

    res.render('admin/draft-form', { 
      user: req.session.user, 
      draft, 
      artists, 
      tags, 
      characters, 
      collections,
      error: null 
    });
  } catch (error) {
    console.error('Error loading draft:', error);
    res.render('admin/error', { error: error.message });
  }
});

// Create draft
router.post('/drafts/new', requireAuth, upload.fields([
  { name: 'draft_images', maxCount: 20 }
]), async (req, res) => {
  try {
    const { 
      title, description, status, date_month, price, client_name, 
      deadline_date, notes, artist_id, collection_id, tag_names, character_ids 
    } = req.body;

    if (!title) {
      throw new Error('Title is required');
    }

    const slugGenerator = new SlugGenerator(req.db);
    const slug = await slugGenerator.generateDraftSlug(title);

    // Handle artist ID (create new if needed)
    const processedArtistId = await handleArtistId(req.db, artist_id);

    // Handle character IDs (create new if needed)
    const processedCharacterIds = await handleCharacterIds(req.db, character_ids);

    // Insert draft
    const result = await req.db.run(`
      INSERT INTO drafts (
        title, slug, description, status, date_month, price, 
        artist_id, collection_id, notes, client_name, deadline_date,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      title, slug, description || null, status || 'requested', date_month || null, 
      price || null, processedArtistId, collection_id || null, notes || null,
      client_name || null, deadline_date || null
    ]);

    const draftId = result.id;

    // Handle tags
    if (tag_names) {
      const tagList = tag_names.split(',').map(t => t.trim()).filter(t => t);
      
      for (const tagName of tagList) {
        let tag = await req.db.get('SELECT id FROM tags WHERE name = ?', [tagName]);
        
        if (!tag) {
          const tagSlug = await slugGenerator.generateTagSlug(tagName);
          const tagResult = await req.db.run(
            'INSERT INTO tags (name, slug) VALUES (?, ?)',
            [tagName, tagSlug]
          );
          tag = { id: tagResult.id };
        }
        
        await req.db.run(
          'INSERT OR IGNORE INTO draft_tags (draft_id, tag_id) VALUES (?, ?)',
          [draftId, tag.id]
        );
      }
    }

    // Handle characters
    if (processedCharacterIds && processedCharacterIds.length > 0) {
      for (const characterId of processedCharacterIds) {
        await req.db.run(
          'INSERT OR IGNORE INTO draft_characters (draft_id, character_id) VALUES (?, ?)',
          [draftId, characterId]
        );
      }
    }

    // Process draft images
    if (req.files && req.files.draft_images) {
      const imageProcessor = new ImageProcessor();
      const draftsDir = path.join(__dirname, '../uploads/drafts');
      await fs.ensureDir(draftsDir);
      
      for (let i = 0; i < req.files.draft_images.length; i++) {
        const file = req.files.draft_images[i];
        await imageProcessor.validateImage(file);
        
        const processed = await imageProcessor.processImageSet(file, draftsDir, 'draft');
        
        await req.db.run(`
          INSERT INTO draft_images (
            draft_id, original_path, display_path, thumb_path, 
            filename, filesize, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          draftId,
          extractRelativePathFromUploads(processed.original),
          extractRelativePathFromUploads(processed.display),
          extractRelativePathFromUploads(processed.thumb),
          processed.filename,
          processed.filesize,
          i
        ]);
      }
    }

    res.redirect('/admin/drafts');
  } catch (error) {
    console.error('Error creating draft:', error);
    
    // Reload form data
    const [artists, tags, characters, collections] = await Promise.all([
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    res.render('admin/draft-form', { 
      user: req.session.user, 
      draft: null,
      formData: req.body,
      artists, 
      tags, 
      characters, 
      collections,
      error: error.message 
    });
  }
});

// Update draft
router.post('/drafts/:id/edit', requireAuth, upload.fields([
  { name: 'draft_images', maxCount: 20 }
]), async (req, res) => {
  try {
    const draftId = req.params.id;
    const { 
      title, description, status, date_month, price, client_name, 
      deadline_date, notes, artist_id, collection_id, tag_names, character_ids 
    } = req.body;

    // Get existing draft
    const existingDraft = await req.db.get('SELECT * FROM drafts WHERE id = ?', [draftId]);
    if (!existingDraft) {
      return res.status(404).render('admin/error', { error: 'Draft not found' });
    }

    // Update draft
    await req.db.run(`
      UPDATE drafts SET 
        title = ?, description = ?, status = ?, date_month = ?, price = ?,
        artist_id = ?, collection_id = ?, notes = ?, client_name = ?, deadline_date = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [
      title, description || null, status, date_month || null, price || null,
      artist_id || null, collection_id || null, notes || null,
      client_name || null, deadline_date || null, draftId
    ]);

    // Update tags (delete existing and re-add)
    await req.db.run('DELETE FROM draft_tags WHERE draft_id = ?', [draftId]);
    
    if (tag_names) {
      const slugGenerator = new SlugGenerator(req.db);
      const tagList = tag_names.split(',').map(t => t.trim()).filter(t => t);
      
      for (const tagName of tagList) {
        let tag = await req.db.get('SELECT id FROM tags WHERE name = ?', [tagName]);
        
        if (!tag) {
          const tagSlug = await slugGenerator.generateTagSlug(tagName);
          const tagResult = await req.db.run(
            'INSERT INTO tags (name, slug) VALUES (?, ?)',
            [tagName, tagSlug]
          );
          tag = { id: tagResult.id };
        }
        
        await req.db.run(
          'INSERT OR IGNORE INTO draft_tags (draft_id, tag_id) VALUES (?, ?)',
          [draftId, tag.id]
        );
      }
    }

    // Update characters (delete existing and re-add)
    await req.db.run('DELETE FROM draft_characters WHERE draft_id = ?', [draftId]);
    
    if (character_ids) {
      const characterList = Array.isArray(character_ids) ? character_ids : [character_ids];
      
      for (const characterId of characterList) {
        await req.db.run(
          'INSERT OR IGNORE INTO draft_characters (draft_id, character_id) VALUES (?, ?)',
          [draftId, characterId]
        );
      }
    }

    // Process new draft images (append to existing)
    if (req.files && req.files.draft_images) {
      const imageProcessor = new ImageProcessor();
      const draftsDir = path.join(__dirname, '../uploads/drafts');
      await fs.ensureDir(draftsDir);
      
      for (let i = 0; i < req.files.draft_images.length; i++) {
        const file = req.files.draft_images[i];
        await imageProcessor.validateImage(file);
        
        const processed = await imageProcessor.processImageSet(file, draftsDir, 'draft');
        
        await req.db.run(`
          INSERT INTO draft_images (
            draft_id, original_path, display_path, thumb_path, 
            filename, filesize, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          draftId,
          extractRelativePathFromUploads(processed.original),
          extractRelativePathFromUploads(processed.display),
          extractRelativePathFromUploads(processed.thumb),
          processed.filename,
          processed.filesize,
          i
        ]);
      }
    }

    res.redirect('/admin/drafts');
  } catch (error) {
    console.error('Error updating draft:', error);
    
    // Reload form data and existing draft
    const [draft, artists, tags, characters, collections] = await Promise.all([
      req.db.get('SELECT * FROM drafts WHERE id = ?', [req.params.id]),
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    res.render('admin/draft-form', { 
      user: req.session.user, 
      draft: { ...draft, ...req.body },
      artists, 
      tags, 
      characters, 
      collections,
      error: error.message 
    });
  }
});

// Delete draft
router.post('/drafts/:id/delete', requireAuth, async (req, res) => {
  try {
    const draftId = req.params.id;

    // Get draft images to delete files
    const images = await req.db.all('SELECT * FROM draft_images WHERE draft_id = ?', [draftId]);
    
    // Delete image files
    for (const image of images) {
      const imagePaths = [
        path.join(__dirname, '../uploads', image.original_path),
        path.join(__dirname, '../uploads', image.display_path),
        path.join(__dirname, '../uploads', image.thumb_path)
      ].filter(Boolean);

      for (const imgPath of imagePaths) {
        try {
          await fs.remove(imgPath);
        } catch (err) {
          console.warn('Could not delete image file:', err.message);
        }
      }
    }

    // Delete draft (cascade will handle related tables)
    await req.db.run('DELETE FROM drafts WHERE id = ?', [draftId]);
    
    res.redirect('/admin/drafts');
  } catch (error) {
    console.error('Error deleting draft:', error);
    res.redirect('/admin/drafts?error=' + encodeURIComponent(error.message));
  }
});

// Convert draft to commission
router.post('/drafts/:id/convert', requireAuth, async (req, res) => {
  try {
    const draftId = req.params.id;

    // Get draft details
    const draft = await req.db.get('SELECT * FROM drafts WHERE id = ?', [draftId]);
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    if (draft.status !== 'completed' && draft.status !== 'delivered') {
      return res.status(400).json({ error: 'Draft must be completed or delivered before converting to commission' });
    }

    const slugGenerator = new SlugGenerator(req.db);
    const commissionSlug = draft.date_month 
      ? await slugGenerator.generateCommissionSlug(draft.title, draft.date_month)
      : await slugGenerator.generateCommissionSlug(draft.title, new Date().toISOString().slice(0, 7)); // Use current YYYY-MM if no date

    // Create commission
    const commissionResult = await req.db.run(`
      INSERT INTO commissions (
        title, slug, description, date_month, price, score, nsfw,
        artist_id, collection_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 100, 0, ?, ?, datetime('now'), datetime('now'))
    `, [
      draft.title, commissionSlug, draft.description, draft.date_month, draft.price,
      draft.artist_id, draft.collection_id
    ]);

    const commissionId = commissionResult.id;

    // Copy tags
    const draftTags = await req.db.all('SELECT tag_id FROM draft_tags WHERE draft_id = ?', [draftId]);
    for (const tagRow of draftTags) {
      await req.db.run(
        'INSERT INTO commission_tags (commission_id, tag_id) VALUES (?, ?)',
        [commissionId, tagRow.tag_id]
      );
    }

    // Copy characters
    const draftCharacters = await req.db.all('SELECT character_id FROM draft_characters WHERE draft_id = ?', [draftId]);
    for (const charRow of draftCharacters) {
      await req.db.run(
        'INSERT INTO commission_characters (commission_id, character_id) VALUES (?, ?)',
        [commissionId, charRow.character_id]
      );
    }

    // Copy images as main/gallery images
    const draftImages = await req.db.all('SELECT * FROM draft_images WHERE draft_id = ? ORDER BY sort_order', [draftId]);
    
    for (let i = 0; i < draftImages.length; i++) {
      const image = draftImages[i];
      
      if (i === 0) {
        // First image becomes main image
        await req.db.run(`
          UPDATE commissions SET 
            main_image_original = ?, main_image_display = ?, main_image_thumb = ?
          WHERE id = ?
        `, [image.original_path, image.display_path, image.thumb_path, commissionId]);
      } else {
        // Additional images become gallery images
        await req.db.run(`
          INSERT INTO commission_images (
            commission_id, original_path, display_path, thumb_path, 
            filename, filesize, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          commissionId, image.original_path, image.display_path, image.thumb_path,
          image.filename, image.filesize, i - 1
        ]);
      }
    }

    // Delete the draft
    await req.db.run('DELETE FROM drafts WHERE id = ?', [draftId]);

    res.json({ success: true, commissionId, commissionSlug });
  } catch (error) {
    console.error('Error converting draft to commission:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================
// NOVEL ROUTES
// ============================

// List novels
router.get('/novels', requireAuth, async (req, res) => {
  try {
    const novels = await req.db.all(`
      SELECT n.*, a.name as artist_name 
      FROM novels n
      LEFT JOIN artists a ON n.artist_id = a.id
      ORDER BY n.created_at DESC
    `);
    res.render('admin/novels', { user: req.session.user, novels });
  } catch (error) {
    console.error('Error loading novels:', error);
    res.render('admin/error', { error: error.message });
  }
});

// New novel form
router.get('/novels/new', requireAuth, async (req, res) => {
  try {
    const [artists, tags, characters, collections] = await Promise.all([
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    res.render('admin/novel-form', { 
      user: req.session.user, 
      novel: null, 
      artists, 
      tags, 
      characters, 
      collections,
      error: null 
    });
  } catch (error) {
    console.error('Error loading novel form:', error);
    res.render('admin/error', { error: error.message });
  }
});

// Create novel
router.post('/novels', requireAuth, async (req, res) => {
  try {
    const {
      title,
      description,
      date_month,
      price,
      score,
      nsfw,
      artist_id,
      collection_id,
      original_language,
      original_title,
      original_content,
      translated_language,
      translated_title,
      translated_content,
      status,
      tag_names,
      character_ids
    } = req.body;

    // Validate required fields
    if (!title || !date_month || !original_content) {
      throw new Error('Title, date, and original content are required');
    }

    // Validate date format
    if (!/^\d{4}-\d{2}$/.test(date_month)) {
      throw new Error('Invalid date format. Use YYYY-MM.');
    }

    const slugGenerator = new SlugGenerator(req.db);
    const slug = await slugGenerator.generateNovelSlug(title, date_month);

    // Handle artist ID (create new if needed)
    const processedArtistId = await handleArtistId(req.db, artist_id);

    // Handle character IDs (create new if needed)
    const processedCharacterIds = await handleCharacterIds(req.db, character_ids);

    // Calculate word count
    const wordCount = original_content ? original_content.split(/\s+/).filter(word => word.length > 0).length : 0;

    // Create novel
    const novelResult = await req.db.run(`
      INSERT INTO novels (
        title, slug, description, date_month, price, score, nsfw,
        artist_id, collection_id, original_language, original_title, original_content,
        translated_language, translated_title, translated_content, status, word_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      title, slug, description || null, date_month,
      price ? parseFloat(price) : null,
      score ? parseInt(score) : 100,
      nsfw ? 1 : 0,
      processedArtistId,
      collection_id || null,
      original_language || 'en',
      original_title || null,
      original_content,
      translated_language || null,
      translated_title || null,
      translated_content || null,
      status || 'draft',
      wordCount
    ]);

    const novelId = novelResult.lastID;

    // Handle tags
    if (tag_names && tag_names.trim()) {
      const tagArray = tag_names.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      
      for (const tagName of tagArray) {
        // Get or create tag
        let tag = await req.db.get('SELECT id FROM tags WHERE name = ?', [tagName]);
        
        if (!tag) {
          const tagSlug = await slugGenerator.generateTagSlug(tagName);
          const tagResult = await req.db.run(
            'INSERT INTO tags (name, slug) VALUES (?, ?)',
            [tagName, tagSlug]
          );
          tag = { id: tagResult.lastID };
        }
        
        // Link tag to novel
        await req.db.run(
          'INSERT OR IGNORE INTO novel_tags (novel_id, tag_id) VALUES (?, ?)',
          [novelId, tag.id]
        );
      }
    }

    // Handle characters
    if (processedCharacterIds && processedCharacterIds.length > 0) {
      for (const characterId of processedCharacterIds) {
        await req.db.run(
          'INSERT OR IGNORE INTO novel_characters (novel_id, character_id) VALUES (?, ?)',
          [novelId, characterId]
        );
      }
    }

    res.redirect('/admin/novels');
  } catch (error) {
    console.error('Error creating novel:', error);
    
    // Reload form data
    const [artists, tags, characters, collections] = await Promise.all([
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    res.render('admin/novel-form', { 
      user: req.session.user, 
      novel: null,
      formData: req.body,
      artists, 
      tags, 
      characters, 
      collections,
      error: error.message 
    });
  }
});

// Edit novel form
router.get('/novels/:id/edit', requireAuth, async (req, res) => {
  try {
    const [novel, artists, tags, characters, collections, existingTags, existingCharacters] = await Promise.all([
      req.db.get('SELECT * FROM novels WHERE id = ?', [req.params.id]),
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name'),
      req.db.all(`
        SELECT t.name 
        FROM tags t 
        JOIN novel_tags nt ON t.id = nt.tag_id 
        WHERE nt.novel_id = ?
      `, [req.params.id]),
      req.db.all(`
        SELECT c.id 
        FROM characters c 
        JOIN novel_characters nc ON c.id = nc.character_id 
        WHERE nc.novel_id = ?
      `, [req.params.id])
    ]);

    if (!novel) {
      return res.status(404).render('admin/error', { error: 'Novel not found' });
    }

    // Add existing relationships to novel object
    novel.tag_names = existingTags.map(t => t.name).join(', ');
    novel.character_ids = existingCharacters.map(c => c.id);

    res.render('admin/novel-form', { 
      user: req.session.user, 
      novel, 
      artists, 
      tags, 
      characters, 
      collections,
      error: null 
    });
  } catch (error) {
    console.error('Error loading novel:', error);
    res.render('admin/error', { error: error.message });
  }
});

// Update novel
router.post('/novels/:id/edit', requireAuth, async (req, res) => {
  try {
    const novelId = parseInt(req.params.id);
    const {
      title,
      description,
      date_month,
      price,
      score,
      nsfw,
      artist_id,
      collection_id,
      original_language,
      original_title,
      original_content,
      translated_language,
      translated_title,
      translated_content,
      status,
      tag_names,
      character_ids
    } = req.body;

    // Validate date format
    if (!/^\d{4}-\d{2}$/.test(date_month)) {
      throw new Error('Invalid date format. Use YYYY-MM.');
    }

    // Calculate word count
    const wordCount = original_content ? original_content.split(/\s+/).filter(word => word.length > 0).length : 0;

    // Update novel
    await req.db.run(`
      UPDATE novels SET 
        title = ?, description = ?, date_month = ?, price = ?, score = ?, nsfw = ?,
        artist_id = ?, collection_id = ?, original_language = ?, original_title = ?, 
        original_content = ?, translated_language = ?, translated_title = ?, 
        translated_content = ?, status = ?, word_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [
      title, description || null, date_month,
      price ? parseFloat(price) : null,
      score ? parseInt(score) : 100,
      nsfw ? 1 : 0,
      artist_id || null,
      collection_id || null,
      original_language || 'en',
      original_title || null,
      original_content,
      translated_language || null,
      translated_title || null,
      translated_content || null,
      status || 'draft',
      wordCount,
      novelId
    ]);

    // Update tags
    await req.db.run('DELETE FROM novel_tags WHERE novel_id = ?', [novelId]);
    
    if (tag_names && tag_names.trim()) {
      const slugGenerator = new SlugGenerator(req.db);
      const tagArray = tag_names.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      
      for (const tagName of tagArray) {
        let tag = await req.db.get('SELECT id FROM tags WHERE name = ?', [tagName]);
        
        if (!tag) {
          const tagSlug = await slugGenerator.generateTagSlug(tagName);
          const tagResult = await req.db.run(
            'INSERT INTO tags (name, slug) VALUES (?, ?)',
            [tagName, tagSlug]
          );
          tag = { id: tagResult.lastID };
        }
        
        await req.db.run(
          'INSERT OR IGNORE INTO novel_tags (novel_id, tag_id) VALUES (?, ?)',
          [novelId, tag.id]
        );
      }
    }

    // Update characters
    await req.db.run('DELETE FROM novel_characters WHERE novel_id = ?', [novelId]);
    
    if (character_ids && Array.isArray(character_ids)) {
      for (const characterId of character_ids) {
        if (characterId) {
          await req.db.run(
            'INSERT OR IGNORE INTO novel_characters (novel_id, character_id) VALUES (?, ?)',
            [novelId, parseInt(characterId)]
          );
        }
      }
    }

    res.redirect('/admin/novels');
  } catch (error) {
    console.error('Error updating novel:', error);
    
    // Reload form data
    const [novel, artists, tags, characters, collections] = await Promise.all([
      req.db.get('SELECT * FROM novels WHERE id = ?', [req.params.id]),
      req.db.all('SELECT * FROM artists ORDER BY name'),
      req.db.all('SELECT * FROM tags ORDER BY name'),
      req.db.all('SELECT * FROM characters ORDER BY name'),
      req.db.all('SELECT * FROM collections ORDER BY name')
    ]);

    res.render('admin/novel-form', { 
      user: req.session.user, 
      novel, 
      formData: req.body,
      artists, 
      tags, 
      characters, 
      collections,
      error: error.message 
    });
  }
});

// Delete novel
router.delete('/novels/:id', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM novels WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting novel:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

module.exports = router;