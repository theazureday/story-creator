'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getPublishedStories } from '@/lib/firestore-utils';
import { timeAgo } from '@/lib/utils';
import type { Story } from '@/lib/types';

export default function BrowsePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getPublishedStories(100);
        setStories(data);
      } catch (err) {
        console.error('Error loading stories:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Collect all unique tags
  const allTags = Array.from(new Set(stories.flatMap((s) => s.tags))).sort();

  // Filter stories
  const filtered = stories.filter((s) => {
    const matchesSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !selectedTag || s.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-sm border-b border-gray-800/50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="text-lg font-bold text-white flex items-center gap-2"
          >
            <span className="text-violet-400">✦</span> Story Creator
          </button>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <button
                  onClick={() => router.push('/library')}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  My Library
                </button>
                <button
                  onClick={() => router.push('/create')}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  Dashboard
                </button>
                <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-xs font-medium">
                  {user.displayName?.charAt(0) || 'U'}
                </div>
              </>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="text-sm px-3 py-1.5 bg-violet-600 rounded-lg hover:bg-violet-500"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold mb-1">Browse Stories</h1>
        <p className="text-gray-400 text-sm">Discover interactive visual novels created by the community</p>
      </div>

      {/* Search + Filters */}
      <div className="max-w-6xl mx-auto px-4 pb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search stories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        {/* Tags */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => setSelectedTag(null)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                !selectedTag
                  ? 'bg-violet-600/20 border-violet-500 text-violet-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  tag === selectedTag
                    ? 'bg-violet-600/20 border-violet-500 text-violet-300'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Story Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg mb-2">
              {search || selectedTag ? 'No stories match your filters' : 'No stories published yet'}
            </p>
            <p className="text-gray-600 text-sm">
              {!search && !selectedTag && 'Be the first to create and publish a story!'}
            </p>
            {!user && (
              <button
                onClick={() => router.push('/signup')}
                className="mt-4 px-4 py-2 bg-violet-600 rounded-lg text-sm hover:bg-violet-500"
              >
                Get Started
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((story) => (
              <button
                key={story.id}
                onClick={() => router.push(`/play/${story.id}`)}
                className="group text-left bg-gray-900/50 border border-gray-800/50 rounded-xl overflow-hidden hover:border-violet-500/30 transition-all hover:shadow-lg hover:shadow-violet-500/5"
              >
                {/* Cover image */}
                <div className="aspect-[16/9] bg-gradient-to-br from-violet-900/30 to-gray-900 relative overflow-hidden">
                  {story.coverImageUrl ? (
                    <img
                      src={story.coverImageUrl}
                      alt={story.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl opacity-20">📖</span>
                    </div>
                  )}
                  {/* Play count overlay */}
                  <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs text-gray-300 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                    {story.playCount}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-white group-hover:text-violet-300 transition-colors line-clamp-1">
                    {story.title}
                  </h3>
                  <p className="text-gray-400 text-xs mt-1 line-clamp-2">{story.description}</p>

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{story.sceneCount} scenes</span>
                      <span>{story.characterCount} characters</span>
                    </div>
                    {story.rating > 0 && (
                      <div className="flex items-center gap-1 text-xs text-yellow-500">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {story.rating.toFixed(1)}
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {story.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {story.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-800/50">
                    <span className="text-[10px] text-gray-600">by {story.creatorName}</span>
                    <span className="text-[10px] text-gray-600">{timeAgo(story.updatedAt)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
