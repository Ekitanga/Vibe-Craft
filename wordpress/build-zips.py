"""Builds the two files to upload to WordPress (EasyWP or any host):

    python wordpress/build-zips.py
      → wordpress/dist/vibecraft-theme.zip   (Appearance → Themes → Add New → Upload)
      → wordpress/dist/vibecraft-core.zip    (Plugins → Add New → Upload)

Re-syncs the theme from Client/ first, so the zips always match the approved design.
"""
import os
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")


def build(source_dir, folder_name, zip_name):
    path = os.path.join(DIST, zip_name)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for root, _dirs, files in os.walk(source_dir):
            for name in files:
                full = os.path.join(root, name)
                archive.write(full, os.path.join(folder_name, os.path.relpath(full, source_dir)))
    print(f"{zip_name}: {os.path.getsize(path) // 1024} KB")


def main():
    subprocess.run([sys.executable, os.path.join(HERE, "sync-theme.py")], check=True)
    os.makedirs(DIST, exist_ok=True)
    build(os.path.join(HERE, "theme", "vibecraft"), "vibecraft", "vibecraft-theme.zip")
    build(os.path.join(HERE, "plugin", "vibecraft-core"), "vibecraft-core", "vibecraft-core.zip")


if __name__ == "__main__":
    main()
