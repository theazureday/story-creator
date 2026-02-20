'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function StoryEditorRedirect() {
  const params = useParams();
  const router = useRouter();
  const storyId = params.storyId as string;

  useEffect(() => {
    router.replace(`/create/${storyId}/scenes`);
  }, [storyId, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-purple-400">Loading...</div>
    </div>
  );
}
