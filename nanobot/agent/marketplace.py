"""Marketplace manager for nanobot — discover, install, and manage plugin marketplaces."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path

from loguru import logger


@dataclass
class MarketplaceEntry:
    """A registered marketplace source."""

    name: str
    source: str
    type: str  # "local" or "git"


@dataclass
class MarketplacePluginInfo:
    """A plugin available in a marketplace."""

    name: str
    description: str
    source_path: str  # Relative path inside the marketplace (e.g. "./claude-plugins/data-toolkit")
    marketplace_name: str
    installed: bool


class MarketplaceManager:
    """
    Manages plugin marketplaces: register/remove marketplace sources, discover
    available plugins, and install/uninstall them into ``~/.nanobot/plugins/``.

    Marketplace sources can be local directories or git repositories. Each
    marketplace root must contain ``.claude-plugin/marketplace.json`` with the
    manifest listing available plugins.

    Config is persisted in ``~/.nanobot/marketplaces.json``.
    Git repos are cached in ``~/.nanobot/marketplace-cache/<name>/``.
    Installed plugins land in ``~/.nanobot/plugins/<plugin-name>/``.
    """

    CONFIG_PATH = Path.home() / ".nanobot" / "marketplaces.json"
    CACHE_DIR = Path.home() / ".nanobot" / "marketplace-cache"
    PLUGINS_DIR = Path.home() / ".nanobot" / "plugins"

    GIT_TIMEOUT = 60  # seconds

    def __init__(
        self,
        config_path: Path | None = None,
        cache_dir: Path | None = None,
        plugins_dir: Path | None = None,
    ):
        self.config_path = config_path or self.CONFIG_PATH
        self.cache_dir = cache_dir or self.CACHE_DIR
        self.plugins_dir = plugins_dir or self.PLUGINS_DIR

    # ------------------------------------------------------------------ public

    def list_marketplaces(self) -> list[MarketplaceEntry]:
        """Return all registered marketplaces."""
        return self._load_config()

    def add_marketplace(self, source: str) -> MarketplaceEntry:
        """
        Register a new marketplace from a local path or git URL.

        For git sources the repo is cloned (``--depth=1``) into the cache
        directory and the manifest is read to determine the marketplace name.
        For local sources the path must exist and contain a valid manifest.

        Returns the created ``MarketplaceEntry``.

        Raises ``ValueError`` on invalid source or duplicate name.
        """
        source_type = self._detect_type(source)

        if source_type == "git":
            entry = self._add_git_marketplace(source)
        else:
            entry = self._add_local_marketplace(source)

        # Persist — update existing entry if one with the same name exists
        entries = self._load_config()
        replaced = False
        for i, existing in enumerate(entries):
            if existing.name == entry.name:
                logger.info(
                    "Updating existing marketplace '{}' (old source: {} → new source: {})",
                    entry.name,
                    existing.source,
                    entry.source,
                )
                entries[i] = entry
                replaced = True
                break
        if not replaced:
            entries.append(entry)
        self._save_config(entries)
        logger.info("Registered marketplace '{}' from {}", entry.name, entry.source)
        return entry

    def remove_marketplace(self, name: str) -> None:
        """
        Unregister a marketplace by name.

        If the marketplace was cloned from git, the cached clone is also deleted.

        Raises ``ValueError`` if the marketplace is not found.
        """
        entries = self._load_config()
        entry = self._find_entry(entries, name)

        # Clean up git cache if applicable
        cache_path = self.cache_dir / name
        if cache_path.exists():
            shutil.rmtree(cache_path)
            logger.debug("Removed cached clone at {}", cache_path)

        entries = [e for e in entries if e.name != name]
        self._save_config(entries)
        logger.info("Removed marketplace '{}'", name)

    def list_available_plugins(
        self, marketplace_name: str
    ) -> list[MarketplacePluginInfo]:
        """
        List all plugins offered by a registered marketplace.

        For git marketplaces the cached clone is updated (``git pull --ff-only``)
        before reading the manifest.

        Raises ``ValueError`` if the marketplace is not found or the manifest
        is missing/invalid.
        """
        entries = self._load_config()
        entry = self._find_entry(entries, marketplace_name)
        root = self._resolve_root(entry)
        manifest = self._read_manifest(root, entry.name)

        installed_names = self._installed_plugin_names()

        plugins: list[MarketplacePluginInfo] = []
        for p in manifest.get("plugins", []):
            pname = p.get("name", "")
            if not pname:
                continue
            # Skip plugins whose names would be unsafe as directory names
            try:
                self._validate_name(pname, "plugin name")
            except ValueError:
                logger.warning(
                    "Skipping plugin with unsafe name '{}' in marketplace '{}'",
                    pname,
                    marketplace_name,
                )
                continue
            plugins.append(
                MarketplacePluginInfo(
                    name=pname,
                    description=p.get("description", ""),
                    source_path=p.get("source", ""),
                    marketplace_name=entry.name,
                    installed=pname in installed_names,
                )
            )
        return plugins

    def install_plugin(self, marketplace_name: str, plugin_name: str) -> Path:
        """
        Install a plugin from a marketplace into ``~/.nanobot/plugins/``.

        The plugin directory is copied (not symlinked) so it works even if the
        marketplace source is later removed.

        Returns the ``Path`` to the installed plugin directory.

        Raises ``ValueError`` if the marketplace or plugin is not found, or if
        the plugin source directory does not exist.
        """
        self._validate_name(plugin_name, "plugin name")

        entries = self._load_config()
        entry = self._find_entry(entries, marketplace_name)
        root = self._resolve_root(entry)
        manifest = self._read_manifest(root, entry.name)

        plugin_meta = self._find_plugin_in_manifest(manifest, plugin_name, entry.name)
        source_rel = plugin_meta.get("source", "")
        source_dir = (root / source_rel).resolve()
        root_resolved = root.resolve()

        # Guard against path traversal — source_dir must be inside the marketplace root
        if not str(source_dir).startswith(str(root_resolved)):
            raise ValueError(
                f"Plugin source '{source_rel}' resolves outside the marketplace "
                f"root ({root_resolved}). This looks like a path traversal attempt."
            )

        if not source_dir.is_dir():
            raise ValueError(
                f"Plugin source directory does not exist: {source_dir}"
            )

        dest = self.plugins_dir / plugin_name
        if dest.exists():
            logger.debug("Removing existing plugin dir at {}", dest)
            shutil.rmtree(dest)

        self.plugins_dir.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source_dir, dest)
        logger.info(
            "Installed plugin '{}' from marketplace '{}' → {}",
            plugin_name,
            entry.name,
            dest,
        )
        return dest

    def update_marketplace(self, name: str) -> MarketplaceEntry:
        """
        Update a marketplace's cached data.

        For git marketplaces: clones if cache is missing, pulls if it exists.
        For local marketplaces: validates the path still exists.

        Returns the ``MarketplaceEntry``.

        Raises ``ValueError`` if the marketplace is not registered or the
        update fails.
        """
        entries = self._load_config()
        entry = self._find_entry(entries, name)

        if entry.type == "git":
            cache_path = self.cache_dir / name
            if not cache_path.exists():
                # Cache missing (e.g. fresh Docker container) — clone
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                try:
                    subprocess.run(
                        ["git", "clone", "--depth=1", entry.source, str(cache_path)],
                        capture_output=True,
                        timeout=self.GIT_TIMEOUT,
                        check=True,
                    )
                    logger.info(
                        "Cloned marketplace '{}' from {}", name, entry.source
                    )
                except subprocess.CalledProcessError as e:
                    stderr = (
                        e.stderr.decode(errors="replace").strip()
                        if e.stderr
                        else ""
                    )
                    raise ValueError(
                        f"Failed to clone marketplace '{name}': {stderr}"
                    ) from e
                except subprocess.TimeoutExpired as e:
                    raise ValueError(
                        f"Git clone timed out after {self.GIT_TIMEOUT}s "
                        f"for marketplace '{name}'"
                    ) from e
            else:
                # Cache exists — pull latest
                try:
                    subprocess.run(
                        ["git", "pull", "--ff-only"],
                        cwd=cache_path,
                        capture_output=True,
                        timeout=self.GIT_TIMEOUT,
                        check=True,
                    )
                    logger.info(
                        "Updated marketplace '{}' from {}", name, entry.source
                    )
                except subprocess.CalledProcessError as e:
                    stderr = (
                        e.stderr.decode(errors="replace").strip()
                        if e.stderr
                        else ""
                    )
                    raise ValueError(
                        f"Failed to update marketplace '{name}': {stderr}"
                    ) from e
                except subprocess.TimeoutExpired as e:
                    raise ValueError(
                        f"Git pull timed out after {self.GIT_TIMEOUT}s "
                        f"for marketplace '{name}'"
                    ) from e
        else:
            # Local marketplace — just verify path still exists
            path = Path(entry.source).expanduser().resolve()
            if not path.is_dir():
                raise ValueError(
                    f"Local marketplace directory no longer exists: {path}"
                )
            logger.debug("Local marketplace '{}' verified at {}", name, path)

        return entry

    def uninstall_plugin(self, plugin_name: str) -> None:
        """
        Remove an installed plugin from ``~/.nanobot/plugins/``.

        Raises ``ValueError`` if the plugin directory does not exist.
        """
        dest = self.plugins_dir / plugin_name
        if not dest.exists():
            raise ValueError(
                f"Plugin '{plugin_name}' is not installed (expected at {dest})"
            )
        shutil.rmtree(dest)
        logger.info("Uninstalled plugin '{}'", plugin_name)

    # ------------------------------------------------------------------ config

    def _load_config(self) -> list[MarketplaceEntry]:
        """Load the marketplaces config file. Returns empty list on missing/corrupt file."""
        if not self.config_path.exists():
            return []
        try:
            raw = json.loads(self.config_path.read_text(encoding="utf-8"))
            if not isinstance(raw, list):
                logger.warning(
                    "marketplaces.json is not a list, resetting to empty"
                )
                return []
            return [
                MarketplaceEntry(
                    name=item["name"],
                    source=item["source"],
                    type=item["type"],
                )
                for item in raw
                if isinstance(item, dict) and "name" in item and "source" in item and "type" in item
            ]
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to read marketplaces.json: {}", e)
            return []

    def _save_config(self, entries: list[MarketplaceEntry]) -> None:
        """Persist the marketplaces list to disk."""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        data = [asdict(e) for e in entries]
        self.config_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    # ------------------------------------------------------------------ helpers

    @staticmethod
    def _validate_name(name: str, label: str = "name") -> None:
        """Reject names that could cause path traversal when used in filesystem paths.

        Raises ``ValueError`` if *name* contains ``/``, ``\\``, or is ``.`` / `..``.
        """
        if "/" in name or "\\" in name or name in (".", ".."):
            raise ValueError(
                f"Invalid {label} '{name}': must not contain path separators "
                f"or be '.' / '..'"
            )

    @staticmethod
    def _detect_type(source: str) -> str:
        """Determine whether a source string is a git URL or a local path."""
        if (
            source.startswith("http://")
            or source.startswith("https://")
            or source.startswith("ssh://")
            or source.startswith("git://")
            or source.startswith("git@")
            or source.endswith(".git")
        ):
            return "git"
        return "local"

    def _find_entry(
        self, entries: list[MarketplaceEntry], name: str
    ) -> MarketplaceEntry:
        """Lookup a marketplace entry by name or raise ValueError."""
        for entry in entries:
            if entry.name == name:
                return entry
        raise ValueError(
            f"Marketplace '{name}' is not registered. "
            f"Use add_marketplace() first."
        )

    def _resolve_root(self, entry: MarketplaceEntry) -> Path:
        """
        Return the filesystem root of a marketplace.

        For local marketplaces this is the source path directly.
        For git marketplaces this is the cached clone, updated with
        ``git pull --ff-only`` before returning.
        """
        if entry.type == "git":
            cache_path = self.cache_dir / entry.name
            if not cache_path.exists():
                raise ValueError(
                    f"Git cache for marketplace '{entry.name}' not found at "
                    f"{cache_path}. Try removing and re-adding the marketplace."
                )
            # Update the cached clone
            try:
                subprocess.run(
                    ["git", "pull", "--ff-only"],
                    cwd=cache_path,
                    capture_output=True,
                    timeout=self.GIT_TIMEOUT,
                    check=True,
                )
                logger.debug("Updated git cache for '{}'", entry.name)
            except subprocess.CalledProcessError as e:
                logger.warning(
                    "git pull failed for '{}': {}",
                    entry.name,
                    e.stderr.decode(errors="replace").strip() if e.stderr else str(e),
                )
            except subprocess.TimeoutExpired:
                logger.warning("git pull timed out for '{}'", entry.name)
            return cache_path
        else:
            path = Path(entry.source).expanduser().resolve()
            if not path.is_dir():
                raise ValueError(
                    f"Local marketplace directory does not exist: {path}"
                )
            return path

    def _read_manifest(self, root: Path, marketplace_name: str) -> dict:
        """Read marketplace manifest, or auto-discover plugins if no manifest exists.

        Looks for ``.claude-plugin/marketplace.json`` first.  If that file is
        missing, falls back to scanning ``claude-plugins/`` for subdirectories
        that contain a ``plugin.json`` or ``.claude-plugin/plugin.json``.
        """
        manifest_path = root / ".claude-plugin" / "marketplace.json"
        if manifest_path.exists():
            try:
                data = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as e:
                raise ValueError(
                    f"Failed to parse marketplace manifest at {manifest_path}: {e}"
                ) from e

            if not isinstance(data, dict):
                raise ValueError(
                    f"Marketplace manifest at {manifest_path} must be a JSON object"
                )
            if "plugins" not in data or not isinstance(data["plugins"], list):
                raise ValueError(
                    f"Marketplace manifest at {manifest_path} missing 'plugins' array"
                )
            return data

        # Fallback: auto-discover plugins under claude-plugins/
        return self._auto_discover_plugins(root, marketplace_name)

    def _auto_discover_plugins(self, root: Path, marketplace_name: str) -> dict:
        """Scan ``claude-plugins/`` for plugin directories and build a manifest."""
        plugins_dir = root / "claude-plugins"
        if not plugins_dir.is_dir():
            raise ValueError(
                f"Marketplace at {root} has no .claude-plugin/marketplace.json "
                f"and no claude-plugins/ directory to scan."
            )

        plugins: list[dict] = []
        for plugin_dir in sorted(plugins_dir.iterdir()):
            if not plugin_dir.is_dir():
                continue
            # Read plugin metadata
            name = plugin_dir.name
            description = ""
            for candidate in (plugin_dir / "plugin.json", plugin_dir / ".claude-plugin" / "plugin.json"):
                if candidate.exists():
                    try:
                        meta = json.loads(candidate.read_text(encoding="utf-8"))
                        name = meta.get("name", name)
                        description = meta.get("description", "")
                    except (json.JSONDecodeError, OSError):
                        pass
                    break
            plugins.append({
                "name": name,
                "source": f"./claude-plugins/{plugin_dir.name}",
                "description": description,
            })

        logger.info(
            "Auto-discovered {} plugins in marketplace '{}' (no manifest file)",
            len(plugins), marketplace_name,
        )
        return {"name": marketplace_name, "plugins": plugins}

    @staticmethod
    def _find_plugin_in_manifest(
        manifest: dict, plugin_name: str, marketplace_name: str
    ) -> dict:
        """Find a plugin entry by name in a marketplace manifest."""
        for p in manifest.get("plugins", []):
            if p.get("name") == plugin_name:
                return p
        raise ValueError(
            f"Plugin '{plugin_name}' not found in marketplace '{marketplace_name}'. "
            f"Available: {[p.get('name') for p in manifest.get('plugins', [])]}"
        )

    def _installed_plugin_names(self) -> set[str]:
        """Return the set of currently installed plugin directory names."""
        if not self.plugins_dir.exists():
            return set()
        return {d.name for d in self.plugins_dir.iterdir() if d.is_dir()}

    # ------------------------------------------------------------------ git

    def _add_git_marketplace(self, source: str) -> MarketplaceEntry:
        """Clone a git URL, read the manifest to get the name, move to cache."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp) / "repo"
            logger.debug("Cloning {} into temp dir", source)
            try:
                subprocess.run(
                    ["git", "clone", "--depth=1", source, str(tmp_path)],
                    capture_output=True,
                    timeout=self.GIT_TIMEOUT,
                    check=True,
                )
            except subprocess.CalledProcessError as e:
                stderr = e.stderr.decode(errors="replace").strip() if e.stderr else ""
                raise ValueError(
                    f"Failed to clone git repository '{source}': {stderr}"
                ) from e
            except subprocess.TimeoutExpired as e:
                raise ValueError(
                    f"Git clone timed out after {self.GIT_TIMEOUT}s for '{source}'"
                ) from e

            # Derive a fallback name from the git URL (e.g. "my-marketplace" from ".../my-marketplace.git")
            fallback_name = source.rstrip("/").rsplit("/", 1)[-1].removesuffix(".git") or "unknown"
            manifest = self._read_manifest(tmp_path, fallback_name)
            name = manifest.get("name")
            if not name or not isinstance(name, str):
                name = fallback_name
            self._validate_name(name, "marketplace name")

            # Move to permanent cache location
            cache_path = self.cache_dir / name
            if cache_path.exists():
                shutil.rmtree(cache_path)
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(tmp_path), str(cache_path))
            logger.debug("Cached git marketplace '{}' at {}", name, cache_path)

        return MarketplaceEntry(name=name, source=source, type="git")

    def _add_local_marketplace(self, source: str) -> MarketplaceEntry:
        """Register a local directory as a marketplace source."""
        path = Path(source).expanduser().resolve()
        if not path.is_dir():
            raise ValueError(
                f"Local marketplace path does not exist or is not a directory: {path}"
            )

        fallback_name = path.name
        manifest = self._read_manifest(path, fallback_name)
        name = manifest.get("name")
        if not name or not isinstance(name, str):
            name = fallback_name
        self._validate_name(name, "marketplace name")

        return MarketplaceEntry(name=name, source=str(path), type="local")
