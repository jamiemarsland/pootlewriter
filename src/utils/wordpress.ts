import { Post, WordPressConfig, Category } from '../types';
import { encryptData, decryptData } from './crypto';
import { marked } from 'marked';
import TurndownService from 'turndown';

const STORAGE_KEY = 'wordpress-config';

export const saveWordPressConfig = async (config: WordPressConfig) => {
  const encryptedConfig = await encryptData(config);
  localStorage.setItem(STORAGE_KEY, encryptedConfig);
};

export const getWordPressConfig = async (): Promise<WordPressConfig | null> => {
  const encryptedConfig = localStorage.getItem(STORAGE_KEY);
  if (!encryptedConfig) return null;
  
  try {
    return await decryptData(encryptedConfig);
  } catch (error) {
    console.error('Failed to decrypt WordPress config:', error);
    return null;
  }
};

export const revokeWordPressConfig = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const testWordPressConnection = async (config: WordPressConfig): Promise<boolean> => {
  if (!config.url || !config.username || !config.password) {
    throw new Error('WordPress configuration is incomplete');
  }

  const auth = btoa(`${config.username}:${config.password}`);
  
  try {
    const response = await fetch(`${config.url}/wp-json/wp/v2/users/me`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const text = await response.text();
      let error;
      try {
        error = JSON.parse(text);
        console.error('WordPress connection test failed:', error);
      } catch {
        console.error('WordPress connection test failed:', text);
      }
      return false;
    }
    
    return true;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('Could not connect to WordPress site. Please check the URL and ensure the site is accessible.');
    }
    console.error('WordPress connection test failed:', error);
    throw error;
  }
};

export const uploadMediaToWordPress = async (file: File, config: WordPressConfig): Promise<{ url: string; id: number }> => {
  if (!config.url || !config.username || !config.password) {
    throw new Error('WordPress configuration is incomplete');
  }

  const auth = btoa(`${config.username}:${config.password}`);
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    // Generate a clean filename from the original filename
    const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    formData.append('title', cleanFilename);
    formData.append('alt_text', cleanFilename.replace(/\.[^/.]+$/, ""));

    const response = await fetch(`${config.url}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`
      },
      body: formData
    });

    if (!response.ok) {
      const text = await response.text();
      let error;
      try {
        error = JSON.parse(text);
        throw new Error(error.message || 'Failed to upload image to WordPress');
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new Error(text || 'Failed to upload image to WordPress');
        }
        throw e;
      }
    }

    const result = await response.json();
    return { url: result.source_url, id: result.id as number };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('Could not connect to WordPress site. Please check the URL and ensure the site is accessible.');
    }
    console.error('WordPress media upload failed:', error);
    throw error instanceof Error ? error : new Error('Failed to upload image to WordPress');
  }
};

// A "tag line" is a line whose only content is hashtags (complete or in-progress).
// We detect this by stripping all complete hashtags, whitespace, and bare # chars —
// if nothing remains, every token on the line is a hashtag.
const isHashtagLine = (trimmed: string): boolean => {
  if (!trimmed || /^#+\s/.test(trimmed)) return false;
  const remainder = trimmed
    .replace(/#[a-zA-Z][a-zA-Z0-9_]*/g, '')
    .replace(/\s+/g, '')
    .replace(/#/g, '');
  return remainder === '' && /#[a-zA-Z]/.test(trimmed);
};

export const extractHashtags = (markdown: string): string[] => {
  const tags = new Set<string>();
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (isHashtagLine(trimmed)) {
      const matches = trimmed.match(/#([a-zA-Z][a-zA-Z0-9_]*)/g);
      matches?.forEach(m => tags.add(m.slice(1)));
    }
  }
  return Array.from(tags);
};

export const stripHashtagLines = (markdown: string): string => {
  return markdown
    .split('\n')
    .filter(line => !isHashtagLine(line.trim()))
    .join('\n')
    .trim();
};

export const getWordPressCategories = async (config: WordPressConfig): Promise<Category[]> => {
  const auth = btoa(`${config.username}:${config.password}`);
  
  try {
    const response = await fetch(`${config.url}/wp-json/wp/v2/categories?per_page=100&orderby=name&order=asc`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch WordPress categories:', errorText);
      throw new Error('Failed to fetch categories from WordPress');
    }
    
    const wpCategories = await response.json();
    return wpCategories.map((cat: any) => ({
      id: cat.id.toString(),
      name: cat.name,
      slug: cat.slug,
      wordpressId: cat.id
    }));
  } catch (error) {
    console.error('Failed to fetch WordPress categories:', error);
    throw error;
  }
};

export const getWordPressTags = async (config: WordPressConfig): Promise<Category[]> => {
  const auth = btoa(`${config.username}:${config.password}`);

  try {
    const response = await fetch(`${config.url}/wp-json/wp/v2/tags?per_page=100&orderby=name&order=asc`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch WordPress tags:', errorText);
      throw new Error('Failed to fetch tags from WordPress');
    }

    const wpTags = await response.json();
    return wpTags.map((tag: any) => ({
      id: tag.id.toString(),
      name: tag.name,
      slug: tag.slug,
      wordpressId: tag.id
    }));
  } catch (error) {
    console.error('Failed to fetch WordPress tags:', error);
    throw error;
  }
};

const createWordPressTag = async (name: string, config: WordPressConfig): Promise<number> => {
  const auth = btoa(`${config.username}:${config.password}`);

  const response = await fetch(`${config.url}/wp-json/wp/v2/tags`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name })
  });

  if (!response.ok) {
    const text = await response.text();
    let error;
    try { error = JSON.parse(text); } catch { /* ignore */ }
    // WordPress returns 400 with "term_exists" code when tag already exists
    if (error?.code === 'term_exists' && error?.data?.term_id) {
      return error.data.term_id as number;
    }
    throw new Error(error?.message || `Failed to create tag "${name}"`);
  }

  const result = await response.json();
  return result.id as number;
};

