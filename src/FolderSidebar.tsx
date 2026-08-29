import { useState, useEffect, useCallback } from 'react';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
  getRecentItems,
  getPathIcon,
  SPECIAL_LOCATIONS,
  type SpecialLocation,
} from '../file-system/file-system';
import { Icon } from '../components/Icon';
import { hasIcon, type IconName } from '@core/icons';
import { DESKOS_ITEM_IDS_MIME, readDraggedItemIds, moveItemsToPath } from '@core/desktop-shortcuts';

/**
 * Resolve a path/location icon name to a known `IconName`, falling back to `folder`.
 *
 * @param name - Preferred icon name
 * @returns Valid icon name for `<Icon />`
 */
function sidebarIcon(name: string): IconName {
  return (hasIcon(name as IconName) ? name : 'folder') as IconName;
}

/** Whether the drag payload can be dropped onto a sidebar path. */
function hasDeskosDragData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).some(
    (type) =>
      type === 'application/x-deskos-shortcut-id' ||
      type === 'application/x-deskos-folder-id' ||
      type === 'application/x-deskos-program-id' ||
      type === DESKOS_ITEM_IDS_MIME
  );
}

/** Props for the folder sidebar navigation panel. */
interface FolderSidebarProps {
  /** Currently open path (highlights matching items) */
  currentPath: string;
  /** Navigate the parent folder window to a path */
  onNavigate: (path: string) => void;
}

/** Folder-window sidebar: locations, favorites, and recent paths. */
export function FolderSidebar({ currentPath, onNavigate }: FolderSidebarProps) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentItems, setRecentItems] = useState<Array<{ path: string; timestamp: number }>>([]);
  const [expandedSections, setExpandedSections] = useState({
    recent: true,
    favorites: true,
    locations: true,
  });

  const loadData = useCallback(() => {
    setFavorites(getFavorites());
    setRecentItems(getRecentItems());
  }, []);

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('desktop-shortcuts-updated', handleUpdate);
    return () => {
      window.removeEventListener('desktop-shortcuts-updated', handleUpdate);
    };
  }, [loadData]);

  const toggleFavorite = useCallback(
    (path: string) => {
      if (isFavorite(path)) {
        removeFavorite(path);
      } else {
        addFavorite(path);
      }
      loadData();
    },
    [loadData]
  );

  const toggleSection = useCallback((section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  const handleLocationClick = useCallback(
    (location: SpecialLocation) => {
      const locationInfo = SPECIAL_LOCATIONS[location];
      onNavigate(locationInfo.path);
    },
    [onNavigate]
  );

  const isCurrentPath = (path: string) => currentPath === path;

  const handlePathDragOver = useCallback((path: string, e: React.DragEvent) => {
    if (!hasDeskosDragData(e.dataTransfer) || path === '/Applications') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over-target');
  }, []);

  const handlePathDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    e.currentTarget.classList.remove('drag-over-target');
  }, []);

  const handlePathDrop = useCallback((path: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over-target');

    if (!hasDeskosDragData(e.dataTransfer) || path === '/Applications') return;

    const itemIds = readDraggedItemIds(e.dataTransfer);
    if (itemIds.length === 0) return;

    moveItemsToPath(path, itemIds);
  }, []);

  return (
    <div className="folder-sidebar">
      <div className="folder-sidebar-header">
        <h3 className="folder-sidebar-title">Navigation</h3>
      </div>

      <div className="folder-sidebar-content">
        <div className="folder-sidebar-section">
          <button
            className="folder-sidebar-section-header"
            onClick={() => toggleSection('locations')}
          >
            <span className="folder-sidebar-section-icon">
              <Icon
                name={expandedSections.locations ? 'chevron-down' : 'chevron-right'}
                size={16}
              />
            </span>
            <span className="folder-sidebar-section-title">Locations</span>
          </button>
          {expandedSections.locations && (
            <div className="folder-sidebar-section-content">
              {Object.entries(SPECIAL_LOCATIONS).map(([key, location]) => (
                <button
                  key={key}
                  type="button"
                  className={`folder-sidebar-item ${isCurrentPath(location.path) ? 'active' : ''}`}
                  data-drop-path={location.path}
                  onClick={() => handleLocationClick(key as SpecialLocation)}
                  onDragOver={(e) => handlePathDragOver(location.path, e)}
                  onDragLeave={handlePathDragLeave}
                  onDrop={(e) => handlePathDrop(location.path, e)}
                  title={location.path}
                >
                  <span className="folder-sidebar-item-icon">
                    <Icon name={sidebarIcon(location.icon)} size={18} />
                  </span>
                  <span className="folder-sidebar-item-label">{location.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="folder-sidebar-section">
          <button
            className="folder-sidebar-section-header"
            onClick={() => toggleSection('favorites')}
          >
            <span className="folder-sidebar-section-icon">
              <Icon
                name={expandedSections.favorites ? 'chevron-down' : 'chevron-right'}
                size={16}
              />
            </span>
            <span className="folder-sidebar-section-title">Favorites</span>
          </button>
          {expandedSections.favorites && (
            <div className="folder-sidebar-section-content">
              {favorites.length === 0 ? (
                <div className="folder-sidebar-empty">No favorites</div>
              ) : (
                favorites.map((path) => (
                  <div key={path} className="folder-sidebar-item-row">
                    <button
                      type="button"
                      className={`folder-sidebar-item ${isCurrentPath(path) ? 'active' : ''}`}
                      data-drop-path={path}
                      onClick={() => onNavigate(path)}
                      onDragOver={(e) => handlePathDragOver(path, e)}
                      onDragLeave={handlePathDragLeave}
                      onDrop={(e) => handlePathDrop(path, e)}
                      title={path}
                    >
                      <span className="folder-sidebar-item-icon">
                        <Icon name={sidebarIcon(getPathIcon(path))} size={18} />
                      </span>
                      <span className="folder-sidebar-item-label">
                        {path.split('/').pop() || path}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="folder-sidebar-item-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(path);
                      }}
                      title={isFavorite(path) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {isFavorite(path) ? '★' : '☆'}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="folder-sidebar-section">
          <button className="folder-sidebar-section-header" onClick={() => toggleSection('recent')}>
            <span className="folder-sidebar-section-icon">
              <Icon name={expandedSections.recent ? 'chevron-down' : 'chevron-right'} size={16} />
            </span>
            <span className="folder-sidebar-section-title">Recent</span>
          </button>
          {expandedSections.recent && (
            <div className="folder-sidebar-section-content">
              {recentItems.length === 0 ? (
                <div className="folder-sidebar-empty">No recent items</div>
              ) : (
                recentItems.slice(0, 10).map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    className={`folder-sidebar-item ${isCurrentPath(item.path) ? 'active' : ''}`}
                    data-drop-path={item.path}
                    onClick={() => onNavigate(item.path)}
                    onDragOver={(e) => handlePathDragOver(item.path, e)}
                    onDragLeave={handlePathDragLeave}
                    onDrop={(e) => handlePathDrop(item.path, e)}
                    title={item.path}
                  >
                    <span className="folder-sidebar-item-icon">
                      <Icon name={sidebarIcon(getPathIcon(item.path))} size={18} />
                    </span>
                    <span className="folder-sidebar-item-label">
                      {item.path.split('/').pop() || item.path}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
