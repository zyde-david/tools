#!/usr/bin/env python3
"""
Migration script to convert existing tool HTML files to use the new base template.
Run from /home/zyde/tools/
"""

import re
import os
from pathlib import Path
from bs4 import BeautifulSoup

TOOLS_DIR = Path(__file__).parent.parent
BASE_TEMPLATE = TOOLS_DIR / "base-template.html"

# Nav links to inject (icon + title + href) - Home is hardcoded in template
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

def build_nav_links(current_file):
    """Build nav links HTML with active state."""
    html = []
    for icon, title, href in NAV_LINKS:
        active = ' active' if href == current_file else ''
        html.append(f'    <a href="{href}" class="nav-link{active}" title="{title}">{icon}</a>')
    return '\n'.join(html)

def extract_existing_content(html_content):
    """Extract title, head extras, body content from existing page."""
    soup = BeautifulSoup(html_content, 'html.parser')

    # Title
    title_tag = soup.find('title')
    title = title_tag.get_text(strip=True) if title_tag else 'Tool'

    # Head extras (stylesheets, extra styles, scripts in head)
    head_extras = []
    for tag in soup.head.find_all(['link', 'style', 'script']):
        # Skip charset, viewport, title
        if tag.name == 'meta': continue
        if tag.name == 'title': continue
        head_extras.append(str(tag))

    # Body content (skip the auth script and tools-nav if present)
    body = soup.body
    if not body:
        return title, '\n'.join(head_extras), ''

    # Remove auth script if present
    for script in body.find_all('script'):
        if 'zyde_auth' in script.get_text():
            script.decompose()

    # Remove existing tools-nav
    for nav in body.find_all(class_='tools-nav'):
        nav.decompose()

    # Remove old tools-nav styles from style tags in body
    for style in body.find_all('style'):
        if 'tools-nav' in style.get_text():
            style.decompose()

    # Get remaining body content
    content_html = ''.join(str(child) for child in body.contents)

    return title, '\n'.join(head_extras), content_html.strip()

def detect_light_mode(html_content):
    """Detect if page uses light theme (light bg, dark text)."""
    # Check for common light theme indicators
    light_indicators = [
        'background-color: #f',
        'background:#f',
        'background: #f',
        'color: #333',
        'color:#333',
        'color: #1',
        'color:#1',
        'bg-white',
        'bg-gray-50',
        'bg-slate-50',
    ]
    content_lower = html_content.lower()
    return any(ind in content_lower for ind in light_indicators)

def generate_migrated_page(title, head_extras, content, current_file):
    """Generate new page using base template."""
    with open(BASE_TEMPLATE, 'r', encoding='utf-8') as f:
        template = f.read()

    nav_links = build_nav_links(current_file)
    light_mode = ' class="light"' if detect_light_mode(content) else ''

    # Replace placeholders
    result = template.replace('{{TITLE}}', title)
    result = result.replace('{{DESCRIPTION}}', f'{title} - เครื่องมือใน Zyde\'s Toolbox')
    result = result.replace('{{HEAD_EXTRAS}}', head_extras)
    result = result.replace('{{NAV_LINKS}}', nav_links)
    result = result.replace('{{TOOL_TITLE}}', title)
    result = result.replace('{{CONTENT}}', content)
    result = result.replace('{{FOOTER_CONTENT}}', 'Zyde\'s Toolbox | รพ.สต.ยะรัง')
    result = result.replace('<html lang="th">', f'<html lang="th"{light_mode}>')
    result = result.replace('{{FOOTER_SCRIPTS}}', '')

    return result

def migrate_file(filepath):
    """Migrate a single HTML file."""
    filename = filepath.name
    print(f"Processing: {filename}")

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Skip index.html (it's the dashboard)
    if filename == 'index.html':
        print(f"  Skipping index.html (dashboard)")
        return False

    # Skip if already migrated (has base template markers)
    if 'tools-nav' in content and 'var(--tool-brand)' in content:
        print(f"  Already migrated")
        return False

    title, head_extras, body_content = extract_existing_content(content)
    migrated = generate_migrated_page(title, head_extras, body_content, filename)

    # Backup original
    backup_path = filepath.with_suffix('.html.bak')
    filepath.rename(backup_path)
    print(f"  Backed up to {backup_path.name}")

    # Write migrated
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(migrated)

    print(f"  ✓ Migrated")
    return True

def main():
    print("=" * 60)
    print("Migrating tools to base-template.html")
    print("=" * 60)

    html_files = list(TOOLS_DIR.glob("*.html"))
    html_files = [f for f in html_files if not f.name.startswith('.') and 'node_modules' not in str(f)]

    migrated_count = 0
    for filepath in html_files:
        try:
            if migrate_file(filepath):
                migrated_count += 1
        except Exception as e:
            print(f"  ✗ Error: {e}")

    print("=" * 60)
    print(f"Done. Migrated {migrated_count} files.")
    print("Original files backed up with .bak extension.")
    print("=" * 60)

if __name__ == '__main__':
    main()