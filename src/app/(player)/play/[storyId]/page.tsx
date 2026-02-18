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
  getOrCreateWallet,
  deductCoins,
  upsertViewHistory,
  addBookmark,
  removeBookmark,
  getBookmark,
} from '@/lib/firestore-utils';
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
  UserWallet,
} from '@/lib/types';

export default function PlayPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const storyId = params.storyId as string;

  const [story, setStory] = useState<Story | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [progress, setProgress] = useState<PlayerProgress | null>(null);
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);

  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [messages, setMessages] = useState<DialogueMessage[]>([]);
  const [completedConditionIds, setCompletedConditionIds] = useState<string[]>([]);

  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState<ExpressionKey>('default');
  const [characterVisible, setCharacterVisible] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSceneComplete, setIsSceneComplete] = useState(false);

  const [showSceneMap, setShowSceneMap] = useState(false);
  const [premiumPrompt, setPremiumPrompt] = useState<Scene | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isSceneUnlocked = useCallback((scene: Scene, completedSceneIds: string[]) => {
    if (!scene.unlockedBySceneId) return true;
    return completedSceneIds.includes(scene.unlockedBySceneId);
  }, []);

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

        let walletData: UserWallet | null = null;
        if (user) {
          walletData = await getOrCreateWallet(user.uid);
          setWallet(walletData);
          const bm = await getBookmark(user.uid, storyId);
          setIsBookmarked(!!bm);
        }

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
            const allMet = scene.winConditions.length > 0 &&
              scene.winConditions.every((wc) => (prog!.completedWinConditions[scene.id] || []).includes(wc.id));
            if (allMet) setIsSceneComplete(true);
          }
        } else if (scenesData.length > 0) {
          const firstScene = scenesData.find(s => !s.unlockedBySceneId) || scenesData[0];
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

          setMessages([{ role: 'narrator', text: `Scene: ${firstScene.title}`, timestamp: Date.now() }]);
        }

        if (scenesData.length > 0) {
          const firstScene = scenesData.find((s) => s.id === (prog?.currentSceneId || scenesData[0].id));
          if (firstScene && firstScene.characterIds.length > 0) {
            setActiveCharacterId(firstScene.characterIds[0]);
          }
        }

        if (user && storyData) {
          await upsertViewHistory(user.uid, storyId, storyData.title, storyData.coverImageUrl, prog?.completedSceneIds?.length || 0, scenesData.length);
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

  const toggleBookmark = async () => {
    if (!user) return;
    try {
      if (isBookmarked) {
        await removeBookmark(user.uid, storyId);
        setIsBookmarked(false);
      } else {
        await addBookmark(user.uid, storyId);
        setIsBookmarked(true);
      }
    } catch (err) {
      console.error('Bookmark error:', err);
    }
  };

  const sendMessage = useCallback(
    async (text: string) => {
      if (!currentScene || isSending) return;
      setIsSending(true);

      const playerMsg: DialogueMessage = { role: 'player', text, timestamp: Date.now() };
      const updatedMessages = [...messages, playerMsg];
      setMessages(updatedMessages);

      try {
        const sceneChars = currentScene.characterIds
          .map((id) => characters[id])
          .filter(Boolean)
          .map((c) => ({
            id: c.id, name: c.name, displayName: c.displayName,
            description: c.description, outfit: currentScene.outfits[c.id] || '',
          }));

        const response = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'scene_dialogue',
            scenePrompt: currentScene.prompt,
            characters: sceneChars,
            conversationHistory: updatedMessages.map((m) => ({
              role: m.role, characterId: m.characterId, characterName: m.characterName, text: m.text,
            })),
            playerMessage: text,
            winConditions: currentScene.winConditions,
            completedConditionIds,
          }),
        });

        if (!response.ok) throw new Error('AI response failed');
        const data: AIResponse = await response.json();

        if (data.character !== activeCharacterId) {
          setCharacterVisible(false);
          await new Promise((r) => setTimeout(r, 300));
          setActiveCharacterId(data.character);
          setCharacterVisible(true);
        }

        const emotion = (data.emotion || 'default') as ExpressionKey;
        setCurrentEmotion(emotion);

        const charData = characters[data.character];
        const aiMsg: DialogueMessage = {
          role: 'character', characterId: data.character,
          characterName: charData?.displayName || 'Character',
          emotion, text: data.text, timestamp: Date.now(),
        };
        const finalMessages = [...updatedMessages, aiMsg];
        setMessages(finalMessages);

        const newCompleted = [...completedConditionIds, ...data.completedConditions];
        const uniqueCompleted = Array.from(new Set(newCompleted));
        setCompletedConditionIds(uniqueCompleted);

        const allMet = currentScene.winConditions.length > 0 &&
          currentScene.winConditions.every((wc) => uniqueCompleted.includes(wc.id));

        if (allMet) {
          setIsSceneComplete(true);
          setMessages((prev) => [...prev, {
            role: 'system', text: 'All objectives complete! You may continue to the next scene.', timestamp: Date.now(),
          }]);
        }

        if (user && progress) {
          const updatedProgress: PlayerProgress = {
            ...progress,
            currentConversation: finalMessages,
            completedWinConditions: { ...progress.completedWinConditions, [currentScene.id]: uniqueCompleted },
            updatedAt: Date.now(),
          };
          if (allMet) {
            updatedProgress.completedSceneIds = [...Array.from(new Set([...progress.completedSceneIds, currentScene.id]))];
          }
          setProgress(updatedProgress);
          await savePlayerProgress(updatedProgress);

          if (story) {
            await upsertViewHistory(user.uid, storyId, story.title, story.coverImageUrl, updatedProgress.completedSceneIds.length, scenes.length);
          }
        }
      } catch (err) {
        console.error('Error sending message:', err);
        setMessages((prev) => [...prev, { role: 'system', text: 'Something went wrong. Please try again.', timestamp: Date.now() }]);
      } finally {
        setIsSending(false);
      }
    },
    [currentScene, messages, characters, completedConditionIds, activeCharacterId, isSending, user, progress, story, scenes, storyId]
  );

  const goToScene = useCallback(async (targetScene: Scene) => {
    if (!user || !progress) return;

    if (targetScene.isPremium && targetScene.coinCost > 0) {
      const alreadyUnlocked = progress.completedSceneIds.includes(targetScene.id) || progress.currentSceneId === targetScene.id;
      if (!alreadyUnlocked) {
        setPremiumPrompt(targetScene);
        return;
      }
    }

    setCharacterVisible(false);
    await new Promise((r) => setTimeout(r, 300));

    setCurrentScene(targetScene);
    setMessages([{ role: 'narrator', text: `Scene: ${targetScene.title}`, timestamp: Date.now() }]);
    setCompletedConditionIds(progress.completedWinConditions[targetScene.id] || []);
    setIsSceneComplete(false);

    const alreadyCompleted = progress.completedWinConditions[targetScene.id];
    if (alreadyCompleted && targetScene.winConditions.length > 0 &&
      targetScene.winConditions.every(wc => alreadyCompleted.includes(wc.id))) {
      setIsSceneComplete(true);
    }

    if (targetScene.characterIds.length > 0) {
      setActiveCharacterId(targetScene.characterIds[0]);
      setCurrentEmotion('default');
    }
    setCharacterVisible(true);

    const updatedProgress: PlayerProgress = {
      ...progress, currentSceneId: targetScene.id, currentConversation: [], updatedAt: Date.now(),
    };
    setProgress(updatedProgress);
    await savePlayerProgress(updatedProgress);
    setShowSceneMap(false);
  }, [user, progress]);

  const handlePremiumPurchase = async () => {
    if (!premiumPrompt || !user || !wallet) return;
    const cost = premiumPrompt.coinCost || 25;
    if (wallet.coins < cost) {
      alert(`Not enough coins! You need ${cost} coins but have ${wallet.coins}.`);
      return;
    }
    const success = await deductCoins(user.uid, cost);
    if (success) {
      setWallet({ ...wallet, coins: wallet.coins - cost });
      const sceneToGo = premiumPrompt;
      setPremiumPrompt(null);
      await goToScene(sceneToGo);
    } else {
      alert('Failed to deduct coins. Try again.');
    }
  };

  const advanceToNextScene = useCallback(async () => {
    if (!currentScene || !scenes.length || !progress) return;
    const currentIndex = scenes.findIndex((s) => s.id === currentScene.id);
    let nextScene: Scene | null = null;
    for (let i = currentIndex + 1; i < scenes.length; i++) {
      if (isSceneUnlocked(scenes[i], progress.completedSceneIds)) {
        nextScene = scenes[i];
        break;
      }
    }
    if (!nextScene) {
      setMessages((prev) => [...prev, { role: 'system', text: 'Congratulations! You\'ve completed this story!', timestamp: Date.now() }]);
      return;
    }
    await goToScene(nextScene);
  }, [currentScene, scenes, progress, goToScene, isSceneUnlocked]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading story...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: 'var(--background)' }}>
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => router.push('/browse')} className="btn-accent">Browse Stories</button>
        </div>
      </div>
    );
  }

  const activeCharacter = activeCharacterId ? characters[activeCharacterId] : null;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: '#0a0a1a' }}>
      <div className="absolute inset-0">
        {currentScene?.backgroundImageUrl ? (
          <img src={currentScene.backgroundImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-gray-900 via-gray-950 to-black" />
        )}
        <div className="absolute inset-0 bg-black/30" />
      </div>

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-4 py-2 bg-black/60 backdrop-blur-sm">
        <button onClick={() => router.push('/browse')} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Exit
        </button>
        <span className="text-xs text-gray-500 truncate max-w-[30%]">{story?.title}</span>
        <div className="flex items-center gap-3">
          {wallet && (
            <span className="text-xs text-yellow-400 flex items-center gap-1">
              <span className="text-yellow-500 font-bold">{wallet.coins}</span> coins
            </span>
          )}
          <button onClick={toggleBookmark} className={`text-sm ${isBookmarked ? 'text-yellow-400' : 'text-gray-400 hover:text-yellow-400'}`} title={isBookmarked ? 'Remove bookmark' : 'Bookmark story'}>
            <svg className="w-5 h-5" fill={isBookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          </button>
          <button onClick={() => setShowSceneMap(!showSceneMap)} className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded border border-gray-600 hover:border-gray-500">
            Scenes
          </button>
        </div>
      </div>

      {/* Scene map */}
      {showSceneMap && progress && (
        <div className="relative z-30 bg-black/90 backdrop-blur-sm border-b border-gray-800 px-4 py-3 overflow-x-auto">
          <div className="flex gap-2">
            {scenes.map((scene, idx) => {
              const unlocked = isSceneUnlocked(scene, progress.completedSceneIds);
              const completed = progress.completedSceneIds.includes(scene.id);
              const isCurrent = currentScene?.id === scene.id;
              return (
                <button key={scene.id} onClick={() => unlocked && goToScene(scene)} disabled={!unlocked}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs transition-all ${
                    isCurrent ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                    : completed ? 'bg-green-900/40 text-green-400 border border-green-600/30 hover:bg-green-900/60'
                    : unlocked ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                    : 'bg-gray-900/50 text-gray-600 cursor-not-allowed border border-gray-800'
                  }`}>
                  <span className="block font-medium">Scene {idx + 1}</span>
                  <span className="block text-[10px] mt-0.5 truncate max-w-[100px]">{scene.title}</span>
                  {scene.isPremium && !completed && <span className="block text-[10px] text-yellow-400 mt-0.5">{scene.coinCost} coins</span>}
                  {!unlocked && <span className="block text-[10px] mt-0.5">Locked</span>}
                  {completed && <span className="block text-[10px] mt-0.5">Done</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Premium prompt */}
      {premiumPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm text-center">
            <h3 className="text-white font-bold text-lg mb-2">Premium Scene</h3>
            <p className="text-gray-400 text-sm mb-4">
              &ldquo;{premiumPrompt.title}&rdquo; costs <span className="text-yellow-400 font-bold">{premiumPrompt.coinCost || 25} coins</span> to unlock.
            </p>
            <p className="text-gray-500 text-xs mb-4">Your balance: <span className="text-yellow-400">{wallet?.coins || 0} coins</span></p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setPremiumPrompt(null)} className="px-4 py-2 rounded-lg text-sm border border-gray-600 text-gray-300 hover:bg-gray-800">Cancel</button>
              <button onClick={handlePremiumPurchase} disabled={!wallet || wallet.coins < (premiumPrompt.coinCost || 25)} className="btn-accent disabled:opacity-50">
                Unlock for {premiumPrompt.coinCost || 25} coins
              </button>
            </div>
          </div>
        </div>
      )}

      {currentScene && <WinConditionTracker conditions={currentScene.winConditions} completedIds={completedConditionIds} />}

      <div className="relative flex-1 min-h-0">
        <CharacterSprite character={activeCharacter} emotion={currentEmotion} isVisible={characterVisible} />
      </div>

      <div className="relative z-10">
        <DialogueBox messages={messages} characters={characters} onSendMessage={sendMessage} isSending={isSending} isSceneComplete={isSceneComplete} onNextScene={advanceToNextScene} />
      </div>
    </div>
  );
}
