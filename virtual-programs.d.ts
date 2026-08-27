declare module 'virtual:programs' {
  import type { ProgramDefinition } from '@core/program';

  export interface ProgramRegistry {
    [id: string]: {
      metadata: {
        id: string;
        name: string;
        icon: string;
      };
      load: () => Promise<{ default: ProgramDefinition }>;
    };
  }

  export const programs: ProgramRegistry;
  export const programList: Array<{
    id: string;
    name: string;
    icon: string;
  }>;
}
