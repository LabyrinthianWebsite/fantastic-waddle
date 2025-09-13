const express = require('express');
const router = express.Router();

// Suggestions endpoint for typeahead
router.get('/suggest', async (req, res) => {
  try {
    const { type, q = '', take = 10 } = req.query;
    
    let sql;
    let params = [`%${q}%`, parseInt(take)];

    switch (type) {
      case 'artist':
        sql = 'SELECT id, name FROM artists WHERE name LIKE ? ORDER BY name LIMIT ?';
        break;
      case 'tag':
        sql = 'SELECT id, name FROM tags WHERE name LIKE ? ORDER BY name LIMIT ?';
        break;
      case 'character':
        sql = 'SELECT id, name FROM characters WHERE name LIKE ? ORDER BY name LIMIT ?';
        break;
      default:
        return res.status(400).json({ error: 'Invalid type parameter' });
    }

    const results = await req.db.all(sql, params);
    res.json(results);

  } catch (error) {
    console.error('Error in suggest endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enhanced search endpoint with full-text search and caching
router.get('/search', async (req, res) => {
  try {
    const { type, q = '', limit = 20, offset = 0, sort = 'rank' } = req.query;
    
    // Generate cache key
    const cacheKey = req.cache.generateSearchKey(q, { type, limit, offset, sort });
    
    // Check cache first
    let results = req.cache.getSearchResult(cacheKey);
    if (results) {
      return res.json({ ...results, fromCache: true });
    }

    // Use full-text search for comprehensive queries
    if (q.length >= 2 && (type === 'all' || type === 'commissions')) {
      if (type === 'all') {
        results = await req.db.searchAll(q, { limit: parseInt(limit) });
      } else if (type === 'commissions') {
        results = await req.db.searchCommissions(q, { 
          limit: parseInt(limit), 
          offset: parseInt(offset),
          sortBy: sort 
        });
      }
    } else {
      // Fallback to original search for specific types or short queries
      results = await performLegacySearch(req, type, q, limit);
    }

    // Cache the results
    req.cache.setSearchResult(cacheKey, results);
    
    res.json({ ...results, fromCache: false });

  } catch (error) {
    console.error('Error in enhanced search endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Legacy search function for backwards compatibility
async function performLegacySearch(req, type, q, limit) {
  let sql;
  let params = [`%${q}%`, parseInt(limit)];

  switch (type) {
    case 'tags':
      sql = `
        SELECT t.*, COUNT(ct.commission_id) as commission_count
        FROM tags t
        LEFT JOIN commission_tags ct ON t.id = ct.tag_id
        WHERE t.name LIKE ?
        GROUP BY t.id, t.name, t.slug
        ORDER BY commission_count DESC, t.name
        LIMIT ?
      `;
      break;
    case 'characters':
      sql = `
        SELECT ch.*, COUNT(cc.commission_id) as commission_count
        FROM characters ch
        LEFT JOIN commission_characters cc ON ch.id = cc.character_id
        WHERE ch.name LIKE ?
        GROUP BY ch.id, ch.name, ch.slug
        ORDER BY commission_count DESC, ch.name
        LIMIT ?
      `;
      break;
    case 'collections':
      sql = `
        SELECT c.*, COUNT(co.id) as commission_count
        FROM collections c
        LEFT JOIN commissions co ON c.id = co.collection_id
        WHERE c.name LIKE ?
        GROUP BY c.id, c.name, c.slug
        ORDER BY commission_count DESC, c.name
        LIMIT ?
      `;
      break;
    default:
      return { results: [], total: 0 };
  }

  const results = await req.db.all(sql, params);
  
  // Format results for display
  const formattedResults = results.map(item => ({
    ...item,
    portrait_url: item.portrait_thumb_path ? `/uploads/${item.portrait_thumb_path}` : null,
    dormitory_color: getDormitoryColor(item.dormitory),
    dormitory_animal: getDormitoryAnimal(item.dormitory)
  }));

  return { results: formattedResults, total: formattedResults.length };
}

// Enhanced stats endpoint with caching
router.get('/stats', async (req, res) => {
  try {
    // Try to get from cache first
    let stats = req.cache.getStats('dashboard_stats');
    if (stats) {
      return res.json({ ...stats, fromCache: true });
    }

    const [
      totalCommissions,
      totalPrice,
      avgScore,
      nsfwCount,
      recentCount,
      topArtists,
      topTags,
      monthlyStats
    ] = await Promise.all([
      req.db.get('SELECT COUNT(*) as count FROM commissions'),
      req.db.get('SELECT SUM(price) as total FROM commissions WHERE price IS NOT NULL'),
      req.db.get('SELECT AVG(score) as avg FROM commissions WHERE score IS NOT NULL'),
      req.db.get('SELECT COUNT(*) as count FROM commissions WHERE nsfw = 1'),
      req.db.get('SELECT COUNT(*) as count FROM commissions WHERE created_at >= date("now", "-30 days")'),
      req.db.all(`
        SELECT a.name, a.slug, COUNT(c.id) as count
        FROM artists a
        LEFT JOIN commissions c ON a.id = c.artist_id
        GROUP BY a.id, a.name, a.slug
        ORDER BY count DESC
        LIMIT 5
      `),
      req.db.all(`
        SELECT t.name, t.slug, COUNT(ct.commission_id) as count
        FROM tags t
        LEFT JOIN commission_tags ct ON t.id = ct.tag_id
        GROUP BY t.id, t.name, t.slug
        ORDER BY count DESC
        LIMIT 5
      `),
      req.db.all(`
        SELECT date_month, COUNT(*) as count
        FROM commissions
        WHERE date_month IS NOT NULL
        AND date_month >= date('now', '-12 months', 'start of month')
        GROUP BY date_month
        ORDER BY date_month
      `)
    ]);

    stats = {
      totalCommissions: totalCommissions.count,
      totalPrice: totalPrice.total || 0,
      averageScore: avgScore.avg ? Math.round(avgScore.avg * 10) / 10 : 0,
      nsfwCount: nsfwCount.count,
      recentCount: recentCount.count,
      topArtists,
      topTags,
      monthlyTrend: monthlyStats,
      fromCache: false
    };

    // Cache the results
    req.cache.setStats('dashboard_stats', stats);

    res.json(stats);

  } catch (error) {
    console.error('Error getting enhanced stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Commission color palette endpoint
router.get('/commissions/:id/palette', async (req, res) => {
  try {
    const commission = await req.db.get(
      'SELECT color_palette FROM commissions WHERE id = ?',
      [req.params.id]
    );

    if (!commission) {
      return res.status(404).json({ error: 'Commission not found' });
    }

    const palette = commission.color_palette ? JSON.parse(commission.color_palette) : [];
    res.json(palette);

  } catch (error) {
    console.error('Error getting color palette:', error);
    res.status(500).json({ error: error.message });
  }
});

// Character co-appearances endpoint for relationship graph
router.get('/characters/:id/co-appearances', async (req, res) => {
  try {
    const coAppearances = await req.db.all(`
      SELECT 
        ch.id, 
        ch.name, 
        ch.slug, 
        ch.portrait_thumb_path,
        COUNT(*) as count
      FROM characters ch
      JOIN commission_characters cc1 ON ch.id = cc1.character_id
      JOIN commission_characters cc2 ON cc1.commission_id = cc2.commission_id
      WHERE cc2.character_id = ? AND ch.id != ?
      GROUP BY ch.id, ch.name, ch.slug, ch.portrait_thumb_path
      ORDER BY count DESC, ch.name
      LIMIT 50
    `, [req.params.id, req.params.id]);

    // Format for graph visualization
    const nodes = coAppearances.map(char => ({
      id: char.id,
      name: char.name,
      slug: char.slug,
      count: char.count,
      portrait_url: char.portrait_thumb_path ? `/uploads/${char.portrait_thumb_path}` : null
    }));

    res.json(nodes);

  } catch (error) {
    console.error('Error getting co-appearances:', error);
    res.status(500).json({ error: error.message });
  }
});

// Character timeline data endpoint
router.get('/characters/:id/timeline', async (req, res) => {
  try {
    const timeline = await req.db.all(`
      SELECT 
        c.date_month,
        COUNT(*) as count,
        GROUP_CONCAT(c.title, ', ') as titles
      FROM commissions c
      JOIN commission_characters cc ON c.id = cc.commission_id
      WHERE cc.character_id = ?
      GROUP BY c.date_month
      ORDER BY c.date_month
    `, [req.params.id]);

    // Format for chart
    const data = timeline.map(item => ({
      month: item.date_month,
      count: item.count,
      titles: item.titles.split(', ').slice(0, 3) // Limit to first 3 titles
    }));

    res.json(data);

  } catch (error) {
    console.error('Error getting timeline:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-suggest for tag creation
router.get('/tags/suggest-new', async (req, res) => {
  try {
    const { q = '' } = req.query;
    
    // Check if tag already exists
    const existing = await req.db.get(
      'SELECT id, name FROM tags WHERE name LIKE ?',
      [q]
    );

    if (existing) {
      return res.json({ exists: true, tag: existing });
    }

    // Suggest similar tags
    const similar = await req.db.all(
      'SELECT id, name FROM tags WHERE name LIKE ? ORDER BY name LIMIT 5',
      [`%${q}%`]
    );

    res.json({ exists: false, similar });

  } catch (error) {
    console.error('Error in tag suggestion:', error);
    res.status(500).json({ error: error.message });
  }
});

// Color palette search endpoint
router.get('/search/colors', async (req, res) => {
  try {
    const { color, threshold = 50 } = req.query;
    
    if (!color) {
      return res.status(400).json({ error: 'Color parameter is required' });
    }
    
    // Convert hex color to RGB
    const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!hexMatch) {
      return res.status(400).json({ error: 'Invalid color format. Use hex format like #FF0000' });
    }
    
    const targetR = parseInt(hexMatch[1], 16);
    const targetG = parseInt(hexMatch[2], 16);
    const targetB = parseInt(hexMatch[3], 16);
    
    // Get all commissions with color palettes
    const commissions = await req.db.all(`
      SELECT c.*, a.name as artist_name
      FROM commissions c
      LEFT JOIN artists a ON c.artist_id = a.id
      WHERE c.color_palette IS NOT NULL AND c.color_palette != '[]'
      ORDER BY c.created_at DESC
    `);
    
    const matchingCommissions = [];
    
    for (const commission of commissions) {
      try {
        const palette = JSON.parse(commission.color_palette || '[]');
        
        // Check if any color in the palette matches within threshold
        const hasMatch = palette.some(paletteColor => {
          if (!paletteColor.r || !paletteColor.g || !paletteColor.b) return false;
          
          const distance = Math.sqrt(
            Math.pow(paletteColor.r - targetR, 2) +
            Math.pow(paletteColor.g - targetG, 2) +
            Math.pow(paletteColor.b - targetB, 2)
          );
          
          return distance <= threshold;
        });
        
        if (hasMatch) {
          matchingCommissions.push({
            ...commission,
            thumb_url: commission.main_image_thumb ? `/uploads/${commission.main_image_thumb}` : '/public/images/placeholder.jpg',
            formatted_date: formatMonthYear(commission.date_month),
            palette: palette
          });
        }
      } catch (e) {
        // Skip commissions with invalid color palette data
        continue;
      }
    }
    
    res.json(matchingCommissions);
    
  } catch (error) {
    console.error('Error in color search:', error);
    res.status(500).json({ error: error.message });
  }
});

// Popular colors endpoint
router.get('/colors/popular', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const commissions = await req.db.all(`
      SELECT color_palette
      FROM commissions 
      WHERE color_palette IS NOT NULL AND color_palette != '[]'
    `);
    
    const colorCounts = {};
    
    for (const commission of commissions) {
      try {
        const palette = JSON.parse(commission.color_palette || '[]');
        
        palette.forEach(color => {
          if (color.hex) {
            colorCounts[color.hex] = (colorCounts[color.hex] || 0) + 1;
          }
        });
      } catch (e) {
        continue;
      }
    }
    
    const popularColors = Object.entries(colorCounts)
      .map(([hex, count]) => ({ hex, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));
    
    res.json(popularColors);
    
  } catch (error) {
    console.error('Error getting popular colors:', error);
    res.status(500).json({ error: error.message });
  }
});

// Utility function to format month-year for display
function formatMonthYear(dateMonth) {
  if (!dateMonth) return '';
  const [year, month] = dateMonth.split('-');
  const date = new Date(year, month - 1);
  return date.toLocaleDateString('en-AU', { year: 'numeric', month: 'long' });
}

// Utility function for dormitory colors
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

// Cache management endpoints
router.get('/cache/stats', async (req, res) => {
  try {
    const cacheStats = req.cache.getCacheStats();
    res.json(cacheStats);
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/cache/clear', async (req, res) => {
  try {
    const { type } = req.body;
    
    switch (type) {
      case 'search':
        req.cache.clearSearchCache();
        break;
      case 'stats':
        req.cache.clearStatsCache();
        break;
      case 'images':
        req.cache.clearImageCache();
        break;
      case 'all':
        req.cache.clearSearchCache();
        req.cache.clearStatsCache();
        req.cache.clearImageCache();
        break;
      default:
        return res.status(400).json({ error: 'Invalid cache type' });
    }
    
    res.json({ success: true, message: `${type} cache cleared` });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// Backup management endpoints
router.get('/backup/list', async (req, res) => {
  try {
    const backups = await req.backupManager.getBackupList();
    res.json(backups);
  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/backup/create', async (req, res) => {
  try {
    const { includeImages = true, compressionLevel = 6 } = req.body;
    const backupPath = await req.backupManager.createBackup(includeImages, compressionLevel);
    res.json({ success: true, backupPath });
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/backup/export-database', async (req, res) => {
  try {
    const exportPath = await req.backupManager.exportDatabaseToJson();
    res.json({ success: true, exportPath });
  } catch (error) {
    console.error('Error exporting database:', error);
    res.status(500).json({ error: error.message });
  }
});

// Image analysis endpoints
router.post('/images/analyze', async (req, res) => {
  try {
    const { imagePath } = req.body;
    
    if (!imagePath) {
      return res.status(400).json({ error: 'Image path is required' });
    }
    
    const metadata = await req.imageProcessor.extractImageMetadata(imagePath);
    res.json(metadata);
  } catch (error) {
    console.error('Error analyzing image:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/images/find-duplicates', async (req, res) => {
  try {
    const { imagePaths, threshold = 5 } = req.body;
    
    if (!Array.isArray(imagePaths)) {
      return res.status(400).json({ error: 'imagePaths must be an array' });
    }
    
    const duplicates = await req.imageProcessor.detectDuplicates(imagePaths, threshold);
    res.json(duplicates);
  } catch (error) {
    console.error('Error finding duplicates:', error);
    res.status(500).json({ error: error.message });
  }
});

// Advanced analytics endpoints
router.get('/analytics/commission-trends', async (req, res) => {
  try {
    const { timeframe = '12 months' } = req.query;
    
    const cacheKey = `commission_trends_${timeframe}`;
    let trends = req.cache.getStats(cacheKey);
    
    if (!trends) {
      trends = await req.db.all(`
        SELECT 
          date_month,
          COUNT(*) as commission_count,
          AVG(score) as avg_score,
          SUM(price) as total_price,
          COUNT(CASE WHEN nsfw = 1 THEN 1 END) as nsfw_count
        FROM commissions
        WHERE date_month IS NOT NULL
        AND date_month >= date('now', '-${timeframe}', 'start of month')
        GROUP BY date_month
        ORDER BY date_month
      `);
      
      req.cache.setStats(cacheKey, trends);
    }
    
    res.json(trends);
  } catch (error) {
    console.error('Error getting commission trends:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/analytics/tag-correlation', async (req, res) => {
  try {
    const cacheKey = 'tag_correlation';
    let correlations = req.cache.getStats(cacheKey);
    
    if (!correlations) {
      correlations = await req.db.all(`
        SELECT 
          t1.name as tag1,
          t2.name as tag2,
          COUNT(*) as co_occurrence_count
        FROM commission_tags ct1
        JOIN commission_tags ct2 ON ct1.commission_id = ct2.commission_id
        JOIN tags t1 ON ct1.tag_id = t1.id
        JOIN tags t2 ON ct2.tag_id = t2.id
        WHERE t1.id < t2.id
        GROUP BY t1.id, t2.id, t1.name, t2.name
        HAVING co_occurrence_count >= 3
        ORDER BY co_occurrence_count DESC
        LIMIT 50
      `);
      
      req.cache.setStats(cacheKey, correlations);
    }
    
    res.json(correlations);
  } catch (error) {
    console.error('Error getting tag correlations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search by named colors endpoint
router.get('/search/named-colors', async (req, res) => {
  try {
    const { colors } = req.query;
    
    if (!colors) {
      return res.status(400).json({ error: 'No colors specified' });
    }
    
    // Parse colors - can be a single color or comma-separated list
    const colorNames = colors.split(',').map(c => c.trim()).filter(c => c);
    
    if (colorNames.length === 0) {
      return res.status(400).json({ error: 'No valid colors specified' });
    }

    // Build query to find commissions with any of the specified named colors
    const placeholders = colorNames.map(() => '(key_color_1 = ? OR key_color_2 = ? OR key_color_3 = ?)').join(' OR ');
    const params = colorNames.flatMap(color => [color, color, color]); // Each color checked in all three positions

    const commissions = await req.db.all(`
      SELECT c.*, a.name as artist_name, a.slug as artist_slug
      FROM commissions c
      LEFT JOIN artists a ON c.artist_id = a.id
      WHERE ${placeholders}
      ORDER BY c.created_at DESC
    `, params);

    const formattedCommissions = commissions.map(commission => ({
      ...commission,
      thumb_url: commission.main_image_thumb ? `/uploads/${commission.main_image_thumb}` : '/public/images/placeholder.jpg',
      formatted_date: formatMonthYear(commission.date_month),
      key_colors: [commission.key_color_1, commission.key_color_2, commission.key_color_3].filter(Boolean)
    }));
    
    res.json(formattedCommissions);
    
  } catch (error) {
    console.error('Error in named color search:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get popular named colors endpoint
router.get('/colors/named/popular', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Count occurrences of each named color across all three key color fields
    const colorCounts = await req.db.all(`
      SELECT color_name, COUNT(*) as count FROM (
        SELECT key_color_1 as color_name FROM commissions WHERE key_color_1 IS NOT NULL
        UNION ALL
        SELECT key_color_2 as color_name FROM commissions WHERE key_color_2 IS NOT NULL
        UNION ALL
        SELECT key_color_3 as color_name FROM commissions WHERE key_color_3 IS NOT NULL
      ) color_union
      GROUP BY color_name
      ORDER BY count DESC
      LIMIT ?
    `, [parseInt(limit)]);
    
    res.json(colorCounts);
    
  } catch (error) {
    console.error('Error getting popular named colors:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all available named colors endpoint
router.get('/colors/named/all', async (req, res) => {
  try {
    const ColorNamer = require('../middleware/colorNamer');
    const colorNamer = new ColorNamer();
    
    const allColors = colorNamer.getAllColorNames();
    
    res.json(allColors);
    
  } catch (error) {
    console.error('Error getting all named colors:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;