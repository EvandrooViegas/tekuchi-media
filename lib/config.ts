import fs from 'fs';
import path from 'path';
import ini from 'ini';

export function getProcessorPaths() {
  const configPath = path.join(process.cwd(), 'config.ini');
  
  if (!fs.existsSync(configPath)) {
    throw new Error("Config file missing");
  }

  const rawConfig = ini.parse(fs.readFileSync(configPath, 'utf-8'));
  const basePath = rawConfig.paths?.base_path || '';

  // This Proxy interceptor handles the string replacement automatically
  const handler = {
    get(target: any, prop: string) {
      const value = target[prop];
      if (typeof value === 'string' && value.includes('%(base_path)s')) {
        return value.replace(/%\(base_path\)s/g, basePath);
      }
      return value;
    }
  };

  // Wrap the paths object so any key accessed is automatically interpolated
  const interpolatedPaths = new Proxy(rawConfig.paths || {}, handler);

  return {
    inbox: interpolatedPaths.inbox,
    processed: interpolatedPaths.converted,
    archive: interpolatedPaths.archive,
    processing: interpolatedPaths.processing,
    // Add these if your other routes use the cropper paths
    cropper_inbox: interpolatedPaths.cropper_inbox,
    cropper_processed: interpolatedPaths.cropper_processed
  };
}

/**
 * Base URL of the FastAPI server.
 * Override with the PYTHON_API_URL environment variable in production.
 */
export const PYTHON_API_URL =
  process.env.PYTHON_API_URL ?? 'http://localhost:8000';