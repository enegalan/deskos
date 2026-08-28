import type { ProgramContext } from '@core/context';
import { getMaxIconSize, useKernel, type DateFormat } from '@core/kernel';
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_ICON_SIZE,
  MAX_GRID_SIZE,
  MIN_GRID_SIZE,
  MIN_ICON_SIZE,
} from '@core/constants';
import { saveCustomWallpaper, getCustomWallpapers, removeCustomWallpaper, type WallpaperMetadata } from '@core/wallpaper-storage';
import { BUILTIN_WALLPAPERS } from '../../wallpapers/wallpapers';
import { useState, useEffect } from 'react';

/** Host browser label from userAgent (no version noise). */
function getBrowserLabel(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
  return 'Browser';
}

/** Host OS label from userAgent. */
function getPlatformLabel(): string {
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return navigator.platform || 'Unknown';
}

/** Rough localStorage footprint used by DeskOS keys. */
function getStorageUsageLabel(): string {
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    bytes += key.length + (localStorage.getItem(key)?.length ?? 0);
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Props for the Settings program window. */
interface SettingsWindowProps {
  /** Program context (system info, etc.) */
  ctx: ProgramContext;
}

/** Common IANA timezones for the Date & Time settings. */
const TIMEZONES = [
  { label: 'UTC', value: 'UTC' },
  { label: 'New York (EST/EDT)', value: 'America/New_York' },
  { label: 'Chicago (CST/CDT)', value: 'America/Chicago' },
  { label: 'Denver (MST/MDT)', value: 'America/Denver' },
  { label: 'Los Angeles (PST/PDT)', value: 'America/Los_Angeles' },
  { label: 'Mexico City', value: 'America/Mexico_City' },
  { label: 'São Paulo', value: 'America/Sao_Paulo' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'Paris (CET/CEST)', value: 'Europe/Paris' },
  { label: 'Madrid (CET/CEST)', value: 'Europe/Madrid' },
  { label: 'Berlin (CET/CEST)', value: 'Europe/Berlin' },
  { label: 'Rome (CET/CEST)', value: 'Europe/Rome' },
  { label: 'Moscow (MSK)', value: 'Europe/Moscow' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Shanghai (CST)', value: 'Asia/Shanghai' },
  { label: 'Hong Kong (HKT)', value: 'Asia/Hong_Kong' },
  { label: 'Dubai (GST)', value: 'Asia/Dubai' },
  { label: 'Kolkata (IST)', value: 'Asia/Kolkata' },
  { label: 'Sydney (AEDT/AEST)', value: 'Australia/Sydney' },
  { label: 'Auckland (NZDT/NZST)', value: 'Pacific/Auckland' },
];

/** Dock date format choices (label = example layout). */
const DATE_FORMAT_OPTIONS: Array<{ id: DateFormat; label: string }> = [
  { id: 'medium', label: 'Aug 27, 2026' },
  { id: 'long', label: 'Thursday, August 27, 2026' },
  { id: 'iso', label: '2026-08-27' },
  { id: 'dmy', label: '27/08/2026' },
  { id: 'mdy', label: '08/27/2026' },
];

/** Settings app UI: appearance, wallpaper, desktop icons, and date/time. */
export function SettingsWindow({ ctx }: SettingsWindowProps) {
  const settings = useKernel((state) => state.settings);
  const updateSettings = useKernel((state) => state.updateSettings);
  const [customWallpapers, setCustomWallpapers] = useState<WallpaperMetadata[]>([]);
  const [storageUsage, setStorageUsage] = useState(() => getStorageUsageLabel());

  useEffect(() => {
    setStorageUsage(getStorageUsageLabel());
  }, [customWallpapers, settings]);

  // Load custom wallpapers on mount
  useEffect(() => {
    const loadCustomWallpapers = () => {
      const wallpapers = getCustomWallpapers();
      setCustomWallpapers(wallpapers);
    };
    loadCustomWallpapers();
  }, []);

  const handleThemeToggle = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  const handleWallpaperChange = (wallpaper: string) => {
    updateSettings({ wallpaper });
  };

  const handleTimeFormatChange = (format: '12h' | '24h') => {
    updateSettings({ timeFormat: format });
  };

  const handleTimezoneChange = (timezone: string) => {
    updateSettings({ timezone });
  };

  const handleShowDateToggle = () => {
    updateSettings({ showDate: !settings.showDate });
  };

  const handleDateFormatChange = (dateFormat: DateFormat) => {
    updateSettings({ dateFormat });
  };

  const handleShowSecondsToggle = () => {
    updateSettings({ showSeconds: !settings.showSeconds });
  };

  const handleWallpaperUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log('[Settings] No file selected');
      return;
    }

    console.log('[Settings] File selected:', file.name, file.type, file.size);

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB');
      return;
    }

    // Read file as data URL
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      console.log('[Settings] File read, data URL length:', dataUrl?.length);
      
      if (dataUrl) {
        try {
          console.log('[Settings] Saving custom wallpaper...');
          // Save wallpaper with metadata
          const metadata = await saveCustomWallpaper(dataUrl, file.name, file.size);
          console.log('[Settings] Wallpaper saved with metadata:', metadata);
          
          // Update the list
          setCustomWallpapers(getCustomWallpapers());
          
          // Set as current wallpaper
          updateSettings({ wallpaper: metadata.id });
          console.log('[Settings] Settings updated');
        } catch (error) {
          console.error('[Settings] Failed to save wallpaper:', error);
          alert('Failed to save wallpaper: ' + (error instanceof Error ? error.message : String(error)));
        }
      } else {
        console.error('[Settings] No data URL generated');
        alert('Error reading image file');
      }
    };
    reader.onerror = (error) => {
      console.error('[Settings] FileReader error:', error);
      alert('Error reading image file');
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  };

  const handleDeleteCustomWallpaper = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this wallpaper?')) {
      try {
        await removeCustomWallpaper(id);
        setCustomWallpapers(getCustomWallpapers());
        // If this was the current wallpaper, clear it
        if (settings.wallpaper === id) {
          updateSettings({ wallpaper: '' });
        }
      } catch (error) {
        console.error('[Settings] Failed to delete wallpaper:', error);
        alert('Failed to delete wallpaper');
      }
    }
  };

  const handleAccentColorChange = (color: string) => {
    updateSettings({ accentColor: color });
  };

  const handleIconSizeChange = (size: number) => {
    updateSettings({ iconSize: size });
  };

  const handleGridSizeChange = (size: number) => {
    const validSize = Math.max(MIN_GRID_SIZE, size);
    updateSettings({ gridSize: validSize });
    // Realign all icons to the new grid size
    import('@core/desktop-shortcuts').then(({ realignIconsToGrid }) => {
      realignIconsToGrid();
    });
  };

  const handleAutoArrangeToggle = () => {
    const newAutoArrange = !settings.autoArrange;
    updateSettings({ autoArrange: newAutoArrange });
    
    // If enabling, arrange icons immediately
    if (newAutoArrange) {
      import('@core/desktop-shortcuts').then(({ autoArrangeIcons }) => {
        autoArrangeIcons();
      });
    }
  };

  const handleShowIconLabelsToggle = () => {
    updateSettings({ showIconLabels: !settings.showIconLabels });
  };

  const handleResetIconSize = () => {
    updateSettings({ iconSize: DEFAULT_ICON_SIZE });
  };

  const handleResetGridSize = () => {
    updateSettings({ gridSize: DEFAULT_GRID_SIZE });
    // Realign all icons to the new grid size
    import('@core/desktop-shortcuts').then(({ realignIconsToGrid }) => {
      realignIconsToGrid();
    });
  };

  return (
    <div className="settings-container">
      <div className="settings-section">
        <div className="settings-section-title">Appearance</div>

        <div className="settings-row">
          <span className="settings-label">Dark Mode</span>
          <button
            className={`settings-toggle ${settings.theme === 'dark' ? 'active' : ''}`}
            onClick={handleThemeToggle}
          />
        </div>

        <div className="settings-row">
          <span className="settings-label">Accent Color</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="color"
              value={settings.accentColor}
              onChange={(e) => handleAccentColorChange(e.target.value)}
              style={{
                width: '40px',
                height: '30px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            />
            <div style={{ display: 'flex', gap: '4px' }}>
              {['#5c9fff', '#4ade80', '#f87171', '#fbbf24', '#a78bfa', '#ec4899'].map((color) => (
                <button
                  key={color}
                  onClick={() => handleAccentColorChange(color)}
                  style={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: color,
                    border: settings.accentColor === color ? '2px solid var(--color-text-primary)' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}
                  title={color}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Wallpaper</div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {BUILTIN_WALLPAPERS.map((wp) => (
            <button
              key={wp.id}
              onClick={() => handleWallpaperChange(wp.value)}
              style={{
                width: 60,
                height: 40,
                border: settings.wallpaper === wp.value ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                background: wp.value || 'var(--color-bg-tertiary)',
                cursor: 'pointer',
                transition: 'border-color var(--transition-fast)',
              }}
              title={wp.name}
            />
          ))}
        </div>

        {customWallpapers.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
              Custom Wallpapers
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {customWallpapers.map((wp) => (
                <div
                  key={wp.id}
                  style={{
                    position: 'relative',
                    width: 60,
                    height: 40,
                  }}
                >
                  <button
                    onClick={() => handleWallpaperChange(wp.id)}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: settings.wallpaper === wp.id ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      backgroundImage: `url(${wp.thumbnail})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      cursor: 'pointer',
                      transition: 'border-color var(--transition-fast)',
                      padding: 0,
                    }}
                    title={wp.name}
                  />
                  <button
                    onClick={(e) => handleDeleteCustomWallpaper(wp.id, e)}
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: 'var(--color-error)',
                      border: '1px solid var(--color-border)',
                      color: 'white',
                      fontSize: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      lineHeight: 1,
                    }}
                    title="Delete wallpaper"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '8px' }}>
          <label
            className="settings-action-button"
            style={{
              display: 'inline-block',
              padding: '6px 12px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Upload Custom Image
            <input
              type="file"
              accept="image/*"
              onChange={handleWallpaperUpload}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Desktop Icons</div>

        <div className="settings-row">
          <span className="settings-label">Auto Arrange Icons</span>
          <button
            className={`settings-toggle ${settings.autoArrange ? 'active' : ''}`}
            onClick={handleAutoArrangeToggle}
          />
        </div>

        <div className="settings-row">
          <span className="settings-label">Show Icon Labels</span>
          <button
            className={`settings-toggle ${settings.showIconLabels ? 'active' : ''}`}
            onClick={handleShowIconLabelsToggle}
          />
        </div>

        <div className="settings-row">
          <span className="settings-label">Icon Size: {settings.iconSize}px</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="range"
              min={MIN_ICON_SIZE}
              max={getMaxIconSize(settings.gridSize, settings.showIconLabels)}
              value={settings.iconSize}
              onChange={(e) => handleIconSizeChange(parseInt(e.target.value, 10))}
              style={{
                width: '150px',
              }}
            />
            <button
              onClick={handleResetIconSize}
              style={{
                padding: '4px 8px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-bg-elevated)',
                color: 'var(--color-text-primary)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              title={`Reset to default (${DEFAULT_ICON_SIZE}px)`}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Grid Size: {settings.gridSize}px</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="range"
              min={MIN_GRID_SIZE}
              max={MAX_GRID_SIZE}
              value={settings.gridSize}
              onChange={(e) => handleGridSizeChange(parseInt(e.target.value, 10))}
              style={{
                width: '150px',
              }}
            />
            <button
              onClick={handleResetGridSize}
              style={{
                padding: '4px 8px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-bg-elevated)',
                color: 'var(--color-text-primary)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              title={`Reset to default (${DEFAULT_GRID_SIZE}px)`}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Date & Time</div>

        <div className="settings-row">
          <span className="settings-label">Time Format</span>
          <div className="settings-format-buttons">
            <button
              className={`settings-format-button ${settings.timeFormat === '12h' ? 'active' : ''}`}
              onClick={() => handleTimeFormatChange('12h')}
            >
              12-hour
            </button>
            <button
              className={`settings-format-button ${settings.timeFormat === '24h' ? 'active' : ''}`}
              onClick={() => handleTimeFormatChange('24h')}
            >
              24-hour
            </button>
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Timezone</span>
          <select
            value={settings.timezone}
            onChange={(e) => handleTimezoneChange(e.target.value)}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-primary)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <span className="settings-label">Show Date</span>
          <button
            className={`settings-toggle ${settings.showDate ? 'active' : ''}`}
            onClick={handleShowDateToggle}
          />
        </div>

        <div className="settings-row">
          <span className="settings-label">Date Format</span>
          <select
            value={settings.dateFormat}
            onChange={(e) => handleDateFormatChange(e.target.value as DateFormat)}
            disabled={!settings.showDate}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-primary)',
              fontSize: '12px',
              cursor: settings.showDate ? 'pointer' : 'not-allowed',
              opacity: settings.showDate ? 1 : 0.5,
            }}
          >
            {DATE_FORMAT_OPTIONS.map((fmt) => (
              <option key={fmt.id} value={fmt.id}>
                {fmt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <span className="settings-label">Show Seconds</span>
          <button
            className={`settings-toggle ${settings.showSeconds ? 'active' : ''}`}
            onClick={handleShowSecondsToggle}
          />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">System Information</div>

        <div className="settings-about">
          <div className="settings-about-name">DeskOS</div>
          <div className="settings-about-tagline">Modular desktop environment in the browser</div>
          <div className="settings-about-version">v{ctx.system.version}</div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Browser</span>
          <span className="settings-info-value">{getBrowserLabel()}</span>
        </div>

        <div className="settings-row">
          <span className="settings-label">Platform</span>
          <span className="settings-info-value">{getPlatformLabel()}</span>
        </div>

        <div className="settings-row">
          <span className="settings-label">Display</span>
          <span className="settings-info-value">
            {window.screen.width} × {window.screen.height}
          </span>
        </div>

        <div className="settings-row">
          <span className="settings-label">Local storage</span>
          <span className="settings-info-value">{storageUsage}</span>
        </div>
      </div>
    </div>
  );
}
