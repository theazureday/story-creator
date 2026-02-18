'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getUserBookmarks, getUserViewHistory, getStory } from '@/lib/firestore-utils';
import { timeAgo } from '@/lib/utils';
import type { Story, Bookmark, ViewHistory } from '@/lib/types';

type Tab = 'history' | 'bookmarks';

export default function LibraryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('history');
  const [history, setHistory] = useState<ViewHistory[]>([]);
  const [bookmarks, setBookmarks] = useState<(Bookmark & { story?: Story })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoading(true);
      try {
        const [hist, bmarks] = await Promise.all([
          getUserViewHistory(user!.uid),
          getUserBookmarks(user!.uid),
        ]);
        setHistory(hist);

        // Load story details for bookmarks
        const bookmarksWithStories = await Promise.all(
          bmarks.map(async (b) => {
            const story = await getStory(b.storyId);
            return { ...b, story: story || undefined };
          })
        );
        setBookmarks(bookmarksWithStories);
      } catch (err) {
        console.error('Error loading library:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
            <button
              onClick={() => router.push('/browse')}
              className="text-sm text-gray-400 hover:text-white"
            >
              Browse
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
          </div>
        </div>
      </nav>

      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold mb-1">My Library</h1>
        <p className="text-gray-400 text-sm">Your bookmarks and play history</p>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 mb-6">
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'history'
                ? 'bg-violet-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            History ({history.length})
          </button>
          <button
            onClick={() => setTab('bookmarks')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'bookmarks'
                ? 'bg-violet-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Bookmarks ({bookmarks.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'history' ? (
          history.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-500 text-lg mb-2">No play history yet</p>
              <p className="text-gray-600 text-sm mb-4">Start playing stories to see them here</p>
              <button
                onClick={() => router.push('/browse')}
                className="px-4 py-2 bg-violet-600 rounded-lg text-sm hover:bg-violet-500"
              >
                Browse Stories
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => router.push(`/play/${h.storyId}`)}
                  className="group text-left bg-gray-900/50 border border-gray-800/50 rounded-xl overflow-hidden hover:border-violet-500/30 transition-all"
                >
                  <div className="aspect-[16/9] bg-gradient-to-br from-violet-900/30 to-gray-900 relative overflow-hidden">
                    {h.storyCoverUrl ? (
                      <img src={h.storyCoverUrl} alt={h.storyTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-4xl opacity-20">📖</span>
                      </div>
                    )}
                    {/* Progress overlay */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800">
                      <div
                        className="h-full bg-violet-500"
                        style={{ width: `${h.totalScenes > 0 ? (h.scenesCompleted / h.totalScenes) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-white group-hover:text-violet-300 transition-colors line-clamp-1">
                      {h.storyTitle}
                    </h3>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                      <span>{h.scenesCompleted}/{h.totalScenes} scenes</span>
                      <span>{timeAgo(h.lastPlayedAt)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : bookmarks.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg mb-2">No bookmarks yet</p>
            <p className="text-gray-600 text-sm mb-4">Bookmark stories while playing to save them here</p>
            <button
              onClick={() => router.push('/browse')}
              className="px-4 py-2 bg-violet-600 rounded-lg text-sm hover:bg-violet-500"
            >
              Browse Stories
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookmarks.map((b) => (
              <button
                key={b.id}
                onClick={() => router.push(`/play/${b.storyId}`)}
                className="group text-left bg-gray-900/50 border border-gray-800/50 rounded-xl overflow-hidden hover:border-violet-500/30 transition-all"
              >
                <div className="aspect-[16/9] bg-gradient-to-br from-violet-900/30 to-gray-900 relative overflow-hidden">
                  {b.story?.coverImageUrl ? (
                    <img src={b.story.coverImageUrl} alt={b.story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl opacity-20">🔖</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-white group-hover:text-violet-300 transition-colors line-clamp-1">
                    {b.story?.title || 'Unknown Story'}
                  </h3>
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <span>{b.story?.sceneCount || 0} scenes</span>
                    <span>Saved {timeAgo(b.createdAt)}</span>
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
