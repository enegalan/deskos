import { Plugin } from 'vite';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

interface ProgramMetadata {
  id: string;
  name: string;
  icon: string;
  path: string;
}

const VIRTUAL_MODULE_ID = 'virtual:programs';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

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

function scanProgramDirectories(rootDir: string): ProgramMetadata[] {
  const programs: ProgramMetadata[] = [];
  const directories = ['programs', 'system'];

  for (const dir of directories) {
    const fullPath = resolve(rootDir, dir);
    if (!existsSync(fullPath)) continue;

    const entries = readdirSync(fullPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

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

function generateVirtualModule(programs: ProgramMetadata[], rootDir: string): string {
  const imports: string[] = [];
  const registryEntries: string[] = [];
  const listEntries: string[] = [];

  for (const program of programs) {
    // Get relative path from root
    const relativePath = program.path
      .replace(rootDir, '')
      .replace(/\\/g, '/')
      .replace(/^\//, '');

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

  return `${imports.join('\n')}

export const programs = {${registryEntries.join(',')},
};

export const programList = [${listEntries.join(',')},
];
`;
}

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
