const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const slugify = require('slugify');
const sharp = require('sharp');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

// Utility function to create slug
function createSlug(text) {
  return slugify(text, { lower: true, strict: true });
}

// Configure multer for large file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/temp');
    fs.ensureDirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 * 1024, // 50GB limit per file
    files: 1000 // Maximum 1000 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Accept images and videos
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

// Login page
router.get('/login', (req, res) => {
  res.render('admin/login', { title: 'Admin Login - Gallery Suite' });
});

// Login handler
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await req.db.get('SELECT * FROM users WHERE username = ?', [username]);
    
    if (user && await bcrypt.compare(password, user.password_hash)) {
      req.session.user = { id: user.id, username: user.username, role: user.role };
      res.redirect('/admin');
    } else {
      res.render('admin/login', { 
        title: 'Admin Login - Gallery Suite',
        error: 'Invalid username or password' 
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('admin/login', { 
      title: 'Admin Login - Gallery Suite',
      error: 'Login failed' 
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Admin dashboard
router.get('/', requireAuth, async (req, res) => {
  try {
    const stats = {
      studios: await req.db.get('SELECT COUNT(*) as count FROM studios'),
      models: await req.db.get('SELECT COUNT(*) as count FROM models'),
      sets: await req.db.get('SELECT COUNT(*) as count FROM sets'),
      media: await req.db.get('SELECT COUNT(*) as count FROM media'),
      totalSize: await req.db.get('SELECT COALESCE(SUM(filesize), 0) as size FROM media')
    };

    const recentSets = await req.db.all(`
      SELECT s.*, m.name as model_name 
      FROM sets s
      JOIN models m ON s.model_id = m.id
      ORDER BY s.created_at DESC 
      LIMIT 5
    `);

    res.render('admin/gallery-dashboard', {
      title: 'Admin Dashboard - Gallery Suite',
      stats: stats,
      recentSets: recentSets
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load dashboard',
      status: 500 
    });
  }
});

// Studios management
router.get('/studios', requireAuth, async (req, res) => {
  try {
    const studios = await req.db.getStudios();
    res.render('admin/studios', {
      title: 'Manage Studios - Admin - Gallery Suite',
      studios: studios
    });
  } catch (error) {
    console.error('Studios management error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load studios',
      status: 500 
    });
  }
});

router.get('/studios/new', requireAuth, (req, res) => {
  res.render('admin/studio-form', {
    title: 'Add New Studio - Admin - Gallery Suite',
    studio: {},
    isEdit: false
  });
});

router.post('/studios', requireAuth, upload.single('logo'), async (req, res) => {
  try {
    const { name, description, website_url, location, established_date } = req.body;
    const slug = createSlug(name);

    let logoPath = null;
    let logoThumbPath = null;

    if (req.file) {
      const logoDir = path.join(__dirname, '../uploads/studios');
      await fs.ensureDir(logoDir);

      logoPath = `uploads/studios/${slug}-logo${path.extname(req.file.originalname)}`;
      logoThumbPath = `uploads/studios/${slug}-logo-thumb.webp`;

      // Move and process logo
      await fs.move(req.file.path, path.join(__dirname, '..', logoPath));
      
      // Create thumbnail
      await sharp(path.join(__dirname, '..', logoPath))
        .resize(200, 200, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(path.join(__dirname, '..', logoThumbPath));
    }

    const studioId = await req.db.createStudio({
      name, slug, description, 
      logo_path: logoPath,
      logo_thumb_path: logoThumbPath,
      website_url, location, established_date
    });

    res.redirect('/admin/studios');
  } catch (error) {
    console.error('Studio creation error:', error);
    res.status(500).render('error', { 
      error: 'Failed to create studio',
      status: 500 
    });
  }
});

// Studio edit routes
router.get('/studios/:id/edit', requireAuth, async (req, res) => {
  try {
    const studioId = parseInt(req.params.id);
    const studio = await req.db.get('SELECT * FROM studios WHERE id = ?', [studioId]);
    
    if (!studio) {
      return res.status(404).render('error', { 
        error: 'Studio not found',
        status: 404 
      });
    }

    res.render('admin/studio-form', {
      title: 'Edit Studio - Admin - Gallery Suite',
      studio: studio,
      isEdit: true
    });
  } catch (error) {
    console.error('Studio edit form error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load studio',
      status: 500 
    });
  }
});

router.post('/studios/:id', requireAuth, upload.single('logo'), async (req, res) => {
  try {
    const studioId = parseInt(req.params.id);
    const studio = await req.db.get('SELECT * FROM studios WHERE id = ?', [studioId]);
    
    if (!studio) {
      return res.status(404).render('error', { 
        error: 'Studio not found',
        status: 404 
      });
    }

    const { name, description, website_url, location, established_date } = req.body;
    const slug = createSlug(name);

    let logoPath = studio.logo_path;
    let logoThumbPath = studio.logo_thumb_path;

    if (req.file) {
      const logoDir = path.join(__dirname, '../uploads/studios');
      await fs.ensureDir(logoDir);

      logoPath = `uploads/studios/${slug}-logo${path.extname(req.file.originalname)}`;
      logoThumbPath = `uploads/studios/${slug}-logo-thumb.webp`;

      // Move and process logo
      await fs.move(req.file.path, path.join(__dirname, '..', logoPath));
      
      // Create thumbnail
      await sharp(path.join(__dirname, '..', logoPath))
        .resize(200, 200, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(path.join(__dirname, '..', logoThumbPath));
    }

    await req.db.run(`
      UPDATE studios 
      SET name = ?, slug = ?, description = ?, logo_path = ?, logo_thumb_path = ?, 
          website_url = ?, location = ?, established_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, slug, description, logoPath, logoThumbPath, website_url, location, established_date, studioId]);

    res.redirect('/admin/studios');
  } catch (error) {
    console.error('Studio update error:', error);
    res.status(500).render('error', { 
      error: 'Failed to update studio',
      status: 500 
    });
  }
});

// Models management
router.get('/models', requireAuth, async (req, res) => {
  try {
    const models = await req.db.getModels();
    const studios = await req.db.all('SELECT * FROM studios ORDER BY name');
    res.render('admin/models', {
      title: 'Manage Models - Admin - Gallery Suite',
      models: models,
      studios: studios,
      selectedStudio: null
    });
  } catch (error) {
    console.error('Models management error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load models',
      status: 500 
    });
  }
});

router.get('/models/new', requireAuth, async (req, res) => {
  try {
    const studios = await req.db.all('SELECT * FROM studios ORDER BY name');
    res.render('admin/model-form', {
      title: 'Add New Model - Admin - Gallery Suite',
      model: {},
      studios: studios,
      isEdit: false
    });
  } catch (error) {
    console.error('Model form error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load form',
      status: 500 
    });
  }
});

router.post('/models', requireAuth, upload.single('profile_image'), async (req, res) => {
  try {
    const { name, description, studio_id, age, measurements, height, 
            eye_color, hair_color, nationality, instagram_url, twitter_url, website_url } = req.body;
    const slug = createSlug(name);

    let profileImagePath = null;
    let profileThumbPath = null;

    if (req.file) {
      const modelsDir = path.join(__dirname, '../uploads/models');
      await fs.ensureDir(modelsDir);

      profileImagePath = `uploads/models/${slug}-profile${path.extname(req.file.originalname)}`;
      profileThumbPath = `uploads/models/${slug}-profile-thumb.webp`;

      // Move and process profile image
      await fs.move(req.file.path, path.join(__dirname, '..', profileImagePath));
      
      // Create thumbnail
      await sharp(path.join(__dirname, '..', profileImagePath))
        .resize(300, 400, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(path.join(__dirname, '..', profileThumbPath));
    }

    const modelId = await req.db.createModel({
      name, slug, description, 
      studio_id: studio_id || null,
      profile_image_path: profileImagePath,
      profile_thumb_path: profileThumbPath,
      age: age || null,
      measurements, height, eye_color, hair_color, nationality,
      instagram_url, twitter_url, website_url,
      active: true
    });

    res.redirect('/admin/models');
  } catch (error) {
    console.error('Model creation error:', error);
    res.status(500).render('error', { 
      error: 'Failed to create model',
      status: 500 
    });
  }
});

// Model edit routes
router.get('/models/:id/edit', requireAuth, async (req, res) => {
  try {
    const modelId = parseInt(req.params.id);
    const model = await req.db.get('SELECT * FROM models WHERE id = ?', [modelId]);
    
    if (!model) {
      return res.status(404).render('error', { 
        error: 'Model not found',
        status: 404 
      });
    }

    const studios = await req.db.all('SELECT * FROM studios ORDER BY name');
    res.render('admin/model-form', {
      title: 'Edit Model - Admin - Gallery Suite',
      model: model,
      studios: studios,
      isEdit: true
    });
  } catch (error) {
    console.error('Model edit form error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load model',
      status: 500 
    });
  }
});

router.post('/models/:id', requireAuth, upload.single('profile_image'), async (req, res) => {
  try {
    const modelId = parseInt(req.params.id);
    const model = await req.db.get('SELECT * FROM models WHERE id = ?', [modelId]);
    
    if (!model) {
      return res.status(404).render('error', { 
        error: 'Model not found',
        status: 404 
      });
    }

    const { name, description, studio_id, age, measurements, height, 
            eye_color, hair_color, nationality, instagram_url, twitter_url, website_url, active } = req.body;
    const slug = createSlug(name);

    let profileImagePath = model.profile_image_path;
    let profileThumbPath = model.profile_thumb_path;

    if (req.file) {
      const modelsDir = path.join(__dirname, '../uploads/models');
      await fs.ensureDir(modelsDir);

      profileImagePath = `uploads/models/${slug}-profile${path.extname(req.file.originalname)}`;
      profileThumbPath = `uploads/models/${slug}-profile-thumb.webp`;

      // Move and process profile image
      await fs.move(req.file.path, path.join(__dirname, '..', profileImagePath));
      
      // Create thumbnail
      await sharp(path.join(__dirname, '..', profileImagePath))
        .resize(300, 400, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(path.join(__dirname, '..', profileThumbPath));
    }

    await req.db.run(`
      UPDATE models 
      SET name = ?, slug = ?, description = ?, studio_id = ?, profile_image_path = ?, profile_thumb_path = ?, 
          age = ?, measurements = ?, height = ?, eye_color = ?, hair_color = ?, nationality = ?,
          instagram_url = ?, twitter_url = ?, website_url = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, slug, description, studio_id || null, profileImagePath, profileThumbPath, 
        age || null, measurements, height, eye_color, hair_color, nationality,
        instagram_url, twitter_url, website_url, active ? 1 : 0, modelId]);

    res.redirect('/admin/models');
  } catch (error) {
    console.error('Model update error:', error);
    res.status(500).render('error', { 
      error: 'Failed to update model',
      status: 500 
    });
  }
});

// Sets management
router.get('/sets', requireAuth, async (req, res) => {
  try {
    const sets = await req.db.getSets();
    res.render('admin/sets', {
      title: 'Manage Sets - Admin - Gallery Suite',
      sets: sets
    });
  } catch (error) {
    console.error('Sets management error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load sets',
      status: 500 
    });
  }
});

router.get('/sets/new', requireAuth, async (req, res) => {
  try {
    const models = await req.db.all(`
      SELECT m.*, COALESCE(s.name, 'One-Shot Studio') as studio_name 
      FROM models m 
      LEFT JOIN studios s ON m.studio_id = s.id 
      ORDER BY m.name
    `);
    res.render('admin/set-form', {
      title: 'Add New Set - Admin - Gallery Suite',
      set: {},
      models: models,
      isEdit: false
    });
  } catch (error) {
    console.error('Set form error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load form',
      status: 500 
    });
  }
});

router.post('/sets', requireAuth, upload.single('cover_image'), async (req, res) => {
  try {
    const { name, description, model_id, release_date, location, 
            photographer, outfit_description, theme } = req.body;
    const slug = createSlug(name);

    let coverImagePath = null;
    let coverThumbPath = null;

    if (req.file) {
      const setsDir = path.join(__dirname, '../uploads/sets');
      await fs.ensureDir(setsDir);

      coverImagePath = `uploads/sets/${slug}-cover${path.extname(req.file.originalname)}`;
      coverThumbPath = `uploads/sets/${slug}-cover-thumb.webp`;

      // Move and process cover image
      await fs.move(req.file.path, path.join(__dirname, '..', coverImagePath));
      
      // Create thumbnail
      await sharp(path.join(__dirname, '..', coverImagePath))
        .resize(400, 300, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(path.join(__dirname, '..', coverThumbPath));
    }

    const setId = await req.db.createSet({
      name, slug, description, model_id,
      release_date, location, photographer, outfit_description, theme,
      cover_image_path: coverImagePath,
      cover_thumb_path: coverThumbPath
    });

    res.redirect(`/admin/sets/${setId}/upload`);
  } catch (error) {
    console.error('Set creation error:', error);
    res.status(500).render('error', { 
      error: 'Failed to create set',
      status: 500 
    });
  }
});

// Set edit routes
router.get('/sets/:id/edit', requireAuth, async (req, res) => {
  try {
    const setId = parseInt(req.params.id);
    const set = await req.db.get('SELECT * FROM sets WHERE id = ?', [setId]);
    
    if (!set) {
      return res.status(404).render('error', { 
        error: 'Set not found',
        status: 404 
      });
    }

    const models = await req.db.all(`
      SELECT m.*, COALESCE(s.name, 'One-Shot Studio') as studio_name 
      FROM models m 
      LEFT JOIN studios s ON m.studio_id = s.id 
      WHERE m.active = 1 OR m.active IS NULL
      ORDER BY m.name
    `);

    res.render('admin/set-form', {
      title: 'Edit Set - Admin - Gallery Suite',
      set: set,
      models: models,
      isEdit: true
    });
  } catch (error) {
    console.error('Set edit form error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load set',
      status: 500 
    });
  }
});

router.post('/sets/:id', requireAuth, upload.single('cover_image'), async (req, res) => {
  try {
    const setId = parseInt(req.params.id);
    const set = await req.db.get('SELECT * FROM sets WHERE id = ?', [setId]);
    
    if (!set) {
      return res.status(404).render('error', { 
        error: 'Set not found',
        status: 404 
      });
    }

    const { name, description, model_id, release_date, location, 
            photographer, outfit_description, theme } = req.body;
    const slug = createSlug(name);

    let coverImagePath = set.cover_image_path;
    let coverThumbPath = set.cover_thumb_path;

    if (req.file) {
      const setsDir = path.join(__dirname, '../uploads/sets');
      await fs.ensureDir(setsDir);

      coverImagePath = `uploads/sets/${slug}-cover${path.extname(req.file.originalname)}`;
      coverThumbPath = `uploads/sets/${slug}-cover-thumb.webp`;

      // Move and process cover image
      await fs.move(req.file.path, path.join(__dirname, '..', coverImagePath));
      
      // Create thumbnail
      await sharp(path.join(__dirname, '..', coverImagePath))
        .resize(400, 300, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(path.join(__dirname, '..', coverThumbPath));
    }

    await req.db.run(`
      UPDATE sets 
      SET name = ?, slug = ?, description = ?, model_id = ?, release_date = ?, location = ?, 
          photographer = ?, outfit_description = ?, theme = ?, cover_image_path = ?, cover_thumb_path = ?, 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, slug, description, model_id, release_date, location, 
        photographer, outfit_description, theme, coverImagePath, coverThumbPath, setId]);

    res.redirect('/admin/sets');
  } catch (error) {
    console.error('Set update error:', error);
    res.status(500).render('error', { 
      error: 'Failed to update set',
      status: 500 
    });
  }
});

// Media upload page for sets
router.get('/sets/:id/upload', requireAuth, async (req, res) => {
  try {
    const set = await req.db.getSetBySlug(req.params.id) || 
                await req.db.get('SELECT * FROM sets WHERE id = ?', [req.params.id]);
    
    if (!set) {
      return res.status(404).render('404', { url: req.url });
    }

    res.render('admin/media-upload', {
      title: `Upload Media - ${set.name} - Admin - Gallery Suite`,
      set: set
    });
  } catch (error) {
    console.error('Media upload page error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load upload page',
      status: 500 
    });
  }
});

// Handle bulk media upload
router.post('/sets/:id/upload', requireAuth, upload.array('media', 1000), async (req, res) => {
  try {
    const setId = parseInt(req.params.id);
    const set = await req.db.get('SELECT * FROM sets WHERE id = ?', [setId]);
    
    if (!set) {
      return res.status(404).json({ error: 'Set not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const mediaDir = path.join(__dirname, '../uploads/media', set.slug);
    const thumbsDir = path.join(__dirname, '../uploads/thumbs', set.slug);
    await fs.ensureDir(mediaDir);
    await fs.ensureDir(thumbsDir);

    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const fileExt = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, fileExt);
      const fileName = `${baseName}${fileExt}`;
      
      const finalPath = path.join(mediaDir, fileName);
      const relativePath = `uploads/media/${set.slug}/${fileName}`;
      const thumbPath = `uploads/thumbs/${set.slug}/${baseName}.webp`;

      // Move file to final location
      await fs.move(file.path, finalPath);

      // Determine file type
      const fileType = file.mimetype.startsWith('video/') ? 'video' : 'image';
      
      let width = null, height = null, duration = null;

      try {
        if (fileType === 'image') {
          // Get image dimensions and create thumbnail
          const metadata = await sharp(finalPath).metadata();
          width = metadata.width;
          height = metadata.height;

          // Create WebP thumbnail
          await sharp(finalPath)
            .resize(400, 300, { fit: 'cover', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(path.join(__dirname, '..', thumbPath));
        } else {
          // For videos, create a placeholder thumbnail
          // In a real implementation, you'd use ffmpeg to extract a frame
          const placeholderThumb = path.join(__dirname, '../public/images/video-placeholder.png');
          if (await fs.pathExists(placeholderThumb)) {
            await fs.copy(placeholderThumb, path.join(__dirname, '..', thumbPath));
          }
        }
      } catch (thumbError) {
        console.warn('Thumbnail creation failed:', thumbError);
      }

      // Get file stats
      const stats = await fs.stat(finalPath);

      // Save to database
      const mediaId = await req.db.createMedia({
        set_id: setId,
        filename: fileName,
        original_path: relativePath,
        display_path: relativePath,
        thumb_path: thumbPath,
        file_type: fileType,
        mime_type: file.mimetype,
        filesize: stats.size,
        width: width,
        height: height,
        duration: duration,
        sort_order: i,
        hash: null // TODO: Implement hash calculation for duplicate detection
      });

      results.push({
        id: mediaId,
        filename: fileName,
        size: stats.size,
        type: fileType
      });
    }

    // Update set statistics
    await req.db.updateSetStats(setId);

    res.json({
      success: true,
      uploaded: results.length,
      files: results
    });

  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

module.exports = router;