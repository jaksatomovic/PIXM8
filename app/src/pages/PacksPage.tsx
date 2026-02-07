import { useEffect, useState, useRef } from 'react';
import { api } from '../api';
import {
  Package,
  Upload,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Download,
  ToggleLeft,
  ToggleRight,
  Image as ImageIcon,
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';

type Addon = {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  img_src?: string;
  is_enabled?: boolean;
  experiences_count: number;
  voices_count?: number;
  installed_at?: number;
};

type CatalogItem = {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  img_src?: string;
  zip_url: string;
  tags?: string[];
};

/** Default packs offered to the user (install from file or from catalog). */
const DEFAULT_PACKS: { id: string; name: string; description: string }[] = [
  { id: 'retro_future_pack', name: 'Retro Future Pack', description: 'Synthwave + CRT + arcade vibes. Personalities, games, and stories.' },
];

export const PacksPage = () => {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installingUrl, setInstallingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [brokenImgById, setBrokenImgById] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imgSrcFor = (item: { id: string; img_src?: string | null }) => {
    const src = typeof item?.img_src === 'string' ? item.img_src.trim() : '';
    if (!src) return null;
    if (/^https?:\/\//i.test(src)) return src;
    return convertFileSrc(src);
  };

  const loadAddons = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAddons();
      setAddons(res?.addons || []);
    } catch (e: unknown) {
      setAddons([]);
      setError(e instanceof Error ? e.message : 'Failed to load packs');
    } finally {
      setLoading(false);
    }
  };

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const res = await api.getAddonCatalog();
      setCatalog(res?.catalog || []);
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    loadAddons();
    loadCatalog();
  }, []);

  const handleInstallClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      setError('Please select a .zip file');
      return;
    }

    setInstalling(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.installAddon(file);

      if (result?.success) {
        setSuccess(
          `"${result.addon_name}" installed. ` +
            `${result.voices_added ?? 0} voices, ` +
            `${(result.experiences_added ?? 0) + (result.experiences_updated ?? 0)} experiences.`
        );
        await loadAddons();
      } else {
        setError(result?.error || 'Installation failed');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to install');
    } finally {
      setInstalling(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInstallFromUrl = async (zipUrl: string) => {
    setInstallingUrl(zipUrl);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.installAddonFromUrl(zipUrl);

      if (result?.success) {
        setSuccess(`"${result.addon_name}" installed from catalog.`);
        await loadAddons();
      } else {
        setError(result?.error || 'Installation failed');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to install from URL');
    } finally {
      setInstallingUrl(null);
    }
  };

  const handleSetEnabled = async (addonId: string, isEnabled: boolean) => {
    setError(null);
    try {
      await api.setAddonEnabled(addonId, isEnabled);
      await loadAddons();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleUninstall = async (addonId: string, addonName: string) => {
    if (!confirm(`Uninstall "${addonName}"? Experiences and pack data will be removed.`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const result = await api.uninstallAddon(addonId);

      if (result?.success) {
        setSuccess(`"${addonName}" uninstalled.`);
        await loadAddons();
      } else {
        setError(result?.error || 'Uninstall failed');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to uninstall');
    }
  };

  const installedIds = new Set(addons.map((a) => a.id));
  const catalogAvailable = catalog.filter((c) => !installedIds.has(c.id));
  const defaultAvailable = DEFAULT_PACKS.filter((d) => !installedIds.has(d.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-black flex items-center gap-3">
          <Package className="w-7 h-7" />
          Packs
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={loadCatalog}
            disabled={catalogLoading}
            className="retro-btn retro-btn-outline disabled:opacity-50 flex items-center gap-2"
            title="Refresh catalog"
          >
            <RefreshCw className={`w-4 h-4 ${catalogLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleInstallClick}
            disabled={installing}
            className="retro-btn disabled:opacity-50 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            {installing ? 'Installing…' : 'Install from file'}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleFileSelect}
      />

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 font-bold rounded-[12px] flex items-center gap-2">
          <CheckCircle className="w-5 h-5 shrink-0" />
          {success}
        </div>
      )}

      {error && (
        <div className="retro-card font-mono text-sm py-3 px-4 flex items-center gap-2" style={{ backgroundColor: 'rgba(255, 193, 7, 0.15)', border: '1px solid rgba(255, 152, 0, 0.4)' }}>
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{error}</span>
          <span className="opacity-80">— Install from file below still works.</span>
        </div>
      )}

      {loading ? (
        <div className="retro-card font-mono text-sm py-8 text-center text-[var(--color-retro-fg-secondary)]">
          Loading packs…
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
          {/* Card: Add your own pack (install from file) */}
          <div
            role="button"
            tabIndex={0}
            onClick={handleInstallClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleInstallClick();
            }}
            className="retro-card retro-not-selected flex flex-col cursor-pointer transition-shadow hover:shadow-[var(--shadow-retro-hover)] text-left"
            style={{ padding: 0 }}
          >
            <div className="w-full h-[160px] rounded-t-[24px] bg-orange-50/50 flex items-center justify-center overflow-hidden border-b border-[var(--color-retro-border)]" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)', backgroundSize: '6px 6px' }}>
              <ImageIcon size={18} className="text-gray-600" />
            </div>
            <div className="min-w-0 flex-1 p-4">
              <h3 className="text-lg font-black leading-tight retro-clamp-2">Add your own pack</h3>
              <p className="text-gray-600 text-xs font-medium mt-2 retro-clamp-2">
                Install a pack from a .zip file (addon format).
              </p>
            </div>
            <div className="mt-auto border-t border-gray-200 p-4">
              <span className="retro-btn w-full justify-center inline-flex gap-2">
                <Upload size={16} />
                Choose file
              </span>
            </div>
          </div>

          {/* Default packs (not installed) – install from file */}
          {defaultAvailable.map((pack) => (
            <div
              key={`default-${pack.id}`}
              className="retro-card retro-not-selected flex flex-col text-left"
              style={{ padding: 0 }}
            >
              <div className="w-full h-[160px] rounded-t-[24px] bg-orange-50/50 flex items-center justify-center overflow-hidden border-b border-[var(--color-retro-border)]" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)', backgroundSize: '6px 6px' }}>
                <ImageIcon size={18} className="text-gray-600" />
              </div>
              <div className="min-w-0 flex-1 p-4">
                <h3 className="text-lg font-black leading-tight retro-clamp-2">{pack.name}</h3>
                <p className="text-gray-600 text-xs font-medium mt-2 retro-clamp-2">{pack.description}</p>
              </div>
              <div className="mt-auto border-t border-gray-200 p-4">
                <button
                  type="button"
                  onClick={handleInstallClick}
                  disabled={installing}
                  className="retro-btn w-full justify-center gap-2 disabled:opacity-50"
                >
                  <Download size={16} />
                  {installing ? 'Installing…' : 'Install from file'}
                </button>
              </div>
            </div>
          ))}

          {/* Catalog packs (not installed) */}
          {catalogAvailable.map((item) => {
            const src = imgSrcFor(item);
            const broken = brokenImgById[`catalog-${item.id}`];
            return (
            <div
              key={`catalog-${item.id}`}
              className="retro-card retro-not-selected flex flex-col text-left"
              style={{ padding: 0 }}
            >
              <div className="w-full h-[160px] rounded-t-[24px] bg-orange-50/50 flex items-center justify-center overflow-hidden border-b border-[var(--color-retro-border)]" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)', backgroundSize: '6px 6px' }}>
                {src && !broken ? (
                  <div className="w-full h-full flex items-center justify-center overflow-hidden">
                    <img
                      src={src}
                      alt=""
                      className="h-auto w-auto max-h-full max-w-full object-contain object-center"
                      onError={() => setBrokenImgById((prev) => ({ ...prev, [`catalog-${item.id}`]: true }))}
                    />
                  </div>
                ) : (
                  <ImageIcon size={18} className="text-gray-600" />
                )}
              </div>
              <div className="min-w-0 flex-1 p-4">
                <h3 className="text-lg font-black leading-tight retro-clamp-2">{item.name}</h3>
                <p className="text-gray-600 text-xs font-medium mt-1">v{item.version}</p>
                <p className="text-gray-600 text-xs font-medium mt-2 retro-clamp-2">{item.description || '—'}</p>
                {Array.isArray(item.tags) && item.tags.length > 0 && (
                  <p className="text-xs opacity-60 mt-1">{item.tags.join(', ')}</p>
                )}
              </div>
              <div className="mt-auto border-t border-gray-200 p-4">
                <button
                  type="button"
                  onClick={() => handleInstallFromUrl(item.zip_url)}
                  disabled={!!installingUrl}
                  className="retro-btn w-full justify-center gap-2 disabled:opacity-50"
                >
                  <Download size={16} />
                  {installingUrl === item.zip_url ? 'Installing…' : 'Install'}
                </button>
              </div>
            </div>
          );
          })}

          {/* Installed packs */}
          {addons.map((addon) => {
            const src = imgSrcFor(addon);
            const broken = brokenImgById[addon.id];
            return (
            <div
              key={addon.id}
              id={`pack-${addon.id}`}
              className="retro-card retro-not-selected flex flex-col text-left"
              style={{ padding: 0 }}
            >
              <div className="w-full h-[160px] rounded-t-[24px] bg-orange-50/50 flex items-center justify-center overflow-hidden border-b border-[var(--color-retro-border)]" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)', backgroundSize: '6px 6px' }}>
                {src && !broken ? (
                  <div className="w-full h-full flex items-center justify-center overflow-hidden">
                    <img
                      src={src}
                      alt=""
                      className="h-auto w-auto max-h-full max-w-full object-contain object-center"
                      onError={() => setBrokenImgById((prev) => ({ ...prev, [addon.id]: true }))}
                    />
                  </div>
                ) : (
                  <ImageIcon size={18} className="text-gray-600" />
                )}
              </div>
              <div className="min-w-0 flex-1 p-4">
                <h3 className="text-lg font-black leading-tight retro-clamp-2">{addon.name}</h3>
                <p className="text-gray-600 text-xs font-medium mt-1">v{addon.version}</p>
                <p className="text-gray-600 text-xs font-medium mt-2 retro-clamp-2">{addon.description || '—'}</p>
                <div className="flex items-center gap-3 mt-2 text-xs opacity-60">
                  <span>{addon.experiences_count} experience{addon.experiences_count !== 1 ? 's' : ''}</span>
                  <span>{addon.voices_count ?? 0} voice{(addon.voices_count ?? 0) !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="mt-auto border-t border-gray-200 p-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleSetEnabled(addon.id, !addon.is_enabled)}
                  className="flex items-center gap-2 text-sm font-bold"
                  title={addon.is_enabled ? 'Disable pack' : 'Enable pack'}
                >
                  {addon.is_enabled ? (
                    <ToggleRight className="w-5 h-5 text-[var(--color-retro-accent)]" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 opacity-50" />
                  )}
                  <span className="uppercase text-xs">{addon.is_enabled ? 'On' : 'Off'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUninstall(addon.id, addon.name)}
                  className="retro-btn retro-btn-outline text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Uninstall
                </button>
              </div>
            </div>
          );
          })}
        </div>
    </div>
  );
};
