import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProgramContext } from '@core/context';
import { programs } from 'virtual:programs';
import { useKernel, type FolderViewMode } from '@core/kernel';
import { ICON_EMOJI_SCALE, ICON_GLYPH_SCALE } from '@core/constants';
import {
  getTrashItems,
  restoreFromTrash,
  deleteForever,
  emptyTrash,
  isTrashEmpty,
  getTrashEntryName,
  getTrashEntryIcon,
  resolveProgramIcon,
  type TrashEntry,
} from '@core/trash';
import {
  getGridSize,
  isDesktopFolder,
  isDesktopShortcut,
} from '@core/desktop-shortcuts';
import { Icon } from '../../components/Icon';
import { hasIcon, type IconName } from '@core/icons';

interface TrashWindowProps {
  /** Program context for this Trash window */
  ctx: ProgramContext;
}

/** Icon name for a trash entry (folder icon or program / trash icon). */
function entryIconName(entry: TrashEntry): string {
  if (isDesktopFolder(entry.item)) {
    return entry.item.icon || 'folder';
  }
  if (isDesktopShortcut(entry.item)) {
    const meta = programs[entry.item.programId]?.metadata;
    return resolveProgramIcon(
      entry.item.programId,
      meta?.icon || entry.item.programId
    );
  }
  return getTrashEntryIcon(entry);
}

/** Display label for a trash entry. */
function entryLabel(entry: TrashEntry): string {
  if (isDesktopFolder(entry.item)) return entry.item.name;
  if (isDesktopShortcut(entry.item)) {
    const meta = programs[entry.item.programId]?.metadata;
    return entry.item.customName || meta?.name || entry.item.programId;
  }
  return getTrashEntryName(entry);
}