export const fetchPostFromWordPress = async (wordpressId: number, config: WordPressConfig): Promise<{ title: string; content: string }> => {
  if (!config.url || !config.username || !config.password) {
    throw new Error('WordPress configuration is incomplete');
  }

  const auth = btoa(`${config.username}:${config.password}`);

  try {
    const response = await fetch(`${config.url}/wp-json/wp/v2/posts/${wordpressId}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 404) {
      throw new Error('Post not found on WordPress — it may have been deleted.');
    }

    if (!response.ok) {
      const text = await response.text();
      let error;
      try {
        error = JSON.parse(text);
        throw new Error(error.message || 'Failed to fetch post from WordPress');
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(text || 'Failed to fetch post from WordPress');
        throw e;
      }
    }

    const result = await response.json();

    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    const markdown = td.turndown(result.content.rendered as string);

    return {
      title: result.title.rendered as string,
      content: markdown
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('Could not connect to WordPress site. Please check the URL and ensure the site is accessible.');
    }
    throw error instanceof Error ? error : new Error('Failed to fetch post from WordPress');
  }
};

export const publishToWordPress = async (post: Post, config: WordPressConfig) => {
  if (!config.url || !config.username || !config.password) {
    throw new Error('WordPress configuration is incomplete');
  }

  const auth = btoa(`${config.username}:${config.password}`);
  const endpoint = post.wordpressId 
    ? `${config.url}/wp-json/wp/v2/posts/${post.wordpressId}`
    : `${config.url}/wp-json/wp/v2/posts`;
  
  try {
    // Strip hashtag-only lines before converting to HTML
    const cleanContent = stripHashtagLines(post.content);

    // Convert Markdown to HTML before publishing
    const htmlContent = marked(cleanContent, {
      gfm: true,
      breaks: true,
      smartLists: true,
      smartypants: true
    });

    // Handle categories - only use existing WordPress categories
    let categoryIds: number[] = [];
    if (post.categories && post.categories.length > 0) {
      // Get existing WordPress categories to map names to IDs
      const wpCategories = await getWordPressCategories(config);
      
      for (const categoryName of post.categories) {
        const category = wpCategories.find(cat => cat.name === categoryName);
        if (category && category.wordpressId) {
          categoryIds.push(category.wordpressId);
        } else {
          console.warn(`Category "${categoryName}" not found on WordPress site, skipping...`);
        }
      }
    }

    const postData: any = {
      title: post.title || 'Untitled',
      content: htmlContent,
      status: config.publishAsDraft ? 'draft' : 'publish',
      ...(post.featuredMediaId ? { featured_media: post.featuredMediaId } : {})
    };

    // Only include categories if we have valid IDs
    if (categoryIds.length > 0) {
      postData.categories = categoryIds;
    }

    // Handle tags - auto-create tags that don't exist on WordPress yet
    if (post.tags && post.tags.length > 0) {
      const wpTags = await getWordPressTags(config);
      const tagIds: number[] = [];

      for (const tagName of post.tags) {
        const existing = wpTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
        if (existing && existing.wordpressId) {
          tagIds.push(existing.wordpressId);
        } else {
          try {
            const newId = await createWordPressTag(tagName, config);
            tagIds.push(newId);
          } catch (err) {
            console.warn(`Could not create tag "${tagName}":`, err);
          }
        }
      }

      if (tagIds.length > 0) {
        postData.tags = tagIds;
      }
    }

    const response = await fetch(endpoint, {
      method: post.wordpressId ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(postData)
    });

    if (!response.ok) {
      const text = await response.text();
      let error;
      try {
        error = JSON.parse(text);
        throw new Error(error.message || 'Failed to publish to WordPress');
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new Error(text || 'Failed to publish to WordPress');
        }
        throw e;
      }
    }

    const result = await response.json();
    // Update the post with the draft status
    post.publishedAsDraft = config.publishAsDraft;
    return result;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('Could not connect to WordPress site. Please check the URL and ensure the site is accessible.');
    }
    console.error('WordPress publish failed:', error);
    throw error instanceof Error ? error : new Error('Failed to publish to WordPress');
  }
};