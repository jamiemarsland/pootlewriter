export interface Post {
  id: string;
  title: string;
  content: string;
  lastModified: number;
  wordpressId?: number;
  publishedAsDraft?: boolean;
  /** Timestamp of the last successful publish or refresh-from-WP */
  wpModified?: number;
  categories?: string[];
  tags?: string[];
  featuredMediaId?: number;
}

export interface WordPressConfig {
  url: string;
  username: string;
  password: string;
  publishAsDraft: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  wordpressId?: number;
}