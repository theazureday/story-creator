'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  getScenes,
  getCharacters,
  createScene,
  updateScene,
  deleteScene,
  uploadImage,
} from '@/lib/firestore-utils';
import { fileToDataUrl, generateId } from '@/lib/utils';
import { Scene, Character, WinCondition } from '@/lib/types';
import { useAutoSave } from '@/hooks/useAutoSave';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

export default function SceneBuilder() {
  const params = useParams();
  const { user } = useAuth();
  const storyId = params.storyId as string;

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddSceneDialog, setShowAddSceneDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string>('');

  const selectedScene = scenes.find((s) => s.id === selectedSceneId);

  // Auto-save
  const handleAutoSave = useCallback(async () => {
    const scene = scenes.find((s) => s.id === selectedSceneId);
    if (!scene) return;
    await updateScene(storyId, scene.id, scene);
  }, [scenes, selectedSceneId, storyId]);

  const { status: saveStatus, triggerSave } = useAutoSave({ onSave: handleAutoSave });

  // Helper to update scene and trigger auto-save
  const updateSelectedScene = (updates: Partial<Scene>) => {
    if (!selectedScene) return;
    const updated = { ...selectedScene, ...updates };
    setScenes(scenes.map((s) => (s.id === selectedScene.id ? updated : s)));
    triggerSave();
  };

  useEffect(() => {
    if (!user || !storyId) return;
    const fetchData = async () => {
      try {
        const scenesData = await getScenes(storyId);
        const charsData = await getCharacters(storyId);
        setScenes(scenesData.sort((a, b) => a.orderIndex - b.orderIndex));
        setCharacters(charsData);
        if (scenesData.length > 0) setSelectedSceneId(scenesData[0].id);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, storyId]);

  const handleAddScene = async () => {
    if (!user) return;
    const newScene: Scene = {
      id: generateId(),
      storyId,
      title: 'New Scene',
      prompt: '',
      backgroundImageUrl: '',
      orderIndex: scenes.length,
      characterIds: [],
      outfits: {},
      winConditions: [],
      unlockedBySceneId: null,
      isPremium: false,
      coinCost: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await createScene(storyId, newScene);
      setScenes([...scenes, newScene].sort((a, b) => a.orderIndex - b.orderIndex));
      setSelectedSceneId(newScene.id);
      setShowAddSceneDialog(false);
    } catch (error) {
      console.error('Failed to add scene:', error);
    }
  };

  const handleDeleteScene = async () => {
    if (!deleteConfirm || !user) return;
    try {
      await deleteScene(storyId, deleteConfirm);
      const newScenes = scenes
        .filter((s) => s.id !== deleteConfirm)
        .map((s, idx) => ({ ...s, orderIndex: idx }));
      setScenes(newScenes);
      if (selectedSceneId === deleteConfirm) setSelectedSceneId(newScenes[0]?.id || null);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete scene:', error);
    }
  };

  const handleBackgroundUpload = async (file: File) => {
    if (!selectedScene) return;
    try {
      const previewUrl = await fileToDataUrl(file);
      setBackgroundPreview(previewUrl);
      const storagePath = `stories/${storyId}/scenes/${selectedScene.id}/background.png`;
      const downloadUrl = await uploadImage(storagePath, file);
      updateSelectedScene({ backgroundImageUrl: downloadUrl });
    } catch (error) {
      console.error('Failed to upload background:', error);
    }
  };

  const toggleCharacter = (charId: string) => {
    if (!selectedScene) return;
    const updatedCharacters = selectedScene.characterIds.includes(charId)
      ? selectedScene.characterIds.filter((id) => id !== charId)
      : [...selectedScene.characterIds, charId];
    const updatedOutfits = { ...selectedScene.outfits };
    if (!updatedCharacters.includes(charId)) {
      delete updatedOutfits[charId];
    } else if (!updatedOutfits[charId]) {
      updatedOutfits[charId] = '';
    }
    updateSelectedScene({ characterIds: updatedCharacters, outfits: updatedOutfits });
  };

  const addWinCondition = () => {
    if (!selectedScene) return;
    const newCondition: WinCondition = {
      id: generateId(),
      description: '',
      completionCriteria: '',
    };
    updateSelectedScene({ winConditions: [...selectedScene.winConditions, newCondition] });
  };

  const removeWinCondition = (conditionId: string) => {
    if (!selectedScene) return;
    updateSelectedScene({
      winConditions: selectedScene.winConditions.filter((c) => c.id !== conditionId),
    });
  };

  const updateWinCondition = (
    conditionId: string,
    field: 'description' | 'completionCriteria',
    value: string
  ) => {
    if (!selectedScene) return;
    updateSelectedScene({
      winConditions: selectedScene.winConditions.map((c) =>
        c.id === conditionId ? { ...c, [field]: value } : c
      ),
    });
  };

  // Check for circular dependency
  const wouldCreateCycle = (sceneId: string, prerequisiteId: string | null): boolean => {
    if (!prerequisiteId) return false;
    if (prerequisiteId === sceneId) return true;
    const visited = new Set<string>();
    let current = prerequisiteId;
    while (current) {
      if (visited.has(current)) return true;
      visited.add(current);
      const scene = scenes.find((s) => s.id === current);
      if (!scene || !scene.unlockedBySceneId) break;
      if (scene.unlockedBySceneId === sceneId) return true;
      current = scene.unlockedBySceneId;
    }
    return false;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="text-purple-400">Loading scenes...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r overflow-y-auto flex flex-col" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="p-4 space-y-2 flex-1">
          {scenes.map((scene, idx) => (
            <button
              key={scene.id}
              onClick={() => {
                setSelectedSceneId(scene.id);
                setBackgroundPreview('');
              }}
              className={`w-full flex items-start gap-3 p-3 rounded-lg transition-all duration-200 text-left ${
                selectedSceneId === scene.id ? 'text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
              style={{
                background: selectedSceneId === scene.id ? 'var(--accent)' : 'var(--surface-light)',
              }}
            >
              <span className="text-xs font-bold flex-shrink-0 mt-1 opacity-60">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">{scene.title}</span>
                {scene.isPremium && (
                  <span className="text-xs text-yellow-400 mt-0.5 block">
                    Premium ({scene.coinCost} coins)
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setShowAddSceneDialog(true)}
            className="btn-accent w-full text-center text-sm"
          >
            Add Scene
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-y-auto p-8">
        {selectedScene ? (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Save status */}
            {saveStatus !== 'idle' && (
              <div className={`autosave-indicator ${saveStatus} inline-block`}>
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Error saving'}
              </div>
            )}

            {/* Basic Info */}
            <div className="card-jai p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Scene Details</h2>
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-2">Scene Title</label>
                <Input
                  value={selectedScene.title}
                  onChange={(e) => updateSelectedScene({ title: e.target.value })}
                  className="input-jai text-white"
                />
              </div>
            </div>

            {/* Scene Prompt */}
            <div className="card-jai p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Scene Prompt</h2>
              <Textarea
                value={selectedScene.prompt}
                onChange={(e) => updateSelectedScene({ prompt: e.target.value })}
                placeholder="Describe the scenario, setting, and mood for this scene..."
                className="input-jai text-white placeholder-gray-500"
                rows={6}
              />
            </div>

            {/* Scene Unlocking */}
            <div className="card-jai p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Scene Unlocking</h2>
              <p className="text-sm text-gray-400">
                Choose which scene must be completed before this one becomes available to players.
              </p>
              <select
                value={selectedScene.unlockedBySceneId || ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  if (val && wouldCreateCycle(selectedScene.id, val)) {
                    alert('This would create a circular dependency. Choose a different scene.');
                    return;
                  }
                  updateSelectedScene({ unlockedBySceneId: val });
                }}
                className="w-full rounded-lg px-3 py-2 text-white text-sm input-jai"
                style={{ background: 'var(--surface-light)', borderColor: 'var(--border)' }}
              >
                <option value="">None — Available from start</option>
                {scenes
                  .filter((s) => s.id !== selectedScene.id)
                  .map((s, idx) => (
                    <option key={s.id} value={s.id}>
                      Scene {idx + 1}: {s.title}
                    </option>
                  ))}
              </select>

              {/* Visual dependency chain */}
              {selectedScene.unlockedBySceneId && (
                <div className="flex items-center gap-2 text-sm text-gray-400 mt-2">
                  <span className="px-2 py-1 rounded text-xs" style={{ background: 'var(--surface-light)' }}>
                    {scenes.find((s) => s.id === selectedScene.unlockedBySceneId)?.title || 'Unknown'}
                  </span>
                  <span className="text-purple-400">→</span>
                  <span className="px-2 py-1 rounded text-xs text-white" style={{ background: 'var(--accent)' }}>
                    {selectedScene.title}
                  </span>
                </div>
              )}
            </div>

            {/* Premium Settings */}
            <div className="card-jai p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Premium Settings</h2>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedScene.isPremium || false}
                  onChange={(e) =>
                    updateSelectedScene({
                      isPremium: e.target.checked,
                      coinCost: e.target.checked ? selectedScene.coinCost || 50 : 0,
                    })
                  }
                  className="w-4 h-4 rounded accent-purple-600"
                />
                <label className="text-sm text-gray-300">This is a premium scene</label>
              </div>
              {selectedScene.isPremium && (
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">
                    Cost in Coins
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={selectedScene.coinCost || 50}
                    onChange={(e) =>
                      updateSelectedScene({ coinCost: parseInt(e.target.value) || 0 })
                    }
                    className="input-jai text-white w-32"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Players will need to spend this many coins to unlock this scene.
                  </p>
                </div>
              )}
            </div>

            {/* Background Image */}
            <div className="card-jai p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Background Image</h2>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file?.type.startsWith('image/')) handleBackgroundUpload(file);
                }}
                className="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
                style={{ borderColor: 'var(--border)' }}
              >
                {(selectedScene.backgroundImageUrl || backgroundPreview) ? (
                  <img
                    src={backgroundPreview || selectedScene.backgroundImageUrl}
                    alt="Background"
                    className="w-full max-h-64 object-contain rounded mb-4"
                  />
                ) : (
                  <div className="py-8 text-gray-500">
                    <p className="text-sm">Drag and drop or click to upload</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleBackgroundUpload(file);
                  }}
                  className="hidden"
                  id="background-input"
                />
                <Button
                  type="button"
                  onClick={() => document.getElementById('background-input')?.click()}
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:text-white"
                >
                  Upload Image
                </Button>
              </div>
            </div>

            {/* Characters */}
            <div className="card-jai p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Characters</h2>
              {characters.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No characters created yet. Go to the Characters tab to add some.
                </p>
              ) : (
                <div className="space-y-3">
                  {characters.map((char) => (
                    <div key={char.id} className="space-y-2">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedScene.characterIds.includes(char.id)}
                          onChange={() => toggleCharacter(char.id)}
                          className="w-5 h-5"
                        />
                        <label className="text-sm text-gray-300 cursor-pointer flex-1">
                          {char.name}
                        </label>
                      </div>
                      {selectedScene.characterIds.includes(char.id) && (
                        <div className="ml-8">
                          <label className="text-xs text-gray-400 block mb-1">Outfit Description</label>
                          <Input
                            value={selectedScene.outfits[char.id] || ''}
                            onChange={(e) =>
                              updateSelectedScene({
                                outfits: { ...selectedScene.outfits, [char.id]: e.target.value },
                              })
                            }
                            placeholder="e.g., wearing a red dress"
                            className="input-jai text-white text-sm"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Win Conditions */}
            <div className="card-jai p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Win Conditions</h2>
                <button onClick={addWinCondition} className="btn-accent text-sm">
                  Add Condition
                </button>
              </div>
              {selectedScene.winConditions.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No win conditions yet. Add one to define goals for this scene.
                </p>
              ) : (
                <div className="space-y-4">
                  {selectedScene.winConditions.map((condition) => (
                    <div
                      key={condition.id}
                      className="p-4 rounded-lg space-y-3 border"
                      style={{ background: 'var(--surface-light)', borderColor: 'var(--border)' }}
                    >
                      <div>
                        <label className="text-sm font-medium text-gray-300 block mb-2">
                          Player Goal (what the player sees)
                        </label>
                        <Input
                          value={condition.description}
                          onChange={(e) =>
                            updateWinCondition(condition.id, 'description', e.target.value)
                          }
                          placeholder="e.g., Find the hidden key"
                          className="input-jai text-white"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-300 block mb-2">
                          Completion Criteria (what the LLM evaluates)
                        </label>
                        <Textarea
                          value={condition.completionCriteria}
                          onChange={(e) =>
                            updateWinCondition(condition.id, 'completionCriteria', e.target.value)
                          }
                          placeholder="e.g., Player must find a key hidden in the librarian's desk"
                          className="input-jai text-white"
                          rows={3}
                        />
                      </div>
                      <Button
                        onClick={() => removeWinCondition(condition.id)}
                        size="sm"
                        variant="outline"
                        className="border-red-700 text-red-400 hover:bg-red-950 w-full"
                      >
                        Remove Condition
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="flex justify-start pb-8">
              <Button
                onClick={() => setDeleteConfirm(selectedScene.id)}
                variant="outline"
                className="border-red-700 text-red-400 hover:bg-red-950"
              >
                Delete Scene
              </Button>
            </div>

            {/* Delete Confirmation */}
            {deleteConfirm === selectedScene.id && (
              <Dialog
                open={deleteConfirm === selectedScene.id}
                onOpenChange={() => setDeleteConfirm(null)}
              >
                <DialogContent style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <DialogHeader>
                    <DialogTitle className="text-white">Delete Scene?</DialogTitle>
                    <DialogDescription className="text-gray-400">
                      This action cannot be undone. Are you sure you want to delete{' '}
                      <span className="font-semibold">{selectedScene.title}</span>?
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex gap-3 justify-end">
                    <Button onClick={() => setDeleteConfirm(null)} variant="outline" className="border-gray-600 text-gray-300">
                      Cancel
                    </Button>
                    <Button onClick={handleDeleteScene} className="bg-red-600 hover:bg-red-700 text-white">
                      Delete
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-400 mb-4">No scenes yet</p>
              <button onClick={() => setShowAddSceneDialog(true)} className="btn-accent">
                Create First Scene
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Scene Dialog */}
      <Dialog open={showAddSceneDialog} onOpenChange={setShowAddSceneDialog}>
        <DialogContent style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="text-white">Add Scene</DialogTitle>
            <DialogDescription className="text-gray-400">
              Create a new scene for your story.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-4">
            <Button onClick={() => setShowAddSceneDialog(false)} variant="outline" className="border-gray-600 text-gray-300">
              Cancel
            </Button>
            <button onClick={handleAddScene} className="btn-accent">
              Create Scene
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
