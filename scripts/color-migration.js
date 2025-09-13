const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class ColorMigration {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../database/commissions.db');
  }

  async run() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }

        console.log('🎨 Running color enhancement migration...');

        // Add named color fields to commissions table
        db.serialize(() => {
          // Add three key color fields
          db.run(`
            ALTER TABLE commissions 
            ADD COLUMN key_color_1 TEXT DEFAULT NULL
          `, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
              console.error('Error adding key_color_1:', err);
            }
          });

          db.run(`
            ALTER TABLE commissions 
            ADD COLUMN key_color_2 TEXT DEFAULT NULL
          `, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
              console.error('Error adding key_color_2:', err);
            }
          });

          db.run(`
            ALTER TABLE commissions 
            ADD COLUMN key_color_3 TEXT DEFAULT NULL
          `, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
              console.error('Error adding key_color_3:', err);
            }
          });

          // Add index for better color search performance
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_commissions_key_colors 
            ON commissions(key_color_1, key_color_2, key_color_3)
          `, (err) => {
            if (err) {
              console.error('Error creating color index:', err);
            }
          });

          db.close((err) => {
            if (err) {
              reject(err);
            } else {
              console.log('✅ Color enhancement migration completed successfully!');
              resolve();
            }
          });
        });
      });
    });
  }
}

// Export the class for use as a module
module.exports = ColorMigration;

// If run directly, execute the migration
if (require.main === module) {
  const migration = new ColorMigration();
  migration.run().catch(console.error);
}