import React, { useState, useEffect } from 'react';
import { X, Tag, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Category, WordPressConfig } from '../types';
import { getWordPressCategories, getWordPressConfig } from '../utils/wordpress';

interface CategoryManagerProps {
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  onClose: () => void;
}

export default function CategoryManager({ selectedCategories, onCategoriesChange, onClose }: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wpConfig, setWpConfig] = useState<WordPressConfig | null>(null);

  useEffect(() => {
    loadWordPressCategories();
  }, []);

  const loadWordPressCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const config = await getWordPressConfig();
      setWpConfig(config);
      
      if (!config) {
        setError('Please configure WordPress connection first');
        setLoading(false);
        return;
      }

      const wpCategories = await getWordPressCategories(config);
      setCategories(wpCategories);
    } catch (err) {
      setError('Failed to load WordPress categories. Please check your connection.');
      console.error('Error loading WordPress categories:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryName: string) => {
    const newSelected = selectedCategories.includes(categoryName)
      ? selectedCategories.filter(name => name !== categoryName)
      : [...selectedCategories, categoryName];
    onCategoriesChange(newSelected);
  };

  const handleRefresh = () => {
    loadWordPressCategories();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-serif text-gray-900 dark:text-white flex items-center gap-2">
            <Tag size={20} />
            WordPress Categories
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-1 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white disabled:opacity-50"
              title="Refresh categories"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600 dark:text-gray-400">Loading categories...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle size={48} className="text-red-500 mb-4" />
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              {!wpConfig && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Go to Settings to configure your WordPress connection first.
                </p>
              )}
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900 dark:text-white">Select Categories:</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {categories.length} available
                </span>
              </div>
              
              {categories.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No categories found on your WordPress site.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                    Create categories in your WordPress admin panel first.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {categories.map((category) => (
                    <label
                      key={category.id}
                      className="flex items-center gap-3 p-3 border rounded-md border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category.name)}
                        onChange={() => toggleCategory(category.name)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <span className="text-gray-900 dark:text-white font-medium">{category.name}</span>
                        {category.slug !== category.name && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Slug: {category.slug}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              
              {selectedCategories.length > 0 && (
                <div className="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                  <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Selected ({selectedCategories.length}):
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedCategories.map((category) => (
                      <span
                        key={category}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}