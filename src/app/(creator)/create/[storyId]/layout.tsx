'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getStory, updateStory } from '@/lib/firestore-utils';
import { Story } from '@/lib/types';
import Link from 'next/link';

const TABS = [
  { id: 'scenes', label: 'Scenes', path: 'scenes' },
  { id: 'characters', label: 'Characters', path: 'characters' },
  { id: 'backgrounds', label: 'Backgrounds', path: 'backgrounds' },
  { id: 'key-art', label: 'Key Art', path: 'key-art' },
];

export default function StoryEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const storyId = params.storyId as string;
  const [story, setStory] = useState<Story | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && storyId) {
      getStory(storyId).then((s) => {
        if (s) {
          setStory(s);
          setTitleDraft(s.title);
        }
      });
    }
  }, [user, storyId]);

  const activeTab = TABS.find((t) => pathname.includes(`/${t.path}`))?.id || 'scenes';

  const handleTitleSave = async () => {
    if (story && titleDraft.trim() && titleDraft !== story.title) {
      await updateStory(storyId, { title: titleDraft.trim() });
      setStory({ ...story, title: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-purple-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Top Bar */}
      <div className="border-b px-4 py-3 flex items-center gap-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <Link
          href="/create"
          className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back
        </Link>
        <div className="h-5 w-px bg-gray-700" />
        {editingTitle ? (
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
            autoFocus
            className="bg-transparent border-b border-purple-500 text-white text-lg font-bold outline-none px-1"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="text-lg font-bold text-white hover:text-purple-300 transition-colors"
          >
            {story?.title || 'Untitled Story'}
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="border-b flex" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex px-4">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={`/create/${storyId}/${tab.path}`}
              className={`tab-jai ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Page Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
