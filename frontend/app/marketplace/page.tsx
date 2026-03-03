'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Store,
  RefreshCw,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Download,
  Check,
  X,
  Globe,
  FolderOpen,
} from 'lucide-react';
import {
  listMarketplaces,
  addMarketplace,
  removeMarketplace,
  updateMarketplace,
  listMarketplacePlugins,
  installMarketplacePlugin,
  uninstallPlugin,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { Marketplace, MarketplacePlugin } from '@/types';

export default function MarketplacePage() {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [selectedMarketplace, setSelectedMarketplace] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSource, setAddSource] = useState('');
  const [adding, setAdding] = useState(false);
  const [actionPlugin, setActionPlugin] = useState<string | null>(null);
  const [updatingMarketplace, setUpdatingMarketplace] = useState<string | null>(null);

  const loadMarketplaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMarketplaces();
      const list = Array.isArray(data) ? data : [];
      setMarketplaces(list);
      // Auto-select first marketplace if none selected or selected was removed
      if (list.length > 0) {
        setSelectedMarketplace((prev) => {
          if (prev && list.some((m) => m.name === prev)) return prev;
          return list[0].name;
        });
      } else {
        setSelectedMarketplace(null);
        setPlugins([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load marketplaces');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlugins = useCallback(async (marketplaceName: string) => {
    setPluginsLoading(true);
    try {
      const data = await listMarketplacePlugins(marketplaceName);
      setPlugins(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load plugins');
    } finally {
      setPluginsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarketplaces();
  }, [loadMarketplaces]);

  useEffect(() => {
    if (selectedMarketplace) {
      loadPlugins(selectedMarketplace);
    }
  }, [selectedMarketplace, loadPlugins]);

  const handleAdd = async () => {
    if (!addSource.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const marketplace = await addMarketplace(addSource.trim());
      setAddSource('');
      setShowAddForm(false);
      await loadMarketplaces();
      setSelectedMarketplace(marketplace.name);
    } catch (err: any) {
      setError(err.message || 'Failed to add marketplace');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (name: string) => {
    setError(null);
    try {
      await removeMarketplace(name);
      if (selectedMarketplace === name) {
        setSelectedMarketplace(null);
        setPlugins([]);
      }
      await loadMarketplaces();
    } catch (err: any) {
      setError(err.message || 'Failed to remove marketplace');
    }
  };

  const handleUpdateMarketplace = async (name: string) => {
    setUpdatingMarketplace(name);
    setError(null);
    try {
      await updateMarketplace(name);
      await loadPlugins(name);
    } catch (err: any) {
      setError(err.message || 'Failed to update marketplace');
    } finally {
      setUpdatingMarketplace(null);
    }
  };

  const handleUpdatePlugin = async (marketplaceName: string, pluginName: string) => {
    setActionPlugin(pluginName);
    setError(null);
    try {
      await installMarketplacePlugin(marketplaceName, pluginName);
      await loadPlugins(marketplaceName);
    } catch (err: any) {
      setError(err.message || 'Failed to update plugin');
    } finally {
      setActionPlugin(null);
    }
  };

  const handleInstall = async (marketplaceName: string, pluginName: string) => {
    setActionPlugin(pluginName);
    setError(null);
    try {
      await installMarketplacePlugin(marketplaceName, pluginName);
      await loadPlugins(marketplaceName);
    } catch (err: any) {
      setError(err.message || 'Failed to install plugin');
    } finally {
      setActionPlugin(null);
    }
  };

  const handleUninstall = async (pluginName: string) => {
    setActionPlugin(pluginName);
    setError(null);
    try {
      await uninstallPlugin(pluginName);
      if (selectedMarketplace) {
        await loadPlugins(selectedMarketplace);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to uninstall plugin');
    } finally {
      setActionPlugin(null);
    }
  };

  const handleRefresh = async () => {
    await loadMarketplaces();
    if (selectedMarketplace) {
      await loadPlugins(selectedMarketplace);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="w-6 h-6" />
            Marketplace
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and install plugins from registered marketplaces
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowAddForm((v) => !v)}
            variant="outline"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Marketplace
          </Button>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2 text-destructive text-sm">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 h-6 w-6 p-0"
                onClick={() => setError(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add marketplace form */}
      {showAddForm && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Local path or Git URL (e.g. /path/to/marketplace or https://github.com/...)"
                value={addSource}
                onChange={(e) => setAddSource(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                }}
                disabled={adding}
                className="flex-1"
              />
              <Button onClick={handleAdd} disabled={adding || !addSource.trim()} size="sm">
                {adding ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add
              </Button>
              <Button
                onClick={() => {
                  setShowAddForm(false);
                  setAddSource('');
                }}
                variant="ghost"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Marketplace tabs */}
      {marketplaces.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {marketplaces.map((marketplace) => (
            <div key={marketplace.name} className="flex items-center gap-0.5">
              <Button
                variant={selectedMarketplace === marketplace.name ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedMarketplace(marketplace.name)}
                className="gap-1.5"
              >
                {marketplace.type === 'git' ? (
                  <Globe className="w-3.5 h-3.5" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5" />
                )}
                {marketplace.name}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                disabled={updatingMarketplace === marketplace.name}
                onClick={() => handleUpdateMarketplace(marketplace.name)}
                title="Update marketplace"
              >
                {updatingMarketplace === marketplace.name ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(marketplace.name)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {marketplaces.length === 0 && !error && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Store className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">No marketplaces registered</p>
            <p className="text-sm mt-2 max-w-sm mx-auto">
              Add a marketplace by clicking{' '}
              <strong>Add Marketplace</strong> above and providing a local path or Git URL.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Plugin list */}
      {selectedMarketplace && (
        <>
          {pluginsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : plugins.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Store className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No plugins available</p>
                <p className="text-sm mt-1">
                  This marketplace has no plugins yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {plugins.map((plugin) => (
                <Card key={plugin.name}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base font-semibold">
                            {plugin.name}
                          </CardTitle>
                          {plugin.installed && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Check className="w-3 h-3" />
                              Installed
                            </Badge>
                          )}
                        </div>
                        {plugin.description && (
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                            {plugin.description}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {plugin.installed ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionPlugin === plugin.name}
                              onClick={() =>
                                handleUpdatePlugin(plugin.marketplace_name, plugin.name)
                              }
                            >
                              {actionPlugin === plugin.name ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              ) : (
                                <RefreshCw className="w-4 h-4 mr-2" />
                              )}
                              Update
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionPlugin === plugin.name}
                              onClick={() => handleUninstall(plugin.name)}
                            >
                              {actionPlugin === plugin.name ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              ) : (
                                <Trash2 className="w-4 h-4 mr-2" />
                              )}
                              Uninstall
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            disabled={actionPlugin === plugin.name}
                            onClick={() =>
                              handleInstall(plugin.marketplace_name, plugin.name)
                            }
                          >
                            {actionPlugin === plugin.name ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                              <Download className="w-4 h-4 mr-2" />
                            )}
                            Install
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
