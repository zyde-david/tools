#!/usr/bin/env python3
"""
Wrap original HTML files with the new responsive navbar.
Preserves all original content/styles, only injects the nav bar.
"""
import re
from pathlib import Path
from bs4 import BeautifulSoup

TOOLS_DIR = Path(__file__).parent.parent

# Nav links (no home - it's hardcoded in template)
NAV_LINKS = [
    ("✉️", "Envelope Printer", "envelope-printer.html"),
    ("⌨️", "AHK AutoCorrect", "autocorrect.html"),
    ("📊", "Epidemiology Map", "map-epidemic.html"),
    ("🦫", "Base64 Decoder", "base64-decoder.html"),
    ("🔤", "Thai Recovery", "thai-recovery.html"),
    ("🖨️", "Ink Planner", "ink-planner.html"),
    ("📦", "Inventory", "inventory-analytics.html"),
    ("🏆", "Certificate Builder", "interactive-certificate-builder.html"),
    ("🗄️", "myPCU SQL Simulator", "mypcu-sql-simulator.html"),
    ("🧠", "myPCU AI SQL", "mypcu-sql-cheatsheet-ai.html"),
    ("🏥", "Health GIS", "health-gis-app.html"),
    ("📍", "GPS Tracker", "gps-location-tracker.html"),
    ("🎤", "VHV Voice Report", "vhv-quick-report.html"),
    ("🏥", "Yarang PCC", "yarang-pcc-audit.html"),
]

# Pages that have their own fixed bottom bar/FAB
HAS_OWN_BOTTOM_BAR = {
    'vhv-quick-report.html',
}

