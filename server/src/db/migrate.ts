import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://bonk:bonk_dev_password@localhost:5432/bonk_race';
  
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    console.log('[Migrations] Connecting to database...');
    
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`[Migrations] Found ${migrationFiles.length} migration(s)`);

    for (const file of migrationFiles) {
      console.log(`[Migrations] Running migration: ${file}`);
      
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      
      await pool.query(sql);
      console.log(`[Migrations] ✓ ${file} completed`);
    }

    console.log('[Migrations] All migrations completed successfully');
  } catch (error) {
    console.error('[Migrations] Error running migrations:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migrations if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('[Migrations] Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Migrations] Failed:', error);
      process.exit(1);
    });
}

export { runMigrations };
