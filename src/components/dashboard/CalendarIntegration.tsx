"use client";

import React, { useState } from "react";
import { 
  Calendar, 
  Chrome, 
  Monitor, 
  Apple, 
  Check, 
  X, 
  RefreshCw, 
  AlertCircle, 
  ExternalLink,
  Mail,
  Smartphone
} from "lucide-react";

interface CalendarIntegrationProps {
  onClose: () => void;
}

interface CalendarProvider {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  connected: boolean;
  lastSync?: string;
}

export const CalendarIntegration: React.FC<CalendarIntegrationProps> = ({ onClose }) => {
  const [providers, setProviders] = useState<CalendarProvider[]>([
    {
      id: 'google',
      name: 'Google Calendar',
      icon: <Chrome className="w-5 h-5" />,
      color: 'bg-blue-500',
      description: 'Sync with your Google Calendar account',
      connected: false,
    },
    {
      id: 'outlook',
      name: 'Outlook Calendar',
      icon: <Monitor className="w-5 h-5" />,
      color: 'bg-blue-600',
      description: 'Connect to Microsoft Outlook Calendar',
      connected: false,
    },
    {
      id: 'apple',
      name: 'Apple Calendar',
      icon: <Apple className="w-5 h-5" />,
      color: 'bg-gray-800',
      description: 'Sync with Apple iCloud Calendar',
      connected: false,
    },
    {
      id: 'caldav',
      name: 'CalDAV Server',
      icon: <Calendar className="w-5 h-5" />,
      color: 'bg-purple-500',
      description: 'Connect to any CalDAV compatible server',
      connected: false,
    },
  ]);

  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncSettings, setSyncSettings] = useState({
    syncDirection: 'import' as 'import' | 'export' | 'bidirectional',
    syncFrequency: 'hourly' as 'manual' | 'hourly' | 'daily',
    includeCategories: ['deadline', 'hearing', 'meeting'],
  });

  const handleConnect = async (providerId: string) => {
    setSyncing(providerId);
    
    // Simulate connection process
    setTimeout(() => {
      setProviders(prev => prev.map(p => 
        p.id === providerId 
          ? { ...p, connected: true, lastSync: new Date().toISOString() }
          : p
      ));
      setSyncing(null);
    }, 2000);
  };

  const handleDisconnect = async (providerId: string) => {
    setProviders(prev => prev.map(p => 
      p.id === providerId 
        ? { ...p, connected: false, lastSync: undefined }
        : p
    ));
  };

  const handleSync = async (providerId: string) => {
    setSyncing(providerId);
    
    // Simulate sync process
    setTimeout(() => {
      setProviders(prev => prev.map(p => 
        p.id === providerId 
          ? { ...p, lastSync: new Date().toISOString() }
          : p
      ));
      setSyncing(null);
    }, 1500);
  };

  const formatLastSync = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Calendar Integration</h2>
              <p className="text-gray-600 mt-1">Connect your external calendars to sync events</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Providers Grid */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Calendars</h3>
            <div className="grid gap-4">
              {providers.map(provider => (
                <div
                  key={provider.id}
                  className={`border rounded-xl p-4 transition-all ${
                    provider.connected 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg text-white ${provider.color}`}>
                        {provider.icon}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{provider.name}</h4>
                        <p className="text-sm text-gray-600">{provider.description}</p>
                        {provider.connected && (
                          <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Connected • Last sync: {formatLastSync(provider.lastSync)}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {provider.connected ? (
                        <>
                          <button
                            onClick={() => handleSync(provider.id)}
                            disabled={syncing === provider.id}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                          >
                            {syncing === provider.id ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Syncing...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-4 h-4" />
                                Sync Now
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleDisconnect(provider.id)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Disconnect
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleConnect(provider.id)}
                          disabled={syncing === provider.id}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {syncing === provider.id ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <ExternalLink className="w-4 h-4" />
                              Connect
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sync Settings */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Sync Settings</h3>
            
            <div className="space-y-4">
              {/* Sync Direction */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sync Direction</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'import', label: 'Import only', desc: 'From external to MyMcKenzie' },
                    { value: 'export', label: 'Export only', desc: 'From MyMcKenzie to external' },
                    { value: 'bidirectional', label: 'Bidirectional', desc: 'Sync both ways' },
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setSyncSettings(prev => ({ ...prev, syncDirection: option.value as any }))}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        syncSettings.syncDirection === option.value
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-900">{option.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sync Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sync Frequency</label>
                <select
                  value={syncSettings.syncFrequency}
                  onChange={(e) => setSyncSettings(prev => ({ ...prev, syncFrequency: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="manual">Manual only</option>
                  <option value="hourly">Every hour</option>
                  <option value="daily">Once daily</option>
                </select>
              </div>

              {/* Categories to sync */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Categories to Sync</label>
                <div className="space-y-2">
                  {['deadline', 'hearing', 'meeting', 'reminder', 'other'].map(category => (
                    <label key={category} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={syncSettings.includeCategories.includes(category)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSyncSettings(prev => ({
                              ...prev,
                              includeCategories: [...prev.includeCategories, category]
                            }));
                          } else {
                            setSyncSettings(prev => ({
                              ...prev,
                              includeCategories: prev.includeCategories.filter(c => c !== category)
                            }));
                          }
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700 capitalize">{category}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Privacy & Security</p>
                <p>Your calendar data is encrypted and securely transmitted. We only access the minimum information required to sync your events. You can disconnect any time.</p>
              </div>
            </div>
          </div>

          {/* Mobile App Info */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Mobile Sync</h3>
            <div className="flex gap-4">
              <div className="flex-1 p-4 border border-gray-200 rounded-lg">
                <Smartphone className="w-8 h-8 text-indigo-600 mb-2" />
                <h4 className="font-medium text-gray-900">Mobile App</h4>
                <p className="text-sm text-gray-600 mt-1">Download our mobile app to sync on the go</p>
                <button className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                  Learn more →
                </button>
              </div>
              <div className="flex-1 p-4 border border-gray-200 rounded-lg">
                <Mail className="w-8 h-8 text-indigo-600 mb-2" />
                <h4 className="font-medium text-gray-900">Email Reminders</h4>
                <p className="text-sm text-gray-600 mt-1">Get email notifications for upcoming deadlines</p>
                <button className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                  Configure →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => {
              // Save settings
              onClose();
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalendarIntegration;