RESPONSIVE_NAV_CSS = '''/* ============================================================
   RESPONSIVE NAVIGATION (Injected)
   Mobile: Fixed bottom bar (Search, Home, Note)
   Desktop: Collapsible sidebar (collapse on idle, expand on hover)
   Search drawer: slide-up with search bar at bottom (sticky)
   ============================================================ */
:root {
  --nav-height: 64px;
  --nav-width: 260px;
  --nav-collapsed: 56px;
  --tool-brand: #6366f1;
  --tool-brand-hover: #4f46e5;
  --tool-brand-light: #e0e7ff;
  --tool-brand-text: #312e81;
  --bg-base: #0f172a;
  --bg-card: #1e293b;
  --bg-elevated: #334155;
  --bg-hover: #475569;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border-color: #334155;
  --border-focus: #6366f1;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 12px 28px rgba(0,0,0,0.5);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --transition: 150ms ease;
  --z-nav: 1000;
}
html.light {
  --bg-base: #f8fafc;
  --bg-card: #ffffff;
  --bg-elevated: #f1f5f9;
  --bg-hover: #e2e8f0;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --border-color: #e2e8f0;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 12px 28px rgba(0,0,0,0.12);
}

/* ===== MOBILE BOTTOM BAR (3 buttons) ===== */
.tools-fab {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: var(--z-nav);
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: var(--nav-height);
  padding: 0.25rem 0.5rem;
  backdrop-filter: blur(12px);
  box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
}
.tools-fab .fab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: var(--text-secondary);
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius-md);
  font-size: 1.25rem;
  min-width: 56px;
  min-height: 48px;
  transition: all var(--transition);
  flex: 1;
  border: none;
  background: transparent;
  cursor: pointer;
  position: relative;
}
.tools-fab .fab-btn span {
  font-size: 0.625rem;
  margin-top: 0.125rem;
  font-weight: 500;
  white-space: nowrap;
}
.tools-fab .fab-btn:hover,
.tools-fab .fab-btn:active {
  color: var(--text-primary);
  background: var(--bg-elevated);
}
.tools-fab .fab-home {
  color: var(--tool-brand);
  font-size: 1.5rem;
  flex: 1.3;
  background: var(--tool-brand-light);
  border-radius: 40px;
  margin: 0 0.5rem;
  min-height: 44px;
}
.tools-fab .fab-home:hover {
  color: var(--tool-brand-text);
  background: var(--tool-brand);
}

/* ===== SEARCH DRAWER (slide-up, search at bottom) ===== */
.tools-drawer-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: calc(var(--z-nav) + 1);
  backdrop-filter: blur(4px);
}
.tools-drawer-overlay.open {
  display: block;
}
.tools-drawer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: calc(var(--z-nav) + 2);
  background: var(--bg-card);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  transform: translateY(100%);
  transition: transform 0.3s ease;
  box-shadow: 0 -8px 32px rgba(0,0,0,0.4);
}
.tools-drawer.open {
  transform: translateY(0);
}
.tools-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.tools-drawer-header h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary);
}
.tools-drawer-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border: none;
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 1.1rem;
}
.tools-drawer-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
  padding: 0.75rem 0.75rem 1rem;
  overflow-y: auto;
  flex: 1;
}
.tools-drawer-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.25rem;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-secondary);
  transition: all var(--transition);
}
.tools-drawer-item:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}
.tools-drawer-item.active {
  background: var(--tool-brand-light);
  color: var(--tool-brand-text);
}
.tools-drawer-item .icon {
  font-size: 1.5rem;
}
.tools-drawer-item .label {
  font-size: 0.625rem;
  font-weight: 500;
  text-align: center;
  line-height: 1.2;
  word-break: break-word;
}

/* Search bar at bottom of drawer - sticky */
.tools-drawer-search-wrap {
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  background: var(--bg-card);
  padding: 0.75rem;
  border-top: 1px solid var(--border-color);
  z-index: 2;
}
.tools-drawer-search-wrap input {
  width: 100%;
  background: var(--bg-elevated);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  padding: 0.75rem 1rem;
  color: var(--text-primary);
  font-size: 1rem;
  outline: none;
  box-sizing: border-box;
}
.tools-drawer-search-wrap input:focus {
  border-color: var(--border-focus);
}
.tools-drawer-search-wrap input::placeholder {
  color: var(--text-muted);
}

/* No results */
.tools-drawer-no-results {
  display: none;
  grid-column: 1 / -1;
  text-align: center;
  padding: 2rem 1rem;
  color: var(--text-muted);
  font-size: 0.875rem;
}

/* ===== DESKTOP SIDEBAR (collapsible) ===== */
@media (min-width: 768px) {
  .tools-fab { display: none; }

  .tools-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: var(--z-nav);
    background: var(--bg-card);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-sm);
    width: var(--nav-collapsed);
    transition: width 0.2s ease;
    overflow: hidden;
  }
  .tools-sidebar:hover {
    width: var(--nav-width);
    box-shadow: var(--shadow-md);
  }

  /* Header / brand */
  .tools-sidebar-header {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
    min-height: 52px;
  }
  .tools-sidebar-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: var(--text-primary);
    font-weight: 700;
    font-size: 1rem;
  }
  .tools-sidebar-brand .brand-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  .tools-sidebar-brand .brand-text {
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .tools-sidebar:hover .tools-sidebar-brand .brand-text {
    opacity: 1;
  }

  /* Search in sidebar */
  .tools-sidebar-search {
    width: 100%;
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    padding: 0.5rem;
    color: var(--text-primary);
    font-size: 0.825rem;
    outline: none;
    box-sizing: border-box;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .tools-sidebar:hover .tools-sidebar-search {
    opacity: 1;
  }
  .tools-sidebar-search:focus {
    border-color: var(--border-focus);
  }
  .tools-sidebar-search::placeholder {
    color: var(--text-muted);
  }

  /* Nav links */
  .tools-sidebar-nav {
    flex: 1;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    overflow-y: auto;
  }
  .tools-sidebar-link {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.625rem;
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--text-secondary);
    font-size: 0.875rem;
    transition: all var(--transition);
    white-space: nowrap;
    min-height: 40px;
  }
  .tools-sidebar-link:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }
  .tools-sidebar-link.active {
    background: var(--tool-brand-light);
    color: var(--tool-brand-text);
    font-weight: 600;
  }
  .tools-sidebar-link .icon {
    font-size: 1.2rem;
    min-width: 24px;
    text-align: center;
    flex-shrink: 0;
  }
  .tools-sidebar-link .link-text {
    opacity: 0;
    transition: opacity 0.15s ease;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tools-sidebar:hover .tools-sidebar-link .link-text {
    opacity: 1;
  }

  /* Scrollbar styling */
  .tools-sidebar-nav::-webkit-scrollbar {
    width: 4px;
  }
  .tools-sidebar-nav::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 2px;
  }

  /* Content offset - auto adjusts with sidebar width */
  body {
    padding-left: var(--nav-collapsed);
    transition: padding-left 0.2s ease;
  }
  body:has(.tools-sidebar:hover) {
    padding-left: var(--nav-width);
  }
}
'''


