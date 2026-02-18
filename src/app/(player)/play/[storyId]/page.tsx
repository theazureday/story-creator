'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  getStory,
  getScenes,
  getCharacters,
  getPlayerProgress,
  savePlayerProgress,
} from '@/lib/firestore-utils';
// Utils
import CharacterSprite from '@/components/vn-engine/CharacterSprite';
import DialogueBox from '@/components/vn-engine/DialogueBox';
import WinConditionTracker from '@/components/vn-engine/WinConditionTracker';
import type {
  Story,
  Scene,
  Character,
  PlayerProgress,
  DialogueMessage,
  ExpressionKey,
  AIResponse,
} from '@/lib/types';

export default function PlayPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const storyId = params.storyId as string;

  // Data state
  const [story, setStory] = useState<Story | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [progress, setProgress] = useState<PlayerProgress | null>(null);

  // Current scene state
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [messages, setMessages] = useState<DialogueMessage[]>([]);
  const [completedConditionIds, setCompletedConditionIds] = useState<string[]>([]);

  // VN display state
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState<ExpressionKey>('default');
  const [characterVisible, setCharacterVisible] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSceneComplete, setIsSceneComplete] = useState(false);

  // Loading
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load story data
  useEffect(() => {
    async function loadData() {
      try {
        const [storyData, scenesData, charsData] = await Promise.all([
          getStory(storyId),
          getScenes(storyId),
          getCharacters(storyId),
        ]);

        if (!storyData) {
          setError('Story not found');
          setLoading(false);
          return;
        }

        setStory(storyData);
        setScenes(scenesData);

        const charMap: Record<string, Character> = {};
        charsData.forEach((c) => (charMap[c.id] = c));
        setCharacters(charMap);

        // Load player progress
        let prog: PlayerProgress | null = null;
        if (user) {
          prog = await getPlayerProgress(user.uid, storyId);
        }

        if (prog) {
          setProgress(prog);
          const scene = scenesData.find((s) => s.id === prog!.currentSceneId);
          if (scene) {
            setCurrentScene(scene);
            setMessages(prog.currentConversation || []);
            setCompletedConditionIds(prog.completedWinConditions[scene.id] || []);
          }
        } else if (scenesData.length > 0) {
          // Start at scene 0
          const firstScene = scenesData[0];
          setCurrentScene(firstScene);

          if (user) {
            const newProgress: PlayerProgress = {
              odcId: `${user.uid}_${storyId}`,
              odcUserRef: user.uid,
              storyId,
              uid: user.uid,
              currentSceneId: firstScene.id,
              completedSceneIds: [],
              currentConversation: [],
              completedWinConditions: {},
              startedAt: Date.now(),
              updatedAt: Date.now(),
            };
            setProgress(newProgress);
            await savePlayerProgress(newProgress);
          }

          // Add scene intro narrator message
          setMessages([
            {
              role: 'narrator',
              text: `Scene: ${firstScene.title}`,
              timestamp: Date.now(),
            },
          ]);
        }

        // Set initial active character
        if (scenesData.length > 0) {
          const firstScene = scenesData.find((s) => s.id === (prog?.currentSceneId || scenesData[0].id));
          if (firstScene && firstScene.characterIds.length > 0) {
            setActiveCharacterId(firstScene.characterIds[0]);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading story:', err);
        setError('Failed to load story');
        setLoading(false);
      }
    }

    loadData();
  }, [storyId, user]);

  // Send player message to AI
  const sendMessage = useCallback(
    async (text: string) => {
      if (!currentScene || isSending) return;

      setIsSending(true);

      // Add player message
      const playerMsg: DialogueMessage = {
        role: 'player',
        text,
        timestamp: Date.now(),
      };
      const updatedMessages = [...messages, playerMsg];
      setMessages(updatedMessages);

      try {
        // Build character data for the API
        const sceneChars = currentScene.characterIds
          .map((id) => characters[id])
          .filter(Boolean)
          .map((c) => ({
            id: c.id,
            name: c.name,
            displayName: c.displayName,
            description: c.description,
            outfit: currentScene.outfits[c.id] || '',
          }));

        const response = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'scene_dialogue',
            scenePrompt: currentScene.prompt,
            characters: sceneChars,
            conversationHistory: updatedMessages.map((m) => ({
              role: m.role,
              characterId: m.characterId,
              characterName: m.characterName,
              text: m.text,
            })),
            playerMessage: text,
            winConditions: currentScene.winConditions,
            completedConditionIds,
          }),
        });

        if (!response.ok) throw new Error('AI response failed');

        const data: AIResponse = await response.json();

        // Transition character if different
        if (data.character !== activeCharacterId) {
          setCharacterVisible(false);
          await new Promise((r) => setTimeout(r, 300));
          setActiveCharacterId(data.character);
          setCharacterVisible(true);
        }

        // Update emotion/expression
        const emotion = (data.emotion || 'default') as ExpressionKey;
        setCurrentEmotion(emotion);

        // Add AI response message
        const charData = characters[data.character];
        const aiMsg: DialogueMessage = {
          role: 'character',
          characterId: data.character,
          characterName: charData?.displayName || 'Character',
          emotion,
          text: data.text,
          timestamp: Date.now(),
        };
        const finalMessages = [...updatedMessages, aiMsg];
        setMessages(finalMessages);

        // Update completed conditions
        const newCompleted = [...completedConditionIds, ...data.completedConditions];
        const uniqueCompleted = Array.from(new Set(newCompleted));
        setCompletedConditionIds(uniqueCompleted);

        // Check if all conditions met
        const allMet =
          currentScene.winConditions.length > 0 &&
          currentScene.winConditions.every((wc) => uniqueCompleted.includes(wc.id));

        if (allMet) {
          setIsSceneComplete(true);
          // Add completion message
          setMessages((prev) => [
            ...prev,
            {
              role: 'system',
              text: '✨ All objectives complete! You may continue to the next scene.',
              timestamp: Date.now(),
            },
          ]);
        }

        // Save progress
        if (user && progress) {
          const updatedProgress: PlayerProgress = {
            ...progress,
            currentConversation: finalMessages,
            completedWinConditions: {
              ...progress.completedWinConditions,
              [currentScene.id]: uniqueCompleted,
            },
            updatedAt: Date.now(),
          };

          if (allMet) {
            updatedProgress.completedSceneIds = [
              ...Array.from(new Set([...progress.completedSceneIds, currentScene.id])),
            ];
          }

          setProgress(updatedProgress);
          await savePlayerProgress(updatedProgress);
        }
      } catch (err) {
        console.error('Error sending message:', err);
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            text: 'Something went wrong. Please try again.',
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [currentScene, messages, characters, completedConditionIds, activeCharacterId, isSending, user, progress]
  );

  // Advance to next scene
  const advanceToNextScene = useCallback(async () => {
    if (!currentScene || !scenes.length) return;

    const currentIndex = scenes.findIndex((s) => s.id === currentScene.id);
    const nextScene = scenes[currentIndex + 1];

    if (!nextScene) {
      // Story complete!
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          text: '🎉 Congratulations! You\'ve completed this story!',
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    // Transition to next scene
    setCharacterVisible(false);
    await new Promise((r) => setTimeout(r, 300));

    setCurrentScene(nextScene);
    setMessages([
      {
        role: 'narrator',
        text: `Scene: ${nextScene.title}`,
        timestamp: Date.now(),
      },
    ]);
    setCompletedConditionIds([]);
    setIsSceneComplete(false);

    if (nextScene.characterIds.length > 0) {
      setActiveCharacterId(nextScene.characterIds[0]);
      setCurrentEmotion('default');
    }
    setCharacterVisible(true);

    // Update progress
    if (user && progress) {
      const updatedProgress: PlayerProgress = {
        ...progress,
        currentSceneId: nextScene.id,
        currentConversation: [],
        updatedAt: Date.now(),
      };
      setProgress(updatedProgress);
      await savePlayerProgress(updatedProgress);
    }
  }, [currentScene, scenes, user, progress]);

  // --- Render ---

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading story...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push('/browse')}
            className="px-4 py-2 bg-gray-800 rounded-lg text-sm hover:bg-gray-700"
          >
            Browse Stories
          </button>
        </div>
      </div>
    );
  }

  const activeCharacter = activeCharacterId ? characters[activeCharacterId] : null;

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col overflow-hidden">
      {/* Background layer */}
      <div className="absolute inset-0">
        {currentScene?.backgroundImageUrl ? (
          <img
            src={currentScene.backgroundImageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-gray-900 via-gray-950 to-black" />
        )}
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/30" />
      </div>

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-4 py-2 bg-gray-950/60 backdrop-blur-sm">
        <button
          onClick={() => router.push('/browse')}
          className="text-gray-400 hover:text-white text-sm flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Exit
        </button>
        <span className="text-xs text-gray-500 truncate max-w-[50%]">
          {story?.title}
        </span>
        <span className="text-xs text-gray-500">
          {currentScene?.title}
        </span>
      </div>

      {/* Win condition tracker */}
      {currentScene && (
        <WinConditionTracker
          conditions={currentScene.winConditions}
          completedIds={completedConditionIds}
        />
      )}

      {/* Character sprite area */}
      <div className="relative flex-1 min-h-0">
        <CharacterSprite
          character={activeCharacter}
          emotion={currentEmotion}
          isVisible={characterVisible}
        />
      </div>

      {/* Dialogue box + input (bottom section) */}
      <div className="relative z-10">
        <DialogueBox
          messages={messages}
          characters={characters}
          onSendMessage={sendMessage}
          isSending={isSending}
          isSceneComplete={isSceneComplete}
          onNextScene={advanceToNextScene}
        />
      </div>
    </div>
  );
}
