const sharp = require('sharp');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const ColorNamer = require('./colorNamer');

class ImageProcessor {
  constructor() {
    this.supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'bmp'];
    this.colorNamer = new ColorNamer();
  }

  // Generate a safe filename with timestamp
  generateSafeFilename(originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}_${random}${ext}`;
  }

  // Check if file is a supported image format
  isValidImage(filename) {
    const ext = path.extname(filename).toLowerCase().substring(1);
    return this.supportedFormats.includes(ext);
  }

  // Extract dominant colors from image using k-means clustering
  async extractColorPalette(imagePath, numColors = 5) {
    try {
      // Resize image for faster processing
      const { data, info } = await sharp(imagePath)
        .resize(100, 100, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels = [];
      for (let i = 0; i < data.length; i += info.channels) {
        pixels.push({
          r: data[i],
          g: data[i + 1] || 0,
          b: data[i + 2] || 0
        });
      }

      // Simple color quantization using k-means clustering
      const dominantColors = this.kmeansClustering(pixels, numColors);
      
      const palette = dominantColors.map(color => ({
        ...color,
        hex: this.rgbToHex(color.r, color.g, color.b),
        name: this.colorNamer.getColorName(color.r, color.g, color.b)
      }));

      return palette;
    } catch (error) {
      console.error('Error extracting color palette:', error);
      return [];
    }
  }

  // Simple k-means clustering for color extraction
  kmeansClustering(pixels, k = 5, maxIterations = 10) {
    if (pixels.length === 0) return [];

    // Initialize centroids randomly
    let centroids = [];
    for (let i = 0; i < k; i++) {
      const randomPixel = pixels[Math.floor(Math.random() * pixels.length)];
      centroids.push({ ...randomPixel });
    }

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const clusters = Array(k).fill(null).map(() => []);

      // Assign pixels to nearest centroid
      pixels.forEach(pixel => {
        let minDistance = Infinity;
        let nearestCentroid = 0;

        centroids.forEach((centroid, index) => {
          const distance = this.colorDistance(pixel, centroid);
          if (distance < minDistance) {
            minDistance = distance;
            nearestCentroid = index;
          }
        });

        clusters[nearestCentroid].push(pixel);
      });

      // Update centroids
      const newCentroids = clusters.map(cluster => {
        if (cluster.length === 0) return centroids[0]; // Keep old centroid if no pixels assigned

        const sum = cluster.reduce(
          (acc, pixel) => ({
            r: acc.r + pixel.r,
            g: acc.g + pixel.g,
            b: acc.b + pixel.b
          }),
          { r: 0, g: 0, b: 0 }
        );

        return {
          r: Math.round(sum.r / cluster.length),
          g: Math.round(sum.g / cluster.length),
          b: Math.round(sum.b / cluster.length)
        };
      });

      // Check for convergence
      const converged = centroids.every((centroid, index) =>
        this.colorDistance(centroid, newCentroids[index]) < 5
      );

      centroids = newCentroids;

      if (converged) break;
    }

    return centroids;
  }

  // Calculate color distance
  colorDistance(color1, color2) {
    return Math.sqrt(
      Math.pow(color1.r - color2.r, 2) +
      Math.pow(color1.g - color2.g, 2) +
      Math.pow(color1.b - color2.b, 2)
    );
  }

  // Convert RGB to hex
  rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Create display variant (max 2048px long edge)
  async createDisplayVariant(inputPath, outputPath) {
    await fs.ensureDir(path.dirname(outputPath));
    
    const metadata = await sharp(inputPath).metadata();
    const { width, height } = metadata;
    
    // Don't upscale
    const maxSize = 2048;
    if (width <= maxSize && height <= maxSize) {
      await fs.copy(inputPath, outputPath);
      return outputPath;
    }

    // Determine output format
    const hasAlpha = metadata.hasAlpha;
    const outputFormat = hasAlpha ? 'png' : 'jpeg';
    const outputExt = hasAlpha ? '.png' : '.jpg';
    const finalOutputPath = outputPath.replace(/\.[^.]+$/, outputExt);

    let processor = sharp(inputPath)
      .resize(maxSize, maxSize, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .rotate(); // Auto-orient based on EXIF

    if (hasAlpha) {
      processor = processor.png({ quality: 90 });
    } else {
      processor = processor.jpeg({ 
        quality: 85, 
        progressive: true 
      });
    }

    await processor.toFile(finalOutputPath);
    return finalOutputPath;
  }

  // Create thumbnail variant (max 512px long edge)
  async createThumbnailVariant(inputPath, outputPath) {
    await fs.ensureDir(path.dirname(outputPath));
    
    const metadata = await sharp(inputPath).metadata();
    const { width, height } = metadata;
    
    // Don't upscale
    const maxSize = 512;
    if (width <= maxSize && height <= maxSize) {
      await fs.copy(inputPath, outputPath);
      return outputPath;
    }

    // Determine output format
    const hasAlpha = metadata.hasAlpha;
    const outputFormat = hasAlpha ? 'png' : 'jpeg';
    const outputExt = hasAlpha ? '.png' : '.jpg';
    const finalOutputPath = outputPath.replace(/\.[^.]+$/, outputExt);

    let processor = sharp(inputPath)
      .resize(maxSize, maxSize, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .rotate(); // Auto-orient based on EXIF

    if (hasAlpha) {
      processor = processor.png({ quality: 80 });
    } else {
      processor = processor.jpeg({ 
        quality: 75, 
        progressive: true 
      });
    }

    await processor.toFile(finalOutputPath);
    return finalOutputPath;
  }

  // Create character portrait (256x256 center crop)
  async createCharacterPortrait(inputPath, outputPath) {
    await fs.ensureDir(path.dirname(outputPath));
    
    const outputExt = '.jpg';
    const finalOutputPath = outputPath.replace(/\.[^.]+$/, outputExt);

    await sharp(inputPath)
      .resize(256, 256, { 
        fit: 'cover',
        position: 'center'
      })
      .rotate() // Auto-orient based on EXIF
      .jpeg({ 
        quality: 85,
        progressive: true
      })
      .toFile(finalOutputPath);

    return finalOutputPath;
  }

  // Process a complete image set (original, display, thumbnail)
  async processImageSet(file, baseDir, type = 'commission') {
    const safeFilename = this.generateSafeFilename(file.originalname);
    const baseName = path.parse(safeFilename).name;
    const originalExt = path.extname(safeFilename);

    // Define paths
    const originalPath = path.join(baseDir, 'originals', safeFilename);
    const displayPath = path.join(baseDir, 'display', `${baseName}_display${originalExt}`);
    const thumbPath = path.join(baseDir, 'thumbs', `${baseName}_thumb${originalExt}`);

    // Ensure directories exist
    await fs.ensureDir(path.dirname(originalPath));
    await fs.ensureDir(path.dirname(displayPath));
    await fs.ensureDir(path.dirname(thumbPath));

    // Save original
    await fs.writeFile(originalPath, file.buffer);

    // Create variants
    const finalDisplayPath = await this.createDisplayVariant(originalPath, displayPath);
    const finalThumbPath = await this.createThumbnailVariant(originalPath, thumbPath);

    // Extract color palette for main images
    let colorPalette = null;
    let keyColors = [];
    if (type === 'main') {
      colorPalette = await this.extractColorPalette(originalPath);
      keyColors = this.colorNamer.getThreeKeyColors(colorPalette);
    }

    return {
      original: originalPath,
      display: finalDisplayPath,
      thumb: finalThumbPath,
      filename: safeFilename,
      filesize: file.size,
      colorPalette,
      keyColors
    };
  }

  // Validate image upload
  async validateImage(file) {
    if (!this.isValidImage(file.originalname)) {
      throw new Error('Invalid image format. Supported formats: ' + this.supportedFormats.join(', '));
    }

    if (file.size > 2 * 1024 * 1024 * 1024) { // 2GB limit
      throw new Error('File size too large. Maximum size is 2GB.');
    }

    try {
      const metadata = await sharp(file.buffer).metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image: could not determine dimensions');
      }

      if (metadata.width * metadata.height > 300 * 1000 * 1000) { // 300 megapixels
        throw new Error('Image resolution too high. Maximum is 300 megapixels.');
      }

      return true;
    } catch (error) {
      throw new Error('Invalid image file: ' + error.message);
    }
  }

  // Rebuild variants for existing images
  async rebuildVariants(originalPath, baseDir) {
    if (!await fs.pathExists(originalPath)) {
      throw new Error('Original image not found');
    }

    const baseName = path.parse(originalPath).name.replace(/_\d+_[a-f0-9]+$/, '');
    const originalExt = path.extname(originalPath);

    const displayPath = path.join(baseDir, 'display', `${baseName}_display${originalExt}`);
    const thumbPath = path.join(baseDir, 'thumbs', `${baseName}_thumb${originalExt}`);

    const finalDisplayPath = await this.createDisplayVariant(originalPath, displayPath);
    const finalThumbPath = await this.createThumbnailVariant(originalPath, thumbPath);

    return {
      display: finalDisplayPath,
      thumb: finalThumbPath
    };
  }
}

module.exports = ImageProcessor;