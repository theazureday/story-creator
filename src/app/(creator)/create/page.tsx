'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getUserStories, createStory } from '@/lib/firestore-utils';
import { generateId } from '@/lib/utils';
import { Story } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

export default function CreatorDashboard() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    tags: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Fetch user's stories
  useEffect(() => {
    if (user) {
      const fetchStories = async () => {
        try {
          const userStories = await getUserStories(user.uid);
          setStories(userStories);
        } catch (error) {
          console.error('Failed to fetch stories:', error);
        } finally {
          setStoriesLoading(false);
        }
      };
      fetchStories();
    }
  }, [user]);

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title.trim()) return;

    setIsCreating(true);
    try {
      const newStory: Story = {
        id: generateId(),
        creatorUid: user.uid,
        creatorName: user.displayName || 'Creator',
        title: formData.title,
        description: formData.description,
        tags: formData.tags
          .split(',')
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag),
        coverImageUrl: '',
        isPublished: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        playCount: 0,
        rating: 0,
        ratingCount: 0,
        sceneCount: 0,
        characterCount: 0,
      };

      await createStory(newStory);
      setStories([newStory, ...stories]);
      setFormData({ title: '', description: '', tags: '' });
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Failed to create story:', error);
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-violet-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Navigation Bar */}
      <nav className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-violet-500 hover:text-violet-400">
            Story Creator
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">Welcome, {user.email?.split('@')[0]}</span>
            <Button
              onClick={() => {
                // Sign out logic
              }}
              variant="outline"
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-white">My Stories</h1>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger className="inline-flex">
              <Button className="bg-violet-600 hover:bg-violet-700 text-white">
                New Story
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-gray-800">
              <DialogHeader>
                <DialogTitle className="text-white">Create New Story</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Start your creative journey by creating a new interactive story.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateStory} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">
                    Story Title *
                  </label>
                  <Input
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="Enter story title"
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">
                    Description
                  </label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Describe your story..."
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                    rows={4}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">
                    Tags (comma-separated)
                  </label>
                  <Input
                    value={formData.tags}
                    onChange={(e) =>
                      setFormData({ ...formData, tags: e.target.value })
                    }
                    placeholder="adventure, fantasy, mystery"
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4">
                  <Button
                    type="button"
                    onClick={() => setIsDialogOpen(false)}
                    variant="outline"
                    className="border-gray-700 text-gray-300 hover:bg-gray-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isCreating || !formData.title.trim()}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    {isCreating ? 'Creating...' : 'Create Story'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stories Grid */}
        {storiesLoading ? (
          <div className="text-center py-12">
            <div className="text-gray-400">Loading stories...</div>
          </div>
        ) : stories.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            <p className="text-gray-400 text-lg mb-4">
              No stories yet. Create your first story!
            </p>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger className="inline-flex">
                <Button className="bg-violet-600 hover:bg-violet-700 text-white">
                  Create First Story
                </Button>
              </DialogTrigger>
            </Dialog>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stories.map((story) => (
              <Link
                key={story.id}
                href={`/create/${story.id}/characters`}
              >
                <Card className="bg-gray-900 border-gray-800 overflow-hidden hover:border-violet-600 transition-colors h-full cursor-pointer group">
                  {/* Cover Image or Gradient */}
                  <div className="h-48 bg-gradient-to-br from-violet-600 to-purple-900 relative overflow-hidden">
                    {story.coverImageUrl ? (
                      <img
                        src={story.coverImageUrl}
                        alt={story.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-violet-300 text-sm opacity-50">
                          No cover image
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-white text-lg line-clamp-2 flex-1">
                        {story.title}
                      </h3>
                      {story.isPublished && (
                        <Badge className="bg-violet-600 text-white flex-shrink-0 whitespace-nowrap">
                          Published
                        </Badge>
                      )}
                    </div>

                    <p className="text-gray-400 text-sm line-clamp-2">
                      {story.description || 'No description yet'}
                    </p>

                    {/* Stats */}
                    <div className="flex gap-4 text-xs text-gray-500 pt-2 border-t border-gray-800">
                      <div className="flex flex-col">
                        <span className="text-violet-400 font-semibold">
                          {story.playCount || 0}
                        </span>
                        <span>Plays</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-violet-400 font-semibold">
                          {story.characterCount || 0}
                        </span>
                        <span>Characters</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-violet-400 font-semibold">
                          {story.sceneCount || 0}
                        </span>
                        <span>Scenes</span>
                      </div>
                      <div className="flex flex-col ml-auto">
                        <span className="text-gray-500 text-xs">
                          {new Date(story.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
