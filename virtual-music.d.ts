declare module 'virtual:music' {
  /** Tracks discovered under `public/music/`, name-sorted. */
  export const music: Array<{
    /** Original file name (item label). */
    name: string;
    /** URL-encoded path served by Vite from `public/`. */
    url: string;
  }>;
}
