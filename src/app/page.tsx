'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getPublishedStories, getUserViewHistory } from '@/lib/firestore-utils';
import { Story, ViewHistory } from '@/lib/types';

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function Home() {
  const router = useRouter();
  const { user, userData } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [viewHistory, setViewHistory] = useState<ViewHistory[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);

  // Fetch popular stories
  useEffect(() => {
    getPublishedStories(30)
      .then(setStories)
      .catch((err) => console.error('Failed to fetch stories:', err))
      .finally(() => setStoriesLoading(false));
  }, []);

  // Fetch user's play history
  useEffect(() => {
    if (user) {
      getUserViewHistory(user.uid)
        .then(setViewHistory)
        .catch((err) => console.error('Failed to fetch view history:', err));
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-sm border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-violet-400 text-xl">✦</span>
            <span className="font-bold text-lg">Story Creator</span>
          </Link>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/create"
                  className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition"
                >
                  Create
                </Link>
                <Link href="/create" className="flex items-center gap-2 group">
                  <div className="w-8 h-8 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center text-sm font-medium text-violet-300 group-hover:border-violet-400 transition">
                    {(userData?.displayName || user.displayName || 'U')[0].toUpperCase()}
                  </div>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-gray-400 hover:text-white transition">
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-10">
        {/* My Chats Section — only for logged-in users with history */}
        {user && viewHistory.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-white">My Chats</h2>
                <p className="text-sm text-gray-500">Continue your stories</p>
              </div>
              <Link href="/library" className="text-sm text-violet-400 hover:text-violet-300 transition">
                View All
              </Link>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-gray-700">
              {viewHistory.map((vh) => (
                <button
                  key={vh.id}
                  onClick={() => router.push(`/play/${vh.storyId}`)}
                  className="flex-shrink-0 w-[180px] group text-left"
                >
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-gray-800 group-hover:border-violet-500/60 transition-all group-hover:shadow-lg group-hover:shadow-violet-500/10">
                    {vh.storyCoverUrl ? (
                      <img
                        src={vh.storyCoverUrl}
                        alt={vh.storyTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-violet-900/40 to-indigo-900/40 flex items-center justify-center">
                        <span className="text-3xl">📖</span>
                      </div>
                    )}
                    {/* Progress bar at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm px-3 py-2">
                      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
                        <div
                          className="h-full bg-violet-500 rounded-full transition-all"
                          style={{ width: `${vh.totalScenes > 0 ? (vh.scenesCompleted / vh.totalScenes) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400">
                        {vh.scenesCompleted}/{vh.totalScenes} scenes · {timeAgo(vh.lastPlayedAt)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-medium text-gray-200 group-hover:text-white transition line-clamp-1">
                    {vh.storyTitle}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Popular Stories Section */}
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-white">Popular Stories</h2>
            <p className="text-sm text-gray-500">Discover interactive visual novels</p>
          </div>

          {storiesLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-violet-500" />
            </div>
          ) : stories.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-500 mb-4">No stories published yet.</p>
              {!user && (
                <Link
                  href="/signup"
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition"
                >
                  Get Started
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {stories.map((story) => (
                <button
                  key={story.id}
                  onClick={() => router.push(`/play/${story.id}`)}
                  className="group text-left"
                >
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-gray-800 group-hover:border-violet-500/60 transition-all group-hover:shadow-lg group-hover:shadow-violet-500/10">
                    {story.coverImageUrl ? (
                      <img
                        src={story.coverImageUrl}
                        alt={story.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-violet-900/40 to-indigo-900/40 flex items-center justify-center">
                        <span className="text-4xl">📖</span>
                      </div>
                    )}
                    {/* Play count badge */}
                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs text-gray-300 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                      {story.playCount}
                    </div>
                    {/* Bottom gradient overlay with info */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-10">
                      <p className="text-sm font-semibold text-white line-clamp-1">{story.title}</p>
                      <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{story.description}</p>
                    </div>
                  </div>
                  {/* Tags below the card */}
                  {story.tags && story.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {story.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700/50"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