RESPONSIVE_NAV_HTML = '''<!-- ===== Responsive Navigation ===== -->
<!-- Mobile: 3-button bottom bar -->
<nav class="tools-fab" role="navigation" aria-label="เครื่องมือนำทาง">
  <button class="fab-btn fab-search" id="fabSearchBtn" title="ค้นหา" aria-label="ค้นหา">
    🔍<span>ค้นหา</span>
  </button>
  <a href="index.html" class="fab-btn fab-home" title="หน้าหลัก" aria-label="หน้าหลัก">
    🏠<span>หน้าหลัก</span>
  </a>
  <a href="vhv-quick-report.html" class="fab-btn fab-note" title="อสม.รายงานด่วน" aria-label="อสม.รายงานด่วน">
    📝<span>รายงานด่วน</span>
  </a>
</nav>

<!-- Search Drawer (slide-up) -->
<div class="tools-drawer-overlay" id="toolsDrawerOverlay"></div>
<div class="tools-drawer" id="toolsDrawer">
  <div class="tools-drawer-header">
    <h3>🔍 ค้นหาเครื่องมือ</h3>
    <button class="tools-drawer-close" id="toolsDrawerClose">✕</button>
  </div>
  <div class="tools-drawer-grid" id="toolsDrawerGrid">
    {drawer_items}
    <div class="tools-drawer-no-results" id="toolsNoResults">ไม่พบเครื่องมือที่ค้นหา</div>
  </div>
  <div class="tools-drawer-search-wrap">
    <input type="text" id="toolsDrawerSearchInput" placeholder="พิมพ์ชื่อเครื่องมือ..." autocomplete="off">
  </div>
</div>

<!-- Desktop sidebar -->
<aside class="tools-sidebar" role="navigation" aria-label="เครื่องมือนำทาง">
  <div class="tools-sidebar-header">
    <a href="index.html" class="tools-sidebar-brand">
      <span class="brand-icon">🛠️</span>
      <span class="brand-text">Zyde's Tools</span>
    </a>
  </div>
  <div class="tools-sidebar-nav">
    <input type="text" class="tools-sidebar-search" id="sidebarSearch" placeholder="ค้นหา..." autocomplete="off">
    {sidebar_links}
  </div>
</aside>'''


RESPONSIVE_NAV_JS = '''
<script>
(function() {
  "use strict";
  const current = window.location.pathname.split("/").pop() || "index.html";

  /* ===================== SIDEBAR SEARCH ===================== */
  const sidebarSearch = document.getElementById("sidebarSearch");
  if (sidebarSearch) {
    sidebarSearch.addEventListener("input", function() {
      const q = this.value.toLowerCase().trim();
      document.querySelectorAll(".tools-sidebar-link").forEach(function(link) {
        const text = link.textContent.toLowerCase();
        link.style.display = !q || text.includes(q) ? "flex" : "none";
      });
    });
  }

  /* ===================== DRAWER ===================== */
  const overlay = document.getElementById("toolsDrawerOverlay");
  const drawer = document.getElementById("toolsDrawer");
  const openBtn = document.getElementById("fabSearchBtn");
  const closeBtn = document.getElementById("toolsDrawerClose");
  const searchInput = document.getElementById("toolsDrawerSearchInput");
  const noResults = document.getElementById("toolsNoResults");

  function openDrawer() {
    overlay.classList.add("open");
    drawer.classList.add("open");
    document.body.style.overflow = "hidden";
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
      filterDrawer("");
    }
  }

  function closeDrawer() {
    overlay.classList.remove("open");
    drawer.classList.remove("open");
    document.body.style.overflow = "";
  }

  if (openBtn) openBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);

  /* Drawer search filter */
  function filterDrawer(q) {
    var found = false;
    var items = document.querySelectorAll("#toolsDrawerGrid .tools-drawer-item");
    items.forEach(function(item) {
      var text = item.textContent.toLowerCase();
      var match = !q || text.includes(q);
      item.style.display = match ? "flex" : "none";
      if (match) found = true;
    });
    if (noResults) {
      noResults.style.display = found ? "none" : "block";
    }
  }

  if (searchInput) {
    searchInput.addEventListener("input", function() {
      filterDrawer(this.value.toLowerCase().trim());
    });
    /* Prevent close on input click (bubbles up) */
    searchInput.addEventListener("click", function(e) { e.stopPropagation(); });
  }

  /* ===================== ACTIVE STATE ===================== */
  /* Sidebar */
  document.querySelectorAll(".tools-sidebar-link").forEach(function(a) {
    var href = a.getAttribute("href");
    if (href === current || (current === "index.html" && href === "index.html")) {
      a.classList.add("active");
    }
  });
  /* Drawer */
  document.querySelectorAll(".tools-drawer-item").forEach(function(a) {
    var href = a.getAttribute("href");
    if (href === current || (current === "index.html" && href === "index.html")) {
      a.classList.add("active");
    }
  });
})();
</script>'''


def build_sidebar_links(current_file):
    html = []
    for icon, title, href in NAV_LINKS:
        active = ' active' if href == current_file else ''
        html.append(f'  <a href="{href}" class="tools-sidebar-link{active}" title="{title}"><span class="icon">{icon}</span><span class="link-text">{title}</span></a>')
    return '\n'.join(html)


