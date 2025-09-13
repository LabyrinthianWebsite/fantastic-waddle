const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const slugify = require('slugify');
const router = express.Router();

// Utility function to create slug
function createSlug(text) {
  return slugify(text, { lower: true, strict: true });
}

// Home page - Gallery overview
router.get('/', async (req, res) => {
  try {
    const studios = await req.db.getStudios();
    const models = await req.db.getModels();
    const recentSets = await req.db.all(`
      SELECT s.*, 
             m.name as model_name,
             m.slug as model_slug,
             st.name as studio_name,
             st.slug as studio_slug
      FROM sets s
      JOIN models m ON s.model_id = m.id
      LEFT JOIN studios st ON m.studio_id = st.id
      ORDER BY s.created_at DESC
      LIMIT 12
    `);

    const stats = {
      studios: studios.length,
      models: models.length,
      sets: await req.db.get('SELECT COUNT(*) as count FROM sets'),
      media: await req.db.get('SELECT COUNT(*) as count FROM media')
    };

    res.render('gallery/home', {
      title: 'Gallery Suite',
      studios: studios,
      models: models.slice(0, 8), // Show top 8 models
      recentSets: recentSets,
      stats: stats
    });
  } catch (error) {
    console.error('Error loading home page:', error);
    res.status(500).render('error', { 
      error: 'Failed to load gallery homepage',
      status: 500 
    });
  }
});

// Studios listing page
router.get('/studios', async (req, res) => {
  try {
    const studios = await req.db.getStudios();
    
    res.render('gallery/studios', {
      title: 'Studios - Gallery Suite',
      studios: studios
    });
  } catch (error) {
    console.error('Error loading studios:', error);
    res.status(500).render('error', { 
      error: 'Failed to load studios',
      status: 500 
    });
  }
});

// Studio detail page
router.get('/studios/:slug', async (req, res) => {
  try {
    const studio = await req.db.getStudioBySlug(req.params.slug);
    if (!studio) {
      return res.status(404).render('404', { url: req.url });
    }

    const models = await req.db.getModels(studio.id);
    
    res.render('gallery/studio-detail', {
      title: `${studio.name} - Studios - Gallery Suite`,
      studio: studio,
      models: models
    });
  } catch (error) {
    console.error('Error loading studio detail:', error);
    res.status(500).render('error', { 
      error: 'Failed to load studio details',
      status: 500 
    });
  }
});

// Models listing page
router.get('/models', async (req, res) => {
  try {
    const studioId = req.query.studio ? parseInt(req.query.studio) : null;
    const models = await req.db.getModels(studioId);
    const studios = await req.db.all('SELECT * FROM studios ORDER BY name');
    
    res.render('gallery/models', {
      title: 'Models - Gallery Suite',
      models: models,
      studios: studios,
      selectedStudio: studioId
    });
  } catch (error) {
    console.error('Error loading models:', error);
    res.status(500).render('error', { 
      error: 'Failed to load models',
      status: 500 
    });
  }
});

// Model detail page
router.get('/models/:slug', async (req, res) => {
  try {
    const model = await req.db.getModelBySlug(req.params.slug);
    if (!model) {
      return res.status(404).render('404', { url: req.url });
    }

    const sets = await req.db.getSets(model.id);
    
    res.render('gallery/model-detail', {
      title: `${model.name} - Models - Gallery Suite`,
      model: model,
      sets: sets
    });
  } catch (error) {
    console.error('Error loading model detail:', error);
    res.status(500).render('error', { 
      error: 'Failed to load model details',
      status: 500 
    });
  }
});

// Sets listing page
router.get('/sets', async (req, res) => {
  try {
    const modelId = req.query.model ? parseInt(req.query.model) : null;
    const sets = await req.db.getSets(modelId);
    const models = await req.db.all(`
      SELECT m.*, s.name as studio_name 
      FROM models m 
      LEFT JOIN studios s ON m.studio_id = s.id 
      ORDER BY m.name
    `);
    
    res.render('gallery/sets', {
      title: 'Sets - Gallery Suite',
      sets: sets,
      models: models,
      selectedModel: modelId
    });
  } catch (error) {
    console.error('Error loading sets:', error);
    res.status(500).render('error', { 
      error: 'Failed to load sets',
      status: 500 
    });
  }
});

