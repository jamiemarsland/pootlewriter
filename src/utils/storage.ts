import { Post } from '../types';

export const savePosts = (posts: Post[]) => {
  localStorage.setItem('writing-app-posts', JSON.stringify(posts));
};

export const loadPosts = (): Post[] => {
  const posts = localStorage.getItem('writing-app-posts');
  return posts ? JSON.parse(posts) : [];
};