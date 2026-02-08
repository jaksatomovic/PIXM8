import { useEffect, useState, useRef } from 'react';
import { api } from '../api';
import { Package, Upload, Trash2, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

type Addon = {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  is_enabled?: boolean;
  experiences_count: number;
  voices_count?: number;
};

export const Addons = () => {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAddons();
  }, []);

  const loadAddons = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAddons();
      setAddons(res?.addons || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load addons');
    } finally {
      setLoading(false);
    }
  };

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
          `Addon "${result.addon_name}" installed successfully! ` +
          `Added ${result.voices_added || 0} voices, ` +
          `${result.images_added || 0} images, ` +
          `${result.experiences_added || 0} new experiences, ` +
          `${result.experiences_updated || 0} updated experiences.`
        );
        await loadAddons();
      } else {
        setError(result?.error || 'Installation failed');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to install addon');
    } finally {
      setInstalling(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUninstall = async (addonId: string, addonName: string) => {
    if (!confirm(`Are you sure you want to uninstall "${addonName}"?`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const result = await api.uninstallAddon(addonId);
      
      if (result?.success) {
        const removedCount = result?.experiences_removed || 0;
        setSuccess(
          `Addon "${addonName}" uninstalled successfully. ` +
          `${removedCount} experience${removedCount !== 1 ? 's' : ''} removed.`
        );
        await loadAddons();
      } else {
        setError(result?.error || 'Uninstallation failed');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to uninstall addon');
    }
  };

  return (
    <div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 font-bold rounded-[12px] flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 font-bold rounded-[12px] flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}

      <div className="retro-card space-y-6 border border-gray-200 shadow-[0_12px_28px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div>
            <h3 className="font-bold uppercase text-lg mb-1">Community Addon Packs</h3>
            <p className="text-xs opacity-60">
              Install addon packs to add new personalities, games, stories, voices, and images
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadAddons}
              disabled={loading}
              className="retro-btn retro-btn-outline disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleInstallClick}
              disabled={installing}
              className="retro-btn disabled:opacity-50 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {installing ? 'Installing...' : 'Install'}
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

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading addons...</div>
        ) : addons.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-bold">No addons installed</p>
            <p className="text-xs mt-2 opacity-60">
              Click "Install" to install your first addon pack
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {addons.map((addon) => (
              <div
                key={addon.id}
                className="p-4 retro-card rounded-[12px] flex items-start justify-between gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-lg">{addon.name}</h4>
                    <span className="text-xs opacity-60 font-mono">v{addon.version}</span>
                  </div>
                  {addon.author && (
                    <p className="text-xs opacity-60 mb-1">by {addon.author}</p>
                  )}
                  {addon.description && (
                    <p className="text-sm opacity-80 mb-2">{addon.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs opacity-60">
                    <span>{addon.experiences_count} experience{addon.experiences_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleUninstall(addon.id, addon.name)}
                  className="retro-btn retro-btn-outline text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Uninstall
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-[12px]">
        <h4 className="font-bold uppercase text-sm mb-2">About Addon Packs</h4>
        <p className="text-xs opacity-80 leading-relaxed">
          Addon packs are ZIP files containing personalities, games, stories, voices, and images.
          See the README for the addon pack specification and how to create your own.
        </p>
      </div>
    </div>
  );
};
