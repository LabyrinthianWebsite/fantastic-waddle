const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

class AutoThumbnailService {
  constructor() {
    this.thumbnailSize = { width: 400, height: 300 };
  }

  /**
   * Auto-generate thumbnails for entities when media is uploaded
   * @param {Object} db - Database instance
   * @param {Object} videoProcessor - Video processor instance
   * @param {Object} mediaInfo - Information about the uploaded media
   */
  async updateEntityThumbnails(db, videoProcessor, mediaInfo) {
    try {
      console.log('Starting auto-thumbnail update for media:', mediaInfo.filename);

      // Get the set information
      const set = await db.getSetById(mediaInfo.set_id);
      if (!set) {
        console.warn('Set not found for media:', mediaInfo.set_id);
        return;
      }

      // Update set thumbnail if it doesn't have one
      await this.updateSetThumbnailIfNeeded(db, videoProcessor, set, mediaInfo);

      // Get the model information
      const model = await db.getModelById(set.model_id);
      if (model) {
        await this.updateModelThumbnailIfNeeded(db, videoProcessor, model, mediaInfo);

        // Get the studio information if model has one
        if (model.studio_id) {
          const studio = await db.getStudioById(model.studio_id);
          if (studio) {
            await this.updateStudioThumbnailIfNeeded(db, videoProcessor, studio, mediaInfo);
          }
        }
      }

      console.log('Auto-thumbnail update completed for media:', mediaInfo.filename);
    } catch (error) {
      console.error('Error in auto-thumbnail update:', error);
    }
  }

  /**
   * Update set thumbnail if it doesn't have one
   */
  async updateSetThumbnailIfNeeded(db, videoProcessor, set, mediaInfo) {
    if (set.cover_image_path && set.cover_thumb_path) {
      console.log('Set already has thumbnail:', set.name);
      return;
    }

    console.log('Generating thumbnail for set:', set.name);
    
    const { coverImagePath, coverThumbPath } = await this.generateThumbnailFromMedia(
      videoProcessor, 
      mediaInfo, 
      `uploads/covers/sets/${set.slug}`,
      `cover_${set.slug}`
    );

    await db.updateSetThumbnail(set.id, coverImagePath, coverThumbPath);
    console.log('Set thumbnail updated:', set.name);
  }

  /**
   * Update model thumbnail if it doesn't have one
   */
  async updateModelThumbnailIfNeeded(db, videoProcessor, model, mediaInfo) {
    if (model.profile_image_path && model.profile_thumb_path) {
      console.log('Model already has thumbnail:', model.name);
      return;
    }

    console.log('Generating thumbnail for model:', model.name);
    
    const { coverImagePath, coverThumbPath } = await this.generateThumbnailFromMedia(
      videoProcessor, 
      mediaInfo, 
      `uploads/covers/models/${model.slug}`,
      `profile_${model.slug}`
    );

    await db.updateModelThumbnail(model.id, coverImagePath, coverThumbPath);
    console.log('Model thumbnail updated:', model.name);
  }

  /**
   * Update studio thumbnail if it doesn't have one
   */
  async updateStudioThumbnailIfNeeded(db, videoProcessor, studio, mediaInfo) {
    if (studio.logo_path && studio.logo_thumb_path) {
      console.log('Studio already has thumbnail:', studio.name);
      return;
    }

    console.log('Generating thumbnail for studio:', studio.name);
    
    const { coverImagePath, coverThumbPath } = await this.generateThumbnailFromMedia(
      videoProcessor, 
      mediaInfo, 
      `uploads/covers/studios/${studio.slug}`,
      `logo_${studio.slug}`
    );

    await db.updateStudioThumbnail(studio.id, coverImagePath, coverThumbPath);
    console.log('Studio thumbnail updated:', studio.name);
  }

  /**
   * Generate thumbnail from media file
   */
  async generateThumbnailFromMedia(videoProcessor, mediaInfo, outputDir, baseName) {
    const coverImagePath = `${outputDir}/${baseName}.webp`;
    const coverThumbPath = `${outputDir}/${baseName}_thumb.webp`;
    
    const fullCoverPath = path.join(__dirname, '..', coverImagePath);
    const fullThumbPath = path.join(__dirname, '..', coverThumbPath);
    
    // Ensure output directory exists
    await fs.ensureDir(path.dirname(fullCoverPath));

    const mediaPath = path.join(__dirname, '..', mediaInfo.display_path);

    if (mediaInfo.file_type === 'video') {
      // Extract thumbnail from video
      await videoProcessor.extractThumbnail(mediaPath, fullCoverPath, {
        width: 800,
        height: 600,
        quality: 85
      });
    } else {
      // Copy and resize image
      await sharp(mediaPath)
        .resize(800, 600, { fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(fullCoverPath);
    }

    // Create smaller thumbnail version
    await sharp(fullCoverPath)
      .resize(this.thumbnailSize.width, this.thumbnailSize.height, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(fullThumbPath);

    return { coverImagePath, coverThumbPath };
  }

  /**
   * Clean up thumbnails when media is deleted
   */
  async cleanupEntityThumbnails(db, mediaInfo) {
    // This would be called when media is deleted to regenerate thumbnails
    // from remaining media if the deleted media was used as thumbnail
    // Implementation depends on business requirements
    console.log('Cleanup thumbnails for deleted media:', mediaInfo.filename);
  }
}

module.exports = AutoThumbnailService;