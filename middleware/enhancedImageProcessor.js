const sharp = require('sharp');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const imghash = require('imghash');

class EnhancedImageProcessor {
  constructor() {
    this.supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'bmp', 'avif', 'heif', 'heic', 'jxl'];
    this.thumbnailSizes = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 }
    };
  }

  // Generate multiple thumbnail sizes
  async generateThumbnails(imagePath, outputDir) {
    const results = {};
    const basename = path.basename(imagePath, path.extname(imagePath));
    
    await fs.ensureDir(outputDir);

    for (const [size, dimensions] of Object.entries(this.thumbnailSizes)) {
      try {
        const outputPath = path.join(outputDir, `${basename}_${size}.webp`);
        
        await sharp(imagePath)
          .resize(dimensions.width, dimensions.height, {
            fit: 'cover',
            position: 'center'
          })
          .webp({ quality: 85 })
          .toFile(outputPath);

        results[size] = outputPath;
      } catch (error) {
        console.error(`Failed to generate ${size} thumbnail:`, error);
      }
    }

    return results;
  }

  // Generate progressive JPEG for better loading experience
  async generateProgressiveImage(imagePath, outputPath, quality = 85) {
    try {
      await sharp(imagePath)
        .jpeg({ 
          quality, 
          progressive: true,
          mozjpeg: true
        })
        .toFile(outputPath);
      
      return outputPath;
    } catch (error) {
      console.error('Failed to generate progressive image:', error);
      throw error;
    }
  }

  // Extract comprehensive image metadata
  async extractImageMetadata(imagePath) {
    try {
      const metadata = await sharp(imagePath).metadata();
      const stats = await fs.stat(imagePath);
      
      // Extract color palette
      const colorPalette = await this.extractDominantColors(imagePath);
      
      // Generate perceptual hash for duplicate detection
      const hash = await imghash.hash(imagePath);
      
      // Extract EXIF data if available
      const exifData = metadata.exif ? this.parseExifData(metadata.exif) : {};

      return {
        filename: path.basename(imagePath),
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        channels: metadata.channels,
        depth: metadata.depth,
        density: metadata.density,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
        colorSpace: metadata.space,
        fileSize: stats.size,
        fileCreated: stats.birthtime,
        fileModified: stats.mtime,
        aspectRatio: metadata.width / metadata.height,
        perceptualHash: hash,
        dominantColors: colorPalette,
        exif: exifData
      };
    } catch (error) {
      console.error('Failed to extract image metadata:', error);
      throw error;
    }
  }

  // Extract dominant colors using sharp
  async extractDominantColors(imagePath, numColors = 5) {
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
      
      return dominantColors.map(color => ({
        ...color,
        hex: this.rgbToHex(color.r, color.g, color.b),
        hsl: this.rgbToHsl(color.r, color.g, color.b)
      }));
    } catch (error) {
      console.error('Failed to extract dominant colors:', error);
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
        this.colorDistance(centroid, newCentroids[index]) < 1
      );

      centroids = newCentroids;

      if (converged) break;
    }

    return centroids;
  }

  // Calculate color distance in RGB space
  colorDistance(color1, color2) {
    return Math.sqrt(
      Math.pow(color1.r - color2.r, 2) +
      Math.pow(color1.g - color2.g, 2) +
      Math.pow(color1.b - color2.b, 2)
    );
  }

  // Convert RGB to hex
  rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("");
  }

  // Convert RGB to HSL
  rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  // Parse EXIF data
  parseExifData(exifBuffer) {
    try {
      // Basic EXIF parsing - in a production environment, you'd use a proper EXIF library
      return {
        // This is a simplified implementation
        hasExifData: true,
        dataLength: exifBuffer.length
      };
    } catch (error) {
      return { hasExifData: false };
    }
  }

  // Detect duplicate images using perceptual hashing
  async detectDuplicates(imagePaths, threshold = 5) {
    const hashes = new Map();
    const duplicates = [];

    for (const imagePath of imagePaths) {
      try {
        const hash = await imghash.hash(imagePath);
        hashes.set(imagePath, hash);
      } catch (error) {
        console.error(`Failed to hash ${imagePath}:`, error);
      }
    }

    const hashArray = Array.from(hashes.entries());
    
    for (let i = 0; i < hashArray.length; i++) {
      for (let j = i + 1; j < hashArray.length; j++) {
        const [path1, hash1] = hashArray[i];
        const [path2, hash2] = hashArray[j];
        
        const distance = this.hammingDistance(hash1, hash2);
        
        if (distance <= threshold) {
          duplicates.push({
            image1: path1,
            image2: path2,
            similarity: 1 - (distance / 64), // Normalize to 0-1 scale
            hammingDistance: distance
          });
        }
      }
    }

    return duplicates;
  }

  // Calculate Hamming distance between two hashes
  hammingDistance(hash1, hash2) {
    if (hash1.length !== hash2.length) return Infinity;
    
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    
    return distance;
  }

  // Optimize image for web
  async optimizeForWeb(inputPath, outputPath, options = {}) {
    const {
      format = 'webp',
      quality = 85,
      progressive = true,
      maxWidth = 1920,
      maxHeight = 1080
    } = options;

    try {
      let pipeline = sharp(inputPath);
      
      // Resize if image is too large
      const metadata = await pipeline.metadata();
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        pipeline = pipeline.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Apply format-specific optimizations
      switch (format) {
        case 'webp':
          pipeline = pipeline.webp({ quality, effort: 6 });
          break;
        case 'jpeg':
          pipeline = pipeline.jpeg({ quality, progressive, mozjpeg: true });
          break;
        case 'png':
          pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
          break;
      }

      await pipeline.toFile(outputPath);
      return outputPath;
    } catch (error) {
      console.error('Failed to optimize image:', error);
      throw error;
    }
  }
}

module.exports = EnhancedImageProcessor;