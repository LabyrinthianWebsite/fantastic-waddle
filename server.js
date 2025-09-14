const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs-extra');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const methodOverride = require('method-override');
const GalleryDatabase = require('./database/galleryDatabase');
const CacheManager = require('./middleware/cacheManager');
const BackupManager = require('./middleware/backupManager');
const EnhancedImageProcessor = require('./middleware/enhancedImageProcessor');

const app = express();
const PORT = process.env.PORT || 6969;

// Initialize gallery database and services
const db = new GalleryDatabase();
const cacheManager = new CacheManager();
const imageProcessor = new EnhancedImageProcessor();

// Initialize backup manager after uploadsDir is defined
let backupManager;

// Compression middleware for better performance
app.use(compression());

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "http://localhost"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for static files to prevent issues when browsing pages with many images
  // Static assets (thumbnails, CSS, JS, etc.) don't need aggressive rate limiting
  skip: (req, res) => {
    // Skip rate limiting for static file requests
    return req.url.startsWith('/uploads/') || 
           req.url.startsWith('/public/') || 
           req.url.startsWith('/Images/');
  },
  // Custom message and logging for rate limit responses
  message: 'Too many requests, please try again later.',
  handler: (req, res, next, options) => {
    // Log rate limiting events
    const logEntry = `${new Date().toISOString()} RATE_LIMIT ${req.method} ${req.url} 429 ${req.ip} - Rate limit exceeded (${options.max} requests per ${options.windowMs}ms)\n`;
    
    fs.ensureDir(path.join(__dirname, 'logs')).then(() => {
      fs.appendFile(path.join(__dirname, 'logs', 'server.log'), logEntry).catch(console.error);
    });
    
    console.log(`Rate limit exceeded for IP ${req.ip}: ${req.method} ${req.url}`);
    
    // Send the default rate limit response
    res.status(options.statusCode).send(options.message);
  }
});
app.use(limiter);

// Session configuration
app.use(session({
  secret: 'commission-db-secret-key', // In production, use environment variable
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsing middleware with increased limits for large uploads
app.use(express.json({ limit: '50gb' }));
app.use(express.urlencoded({ extended: true, limit: '50gb' }));

// Method override middleware for PUT/DELETE support in forms
app.use(methodOverride('_method'));

// Static file serving
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/Images', express.static(path.join(__dirname, 'Images')));

// Middleware to make database and services available in routes
app.use((req, res, next) => {
  req.db = db;
  req.cache = cacheManager;
  req.imageProcessor = imageProcessor;
  req.backupManager = backupManager;
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = `${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${res.get('content-length') || 0}b ${duration}ms\n`;
    
    fs.ensureDir(path.join(__dirname, 'logs')).then(() => {
      fs.appendFile(path.join(__dirname, 'logs', 'server.log'), logEntry).catch(console.error);
    });
  });
  next();
});

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

// Import routes
const galleryRoutes = require('./routes/gallery');
const galleryAdminRoutes = require('./routes/gallery-admin');
const setupRoutes = require('./routes/setup');

// Route handlers
app.use('/setup', setupRoutes);
app.use('/admin', galleryAdminRoutes);
app.use('/', galleryRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500);
  
  if (req.accepts('html')) {
    res.render('error', { error: err.message, status: 500 });
  } else if (req.accepts('json')) {
    res.json({ error: err.message });
  } else {
    res.type('txt').send(err.message);
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404);
  
  if (req.accepts('html')) {
    res.render('404', { url: req.url });
  } else if (req.accepts('json')) {
    res.json({ error: 'Not found' });
  } else {
    res.type('txt').send('Not found');
  }
});

// Initialize and start server
async function start() {
  try {
    await db.init();
    
    // Initialize backup manager after database is ready
    backupManager = new BackupManager(db, path.join(__dirname, 'uploads'));
    
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`CommissionDB server running on http://127.0.0.1:${PORT}`);
      console.log('Server is bound to localhost only for security');
      console.log('Enhanced features enabled: FTS search, caching, backup system, advanced image processing');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  await db.close();
  process.exit(0);
});

start();

module.exports = app;