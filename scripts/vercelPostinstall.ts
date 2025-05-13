import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const isVercel = process.env.VERCEL === '1';

// Only run migrations on Vercel
if (!isVercel) {
  console.log('Not running on Vercel, skipping database migration.');
  process.exit(0);
}

// Prevent migration with file system database on Vercel
if (process.env.USE_FILE_SYSTEM_DB = "true") {
    console.error("Using SQLite database with USE_FILE_SYSTEM_DB=true. This is not supported on Vercel.");
    process.exit(1);
}

async function runPrismaMigrate() {
    try {
      const { stdout, stderr } = await execPromise(
        'pnpm db:migrate', 
        {
          cwd: process.cwd(),
          env: process.env, 
        }
      );

      console.log('Database migration output:'); 
      console.log(stdout);

      if (stderr) {
        console.error('Database migration stderr:'); 
        console.error(stderr);
      }
    } catch (error: any) { 
      console.error('Database migration error:', error); 
      process.exit(1);
    }
  }

runPrismaMigrate();
