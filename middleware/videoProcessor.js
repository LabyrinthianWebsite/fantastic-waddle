const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

class VideoProcessor {
  constructor() {
    this.supportedFormats = ['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv'];
  }

  /**
   * Execute a command using spawn for better argument handling
   * @param {string} command - Command to execute
   * @param {Array} args - Arguments array
   * @returns {Promise<{stdout: string, stderr: string}>}
   */
  async execCommand(command, args) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Extract a thumbnail from a video file using FFmpeg
   * @param {string} videoPath - Path to the video file
   * @param {string} outputPath - Path where thumbnail should be saved
   * @param {Object} options - Options for thumbnail generation
   * @returns {Promise<string>} - Path to generated thumbnail
   */
  async extractThumbnail(videoPath, outputPath, options = {}) {
    const {
      timeOffset = '00:00:01', // Extract frame at 1 second
      width = 400,
      height = 300,
      quality = 80
    } = options;

    try {
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));

      // FFmpeg arguments to extract a frame and convert to WebP
      const args = [
        '-i', videoPath,
        '-ss', timeOffset,
        '-vframes', '1',
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        '-q:v', quality.toString(),
        '-f', 'webp',
        '-y', // Overwrite output file
        outputPath
      ];

      console.log('Executing FFmpeg command:', 'ffmpeg', args.join(' '));
      const { stdout, stderr } = await this.execCommand('ffmpeg', args);
      
      if (stderr && !stderr.includes('frame=')) {
        console.warn('FFmpeg stderr:', stderr);
      }

      // Verify the thumbnail was created
      if (await fs.pathExists(outputPath)) {
        console.log('Video thumbnail generated successfully:', outputPath);
        return outputPath;
      } else {
        throw new Error('Thumbnail file was not created');
      }

    } catch (error) {
      console.error('Failed to extract video thumbnail:', error);
      throw error;
    }
  }

  /**
   * Get video metadata using FFprobe
   * @param {string} videoPath - Path to the video file
   * @returns {Promise<Object>} - Video metadata
   */
  async getVideoMetadata(videoPath) {
    try {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        videoPath
      ];

      const { stdout } = await this.execCommand('ffprobe', args);
      const metadata = JSON.parse(stdout);

      // Find the video stream
      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      
      if (!videoStream) {
        throw new Error('No video stream found');
      }

      return {
        duration: parseFloat(metadata.format.duration) || null,
        width: parseInt(videoStream.width) || null,
        height: parseInt(videoStream.height) || null,
        codec: videoStream.codec_name || null,
        frameRate: this.parseFrameRate(videoStream.r_frame_rate) || null,
        bitrate: parseInt(metadata.format.bit_rate) || null,
        size: parseInt(metadata.format.size) || null
      };

    } catch (error) {
      console.error('Failed to get video metadata:', error);
      throw error;
    }
  }

  /**
   * Parse frame rate from FFprobe format (e.g., "30/1")
   * @param {string} frameRateStr - Frame rate string from FFprobe
   * @returns {number|null} - Numeric frame rate
   */
  parseFrameRate(frameRateStr) {
    if (!frameRateStr || frameRateStr === '0/0') return null;
    
    const [num, den] = frameRateStr.split('/').map(x => parseInt(x));
    return den > 0 ? num / den : null;
  }

  /**
   * Check if FFmpeg is available
   * @returns {Promise<boolean>} - True if FFmpeg is available
   */
  async isFFmpegAvailable() {
    try {
      await this.execCommand('ffmpeg', ['-version']);
      await this.execCommand('ffprobe', ['-version']);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get optimal thumbnail time offset based on video duration
   * @param {number} duration - Video duration in seconds
   * @returns {string} - Time offset in HH:MM:SS format
   */
  getOptimalThumbnailTime(duration) {
    if (!duration || duration <= 0) {
      return '00:00:01';
    }

    // Take thumbnail from 10% into the video, but not less than 1 second
    // and not more than 30 seconds
    const offset = Math.max(1, Math.min(30, duration * 0.1));
    
    const hours = Math.floor(offset / 3600);
    const minutes = Math.floor((offset % 3600) / 60);
    const seconds = Math.floor(offset % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

module.exports = VideoProcessor;