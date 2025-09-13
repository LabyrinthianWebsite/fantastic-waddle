const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const JSZip = require('jszip');
const cron = require('node-cron');

class BackupManager {
  constructor(db, uploadsDir) {
    this.db = db;
    this.uploadsDir = uploadsDir;
    this.backupDir = path.join(__dirname, '../backups');
    this.maxBackups = 10; // Keep last 10 backups
    
    // Ensure backup directory exists
    this.init();
  }

  async init() {
    await fs.ensureDir(this.backupDir);
    
    // Schedule automated backups (daily at 2 AM)
    cron.schedule('0 2 * * *', () => {
      this.createAutomatedBackup();
    });
  }

  async createBackup(includeImages = true, compressionLevel = 6) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `commission-db-backup-${timestamp}`;
    const backupPath = path.join(this.backupDir, `${backupName}.zip`);

    try {
      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: compressionLevel } });

      return new Promise((resolve, reject) => {
        output.on('close', () => {
          console.log(`Backup created: ${backupPath} (${archive.pointer()} bytes)`);
          this.cleanupOldBackups();
          resolve(backupPath);
        });

        archive.on('error', reject);
        archive.pipe(output);

        // Add database file - use the actual path from the database instance
        const dbPath = this.db.dbPath;
        if (fs.existsSync(dbPath)) {
          archive.file(dbPath, { name: path.basename(dbPath) });
        }

        // Add configuration and important files
        const configFiles = [
          'package.json',
          'server.js',
          '.gitignore'
        ];

        configFiles.forEach(file => {
          const filePath = path.join(__dirname, '..', file);
          if (fs.existsSync(filePath)) {
            archive.file(filePath, { name: file });
          }
        });

        // Add routes, middleware, views, and public directories
        const directories = ['routes', 'middleware', 'views', 'public'];
        directories.forEach(dir => {
          const dirPath = path.join(__dirname, '..', dir);
          if (fs.existsSync(dirPath)) {
            archive.directory(dirPath, dir);
          }
        });

        // Include images if requested
        if (includeImages && fs.existsSync(this.uploadsDir)) {
          archive.directory(this.uploadsDir, 'uploads');
          
          const imagesDir = path.join(__dirname, '../Images');
          if (fs.existsSync(imagesDir)) {
            archive.directory(imagesDir, 'Images');
          }
        }

        // Add metadata
        const metadata = {
          created: new Date().toISOString(),
          version: require('../package.json').version,
          includesImages: includeImages,
          compressionLevel: compressionLevel,
          totalFiles: 0 // Will be updated during archiving
        };

        archive.append(JSON.stringify(metadata, null, 2), { name: 'backup-metadata.json' });
        archive.finalize();
      });
    } catch (error) {
      console.error('Backup creation failed:', error);
      throw error;
    }
  }

  async restoreBackup(backupPath) {
    try {
      const zip = new JSZip();
      const data = await fs.readFile(backupPath);
      const contents = await zip.loadAsync(data);

      // Read metadata
      let metadata = {};
      if (contents.files['backup-metadata.json']) {
        const metadataContent = await contents.files['backup-metadata.json'].async('string');
        metadata = JSON.parse(metadataContent);
      }

      console.log('Restoring backup from:', metadata.created || 'unknown date');

      // Create restoration directory
      const restoreDir = path.join(this.backupDir, `restore-${Date.now()}`);
      await fs.ensureDir(restoreDir);

      // Extract all files
      const promises = Object.keys(contents.files).map(async (filename) => {
        const file = contents.files[filename];
        if (!file.dir) {
          const filePath = path.join(restoreDir, filename);
          await fs.ensureDir(path.dirname(filePath));
          const content = await file.async('nodebuffer');
          await fs.writeFile(filePath, content);
        }
      });

      await Promise.all(promises);

      console.log(`Backup extracted to: ${restoreDir}`);
      return {
        restoreDir,
        metadata,
        success: true
      };
    } catch (error) {
      console.error('Backup restoration failed:', error);
      throw error;
    }
  }

  async exportDatabaseToJson() {
    try {
      const tables = [
        'users', 'artists', 'tags', 'characters', 'collections',
        'commissions', 'commission_tags', 'commission_characters',
        'commission_files', 'character_relationships'
      ];

      const exportData = {
        exported: new Date().toISOString(),
        version: require('../package.json').version,
        data: {}
      };

      for (const table of tables) {
        try {
          const rows = await this.db.all(`SELECT * FROM ${table}`);
          exportData.data[table] = rows;
        } catch (error) {
          console.warn(`Could not export table ${table}:`, error.message);
          exportData.data[table] = [];
        }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const exportPath = path.join(this.backupDir, `database-export-${timestamp}.json`);
      
      await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
      console.log(`Database exported to: ${exportPath}`);
      
      return exportPath;
    } catch (error) {
      console.error('Database export failed:', error);
      throw error;
    }
  }

  async createAutomatedBackup() {
    try {
      console.log('Starting automated backup...');
      const backupPath = await this.createBackup(true, 9); // Maximum compression for automated backups
      console.log('Automated backup completed:', backupPath);
    } catch (error) {
      console.error('Automated backup failed:', error);
    }
  }

  async cleanupOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('commission-db-backup-') && file.endsWith('.zip'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          stat: fs.statSync(path.join(this.backupDir, file))
        }))
        .sort((a, b) => b.stat.mtime - a.stat.mtime); // Sort by modification time, newest first

      if (backupFiles.length > this.maxBackups) {
        const filesToDelete = backupFiles.slice(this.maxBackups);
        for (const file of filesToDelete) {
          await fs.remove(file.path);
          console.log(`Deleted old backup: ${file.name}`);
        }
      }
    } catch (error) {
      console.error('Backup cleanup failed:', error);
    }
  }

  async getBackupList() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('commission-db-backup-') && file.endsWith('.zip'))
        .map(file => {
          const stat = fs.statSync(path.join(this.backupDir, file));
          return {
            name: file,
            path: path.join(this.backupDir, file),
            size: stat.size,
            created: stat.mtime,
            humanSize: this.formatFileSize(stat.size)
          };
        })
        .sort((a, b) => b.created - a.created);

      return backupFiles;
    } catch (error) {
      console.error('Failed to get backup list:', error);
      return [];
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = BackupManager;