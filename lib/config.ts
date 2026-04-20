import fs from 'fs';
import path from 'path';
import ini from 'ini';

export function getProcessorPaths() {
  const configPath = path.join(process.cwd(), 'server', 'compressor', 'config.ini');
  
  if (!fs.existsSync(configPath)) {
    throw new Error("Config file missing");
  }

  const config = ini.parse(fs.readFileSync(configPath, 'utf-8'));

  // These keys MUST match the names in your .ini file [paths] section
  return {
    inbox: config.paths.inbox,         // E.g., C:\Media\TODO
    processed: config.paths.converted, // E.g., C:\Media\PROCESSED
    archive: config.paths.archive,     // E.g., C:\Media\SOURCES
    processing: config.paths.processing
  };
}