// Set detail page
router.get('/sets/:slug', async (req, res) => {
  try {
    const set = await req.db.getSetBySlug(req.params.slug);
    if (!set) {
      return res.status(404).render('404', { url: req.url });
    }

    const media = await req.db.getMediaBySet(set.id);
    const tags = await req.db.all(`
      SELECT t.* FROM tags t
      JOIN set_tags st ON t.id = st.tag_id
      WHERE st.set_id = ?
    `, [set.id]);
    
    res.render('gallery/set-detail', {
      title: `${set.name} - Sets - Gallery Suite`,
      set: set,
      media: media,
      tags: tags
    });
  } catch (error) {
    console.error('Error loading set detail:', error);
    res.status(500).render('error', { 
      error: 'Failed to load set details',
      status: 500 
    });
  }
});

// Media detail/view page
router.get('/media/:id', async (req, res) => {
  try {
    const media = await req.db.get(`
      SELECT m.*, 
             s.name as set_name,
             s.slug as set_slug,
             mod.name as model_name,
             mod.slug as model_slug
      FROM media m
      JOIN sets s ON m.set_id = s.id
      JOIN models mod ON s.model_id = mod.id
      WHERE m.id = ?
    `, [req.params.id]);

    if (!media) {
      return res.status(404).render('404', { url: req.url });
    }

    // Get next and previous media in the same set
    const nextMedia = await req.db.get(`
      SELECT id, filename FROM media 
      WHERE set_id = ? AND sort_order > ? 
      ORDER BY sort_order LIMIT 1
    `, [media.set_id, media.sort_order]);

    const prevMedia = await req.db.get(`
      SELECT id, filename FROM media 
      WHERE set_id = ? AND sort_order < ? 
      ORDER BY sort_order DESC LIMIT 1
    `, [media.set_id, media.sort_order]);
    
    res.render('gallery/media-detail', {
      title: `${media.filename} - ${media.set_name} - Gallery Suite`,
      media: media,
      nextMedia: nextMedia,
      prevMedia: prevMedia
    });
  } catch (error) {
    console.error('Error loading media detail:', error);
    res.status(500).render('error', { 
      error: 'Failed to load media details',
      status: 500 
    });
  }
});

// Search functionality
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const results = {
      studios: [],
      models: [],
      sets: [],
      media: []
    };

    if (query.length >= 2) {
      const searchPattern = `%${query}%`;
      
      // Search studios
      results.studios = await req.db.all(`
        SELECT * FROM studios 
        WHERE name LIKE ? OR description LIKE ?
        ORDER BY name LIMIT 10
      `, [searchPattern, searchPattern]);

      // Search models
      results.models = await req.db.all(`
        SELECT m.*, s.name as studio_name FROM models m
        LEFT JOIN studios s ON m.studio_id = s.id
        WHERE m.name LIKE ? OR m.description LIKE ?
        ORDER BY m.name LIMIT 10
      `, [searchPattern, searchPattern]);

      // Search sets
      results.sets = await req.db.all(`
        SELECT s.*, m.name as model_name FROM sets s
        JOIN models m ON s.model_id = m.id
        WHERE s.name LIKE ? OR s.description LIKE ?
        ORDER BY s.name LIMIT 10
      `, [searchPattern, searchPattern]);
    }
    
    res.render('gallery/search', {
      title: `Search: ${query} - Gallery Suite`,
      query: query,
      results: results
    });
  } catch (error) {
    console.error('Error performing search:', error);
    res.status(500).render('error', { 
      error: 'Failed to perform search',
      status: 500 
    });
  }
});

module.exports = router;