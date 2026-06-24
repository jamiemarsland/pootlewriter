import React, { useState, useEffect } from 'react';
import { X, Loader2, Check, AlertCircle } from 'lucide-react';
import { WordPressConfig as Config } from '../types';
import { saveWordPressConfig, getWordPressConfig, testWordPressConnection, revokeWordPressConfig } from '../utils/wordpress';

interface Props {
  onClose: () => void;
  onSave: (config: Config | null) => void;
}

export default function WordPressConfig({ onClose, onSave }: Props) {
  const [config, setConfig] = useState<Config>({ url: '', username: '', password: '', publishAsDraft: false });
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'none' | 'success' | 'error'>('none');

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const existingConfig = await getWordPressConfig();
        if (existingConfig) {
          setConfig(existingConfig);
          setConnectionStatus('success');
        }
      } catch (error) {
        console.error('Failed to load WordPress config:', error);
        setConnectionStatus('error');
      }
    };
    loadConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setConnectionStatus('none');

    try {
      const isConnected = await testWordPressConnection(config);
      if (isConnected) {
        await saveWordPressConfig(config);
        onSave(config);
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
    } catch (error) {
      setConnectionStatus('error');
    } finally {
      setTesting(false);
    }
  };

  const handleRevoke = async () => {
    revokeWordPressConfig();
    setConfig({ url: '', username: '', password: '', publishAsDraft: false });
    setConnectionStatus('none');
    onSave(null);
  };

  const handleDraftToggle = async () => {
    const newConfig = { ...config, publishAsDraft: !config.publishAsDraft };
    setConfig(newConfig);
    if (connectionStatus === 'success') {
      await saveWordPressConfig(newConfig);
      onSave(newConfig);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-serif text-gray-900 dark:text-white">WordPress Configuration</h2>
            <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <X size={20} />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              WordPress Site URL
            </label>
            <input
              type="url"
              value={config.url}
              onChange={e => setConfig(c => ({ ...c, url: e.target.value }))}
              placeholder="https://your-site.com"
              required
              className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={connectionStatus === 'success'}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username
            </label>
            <input
              type="text"
              value={config.username}
              onChange={e => setConfig(c => ({ ...c, username: e.target.value }))}
              required
              className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={connectionStatus === 'success'}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Application Password
            </label>
            <input
              type="password"
              value={config.password}
              onChange={e => setConfig(c => ({ ...c, password: e.target.value }))}
              required
              className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={connectionStatus === 'success'}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Generate an application password in your WordPress dashboard under Users → Profile
            </p>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Publish posts as drafts
            </label>
            <button
              type="button"
              onClick={handleDraftToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                config.publishAsDraft ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.publishAsDraft ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {connectionStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle size={16} />
              <span className="text-sm">Connection failed. Please check your credentials.</span>
            </div>
          )}
          
          <div className="flex gap-4">
            {connectionStatus !== 'success' && (
              <button
                type="submit"
                disabled={testing}
                className="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {testing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  'Save Configuration'
                )}
              </button>
            )}
            
            {connectionStatus === 'success' && (
              <>
                <div className="flex-1 flex items-center gap-2 text-green-600 dark:text-green-400">
                  <Check size={16} />
                  <span>Connected</span>
                </div>
                <button
                  type="button"
                  onClick={handleRevoke}
                  className="px-4 py-2 border border-red-600 text-red-600 dark:border-red-500 dark:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Revoke
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}