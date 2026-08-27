import { useState, useEffect, useCallback } from 'react';
import {
  SPECIAL_LOCATIONS,
  getFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
  getRecentItems,
  getPathIcon,
  type SpecialLocation,
} from '@core/file-system';
import { Icon } from '../components/Icon';
import { hasIcon, type IconName } from '@core/icons';

function sidebarIcon(name: string): IconName {
  return (hasIcon(name as IconName) ? name : 'folder') as IconName;
}

interface FolderSidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

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

  const toggleFavorite = useCallback((path: string) => {
    if (isFavorite(path)) {
      removeFavorite(path);
    } else {
      addFavorite(path);
    }
    loadData();
  }, [loadData]);

  const toggleSection = useCallback((section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  const handleLocationClick = useCallback((location: SpecialLocation) => {
    const locationInfo = SPECIAL_LOCATIONS[location];
    onNavigate(locationInfo.path);
  }, [onNavigate]);

  const isCurrentPath = (path: string) => {
    return currentPath === path || currentPath.startsWith(path + '/');
  };

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
              <Icon name={expandedSections.locations ? 'chevron-down' : 'chevron-right'} size={16} />
            </span>
            <span className="folder-sidebar-section-title">Locations</span>
          </button>
          {expandedSections.locations && (
            <div className="folder-sidebar-section-content">
              {Object.entries(SPECIAL_LOCATIONS).map(([key, location]) => (
                <button
                  key={key}
                  className={`folder-sidebar-item ${isCurrentPath(location.path) ? 'active' : ''}`}
                  onClick={() => handleLocationClick(key as SpecialLocation)}
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
              <Icon name={expandedSections.favorites ? 'chevron-down' : 'chevron-right'} size={16} />
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
                      className={`folder-sidebar-item ${isCurrentPath(path) ? 'active' : ''}`}
                      onClick={() => onNavigate(path)}
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
          <button
            className="folder-sidebar-section-header"
            onClick={() => toggleSection('recent')}
          >
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
                    className={`folder-sidebar-item ${isCurrentPath(item.path) ? 'active' : ''}`}
                    onClick={() => onNavigate(item.path)}
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
