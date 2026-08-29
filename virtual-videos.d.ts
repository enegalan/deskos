declare module 'virtual:videos' {
  /** Videos discovered under `public/video/`, name-sorted. */
  export const videos: Array<{
    /** Original file name (item label). */
    name: string;
    /** URL-encoded path served by Vite from `public/`. */
    url: string;
  }>;
}
