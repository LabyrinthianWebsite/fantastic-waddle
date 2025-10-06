const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const slugify = require('slugify');
const sharp = require('sharp');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const StreamZip = require('node-stream-zip');
const VideoProcessor = require('../middleware/videoProcessor');
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
    files: 5000 // Maximum 5000 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Accept images and videos
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
      'image/avif', 'image/heif', 'image/heic', 'image/jxl',
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

// Separate multer configuration for ZIP uploads
const zipUpload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 * 1024, // 50GB limit per file
    files: 1 // Only one ZIP file at a time
  },
  fileFilter: (req, file, cb) => {
    // Accept ZIP files only
    const allowedMimes = ['application/zip', 'application/x-zip-compressed'];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only ZIP files are allowed for bulk upload`), false);
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
    const studioId = req.query.studio ? parseInt(req.query.studio) : null;
    const search = req.query.search || null;
    const page = parseInt(req.query.page) || 1;
    const perPage = 12; // Number of models per page
    const offset = (page - 1) * perPage;
    
    const totalModels = await req.db.getModelsCount(studioId, search);
    const totalPages = Math.ceil(totalModels / perPage);
    const models = await req.db.getModels(studioId, { limit: perPage, offset, search });
    const studios = await req.db.all('SELECT * FROM studios ORDER BY name');
    
    res.render('admin/models', {
      title: 'Manage Models - Admin - Gallery Suite',
      models: models,
      studios: studios,
      selectedStudio: studioId,
      search: search || '',
      currentPage: page,
      totalPages: totalPages,
      totalModels: totalModels
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
    const modelId = req.query.model ? parseInt(req.query.model) : null;
    const search = req.query.search || null;
    const page = parseInt(req.query.page) || 1;
    const perPage = 12; // Number of sets per page
    const offset = (page - 1) * perPage;
    
    const totalSets = await req.db.getSetsCount(modelId, search);
    const totalPages = Math.ceil(totalSets / perPage);
    const sets = await req.db.getSets(modelId, { limit: perPage, offset, search });
    const models = await req.db.all(`
      SELECT m.*, COALESCE(s.name, 'One-Shot Studio') as studio_name 
      FROM models m 
      LEFT JOIN studios s ON m.studio_id = s.id 
      ORDER BY m.name
    `);
    
    res.render('admin/sets', {
      title: 'Manage Sets - Admin - Gallery Suite',
      sets: sets,
      models: models,
      selectedModel: modelId,
      search: search || '',
      currentPage: page,
      totalPages: totalPages,
      totalSets: totalSets
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
router.post('/sets/:id/upload', requireAuth, upload.array('media', 5000), async (req, res) => {
  try {
    const setId = parseInt(req.params.id);
    
    // Get set with studio information for proper directory structure
    const set = await req.db.getSetBySlug(req.params.id) || 
                await req.db.get(`
                  SELECT s.*, 
                         m.name as model_name,
                         m.slug as model_slug,
                         st.name as studio_name,
                         st.slug as studio_slug
                  FROM sets s
                  JOIN models m ON s.model_id = m.id
                  LEFT JOIN studios st ON m.studio_id = st.id
                  WHERE s.id = ?
                `, [setId]);
    
    if (!set) {
      return res.status(404).json({ error: 'Set not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Create hierarchical directory structure: /[Studio Name]/[Set Name]/
    const studioName = set.studio_name || 'Independent';
    const studioSlug = set.studio_slug || 'independent';
    const mediaDir = path.join(__dirname, '../uploads/media', studioSlug, set.slug);
    const thumbsDir = path.join(__dirname, '../uploads/thumbs', studioSlug, set.slug);
    await fs.ensureDir(mediaDir);
    await fs.ensureDir(thumbsDir);

    const results = [];
    const skippedDuplicates = [];
    let processedCount = 0;

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const fileExt = path.extname(file.originalname);
      const originalBaseName = path.basename(file.originalname, fileExt);
      
      // Determine file type
      const fileType = file.mimetype.startsWith('video/') ? 'video' : 'image';
      
      let fileHash = null;
      let width = null, height = null, duration = null;

      try {
        // Generate hash for duplicate detection
        if (fileType === 'image') {
          fileHash = await req.imageProcessor.extractImageMetadata(file.path).then(metadata => metadata.perceptualHash);
          
          // Get image dimensions
          const metadata = await sharp(file.path).metadata();
          width = metadata.width;
          height = metadata.height;
        } else {
          // For videos, extract metadata and create content hash
          try {
            const videoMeta = await req.videoProcessor.getVideoMetadata(file.path);
            width = videoMeta.width;
            height = videoMeta.height;
            duration = videoMeta.duration;
            console.log('Video metadata extracted:', { width, height, duration });
          } catch (videoMetaError) {
            console.warn('Failed to extract video metadata:', videoMetaError.message);
          }
          
          // Create a simple content hash for videos
          const crypto = require('crypto');
          const fileBuffer = await fs.readFile(file.path);
          fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        }

        // Check for duplicate hash in the database
        const existingMedia = await req.db.get(
          'SELECT id, filename FROM media WHERE set_id = ? AND hash = ?',
          [setId, fileHash]
        );

        if (existingMedia) {
          // Skip duplicate file
          skippedDuplicates.push({
            originalName: file.originalname,
            existingFilename: existingMedia.filename,
            hash: fileHash
          });
          
          // Clean up temporary file
          await fs.remove(file.path);
          continue;
        }

        // Generate unique filename using hash suffix
        const hashSuffix = fileHash.substring(0, 8);
        const fileName = `${originalBaseName}_${hashSuffix}${fileExt}`;
        
        const finalPath = path.join(mediaDir, fileName);
        const relativePath = `uploads/media/${studioSlug}/${set.slug}/${fileName}`;
        const thumbPath = `uploads/thumbs/${studioSlug}/${set.slug}/${originalBaseName}_${hashSuffix}.webp`;

        // Move file to final location
        await fs.move(file.path, finalPath);

        try {
          if (fileType === 'image') {
            // Create WebP thumbnail
            await sharp(finalPath)
              .resize(400, 300, { fit: 'cover', withoutEnlargement: true })
              .webp({ quality: 80 })
              .toFile(path.join(__dirname, '..', thumbPath));
          } else {
            // For videos, extract thumbnail using FFmpeg
            try {
              const fullThumbPath = path.join(__dirname, '..', thumbPath);
              await req.videoProcessor.extractThumbnail(finalPath, fullThumbPath, {
                width: 400,
                height: 300,
                quality: 80
              });
              console.log('Video thumbnail generated successfully');
            } catch (videoError) {
              console.warn('Video thumbnail generation failed, using placeholder:', videoError.message);
              // Fallback to placeholder if video processing fails
              const placeholderThumb = path.join(__dirname, '../public/images/video-placeholder.svg');
              if (await fs.pathExists(placeholderThumb)) {
                // Convert SVG placeholder to WebP for consistency
                await sharp(placeholderThumb)
                  .resize(400, 300, { fit: 'cover' })
                  .webp({ quality: 80 })
                  .toFile(path.join(__dirname, '..', thumbPath));
              }
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
          sort_order: processedCount,
          hash: fileHash
        });

        // Auto-generate thumbnails for related entities
        try {
          await req.autoThumbnailService.updateEntityThumbnails(req.db, req.videoProcessor, {
            id: mediaId,
            set_id: setId,
            filename: fileName,
            display_path: relativePath,
            thumb_path: thumbPath,
            file_type: fileType,
            mime_type: file.mimetype
          });
        } catch (thumbnailError) {
          console.warn('Auto-thumbnail generation failed:', thumbnailError.message);
        }

        results.push({
          id: mediaId,
          filename: fileName,
          originalName: file.originalname,
          size: stats.size,
          type: fileType,
          hash: fileHash
        });

        processedCount++;

      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        // Clean up temporary file on error
        try {
          await fs.remove(file.path);
        } catch (cleanupError) {
          console.warn('Failed to clean up temporary file:', cleanupError);
        }
      }
    }

    // Update set statistics
    await req.db.updateSetStats(setId);

    res.json({
      success: true,
      uploaded: results.length,
      skipped: skippedDuplicates.length,
      total: req.files.length,
      files: results,
      duplicates: skippedDuplicates
    });

  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

// ZIP Upload page for models
router.get('/models/:id/upload-zip', requireAuth, async (req, res) => {
  try {
    const modelId = parseInt(req.params.id);
    const model = await req.db.getModelById(modelId);
    
    if (!model) {
      return res.status(404).render('error', { 
        error: 'Model not found',
        status: 404 
      });
    }

    res.render('admin/zip-upload', {
      title: `Upload ZIP Sets - ${model.name} - Admin - Gallery Suite`,
      model: model
    });
  } catch (error) {
    console.error('ZIP upload page error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load ZIP upload page',
      status: 500 
    });
  }
});

// ZIP Upload route for models
router.post('/models/:id/upload-zip', requireAuth, zipUpload.single('zipfile'), async (req, res) => {
  let zip = null; // Declare zip variable for cleanup in error handler
  
  try {
    const modelId = parseInt(req.params.id);
    
    // Get model information
    const model = await req.db.getModelById(modelId);
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No ZIP file uploaded' });
    }

    // Validate it's a ZIP file
    if (!req.file.originalname.toLowerCase().endsWith('.zip')) {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'File must be a ZIP archive' });
    }

    console.log(`Processing ZIP upload for model ${model.name}: ${req.file.originalname}`);

    // Read the ZIP file using streaming approach to handle large files (>2GB)
    zip = new StreamZip.async({ file: req.file.path });
    const entries = await zip.entries();

    // Process ZIP structure to identify sets and files
    const setStructure = {};
    const results = {
      setsCreated: 0,
      filesProcessed: 0,
      errors: [],
      sets: []
    };

    // First pass: analyze ZIP structure
    for (const entry of Object.values(entries)) {
      if (entry.isDirectory) continue; // Skip directories

      const relativePath = entry.name;
      const pathParts = relativePath.split('/').filter(part => part.length > 0);
      if (pathParts.length < 2) {
        results.errors.push(`Skipping file "${relativePath}" - not in a set folder`);
        continue;
      }

      // If there's a root directory in the ZIP, skip it and use the next level as the set name
      let setName = pathParts[0];
      let fileName = pathParts[pathParts.length - 1];
      
      // If this looks like it might be a root container directory and we have deeper structure
      if (pathParts.length >= 3) {
        // Use the second level as the set name (skip the root folder)
        setName = pathParts[1];
      }

      // Check if it's an image file
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.avif', '.heif', '.heic', '.jxl'];
      const fileExt = path.extname(fileName).toLowerCase();
      
      if (!validExtensions.includes(fileExt)) {
        results.errors.push(`Skipping file "${relativePath}" - not a supported image format`);
        continue;
      }

      if (!setStructure[setName]) {
        setStructure[setName] = [];
      }
      setStructure[setName].push({
        name: fileName,
        path: relativePath,
        entry: entry
      });
    }

    console.log(`Found ${Object.keys(setStructure).length} sets in ZIP:`, Object.keys(setStructure));

    // Process each set
    for (const [setName, files] of Object.entries(setStructure)) {
      try {
        console.log(`Processing set "${setName}" with ${files.length} files`);
        
        // Create the set
        const setSlug = createSlug(setName);
        const setData = {
          name: setName,
          slug: setSlug,
          description: `Uploaded from ZIP file: ${req.file.originalname}`,
          model_id: modelId,
          release_date: new Date().toISOString().split('T')[0],
          location: null,
          photographer: null,
          outfit_description: null,
          theme: null,
          cover_image_path: null,
          cover_thumb_path: null
        };

        const setId = await req.db.createSet(setData);
        console.log(`Created set "${setName}" with ID ${setId}`);

        // Create directory structure for this set
        const studioSlug = model.studio_slug || 'independent';
        const mediaDir = path.join(__dirname, '../uploads/media', studioSlug, setSlug);
        const thumbsDir = path.join(__dirname, '../uploads/thumbs', studioSlug, setSlug);
        await fs.ensureDir(mediaDir);
        await fs.ensureDir(thumbsDir);

        let processedFiles = 0;
        let firstImagePath = null;
        let firstImageThumbPath = null;

        // Process each file in the set
        for (let i = 0; i < files.length; i++) {
          const fileInfo = files[i];
          
          try {
            // Extract file from ZIP
            const fileBuffer = await zip.entryData(fileInfo.path);
            
            // Generate unique filename using hash
            const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
            const hashSuffix = fileHash.substring(0, 8);
            const fileExt = path.extname(fileInfo.name);
            const baseName = path.basename(fileInfo.name, fileExt);
            const uniqueFileName = `${baseName}_${hashSuffix}${fileExt}`;
            
            // Check for duplicate hash in the database
            const existingMedia = await req.db.get(
              'SELECT id, filename FROM media WHERE set_id = ? AND hash = ?',
              [setId, fileHash]
            );

            if (existingMedia) {
              console.log(`Skipping duplicate file: ${fileInfo.name}`);
              continue;
            }

            // Save file to disk
            const finalPath = path.join(mediaDir, uniqueFileName);
            const relativePath = `uploads/media/${studioSlug}/${setSlug}/${uniqueFileName}`;
            const thumbPath = `uploads/thumbs/${studioSlug}/${setSlug}/${baseName}_${hashSuffix}.webp`;
            
            await fs.writeFile(finalPath, fileBuffer);

            // Get image dimensions and create thumbnail
            let width = null, height = null;
            try {
              const metadata = await sharp(finalPath).metadata();
              width = metadata.width;
              height = metadata.height;

              // Create WebP thumbnail
              await sharp(finalPath)
                .resize(400, 300, { fit: 'cover', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(path.join(__dirname, '..', thumbPath));

              // Remember the first image for set cover
              if (!firstImagePath) {
                firstImagePath = relativePath;
                firstImageThumbPath = thumbPath;
              }

            } catch (imageError) {
              console.warn(`Failed to process image ${fileInfo.name}:`, imageError.message);
            }

            // Get file stats
            const stats = await fs.stat(finalPath);

            // Save to database
            const mediaId = await req.db.createMedia({
              set_id: setId,
              filename: uniqueFileName,
              original_path: relativePath,
              display_path: relativePath,
              thumb_path: thumbPath,
              file_type: 'image',
              mime_type: `image/${fileExt.substring(1)}`,
              filesize: stats.size,
              width: width,
              height: height,
              duration: null,
              sort_order: processedFiles,
              hash: fileHash
            });

            processedFiles++;
            results.filesProcessed++;

            console.log(`Processed file ${fileInfo.name} as ${uniqueFileName}`);

          } catch (fileError) {
            console.error(`Error processing file ${fileInfo.name}:`, fileError);
            results.errors.push(`Failed to process "${fileInfo.name}": ${fileError.message}`);
          }
        }

        // Update set with cover image from first uploaded image
        if (firstImagePath && firstImageThumbPath) {
          await req.db.run(`
            UPDATE sets 
            SET cover_image_path = ?, cover_thumb_path = ?
            WHERE id = ?
          `, [firstImagePath, firstImageThumbPath, setId]);
        }

        // Update set statistics
        await req.db.updateSetStats(setId);

        results.setsCreated++;
        results.sets.push({
          name: setName,
          id: setId,
          slug: setSlug,
          filesProcessed: processedFiles
        });

        console.log(`Completed processing set "${setName}" with ${processedFiles} files`);

      } catch (setError) {
        console.error(`Error processing set ${setName}:`, setError);
        results.errors.push(`Failed to process set "${setName}": ${setError.message}`);
      }
    }

    // Close the ZIP file
    await zip.close();

    // Clean up uploaded ZIP file
    await fs.remove(req.file.path);

    console.log(`ZIP processing complete. Created ${results.setsCreated} sets with ${results.filesProcessed} files`);

    res.json({
      success: true,
      message: `Successfully processed ZIP file`,
      ...results
    });

  } catch (error) {
    console.error('ZIP upload error:', error);
    
    // Clean up ZIP handle if it was opened
    if (zip) {
      try {
        await zip.close();
      } catch (zipCleanupError) {
        console.warn('Failed to close ZIP file:', zipCleanupError);
      }
    }
    
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        await fs.remove(req.file.path);
      } catch (cleanupError) {
        console.warn('Failed to clean up uploaded file:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      error: 'ZIP upload failed', 
      details: error.message 
    });
  }
});

// DELETE Routes for Studios, Models, and Sets

// Delete Studio
router.delete('/studios/:id', requireAuth, async (req, res) => {
  try {
    const studioId = parseInt(req.params.id);
    
    // Check if studio exists
    const studio = await req.db.get('SELECT * FROM studios WHERE id = ?', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    // Get all models and sets associated with this studio for cleanup
    const models = await req.db.all('SELECT * FROM models WHERE studio_id = ?', [studioId]);
    
    // Delete all media files for sets associated with models in this studio
    for (const model of models) {
      const sets = await req.db.all('SELECT * FROM sets WHERE model_id = ?', [model.id]);
      for (const set of sets) {
        // Delete media files
        const media = await req.db.all('SELECT * FROM media WHERE set_id = ?', [set.id]);
        for (const item of media) {
          try {
            const fullPath = path.join(__dirname, '..', item.original_path);
            const thumbPath = path.join(__dirname, '..', item.thumb_path);
            await fs.remove(fullPath);
            await fs.remove(thumbPath);
          } catch (fileError) {
            console.warn('File deletion error:', fileError);
          }
        }
        // Delete media records
        await req.db.run('DELETE FROM media WHERE set_id = ?', [set.id]);
      }
      // Delete sets
      await req.db.run('DELETE FROM sets WHERE model_id = ?', [model.id]);
    }

    // Delete models
    await req.db.run('DELETE FROM models WHERE studio_id = ?', [studioId]);

    // Delete studio logo files
    if (studio.logo_path) {
      try {
        await fs.remove(path.join(__dirname, '..', studio.logo_path));
      } catch (fileError) {
        console.warn('Logo file deletion error:', fileError);
      }
    }
    if (studio.logo_thumb_path) {
      try {
        await fs.remove(path.join(__dirname, '..', studio.logo_thumb_path));
      } catch (fileError) {
        console.warn('Logo thumb deletion error:', fileError);
      }
    }

    // Delete studio record
    await req.db.run('DELETE FROM studios WHERE id = ?', [studioId]);

    res.json({ success: true, message: 'Studio deleted successfully' });
  } catch (error) {
    console.error('Studio deletion error:', error);
    res.status(500).json({ error: 'Failed to delete studio' });
  }
});

// Delete Model
router.delete('/models/:id', requireAuth, async (req, res) => {
  try {
    const modelId = parseInt(req.params.id);
    
    // Check if model exists
    const model = await req.db.get('SELECT * FROM models WHERE id = ?', [modelId]);
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    // Get all sets associated with this model for cleanup
    const sets = await req.db.all('SELECT * FROM sets WHERE model_id = ?', [modelId]);
    
    // Delete all media files for sets associated with this model
    for (const set of sets) {
      const media = await req.db.all('SELECT * FROM media WHERE set_id = ?', [set.id]);
      for (const item of media) {
        try {
          const fullPath = path.join(__dirname, '..', item.original_path);
          const thumbPath = path.join(__dirname, '..', item.thumb_path);
          await fs.remove(fullPath);
          await fs.remove(thumbPath);
        } catch (fileError) {
          console.warn('File deletion error:', fileError);
        }
      }
      // Delete media records
      await req.db.run('DELETE FROM media WHERE set_id = ?', [set.id]);
    }

    // Delete sets
    await req.db.run('DELETE FROM sets WHERE model_id = ?', [modelId]);

    // Delete model profile image files
    if (model.profile_image_path) {
      try {
        await fs.remove(path.join(__dirname, '..', model.profile_image_path));
      } catch (fileError) {
        console.warn('Profile image deletion error:', fileError);
      }
    }
    if (model.profile_thumb_path) {
      try {
        await fs.remove(path.join(__dirname, '..', model.profile_thumb_path));
      } catch (fileError) {
        console.warn('Profile thumb deletion error:', fileError);
      }
    }

    // Delete model record
    await req.db.run('DELETE FROM models WHERE id = ?', [modelId]);

    res.json({ success: true, message: 'Model deleted successfully' });
  } catch (error) {
    console.error('Model deletion error:', error);
    res.status(500).json({ error: 'Failed to delete model' });
  }
});

// Delete Set
router.delete('/sets/:id', requireAuth, async (req, res) => {
  try {
    const setId = parseInt(req.params.id);
    
    // Check if set exists
    const set = await req.db.get('SELECT * FROM sets WHERE id = ?', [setId]);
    if (!set) {
      return res.status(404).json({ error: 'Set not found' });
    }

    // Delete all media files associated with this set
    const media = await req.db.all('SELECT * FROM media WHERE set_id = ?', [setId]);
    for (const item of media) {
      try {
        const fullPath = path.join(__dirname, '..', item.original_path);
        const thumbPath = path.join(__dirname, '..', item.thumb_path);
        await fs.remove(fullPath);
        await fs.remove(thumbPath);
      } catch (fileError) {
        console.warn('File deletion error:', fileError);
      }
    }

    // Delete media records
    await req.db.run('DELETE FROM media WHERE set_id = ?', [setId]);

    // Delete set cover image files
    if (set.cover_image_path) {
      try {
        await fs.remove(path.join(__dirname, '..', set.cover_image_path));
      } catch (fileError) {
        console.warn('Cover image deletion error:', fileError);
      }
    }
    if (set.cover_thumb_path) {
      try {
        await fs.remove(path.join(__dirname, '..', set.cover_thumb_path));
      } catch (fileError) {
        console.warn('Cover thumb deletion error:', fileError);
      }
    }

    // Delete set record
    await req.db.run('DELETE FROM sets WHERE id = ?', [setId]);

    res.json({ success: true, message: 'Set deleted successfully' });
  } catch (error) {
    console.error('Set deletion error:', error);
    res.status(500).json({ error: 'Failed to delete set' });
  }
});

module.exports = router;