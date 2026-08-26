/**
 * Wallpaper storage using IndexedDB for large image files
 * IndexedDB has much larger storage limits than localStorage
 */

const DB_NAME = 'deskos-wallpapers';
const DB_VERSION = 1;
const STORE_NAME = 'wallpapers';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    if (!indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[WallpaperStorage] Database open error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('[WallpaperStorage] Database opened successfully');
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      console.log('[WallpaperStorage] Database upgrade needed');
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
        console.log('[WallpaperStorage] Object store created');
      }
    };

    request.onblocked = () => {
      console.warn('[WallpaperStorage] Database open blocked');
    };
  });

  return dbPromise;
}

/**
 * Store a wallpaper image in IndexedDB
 * @param dataUrl The data URL of the image
 * @returns A reference ID that can be stored in settings
 */
export async function storeWallpaper(dataUrl: string): Promise<string> {
  try {
    console.log('[WallpaperStorage] Opening database...');
    const db = await openDatabase();
    console.log('[WallpaperStorage] Database opened');
    
    const id = `wallpaper-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[WallpaperStorage] Generated ID:', id);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      console.log('[WallpaperStorage] Storing data, size:', dataUrl.length);
      
      const request = store.put(dataUrl, id);

      request.onsuccess = () => {
        console.log('[WallpaperStorage] Successfully stored wallpaper');
        resolve(id);
      };

      request.onerror = () => {
        console.error('[WallpaperStorage] Store error:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[WallpaperStorage] Failed to store wallpaper:', error);
    throw error;
  }
}

/**
 * Retrieve a wallpaper image from IndexedDB
 * @param id The reference ID stored in settings
 * @returns The data URL of the image, or null if not found
 */
export async function getWallpaper(id: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[WallpaperStorage] Failed to get wallpaper:', error);
    return null;
  }
}

/**
 * Delete a wallpaper from IndexedDB
 * @param id The reference ID to delete
 */
export async function deleteWallpaper(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[WallpaperStorage] Failed to delete wallpaper:', error);
    throw error;
  }
}

/**
 * Check if a wallpaper value is a reference ID (starts with 'wallpaper-')
 * vs a direct data URL or gradient
 */
export function isWallpaperReference(value: string): boolean {
  return value.startsWith('wallpaper-');
}

/**
 * Metadata for a custom wallpaper
 */
export interface WallpaperMetadata {
  id: string;
  name: string;
  thumbnail: string; // Data URL for thumbnail
  dateAdded: number;
  fileSize: number;
}

const WALLPAPERS_LIST_KEY = 'deskos:custom-wallpapers';

/**
 * Generate a thumbnail from a data URL
 */
function generateThumbnail(dataUrl: string, maxWidth: number = 200, maxHeight: number = 120): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate thumbnail dimensions
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * Get list of saved custom wallpapers
 */
export function getCustomWallpapers(): WallpaperMetadata[] {
  try {
    const stored = localStorage.getItem(WALLPAPERS_LIST_KEY);
    if (stored) {
      return JSON.parse(stored) as WallpaperMetadata[];
    }
  } catch (error) {
    console.error('[WallpaperStorage] Failed to load custom wallpapers list:', error);
  }
  return [];
}

/**
 * Save a custom wallpaper with metadata
 */
export async function saveCustomWallpaper(
  dataUrl: string,
  fileName: string,
  fileSize: number
): Promise<WallpaperMetadata> {
  // Store the full image in IndexedDB
  const id = await storeWallpaper(dataUrl);

  // Generate thumbnail
  const thumbnail = await generateThumbnail(dataUrl);

  // Create metadata
  const metadata: WallpaperMetadata = {
    id,
    name: fileName || `Wallpaper ${new Date().toLocaleDateString()}`,
    thumbnail,
    dateAdded: Date.now(),
    fileSize,
  };

  // Save metadata to localStorage
  const wallpapers = getCustomWallpapers();
  wallpapers.push(metadata);
  localStorage.setItem(WALLPAPERS_LIST_KEY, JSON.stringify(wallpapers));

  return metadata;
}

/**
 * Remove a custom wallpaper
 */
export async function removeCustomWallpaper(id: string): Promise<void> {
  // Remove from IndexedDB
  await deleteWallpaper(id);

  // Remove from metadata list
  const wallpapers = getCustomWallpapers();
  const filtered = wallpapers.filter((wp) => wp.id !== id);
  localStorage.setItem(WALLPAPERS_LIST_KEY, JSON.stringify(filtered));
}

/**
 * Get all wallpaper IDs (for cleanup purposes)
 */
export async function getAllWallpaperIds(): Promise<string[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result as string[]);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[WallpaperStorage] Failed to get wallpaper IDs:', error);
    return [];
  }
}
