import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
} from 'react';
import type { ProgramContext } from '@core/context';
import { useWindowSessionState } from '@core/window-session';
import { TITLE_PATH } from '../../vite-plugin-page-title';
import { Icon } from '@components/Icon';

/** Internal URL for the new-tab home page. */
const HOME_URL = 'about:home';
/** Dino game bookmark/shortcut URL (loads in iframe). */
const DINO_URL = 'https://chromedino.com/';
/** Internal URL for the browser help/about page. */
const HELP_URL = 'about:help';
/** MIME type for bookmark drag-and-drop between toolbar slots. */
const BOOKMARK_DRAG_TYPE = 'application/x-deskos-browser-bookmark-url';

/** Default bookmarks shown when the user has none saved. */
const DEFAULT_BOOKMARKS = [
  { label: 'Google', url: 'https://www.google.com' },
  { label: 'Dino', url: DINO_URL },
  { label: 'Wikipedia', url: 'https://www.wikipedia.org' },
] as const;

interface Bookmark {
  label: string;
  url: string;
}

interface HomeShortcut {
  label: string;
  url: string;
}

/** Default home-page shortcut tiles for a fresh session. */
const DEFAULT_SHORTCUTS: HomeShortcut[] = [
  { label: 'Google', url: 'https://www.google.com' },
  { label: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { label: 'Dino', url: DINO_URL },
];

interface BrowserTab {
  id: string;
  history: string[];
  historyIndex: number;
  inputUrl: string;
  title: string;
  loading: boolean;
  reloadKey: number;
}

type PersistedBrowserTab = Pick<
  BrowserTab,
  'id' | 'history' | 'historyIndex' | 'inputUrl' | 'title'
>;

/** Ephemeral per-tab UI state (not persisted in session). */
interface TabRuntime {
  reloadKey: number;
  loading: boolean;
}

const DEFAULT_TAB_RUNTIME: TabRuntime = { reloadKey: 0, loading: false };

interface BrowserWindowSession {
  tabs: PersistedBrowserTab[];
  activeTabId: string;
  showBookmarks: boolean;
}

interface MenuAction {
  label: string;
  action: () => void;
  disabled?: () => boolean;
}

interface BrowserWindowProps {
  ctx: ProgramContext;
  /** Optional URL to open on mount (e.g. local file blob or asset). */
  initialUrl?: string;
  /** Optional window/tab title hint for `initialUrl`. */
  initialTitle?: string;
}

/** Monotonic counter for generated tab ids. */
let tabIdCounter = 0;

/** Generate a unique tab id. */
function createTabId(): string {
  return `tab-${++tabIdCounter}-${Date.now()}`;
}

/** Create a new tab opened on the home page (or a given URL). */
function createTab(initialUrl = HOME_URL, title?: string): BrowserTab {
  const url = normalizeUrl(initialUrl);
  return {
    id: createTabId(),
    history: [url],
    historyIndex: 0,
    inputUrl: url,
    title: title || tabTitleForUrl(url) || 'New Tab',
    loading: false,
    reloadKey: 0,
  };
}

/** Strip runtime-only tab fields before session persistence. */
function serializeTab(tab: BrowserTab): PersistedBrowserTab {
  return {
    id: tab.id,
    history: tab.history,
    historyIndex: tab.historyIndex,
    inputUrl: tab.inputUrl,
    title: tab.title,
  };
}

/** Restore a persisted tab with default loading/reload state. */
function reviveTab(tab: PersistedBrowserTab): BrowserTab {
  return {
    ...tab,
    title: tab.title ?? '',
    ...DEFAULT_TAB_RUNTIME,
  };
}

/** Default browser session: one home tab with bookmarks visible. */
function createDefaultBrowserSession(): BrowserWindowSession {
  const tab = createTab();
  return {
    tabs: [serializeTab(tab)],
    activeTabId: tab.id,
    showBookmarks: true,
  };
}

/** Current URL for a tab (active history entry). */
function getTabUrl(tab: BrowserTab): string {
  return tab.history[tab.historyIndex];
}

/** Append igu=1 to Google URLs so they can load in an iframe. */
function withGoogleIframeParam(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'google.com' && !host.startsWith('google.') && !host.endsWith('.google.com')) {
      return url;
    }
    if (parsed.searchParams.get('igu') === '1') return parsed.href;
    parsed.searchParams.set('igu', '1');
    return parsed.href;
  } catch {
    return url;
  }
}

/** Normalize user input into a navigable URL or internal page id. */
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return HOME_URL;
  if (trimmed === HOME_URL || trimmed.startsWith('about:') || trimmed.startsWith('chrome://')) {
    return trimmed;
  }
  // Local VFS / asset opens: blob URLs and absolute site paths.
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:') || trimmed.startsWith('/')) {
    return trimmed;
  }
  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return HOME_URL;
      }
      return withGoogleIframeParam(parsed.href);
    } catch {
      return HOME_URL;
    }
  }
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(trimmed)) {
    return withGoogleIframeParam('https://' + trimmed);
  }
  return withGoogleIframeParam('https://www.google.com/search?q=' + encodeURIComponent(trimmed));
}

/** True for built-in about: pages rendered without an iframe. */
function isInternalPage(url: string): boolean {
  return url === HOME_URL || url === HELP_URL || url.startsWith('about:');
}

/** Resolve the iframe src for a tab URL (undefined for internal pages). */
function getIframeSrc(url: string): string | undefined {
  if (isInternalPage(url)) return undefined;
  if (url.startsWith('chrome://')) return url;
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('/')) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return withGoogleIframeParam(parsed.href);
  } catch {
    return undefined;
  }
}

/** Tab title for built-in pages rendered without an iframe. */
function tabTitleForUrl(url: string): string {
  if (url === HOME_URL) return 'New Tab';
  if (url === HELP_URL) return 'About Browser';
  return '';
}

