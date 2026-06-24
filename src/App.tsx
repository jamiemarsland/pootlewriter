import React, { useState, useEffect } from 'react';
import { Post } from './types';
import Editor from './components/Editor';
import PostList from './components/PostList';
import { loadPosts, savePosts } from './utils/storage';
import { loadTheme, saveTheme, Theme } from './utils/theme';
import { getWordPressConfig, fetchPostFromWordPress } from './utils/wordpress';

function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentPost, setCurrentPost] = useState<Post | null>(null);
  const [showList, setShowList] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [wpConfig, setWpConfig] = useState(null);

  useEffect(() => {
    setPosts(loadPosts());
    const initialTheme = loadTheme();
    setTheme(initialTheme);
    saveTheme(initialTheme);

    // Load WordPress config
    const loadWpConfig = async () => {
      try {
        const config = await getWordPressConfig();
        setWpConfig(config);
      } catch (error) {
        console.error('Failed to load WordPress config:', error);
      }
    };
    loadWpConfig();
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    saveTheme(newTheme);
  };

  const handleSave = (post: Post) => {
    const newPosts = posts.some(p => p.id === post.id)
      ? posts.map(p => p.id === post.id ? post : p)
      : [...posts, post];
    
    setPosts(newPosts);
    savePosts(newPosts);
    setCurrentPost(post);
    setShowList(false);
  };

  const handleDelete = (id: string) => {
    const newPosts = posts.filter(p => p.id !== id);
    setPosts(newPosts);
    savePosts(newPosts);
    if (currentPost?.id === id) {
      setCurrentPost(null);
    }
  };

  const handleRefreshFromWordPress = async (post: Post) => {
    const config = await getWordPressConfig();
    if (!config) throw new Error('WordPress is not configured.');
    const { title, content } = await fetchPostFromWordPress(post.wordpressId!, config);
    const now = Date.now();
    const updated: Post = { ...post, title, content, lastModified: now, wpModified: now };
    const newPosts = posts.map(p => p.id === post.id ? updated : p);
    setPosts(newPosts);
    savePosts(newPosts);
    if (currentPost?.id === post.id) setCurrentPost(updated);
  };

  return (
    <div className="min-h-screen">
      {showList ? (
        <PostList
          posts={posts}
          onSelect={(post) => {
            setCurrentPost(post);
            setShowList(false);
          }}
          onDelete={handleDelete}
          onRefreshFromWordPress={handleRefreshFromWordPress}
        />
      ) : (
        <Editor
          post={currentPost}
          onSave={handleSave}
          onNew={() => setShowList(true)}
          theme={theme}
          onThemeToggle={toggleTheme}
          wpConfig={wpConfig}
          onWpConfigUpdate={setWpConfig}
        />
      )}
    </div>
  );
}

export default App;