/**
 * Vite plugin: scans program entry files and exposes virtual:programs.
 */

import { Plugin } from 'vite';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

/** Program manifest extracted from a program entry file. */
interface ProgramMetadata {
  id: string;
  name: string;
  icon: string;
  path: string;
}

/** Virtual module id imported as virtual:programs. */
const VIRTUAL_MODULE_ID = 'virtual:programs';
/** Vite-resolved id for the virtual programs module. */
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

/** Parse id/name/icon from a program source file without executing it. */
function extractMetadata(filePath: string): ProgramMetadata | null {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Extract id using regex
    const idMatch = content.match(/id:\s*['"`]([^'"`]+)['"`]/);
    const nameMatch = content.match(/name:\s*['"`]([^'"`]+)['"`]/);
    const iconMatch = content.match(/icon:\s*['"`]([^'"`]+)['"`]/);

    if (idMatch && nameMatch && iconMatch) {
      return {
        id: idMatch[1],
        name: nameMatch[1],
        icon: iconMatch[1],
        path: filePath,
      };
    }
  } catch {
    // File read error, skip
  }
  return null;
}

/** Discover all runnable programs under `programs/`. */
function scanProgramDirectories(rootDir: string): ProgramMetadata[] {
  const programs: ProgramMetadata[] = [];
  const directories = ['programs'];

  for (const dir of directories) {
    const fullPath = resolve(rootDir, dir);
    if (!existsSync(fullPath)) continue;

    const entries = readdirSync(fullPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Scaffolding only — not registered as runnable programs
      if (entry.name === 'templates') continue;

      const programFile = join(fullPath, entry.name, 'program.ts');
      const programFileTsx = join(fullPath, entry.name, 'program.tsx');

      let targetFile = null;
      if (existsSync(programFile)) {
        targetFile = programFile;
      } else if (existsSync(programFileTsx)) {
        targetFile = programFileTsx;
      }

      if (targetFile) {
        const metadata = extractMetadata(targetFile);
        if (metadata) {
          programs.push(metadata);
        }
      }
    }
  }

  return programs;
}

/** Generate the virtual module source for the program registry. */
function generateVirtualModule(programs: ProgramMetadata[], rootDir: string): string {
  const eagerImports: string[] = [];
  const registryEntries: string[] = [];
  const listEntries: string[] = [];

  for (const program of programs) {
    // Get relative path from root
    const relativePath = program.path.replace(rootDir, '').replace(/\\/g, '/').replace(/^\//, '');

    // Eager-load so defineProgram side effects (dock, shortcuts, delete, icons) register at startup
    eagerImports.push(`import '/${relativePath}';`);

    registryEntries.push(`
  '${program.id}': {
    metadata: {
      id: '${program.id}',
      name: '${program.name}',
      icon: '${program.icon}',
    },
    load: () => import('/${relativePath}'),
  }`);

    listEntries.push(`
  {
    id: '${program.id}',
    name: '${program.name}',
    icon: '${program.icon}',
  }`);
  }

  return `${eagerImports.join('\n')}

export const programs = {${registryEntries.join(',')},
};

export const programList = [${listEntries.join(',')},
];
`;
}

/** Vite plugin that builds and hot-reloads the `virtual:programs` module. */
export function programsPlugin(): Plugin {
  let rootDir: string;
  let cachedModule: string | null = null;

  return {
    name: 'deskos-programs',
    enforce: 'pre',

    configResolved(config) {
      rootDir = config.root;
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        const programs = scanProgramDirectories(rootDir);
        cachedModule = generateVirtualModule(programs, rootDir);
        return cachedModule;
      }
    },

    handleHotUpdate({ file, server }) {
      // If a program.ts file changed, invalidate the virtual module
      if (file.includes('/programs/') || file.includes('/system/')) {
        if (file.endsWith('program.ts') || file.endsWith('program.tsx')) {
          const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
          if (module) {
            server.moduleGraph.invalidateModule(module);
            return [module];
          }
        }
      }
    },
  };
}