/** True when the tab already has a real page title (not empty and not just the URL). */
function isResolvedTabTitle(tab: BrowserTab): boolean {
  if (!tab.title) return false;
  const url = getTabUrl(tab);
  if (isInternalPage(url)) return true;
  try {
    return new URL(tab.title).href !== new URL(url).href;
  } catch {
    return tab.title !== url;
  }
}

/** Label shown in the tab strip (includes loading placeholder for external pages). */
function getTabDisplayTitle(tab: BrowserTab): string {
  if (isResolvedTabTitle(tab)) return tab.title;
  const internal = tabTitleForUrl(getTabUrl(tab));
  if (internal) return internal;
  return 'Loading...';
}

/** Read document.title from a loaded iframe when same-origin policy allows it. */
function readIframePageTitle(iframe: HTMLIFrameElement): string | null {
  try {
    const title = iframe.contentDocument?.title?.trim();
    return title || null;
  } catch {
    return null;
  }
}

/** Fetch the document title for a URL via the DeskOS dev/preview server. */
async function fetchPageTitle(url: string): Promise<string | null> {
  try {
    const response = await fetch(`${TITLE_PATH}?url=${encodeURIComponent(url)}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { title?: string | null };
    const title = data.title?.trim();
    return title || null;
  } catch {
    return null;
  }
}

/** Favicon URL for a bookmark or tab (Google s2 service for http(s) URLs). */
function getBookmarkIconUrl(url: string, size = 16): string | null {
  if (url.startsWith('about:') || url.startsWith('chrome://')) {
    return null;
  }
  try {
    const parsed = new URL(url.includes('://') ? url : `https://${url}`);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=${size}`;
  } catch {
    return null;
  }
}

/** Favicon image for a bookmark or tab, with letter fallback on load error. */
function BookmarkIcon({
  url,
  label,
  size = 16,
  className = '',
}: {
  url: string;
  label: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const iconUrl = getBookmarkIconUrl(url, size);

  if (!iconUrl || failed) {
    return (
      <span className={`ie-bookmark-fallback ${className}`.trim()}>
        {label.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      className={`ie-bookmark-icon ${className}`.trim()}
      src={iconUrl}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
    />
  );
}

/** Small favicon shown in the tab strip. */
function TabIcon({ url }: { url: string }) {
  return <BookmarkIcon url={url} label={url} />;
}

type EditLinkKind = 'bookmark' | 'shortcut';

/** Modal dialog for editing a bookmark or home shortcut. */
function EditLinkModal({
  kind,
  label,
  url,
  onLabelChange,
  onUrlChange,
  onSubmit,
  onClose,
}: {
  kind: EditLinkKind;
  label: string;
  url: string;
  onLabelChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const title = kind === 'bookmark' ? 'Edit favorite' : 'Edit shortcut';

  return (
    <div className="ie-shortcut-modal-backdrop" onClick={onClose}>
      <div
        className="ie-shortcut-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ie-edit-link-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ie-edit-link-modal-title" className="ie-shortcut-modal-title">
          {title}
        </h2>
        <form className="ie-shortcut-modal-form" onSubmit={onSubmit}>
          <input
            type="text"
            className="ie-shortcut-modal-input"
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Name"
            autoFocus
          />
          <input
            type="text"
            className="ie-shortcut-modal-input"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="URL"
          />
          <div className="ie-shortcut-modal-actions">
            <button type="submit" className="ie-shortcut-modal-btn ie-shortcut-modal-btn-primary">
              Save
            </button>
            <button type="button" className="ie-shortcut-modal-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** New-tab home page with search bar and shortcut grid. */
function HomePage({
  shortcuts,
  onNavigate,
  onAddShortcut,
}: {
  shortcuts: HomeShortcut[];
  onNavigate: (input: string) => void;
  onAddShortcut: (label: string, url: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    if (!showAddModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showAddModal]);

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewLabel('');
    setNewUrl('');
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onNavigate(query);
  };

  const handleAddShortcut = (e: FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    const url = newUrl.trim();
    if (!label || !url) return;
    onAddShortcut(label, url);
    closeAddModal();
  };

  return (
    <div className="ie-home">
      <form className="ie-home-search" onSubmit={handleSearch}>
        <Icon name="search" size={20} className="ie-home-search-icon" />
        <input
          type="text"
          className="ie-home-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or type a URL"
          spellCheck={false}
          autoFocus
        />
      </form>

      <div className="ie-home-shortcuts">
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.url}
            type="button"
            className="ie-home-shortcut"
            data-shortcut-url={shortcut.url}
            data-shortcut-label={shortcut.label}
            onClick={() => onNavigate(shortcut.url)}
            title={shortcut.url}
          >
            <span className="ie-home-shortcut-icon">
              <BookmarkIcon
                url={shortcut.url}
                label={shortcut.label}
                size={32}
                className="ie-home-favicon"
              />
            </span>
            <span className="ie-home-shortcut-label">{shortcut.label}</span>
          </button>
        ))}

        <button
          type="button"
          className="ie-home-shortcut ie-home-shortcut-add"
          onClick={() => setShowAddModal(true)}
          title="Add shortcut"
          aria-label="Add shortcut"
        >
          <span className="ie-home-shortcut-icon ie-home-shortcut-add-icon">+</span>
          <span className="ie-home-shortcut-label">Add</span>
        </button>
      </div>

      {showAddModal && (
        <div className="ie-shortcut-modal-backdrop" onClick={closeAddModal}>
          <div
            className="ie-shortcut-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ie-shortcut-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ie-shortcut-modal-title" className="ie-shortcut-modal-title">
              Add shortcut
            </h2>
            <form className="ie-shortcut-modal-form" onSubmit={handleAddShortcut}>
              <input
                type="text"
                className="ie-shortcut-modal-input"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Name"
                autoFocus
              />
              <input
                type="text"
                className="ie-shortcut-modal-input"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="URL"
              />
              <div className="ie-shortcut-modal-actions">
                <button
                  type="submit"
                  className="ie-shortcut-modal-btn ie-shortcut-modal-btn-primary"
                >
                  Add
                </button>
                <button type="button" className="ie-shortcut-modal-btn" onClick={closeAddModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Static help/about page for the browser program. */
function HelpPage() {
  return (
    <div className="ie-home">
      <h1 className="ie-home-title">About Browser</h1>
      <p className="ie-home-subtitle">DeskOS web browser</p>
      <p className="ie-home-hint">
        Use the address bar for URLs (with <code>://</code>) or search terms. Bookmarks and menu
        actions are available in the toolbar.
      </p>
    </div>
  );
}

/** Route tab content to home, help, or an iframe for external URLs. */
function BrowserContent({
  url,
  reloadKey,
  onLoad,
  onNavigate,
  shortcuts,
  onAddShortcut,
}: {
  url: string;
  reloadKey: number;
  onLoad: (url: string, pageTitle: string | null) => void;
  onNavigate: (input: string) => void;
  shortcuts: HomeShortcut[];
  onAddShortcut: (label: string, url: string) => void;
}) {
  if (url === HOME_URL) {
    return <HomePage shortcuts={shortcuts} onNavigate={onNavigate} onAddShortcut={onAddShortcut} />;
  }
  if (url === HELP_URL) return <HelpPage />;

  const src = getIframeSrc(url);
  if (!src) {
    return <HomePage shortcuts={shortcuts} onNavigate={onNavigate} onAddShortcut={onAddShortcut} />;
  }

  return (
    <iframe
      key={reloadKey}
      src={src}
      className="ie-frame"
      title="Browser"
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
      onLoad={(e) => onLoad(url, readIframePageTitle(e.currentTarget))}
    />
  );
}

/** Browser window with tabs, toolbar, address bar, bookmarks, and iframe navigation. */
export function BrowserWindow({ ctx, initialUrl, initialTitle }: BrowserWindowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useWindowSessionState<BrowserWindowSession>('main', () => {
    if (initialUrl) {
      const tab = createTab(initialUrl, initialTitle);
      return {
        tabs: [serializeTab(tab)],
        activeTabId: tab.id,
        showBookmarks: true,
      };
    }
    return createDefaultBrowserSession();
  });
  const [tabRuntime, setTabRuntime] = useState<Record<string, TabRuntime>>({});

  const mergeTabRuntime = useCallback(
    (tab: BrowserTab): BrowserTab => ({
      ...tab,
      ...DEFAULT_TAB_RUNTIME,
      ...tabRuntime[tab.id],
    }),
    [tabRuntime]
  );

  const tabs = session.tabs.map(reviveTab).map(mergeTabRuntime);
  const activeTabId = session.activeTabId;
  const showBookmarks = session.showBookmarks;

  const patchTabRuntime = useCallback(
    (tabId: string, patch: Partial<TabRuntime> | ((prev: TabRuntime) => Partial<TabRuntime>)) => {
      setTabRuntime((prev) => {
        const current = { ...DEFAULT_TAB_RUNTIME, ...prev[tabId] };
        const next = typeof patch === 'function' ? patch(current) : patch;
        return { ...prev, [tabId]: { ...current, ...next } };
      });
    },
    []
  );

  const setTabs = useCallback(
    (updater: BrowserTab[] | ((prev: BrowserTab[]) => BrowserTab[])) => {
      setSession((prev) => {
        const currentTabs = prev.tabs.map(reviveTab).map(mergeTabRuntime);
        const nextTabs = typeof updater === 'function' ? updater(currentTabs) : updater;
        return { ...prev, tabs: nextTabs.map(serializeTab) };
      });
    },
    [mergeTabRuntime, setSession]
  );

  const setActiveTabId = useCallback(
    (tabId: string) => {
      setSession((prev) => ({ ...prev, activeTabId: tabId }));
    },
    [setSession]
  );

  const setShowBookmarks = useCallback(
    (value: boolean) => {
      setSession((prev) => ({ ...prev, showBookmarks: value }));
    },
    [setSession]
  );

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    const saved = ctx.storage.getItem<Bookmark[]>('bookmarks');
    return saved && saved.length > 0 ? saved : [...DEFAULT_BOOKMARKS];
  });
  const [shortcuts, setShortcuts] = useState<HomeShortcut[]>(() => {
    const saved = ctx.storage.getItem<HomeShortcut[]>('shortcuts');
    return saved && saved.length > 0 ? saved : DEFAULT_SHORTCUTS;
  });
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragInsertIndex, setDragInsertIndexState] = useState<number | null>(null);
  const dragInsertIndexRef = useRef<number | null>(null);
  const [addressDragOver, setAddressDragOver] = useState(false);
  const [tabbarBookmarkDragOver, setTabbarBookmarkDragOver] = useState(false);
  const suppressTabClickRef = useRef(false);
  const suppressBookmarkClickRef = useRef(false);

  const setDragInsertIndex = useCallback((index: number | null) => {
    dragInsertIndexRef.current = index;
    setDragInsertIndexState(index);
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const currentUrl = getTabUrl(activeTab);
  const canGoBack = activeTab.historyIndex > 0;
  const canGoForward = activeTab.historyIndex < activeTab.history.length - 1;
  const isHome = currentUrl === HOME_URL;

  useEffect(() => {
    ctx.storage.setItem('bookmarks', bookmarks);
  }, [bookmarks, ctx.storage]);

  useEffect(() => {
    ctx.storage.setItem('shortcuts', shortcuts);
  }, [shortcuts, ctx.storage]);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openMenu]);

  const getWindowId = useCallback((): string | null => {
    return rootRef.current?.closest('[data-window-id]')?.getAttribute('data-window-id') ?? null;
  }, []);

  const closeWindow = useCallback(() => {
    const windowId = getWindowId();
    if (windowId) ctx.window.close(windowId);
  }, [ctx.window, getWindowId]);

  const updateTab = useCallback(
    (tabId: string, updater: (tab: BrowserTab) => BrowserTab) => {
      setTabs((prev) => prev.map((tab) => (tab.id === tabId ? updater(tab) : tab)));
    },
    [setTabs]
  );

  const applyTabTitle = useCallback(
    (tabId: string, url: string, title: string) => {
      updateTab(tabId, (tab) => {
        try {
          if (new URL(getTabUrl(tab)).href !== new URL(url).href) return tab;
        } catch {
          if (getTabUrl(tab) !== url) return tab;
        }
        return { ...tab, title };
      });
    },
    [updateTab]
  );

  const requestTabTitle = useCallback(
    (tabId: string, url: string) => {
      if (isInternalPage(url)) return;
      void fetchPageTitle(url).then((title) => {
        if (title) applyTabTitle(tabId, url, title);
      });
    },
    [applyTabTitle]
  );

  const titleRequestRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    for (const tab of tabs) {
      const url = getTabUrl(tab);
      if (isInternalPage(url) || isResolvedTabTitle(tab)) continue;
      if (titleRequestRef.current.get(tab.id) === url) continue;
      titleRequestRef.current.set(tab.id, url);
      requestTabTitle(tab.id, url);
    }
  }, [requestTabTitle, tabs]);

  const openNewTab = useCallback(() => {
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  const openNewTabWithUrl = useCallback(
    (rawUrl: string) => {
      const target = normalizeUrl(rawUrl);
      const tab: BrowserTab = {
        ...createTab(),
        history: [target],
        historyIndex: 0,
        inputUrl: target,
        title: tabTitleForUrl(target),
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      patchTabRuntime(tab.id, { loading: !isInternalPage(target) });
    },
    [patchTabRuntime, setActiveTabId, setTabs]
  );

  const closeTab = useCallback(
    (tabId: string, e?: MouseEvent) => {
      e?.stopPropagation();
      if (tabs.length === 1) {
        closeWindow();
        return;
      }
      setTabs((prev) => {
        const closingIdx = prev.findIndex((tab) => tab.id === tabId);
        const next = prev.filter((tab) => tab.id !== tabId);
        if (tabId === activeTabId) {
          const newIdx = Math.min(closingIdx, next.length - 1);
          setActiveTabId(next[newIdx].id);
        }
        return next;
      });
      setTabRuntime((prev) => {
        if (!(tabId in prev)) return prev;
        const next = { ...prev };
        delete next[tabId];
        return next;
      });
    },
    [activeTabId, closeWindow, tabs.length]
  );

  const refreshTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((entry) => entry.id === tabId);
      if (!tab || getTabUrl(tab) === HOME_URL) return;
      patchTabRuntime(tabId, (prev) => ({ reloadKey: prev.reloadKey + 1, loading: true }));
    },
    [patchTabRuntime, tabs]
  );

  const closeOtherTabs = useCallback(
    (tabId: string) => {
      setTabs((prev) => prev.filter((tab) => tab.id === tabId));
      setActiveTabId(tabId);
    },
    [setActiveTabId, setTabs]
  );

  const closeTabsToRight = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((tab) => tab.id === tabId);
        if (idx === -1) return prev;
        return prev.slice(0, idx + 1);
      });
      setActiveTabId(tabId);
    },
    [setActiveTabId, setTabs]
  );

  const moveTabToIndex = useCallback(
    (fromId: string, toIndex: number) => {
      setTabs((prev) => {
        const fromIdx = prev.findIndex((tab) => tab.id === fromId);
        if (fromIdx === -1) return prev;
        const bounded = Math.max(0, Math.min(toIndex, prev.length));
        if (bounded === fromIdx || bounded === fromIdx + 1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        const target = bounded > fromIdx ? bounded - 1 : bounded;
        next.splice(target, 0, moved);
        return next;
      });
    },
    [setTabs]
  );

  const handleTabDragStart = useCallback((e: DragEvent<HTMLDivElement>, tabId: string) => {
    if ((e.target as HTMLElement).closest('.ie-tab-close')) {
      e.preventDefault();
      return;
    }
    suppressTabClickRef.current = true;
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
  }, []);

  const handleTabDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, tabId: string) => {
      if (e.dataTransfer.types.includes(BOOKMARK_DRAG_TYPE)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const tabIdx = tabs.findIndex((tab) => tab.id === tabId);
      if (tabIdx === -1) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const after = e.clientX >= rect.left + rect.width / 2;
      setDragInsertIndex(after ? tabIdx + 1 : tabIdx);
    },
    [setDragInsertIndex, tabs]
  );

  const handleTabDrop = useCallback(
    (e: DragEvent<HTMLElement>, insertIndex?: number) => {
      const bookmarkUrl = e.dataTransfer.getData(BOOKMARK_DRAG_TYPE);
      if (bookmarkUrl) {
        e.preventDefault();
        openNewTabWithUrl(bookmarkUrl);
        setTabbarBookmarkDragOver(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const fromId = e.dataTransfer.getData('text/plain');
      const targetIndex = insertIndex ?? dragInsertIndexRef.current;
      if (fromId && targetIndex !== null) {
        moveTabToIndex(fromId, targetIndex);
      }
      setDragInsertIndex(null);
      setDraggedTabId(null);
    },
    [moveTabToIndex, openNewTabWithUrl, setDragInsertIndex]
  );

  const handleTabbarDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (e.dataTransfer.types.includes(BOOKMARK_DRAG_TYPE)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setTabbarBookmarkDragOver(true);
        return;
      }
      if (!draggedTabId) return;
      if ((e.target as HTMLElement).closest('.ie-tab')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragInsertIndex(tabs.length);
    },
    [draggedTabId, setDragInsertIndex, tabs.length]
  );

  const handleTabbarDragLeave = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setTabbarBookmarkDragOver(false);
      setDragInsertIndex(null);
    },
    [setDragInsertIndex]
  );

  const handleTabbarDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      const bookmarkUrl = e.dataTransfer.getData(BOOKMARK_DRAG_TYPE);
      if (!bookmarkUrl) return;
      e.preventDefault();
      openNewTabWithUrl(bookmarkUrl);
      setTabbarBookmarkDragOver(false);
    },
    [openNewTabWithUrl]
  );

  const handleBookmarkDragStart = useCallback((e: DragEvent<HTMLButtonElement>, url: string) => {
    suppressBookmarkClickRef.current = true;
    e.dataTransfer.setData(BOOKMARK_DRAG_TYPE, url);
    e.dataTransfer.setData('text/uri-list', url);
    e.dataTransfer.setData('text/plain', url);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  /** Drag the current page URL out of the address bar onto the desktop. */
  const handleAddressUrlDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const url = getTabUrl(activeTab);
      if (!url || url.startsWith('about:') || url.startsWith('chrome://')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData(BOOKMARK_DRAG_TYPE, url);
      e.dataTransfer.setData('text/uri-list', url);
      e.dataTransfer.setData('text/plain', url);
      e.dataTransfer.effectAllowed = 'copy';
    },
    [activeTab]
  );

  const handleBookmarkDragEnd = useCallback(() => {
    window.setTimeout(() => {
      suppressBookmarkClickRef.current = false;
    }, 0);
  }, []);

  const handleAddressDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes(BOOKMARK_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setAddressDragOver(true);
  }, []);

  const handleAddressDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setAddressDragOver(false);
  }, []);

  const handleAddressDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      const bookmarkUrl = e.dataTransfer.getData(BOOKMARK_DRAG_TYPE);
      if (!bookmarkUrl) return;
      e.preventDefault();
      updateTab(activeTabId, (tab) => ({ ...tab, inputUrl: bookmarkUrl }));
      setAddressDragOver(false);
      addressRef.current?.focus();
      addressRef.current?.select();
    },
    [activeTabId, updateTab]
  );

  const handleTabDragEnd = useCallback(() => {
    setDragInsertIndex(null);
    setDraggedTabId(null);
    window.setTimeout(() => {
      suppressTabClickRef.current = false;
    }, 0);
  }, [setDragInsertIndex]);

  const handleTabClick = useCallback((tabId: string) => {
    if (suppressTabClickRef.current) return;
    setActiveTabId(tabId);
  }, []);

  const navigateTo = useCallback(
    (rawUrl: string, pushHistory = true, tabId = activeTabId) => {
      const target = normalizeUrl(rawUrl);
      const tab = tabs.find((entry) => entry.id === tabId);
      if (!tab || getTabUrl(tab) === target) return;

      updateTab(tabId, (current) => {
        if (pushHistory) {
          const history = current.history.slice(0, current.historyIndex + 1);
          history.push(target);
          return {
            ...current,
            history,
            historyIndex: history.length - 1,
            inputUrl: target,
            title: tabTitleForUrl(target),
          };
        }

        const history = [...current.history];
        history[current.historyIndex] = target;
        return {
          ...current,
          history,
          inputUrl: target,
          title: tabTitleForUrl(target),
        };
      });
      patchTabRuntime(tabId, { loading: !isInternalPage(target) });
    },
    [activeTabId, patchTabRuntime, tabs, updateTab]
  );

  const handleBookmarkClick = useCallback(
    (url: string) => {
      if (suppressBookmarkClickRef.current) return;
      navigateTo(url);
    },
    [navigateTo]
  );

  const handleNavigate = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      navigateTo(activeTab.inputUrl);
    },
    [activeTab.inputUrl, navigateTo]
  );

  const handleBack = useCallback(() => {
    if (!canGoBack) return;
    const url = activeTab.history[activeTab.historyIndex - 1];
    updateTab(activeTabId, (tab) => ({
      ...tab,
      historyIndex: tab.historyIndex - 1,
      inputUrl: url,
      title: tabTitleForUrl(url),
    }));
    patchTabRuntime(activeTabId, { loading: !isInternalPage(url) });
  }, [activeTab, activeTabId, canGoBack, patchTabRuntime, updateTab]);

  const handleForward = useCallback(() => {
    if (!canGoForward) return;
    const url = activeTab.history[activeTab.historyIndex + 1];
    updateTab(activeTabId, (tab) => ({
      ...tab,
      historyIndex: tab.historyIndex + 1,
      inputUrl: url,
      title: tabTitleForUrl(url),
    }));
    patchTabRuntime(activeTabId, { loading: !isInternalPage(url) });
  }, [activeTab, activeTabId, canGoForward, patchTabRuntime, updateTab]);

  const handleRefresh = useCallback(() => {
    if (isHome) return;
    patchTabRuntime(activeTabId, (prev) => ({ reloadKey: prev.reloadKey + 1, loading: true }));
  }, [activeTabId, isHome, patchTabRuntime]);

  const handleStop = useCallback(() => {
    if (isHome) return;
    navigateTo(HOME_URL);
  }, [isHome, navigateTo]);

  const handleHome = useCallback(() => {
    navigateTo(HOME_URL);
  }, [navigateTo]);

  const handleIframeLoad = useCallback(
    (tabId: string, url: string, pageTitle: string | null) => {
      patchTabRuntime(tabId, { loading: false });
      if (pageTitle) {
        applyTabTitle(tabId, url, pageTitle);
        return;
      }
      if (!isInternalPage(url)) {
        requestTabTitle(tabId, url);
      }
    },
    [applyTabTitle, patchTabRuntime, requestTabTitle]
  );

  const clearHistory = useCallback(() => {
    updateTab(activeTabId, (tab) => ({
      ...tab,
      history: [HOME_URL],
      historyIndex: 0,
      inputUrl: HOME_URL,
      title: 'New Tab',
    }));
    patchTabRuntime(activeTabId, (prev) => ({ reloadKey: prev.reloadKey + 1, loading: false }));
  }, [activeTabId, patchTabRuntime, updateTab]);

  const addBookmark = useCallback(() => {
    if (isHome || currentUrl === HELP_URL) return;
    const label = currentUrl.replace(/^https?:\/\//, '').split('/')[0] || currentUrl;
    setBookmarks((prev) => {
      if (prev.some((bookmark) => bookmark.url === currentUrl)) return prev;
      return [...prev, { label, url: currentUrl }];
    });
  }, [currentUrl, isHome]);

  const removeBookmark = useCallback((url: string) => {
    setBookmarks((prev) => prev.filter((bookmark) => bookmark.url !== url));
  }, []);

  const updateBookmark = useCallback((originalUrl: string, label: string, url: string) => {
    const trimmedLabel = label.trim();
    const trimmedUrl = url.trim();
    if (!trimmedLabel || !trimmedUrl) return;
    const target = normalizeUrl(trimmedUrl);
    setBookmarks((prev) => {
      const idx = prev.findIndex((bookmark) => bookmark.url === originalUrl);
      if (idx === -1) return prev;
      if (target !== originalUrl && prev.some((bookmark) => bookmark.url === target)) return prev;
      const next = [...prev];
      next[idx] = { label: trimmedLabel, url: target };
      return next;
    });
  }, []);

  const addShortcut = useCallback((label: string, url: string) => {
    const target = normalizeUrl(url);
    const shortcutLabel = label || target;
    setShortcuts((prev) => {
      if (prev.some((shortcut) => shortcut.url === target)) return prev;
      return [...prev, { label: shortcutLabel, url: target }];
    });
  }, []);

  const removeShortcut = useCallback((url: string) => {
    setShortcuts((prev) => prev.filter((shortcut) => shortcut.url !== url));
  }, []);

  const updateShortcut = useCallback((originalUrl: string, label: string, url: string) => {
    const trimmedLabel = label.trim();
    const trimmedUrl = url.trim();
    if (!trimmedLabel || !trimmedUrl) return;
    const target = normalizeUrl(trimmedUrl);
    setShortcuts((prev) => {
      const idx = prev.findIndex((shortcut) => shortcut.url === originalUrl);
      if (idx === -1) return prev;
      if (target !== originalUrl && prev.some((shortcut) => shortcut.url === target)) return prev;
      const next = [...prev];
      next[idx] = { label: trimmedLabel, url: target };
      return next;
    });
  }, []);

  const [editTarget, setEditTarget] = useState<{
    type: EditLinkKind;
    originalUrl: string;
  } | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const closeEditModal = useCallback(() => {
    setEditTarget(null);
    setEditLabel('');
    setEditUrl('');
  }, []);

  const openEditBookmark = useCallback((url: string, label: string) => {
    setEditTarget({ type: 'bookmark', originalUrl: url });
    setEditLabel(label);
    setEditUrl(url);
  }, []);

  const openEditShortcut = useCallback((url: string, label: string) => {
    setEditTarget({ type: 'shortcut', originalUrl: url });
    setEditLabel(label);
    setEditUrl(url);
  }, []);

  const handleEditSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!editTarget) return;
      if (editTarget.type === 'bookmark') {
        updateBookmark(editTarget.originalUrl, editLabel, editUrl);
      } else {
        updateShortcut(editTarget.originalUrl, editLabel, editUrl);
      }
      closeEditModal();
    },
    [closeEditModal, editLabel, editTarget, editUrl, updateBookmark, updateShortcut]
  );

  const isCurrentBookmarked = bookmarks.some((bookmark) => bookmark.url === currentUrl);

  const toggleBookmark = useCallback(() => {
    if (isHome || currentUrl === HELP_URL) return;
    if (isCurrentBookmarked) {
      removeBookmark(currentUrl);
      return;
    }
    addBookmark();
  }, [addBookmark, currentUrl, isCurrentBookmarked, isHome, removeBookmark]);

  const navigateToRef = useRef(navigateTo);
  const removeBookmarkRef = useRef(removeBookmark);
  const removeShortcutRef = useRef(removeShortcut);
  const openEditBookmarkRef = useRef(openEditBookmark);
  const openEditShortcutRef = useRef(openEditShortcut);
  const openNewTabRef = useRef(openNewTab);
  const closeTabRef = useRef(closeTab);
  const refreshTabRef = useRef(refreshTab);
  const closeOtherTabsRef = useRef(closeOtherTabs);
  const closeTabsToRightRef = useRef(closeTabsToRight);
  const setActiveTabIdRef = useRef(setActiveTabId);
  const tabsRef = useRef(tabs);
  navigateToRef.current = navigateTo;
  removeBookmarkRef.current = removeBookmark;
  removeShortcutRef.current = removeShortcut;
  openEditBookmarkRef.current = openEditBookmark;
  openEditShortcutRef.current = openEditShortcut;
  openNewTabRef.current = openNewTab;
  closeTabRef.current = closeTab;
  refreshTabRef.current = refreshTab;
  closeOtherTabsRef.current = closeOtherTabs;
  closeTabsToRightRef.current = closeTabsToRight;
  setActiveTabIdRef.current = setActiveTabId;
  tabsRef.current = tabs;

  useEffect(() => {
    return ctx.contextMenu.register('.ie-tab', {
      id: 'browser-tab',
      priority: 10,
      generator: (context) => {
        const el = context.target.closest('.ie-tab') as HTMLElement | null;
        const tabId = el?.dataset.tabId;
        if (!tabId) return [];

        const allTabs = tabsRef.current;
        const tabIdx = allTabs.findIndex((tab) => tab.id === tabId);
        if (tabIdx === -1) return [];

        setActiveTabIdRef.current(tabId);

        const tab = allTabs[tabIdx];
        const isTabHome = getTabUrl(tab) === HOME_URL;

        return [
          {
            id: 'new-tab',
            label: 'New Tab',
            icon: 'new-window',
            action: () => openNewTabRef.current(),
          },
          {
            id: 'tab-separator-1',
            type: 'separator' as const,
            label: '',
          },
          {
            id: 'reload',
            label: 'Reload',
            icon: 'refresh',
            enabled: !isTabHome,
            action: () => refreshTabRef.current(tabId),
          },
          {
            id: 'tab-separator-2',
            type: 'separator' as const,
            label: '',
          },
          {
            id: 'close',
            label: 'Close Tab',
            icon: 'close',
            action: () => closeTabRef.current(tabId),
          },
          {
            id: 'close-others',
            label: 'Close Other Tabs',
            icon: 'hide-others',
            enabled: allTabs.length > 1,
            action: () => closeOtherTabsRef.current(tabId),
          },
          {
            id: 'close-right',
            label: 'Close Tabs to the Right',
            icon: 'close',
            enabled: tabIdx < allTabs.length - 1,
            action: () => closeTabsToRightRef.current(tabId),
          },
        ];
      },
    });
  }, [ctx]);

  useEffect(() => {
    return ctx.contextMenu.register('.ie-bookmark-btn', {
      id: 'bookmark',
      priority: 10,
      generator: (context) => {
        const el = context.target.closest('.ie-bookmark-btn') as HTMLElement | null;
        const url = el?.dataset.bookmarkUrl;
        const label = el?.dataset.bookmarkLabel ?? '';
        if (!url) return [];

        return [
          {
            id: 'open',
            label: 'Open',
            icon: 'open',
            action: () => navigateToRef.current(url),
          },
          {
            id: 'edit',
            label: 'Edit',
            icon: 'rename',
            action: () => openEditBookmarkRef.current(url, label),
          },
          {
            id: 'bookmark-separator',
            type: 'separator' as const,
            label: '',
          },
          {
            id: 'remove',
            label: 'Remove from Favorites',
            icon: 'delete',
            action: () => removeBookmarkRef.current(url),
          },
        ];
      },
    });
  }, [ctx]);

  useEffect(() => {
    return ctx.contextMenu.register('.ie-home-shortcut', {
      id: 'home-shortcut',
      priority: 10,
      generator: (context) => {
        const el = context.target.closest('.ie-home-shortcut') as HTMLElement | null;
        if (!el || el.classList.contains('ie-home-shortcut-add')) {
          return [];
        }
        const url = el.dataset.shortcutUrl;
        const label = el.dataset.shortcutLabel ?? '';
        if (!url) return [];

        return [
          {
            id: 'open',
            label: 'Open',
            icon: 'open',
            action: () => navigateToRef.current(url),
          },
          {
            id: 'edit',
            label: 'Edit',
            icon: 'rename',
            action: () => openEditShortcutRef.current(url, label),
          },
          {
            id: 'shortcut-separator',
            type: 'separator' as const,
            label: '',
          },
          {
            id: 'remove',
            label: 'Remove shortcut',
            icon: 'delete',
            action: () => removeShortcutRef.current(url),
          },
        ];
      },
    });
  }, [ctx]);

  const runAddressCommand = useCallback(
    (command: 'cut' | 'copy' | 'paste') => {
      const input = addressRef.current;
      if (!input) return;
      input.focus();
      if (command === 'paste') {
        void navigator.clipboard.readText().then((text) => {
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? input.value.length;
          const next = input.value.slice(0, start) + text + input.value.slice(end);
          updateTab(activeTabId, (tab) => ({ ...tab, inputUrl: next }));
        });
        return;
      }
      document.execCommand(command);
    },
    [activeTabId, updateTab]
  );

  const menuItems: { id: string; label: string; items: MenuAction[] }[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'New Tab', action: openNewTab },
        { label: 'Close Tab', action: () => closeTab(activeTabId) },
        { label: 'Close', action: closeWindow },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { label: 'Cut', action: () => runAddressCommand('cut') },
        { label: 'Copy', action: () => runAddressCommand('copy') },
        { label: 'Paste', action: () => runAddressCommand('paste') },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { label: 'Stop', action: handleStop, disabled: () => isHome },
        { label: 'Refresh', action: handleRefresh, disabled: () => isHome },
        {
          label: showBookmarks ? 'Hide Bookmarks' : 'Show Bookmarks',
          action: () => setShowBookmarks(!showBookmarks),
        },
      ],
    },
    {
      id: 'favorites',
      label: 'Favorites',
      items: [
        {
          label: 'Add to Favorites',
          action: addBookmark,
          disabled: () => isHome || currentUrl === HELP_URL || isCurrentBookmarked,
        },
        {
          label: 'Remove from Favorites',
          action: () => removeBookmark(currentUrl),
          disabled: () => !isCurrentBookmarked,
        },
        ...bookmarks.map((bookmark) => ({
          label: bookmark.label,
          action: () => navigateTo(bookmark.url),
        })),
      ],
    },
    {
      id: 'tools',
      label: 'Tools',
      items: [{ label: 'Clear History', action: clearHistory }],
    },
    {
      id: 'help',
      label: 'Help',
      items: [{ label: 'About Browser', action: () => navigateTo(HELP_URL) }],
    },
  ];

  const statusText = activeTab.loading ? 'Loading...' : isHome ? 'Ready' : 'Done';

  return (
    <div className="ie-window" ref={rootRef}>
      <div className="ie-menubar">
        {menuItems.map((menu) => (
          <div key={menu.id} className="ie-menu-wrap">
            <button
              type="button"
              className={`ie-menu-trigger${openMenu === menu.id ? ' active' : ''}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setOpenMenu((current) => (current === menu.id ? null : menu.id))}
            >
              {menu.label}
            </button>
            {openMenu === menu.id && (
              <div className="ie-menu-dropdown" onMouseDown={(e) => e.stopPropagation()}>
                {menu.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="ie-menu-item"
                    disabled={item.disabled?.()}
                    onClick={() => {
                      item.action();
                      setOpenMenu(null);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        className={`ie-tabbar${tabbarBookmarkDragOver ? ' bookmark-drag-over' : ''}`}
        onDragOver={handleTabbarDragOver}
        onDragLeave={handleTabbarDragLeave}
        onDrop={handleTabbarDrop}
      >
        {tabs.map((tab, tabIdx) => {
          const url = getTabUrl(tab);
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`ie-tab${isActive ? ' active' : ''}${draggedTabId === tab.id ? ' dragging' : ''}${dragInsertIndex === tabIdx ? ' insert-before' : ''}`}
              role="tab"
              aria-selected={isActive}
              data-tab-id={tab.id}
              draggable
              onMouseDown={(e) => e.stopPropagation()}
              onDragStart={(e) => handleTabDragStart(e, tab.id)}
              onDragOver={(e) => handleTabDragOver(e, tab.id)}
              onDrop={(e) => {
                e.stopPropagation();
                handleTabDrop(e);
              }}
              onDragEnd={handleTabDragEnd}
              onClick={() => handleTabClick(tab.id)}
              title={url}
            >
              <TabIcon url={url} />
              <span className="ie-tab-title">{getTabDisplayTitle(tab)}</span>
              <button
                type="button"
                className="ie-tab-close"
                aria-label="Close tab"
                onClick={(e) => closeTab(tab.id, e)}
              >
                ×
              </button>
            </div>
          );
        })}
        <div
          className={`ie-tab-drop-end${dragInsertIndex === tabs.length ? ' active' : ''}`}
          onDragOver={(e) => {
            if (!draggedTabId) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setDragInsertIndex(tabs.length);
          }}
          onDrop={(e) => {
            e.stopPropagation();
            handleTabDrop(e, tabs.length);
          }}
        />
        <button
          type="button"
          className="ie-tab-new"
          onClick={openNewTab}
          onDragOver={(e) => {
            if (draggedTabId) {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              setDragInsertIndex(tabs.length);
              return;
            }
            handleTabbarDragOver(e);
          }}
          onDrop={(e) => {
            if (draggedTabId) {
              e.stopPropagation();
              handleTabDrop(e, tabs.length);
              return;
            }
            handleTabbarDrop(e);
          }}
          title="New Tab"
          aria-label="New Tab"
        >
          +
        </button>
      </div>

      <div className="ie-toolbar">
        <div className="ie-nav-buttons">
          <button
            type="button"
            className="ie-btn ie-btn-icon"
            onClick={handleBack}
            disabled={!canGoBack}
            title="Back"
            aria-label="Back"
          >
            <Icon name="arrow-left" size={14} />
          </button>
          <button
            type="button"
            className="ie-btn ie-btn-icon"
            onClick={handleForward}
            disabled={!canGoForward}
            title="Forward"
            aria-label="Forward"
          >
            <Icon name="arrow-right" size={14} />
          </button>
          <button
            type="button"
            className="ie-btn ie-btn-icon"
            onClick={activeTab.loading ? handleStop : handleRefresh}
            disabled={isHome && !activeTab.loading}
            title={activeTab.loading ? 'Stop' : 'Refresh'}
            aria-label={activeTab.loading ? 'Stop' : 'Refresh'}
          >
            <Icon name={activeTab.loading ? 'close' : 'refresh'} size={14} />
          </button>
          <button
            type="button"
            className="ie-btn ie-btn-icon"
            onClick={handleHome}
            title="Home"
            aria-label="Home"
          >
            <Icon name="home" size={14} />
          </button>
        </div>

        <form className="ie-address-bar" onSubmit={handleNavigate}>
          <div
            className={`ie-address-field${addressDragOver ? ' drag-over' : ''}`}
            draggable
            onDragStart={handleAddressUrlDragStart}
            onDragOver={handleAddressDragOver}
            onDragLeave={handleAddressDragLeave}
            onDrop={handleAddressDrop}
            title="Drag to desktop to save this link"
          >
            <button
              type="button"
              className={`ie-bookmark-star${isCurrentBookmarked ? ' active' : ''}`}
              onClick={toggleBookmark}
              disabled={isHome || currentUrl === HELP_URL}
              title={isCurrentBookmarked ? 'Remove from Favorites' : 'Add to Favorites'}
              aria-label={isCurrentBookmarked ? 'Remove from Favorites' : 'Add to Favorites'}
            >
              <Icon name={isCurrentBookmarked ? 'star-filled' : 'star'} size={14} />
            </button>
            <input
              ref={addressRef}
              id={`browser-address-${activeTabId}`}
              type="text"
              className="ie-address-input"
              value={activeTab.inputUrl}
              onChange={(e) =>
                updateTab(activeTabId, (tab) => ({ ...tab, inputUrl: e.target.value }))
              }
              onDragOver={handleAddressDragOver}
              onDragLeave={handleAddressDragLeave}
              onDrop={handleAddressDrop}
              spellCheck={false}
              aria-label="Address"
            />
          </div>
          <button type="submit" className="ie-btn ie-btn-icon ie-go-btn" title="Go" aria-label="Go">
            <Icon name="arrow-right" size={14} />
          </button>
        </form>
      </div>

      {showBookmarks && (
        <div className="ie-bookmarks-bar">
          {bookmarks.map((bookmark) => (
            <button
              key={bookmark.url}
              type="button"
              className="ie-bookmark-btn"
              draggable
              data-bookmark-url={bookmark.url}
              data-bookmark-label={bookmark.label}
              onDragStart={(e) => handleBookmarkDragStart(e, bookmark.url)}
              onDragEnd={handleBookmarkDragEnd}
              onClick={() => handleBookmarkClick(bookmark.url)}
              title={bookmark.url}
            >
              <BookmarkIcon url={bookmark.url} label={bookmark.label} />
              <span className="ie-bookmark-label">{bookmark.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ie-content">
        {tabs.map((tab) => {
          const url = getTabUrl(tab);
          const isActive = tab.id === activeTabId;
          return (
            <div key={tab.id} className={`ie-tab-panel${isActive ? ' active' : ''}`}>
              <BrowserContent
                url={url}
                reloadKey={tab.reloadKey}
                onLoad={(loadedUrl, pageTitle) => handleIframeLoad(tab.id, loadedUrl, pageTitle)}
                onNavigate={navigateTo}
                shortcuts={shortcuts}
                onAddShortcut={addShortcut}
              />
            </div>
          );
        })}
      </div>

      <div className="ie-statusbar">
        <span className="ie-status-text">{statusText}</span>
      </div>

      {editTarget && (
        <EditLinkModal
          kind={editTarget.type}
          label={editLabel}
          url={editUrl}
          onLabelChange={setEditLabel}
          onUrlChange={setEditUrl}
          onSubmit={handleEditSubmit}
          onClose={closeEditModal}
        />
      )}
    </div>
  );
}
