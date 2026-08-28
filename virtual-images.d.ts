declare module 'virtual:images' {
  /** Images discovered under `public/img/`, name-sorted. */
  export const images: Array<{
    /** Original file name (item label). */
    name: string;
    /** URL-encoded path served by Vite from `public/`. */
    url: string;
  }>;
}