/** Trash app UI: folder-like grid/list of soft-deleted items. */
export function TrashWindow({ ctx }: TrashWindowProps) {
  const settings = useKernel((state) => state.settings);
  const updateSettings = useKernel((state) => state.updateSettings);
  const viewMode: FolderViewMode = settings.folderViewMode === 'list' ? 'list' : 'grid';
  const [items, setItems] = useState<TrashEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(() => {
    setItems(getTrashItems());
  }, []);

  useEffect(() => {
    loadItems();
    const refresh = () => loadItems();
    window.addEventListener('trash-updated', refresh);
    return () => window.removeEventListener('trash-updated', refresh);
  }, [loadItems]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (items.some((entry) => entry.id === id)) next.add(id);
      }
      return next;
    });
  }, [items]);

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  useEffect(() => {
    return ctx.selection.register(() => {
      const ids = Array.from(selectedIdsRef.current);
      if (ids.length === 0) return null;
      return { type: 'trash-items', ids, count: ids.length };
    });
  }, [ctx]);

  useEffect(() => {
    const unsubItem = ctx.contextMenu.register('.folder-window-item', {
      id: 'trash-item-menu',
      priority: 10,
      generator: (context) => {
        const itemEl = context.target.closest('.folder-window-item') as HTMLElement | null;
        const itemId = itemEl?.dataset.itemId;
        if (!itemId) return [];

        const selection = context.selection as
          | { type: string; ids: string[] }
          | undefined;
        const selectedIdsForMenu =
          selection?.type === 'trash-items' &&
          selection.ids.length > 0 &&
          selection.ids.includes(itemId)
            ? selection.ids
            : [itemId];
        const isMultiple = selectedIdsForMenu.length > 1;

        return [
          {
            id: 'trash-item-restore',
            label: isMultiple
              ? `Restore (${selectedIdsForMenu.length} items)`
              : 'Restore',
            icon: 'restore',
            action: () => {
              restoreFromTrash(selectedIdsForMenu);
              setSelectedIds(new Set());
              ctx.events.emit('trash:restored', { ids: selectedIdsForMenu });
            },
          },
          {
            id: 'trash-item-separator',
            type: 'separator' as const,
            label: '',
          },
          {
            id: 'trash-item-delete-forever',
            label: isMultiple
              ? `Delete Forever (${selectedIdsForMenu.length} items)`
              : 'Delete Forever',
            icon: 'delete',
            action: () => {
              const count = selectedIdsForMenu.length;
              const ok = confirm(
                count === 1
                  ? 'Are you sure you want to permanently delete this item?'
                  : `Are you sure you want to permanently delete ${count} items?`
              );
              if (!ok) return;
              deleteForever(selectedIdsForMenu);
              setSelectedIds(new Set());
            },
          },
        ];
      },
    });

    const unsubBackground = ctx.contextMenu.register('.folder-window-main', {
      id: 'trash-background-menu',
      priority: 5,
      generator: (context) => {
        if (context.target.closest('.folder-window-item')) {
          return [];
        }
        const mode: FolderViewMode =
          useKernel.getState().settings.folderViewMode === 'list' ? 'list' : 'grid';
        const empty = isTrashEmpty();

        return [
          {
            id: 'trash-view',
            label: 'View',
            icon: 'view',
            type: 'submenu' as const,
            submenu: [
              {
                id: 'trash-view-grid',
                label: 'as Grid',
                icon: 'view-grid',
                type: 'radio' as const,
                checked: mode === 'grid',
                group: 'trash-view-mode',
                action: () => {
                  useKernel.getState().updateSettings({ folderViewMode: 'grid' });
                },
              },
              {
                id: 'trash-view-list',
                label: 'as List',
                icon: 'view-list',
                type: 'radio' as const,
                checked: mode === 'list',
                group: 'trash-view-mode',
                action: () => {
                  useKernel.getState().updateSettings({ folderViewMode: 'list' });
                },
              },
            ],
          },
          {
            id: 'trash-bg-separator',
            type: 'separator' as const,
            label: '',
          },
          {
            id: 'trash-empty',
            label: 'Empty Trash',
            icon: 'delete',
            enabled: !empty,
            action: () => {
              if (isTrashEmpty()) return;
              if (
                !confirm(
                  'Are you sure you want to permanently erase the items in the Trash?'
                )
              ) {
                return;
              }
              emptyTrash();
              setSelectedIds(new Set());
            },
          },
        ];
      },
    });

    return () => {
      unsubItem();
      unsubBackground();
    };
  }, [ctx]);

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    const additive = e.metaKey || e.ctrlKey;
    setSelectedIds((prev) => {
      if (!additive) {
        return new Set([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.folder-window-item')) return;
    setSelectedIds(new Set());
  }, []);

  const handleRestore = useCallback(() => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    restoreFromTrash(ids);
    setSelectedIds(new Set());
    ctx.events.emit('trash:restored', { ids });
  }, [selectedIds, ctx.events]);

  const handleDeleteForever = useCallback(() => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const ok = confirm(
      count === 1
        ? 'Are you sure you want to permanently delete this item?'
        : `Are you sure you want to permanently delete ${count} items?`
    );
    if (!ok) return;
    deleteForever(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const handleEmpty = useCallback(() => {
    if (isTrashEmpty()) return;
    if (!confirm('Are you sure you want to permanently erase the items in the Trash?')) {
      return;
    }
    emptyTrash();
    setSelectedIds(new Set());
  }, []);

  const setViewMode = useCallback(
    (mode: FolderViewMode) => {
      updateSettings({ folderViewMode: mode });
    },
    [updateSettings]
  );

  const renderItemIcon = (icon: string, size: number, color?: string) => (
    <div
      className="folder-window-item-icon"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {hasIcon(icon as IconName) ? (
        <Icon
          name={icon as IconName}
          size={size * ICON_GLYPH_SCALE}
          color={color}
          fallback={
            typeof icon === 'string' && !hasIcon(icon as IconName) ? icon : undefined
          }
        />
      ) : (
        <span style={{ fontSize: `${size * ICON_EMOJI_SCALE}px` }}>{icon}</span>
      )}
    </div>
  );

  const empty = items.length === 0;
  const gridSize = getGridSize();
  const listIconSize = 20;
  const isList = viewMode === 'list';

  return (
    <div className="folder-window-content trash-window">
      <div className="folder-window-header trash-header">
        <div className="trash-toolbar">
          <button
            type="button"
            className="trash-toolbar-btn"
            disabled={selectedIds.size === 0}
            onClick={handleRestore}
          >
            Restore
          </button>
          <button
            type="button"
            className="trash-toolbar-btn"
            disabled={selectedIds.size === 0}
            onClick={handleDeleteForever}
          >
            Delete Forever
          </button>
          <button
            type="button"
            className="trash-toolbar-btn trash-toolbar-btn-danger"
            disabled={empty}
            onClick={handleEmpty}
          >
            Empty Trash
          </button>
        </div>
        <div className="folder-window-view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`folder-view-button ${viewMode === 'grid' ? 'active' : ''}`}
            aria-pressed={viewMode === 'grid'}
            title="Grid view"
            onClick={() => setViewMode('grid')}
          >
            <Icon name="view-grid" size={14} />
          </button>
          <button
            type="button"
            className={`folder-view-button ${viewMode === 'list' ? 'active' : ''}`}
            aria-pressed={viewMode === 'list'}
            title="List view"
            onClick={() => setViewMode('list')}
          >
            <Icon name="view-list" size={14} />
          </button>
        </div>
      </div>

      <div className="folder-window-body">
        <div
          ref={contentRef}
          className="folder-window-main"
          onClick={clearSelection}
        >
          <div className="folder-window-title">Trash</div>
          <div className={`folder-window-grid view-${viewMode}`} ref={gridRef}>
            {empty ? (
              <div className="folder-window-empty">Trash is empty</div>
            ) : (
              items.map((entry, index) => {
                const containerWidth = contentRef.current?.clientWidth || 800;
                const itemsPerRow = Math.max(
                  1,
                  Math.floor((containerWidth - 32) / (gridSize + 16))
                );
                const row = Math.floor(index / itemsPerRow);
                const col = index % itemsPerRow;
                const gridStyle = isList
                  ? undefined
                  : {
                      left: `${col * (gridSize + 16) + 16}px`,
                      top: `${row * (gridSize + 64) + 16}px`,
                      width: `${gridSize}px`,
                    };
                const iconSize = isList ? listIconSize : settings.iconSize;
                const selectedClass = selectedIds.has(entry.id) ? 'selected' : '';
                const icon = entryIconName(entry);
                const isFolder = isDesktopFolder(entry.item);

                return (
                  <div
                    key={entry.id}
                    className={`folder-window-item ${isFolder ? 'folder-item' : 'shortcut-item'} ${selectedClass}`}
                    data-item-id={entry.id}
                    style={gridStyle}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(entry.id, e);
                    }}
                    onContextMenu={() => {
                      if (!selectedIds.has(entry.id)) {
                        const next = new Set([entry.id]);
                        selectedIdsRef.current = next;
                        setSelectedIds(next);
                      }
                    }}
                    onDoubleClick={() => {
                      restoreFromTrash([entry.id]);
                      setSelectedIds(new Set());
                      ctx.events.emit('trash:restored', { ids: [entry.id] });
                    }}
                  >
                    {renderItemIcon(
                      icon,
                      iconSize,
                      isFolder ? 'var(--color-accent)' : undefined
                    )}
                    {(isList || settings.showIconLabels) && (
                      <div className="folder-window-item-label">{entryLabel(entry)}</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