def build_drawer_items(current_file):
    items = []
    for icon, title, href in NAV_LINKS:
        active = ' active' if href == current_file else ''
        items.append(f'  <a href="{href}" class="tools-drawer-item{active}"><span class="icon">{icon}</span><span class="label">{title}</span></a>')
    return '\n'.join(items)


def inject_navbar(html_content, current_file):
    soup = BeautifulSoup(html_content, 'html.parser')

    has_own_bottom_bar = current_file in HAS_OWN_BOTTOM_BAR

    # Remove old tools-nav styles from style tags in body AND head
    for style in soup.find_all('style'):
        style_text = style.get_text()
        if 'tools-nav' in style_text or '.nav-home' in style_text or '.nav-link' in style_text:
            style.decompose()

    # Remove old nav HTML elements (leftover from previous versions)
    for nav_div in soup.find_all('div', class_='tools-nav'):
        nav_div.decompose()
    # Remove any standalone nav-home / nav-link anchors outside our new nav
    for old_link in soup.find_all('a', class_=['nav-home', 'nav-link']):
        # Only remove if not inside our new nav structure
        if not old_link.find_parent(class_='tools-fab') and not old_link.find_parent(class_='tools-sidebar'):
            old_link.decompose()

    # Inject CSS into head
    head = soup.head
    if head:
        style_tag = soup.new_tag('style')
        style_tag.string = RESPONSIVE_NAV_CSS
        head.append(style_tag)

    # Inject nav HTML at start of body
    body = soup.body
    if body:
        # Add data attribute for CSS targeting
        if has_own_bottom_bar:
            body['data-has-own-bottom-bar'] = 'true'

        nav_html = RESPONSIVE_NAV_HTML.format(
            sidebar_links=build_sidebar_links(current_file),
            drawer_items=build_drawer_items(current_file)
        )
        nav_soup = BeautifulSoup(nav_html, 'html.parser')
        body.insert(0, nav_soup)

        # Add JS at end of body
        js_soup = BeautifulSoup(RESPONSIVE_NAV_JS, 'html.parser')
        body.append(js_soup)

        # Adjust main content padding for bottom bar
        extra_offset = ' + 80px' if has_own_bottom_bar else ''
        style_tag = soup.new_tag('style')
        style_tag.string = f'''
/* Ensure content not hidden behind bottom nav on mobile */
@media (max-width: 767px) {{
  body {{padding-bottom: calc(var(--nav-height) + 1rem{extra_offset}); }}
  main {{padding-bottom: calc(var(--nav-height) + 1rem{extra_offset}); }}
  .container, .tool-main, #main-content, [role="main"] {{
    padding-bottom: calc(var(--nav-height) + 1rem{extra_offset}) !important;
  }}
  /* Hide page's own bottom bar on mobile - we provide the nav */
  [data-has-own-bottom-bar] nav.fixed.bottom-0,
  [data-has-own-bottom-bar] nav[class*="bottom-0"],
  [data-has-own-bottom-bar] [class*="bottom-action-bar"] {{
    display: none !important;
  }}
}}
@media (min-width: 768px) {{
  body {{padding-left: var(--nav-collapsed); }}
  main, .container, .tool-main, #main-content, [role="main"] {{
    margin-left: var(--nav-collapsed);
    max-width: calc(100% - var(--nav-collapsed));
  }}
  body:has(.tools-sidebar:hover) {{
    padding-left: var(--nav-width);
  }}
  body:has(.tools-sidebar:hover) main,
  body:has(.tools-sidebar:hover) .container,
  body:has(.tools-sidebar:hover) .tool-main,
  body:has(.tools-sidebar:hover) #main-content,
  body:has(.tools-sidebar:hover) [role="main"] {{
    margin-left: var(--nav-width);
    max-width: calc(100% - var(--nav-width));
  }}
}}
'''
        head.append(style_tag) if head else body.insert(0, style_tag)

    return str(soup)


def process_file(bak_path, out_path):
    print(f"Processing: {bak_path.name}")
    with open(bak_path, 'r', encoding='utf-8') as f:
        content = f.read()

    current_file = out_path.name
    new_content = inject_navbar(content, current_file)

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"  ✓ Wrapped with responsive navbar")


def main():
    print("=" * 60)
    print("Wrapping original files with responsive navbar")
    print("=" * 60)

    # Use .orig files from git restore
    orig_files = list(TOOLS_DIR.glob("*.html.orig"))
    orig_files = [f for f in orig_files if f.name != 'index.html.orig']

    for orig_file in orig_files:
        out_file = TOOLS_DIR / orig_file.name.replace('.orig', '')
        try:
            process_file(orig_file, out_file)
        except Exception as e:
            print(f"  ✗ Error: {e}")

    print("=" * 60)
    print(f"Done. Processed {len(orig_files)} files.")
    print("=" * 60)


if __name__ == '__main__':
    main()
