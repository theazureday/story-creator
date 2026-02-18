'use client';

import { useEffect, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
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
  const [isSaving, setIsSaving] = useState(false);
  const [showAddSceneDialog, setShowAddSceneDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string>('');

  const selectedScene = scenes.find((s) => s.id === selectedSceneId);

  // Fetch scenes and characters
  useEffect(() => {
    if (!user || !storyId) return;

    const fetchData = async () => {
      try {
        const scenesData = await getScenes(storyId);
        const charsData = await getCharacters(storyId);
        setScenes(scenesData.sort((a, b) => a.orderIndex - b.orderIndex));
        setCharacters(charsData);
        if (scenesData.length > 0) {
          setSelectedSceneId(scenesData[0].id);
        }
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await createScene(storyId, newScene);
      const newScenes = [...scenes, newScene].sort(
        (a, b) => a.orderIndex - b.orderIndex
      );
      setScenes(newScenes);
      setSelectedSceneId(newScene.id);
      setShowAddSceneDialog(false);
    } catch (error) {
      console.error('Failed to add scene:', error);
    }
  };

  const handleUpdateScene = async () => {
    if (!selectedScene || !user) return;

    setIsSaving(true);
    try {
      await updateScene(storyId, selectedScene.id, selectedScene);
      setScenes(
        scenes.map((s) => (s.id === selectedScene.id ? selectedScene : s))
      );
    } catch (error) {
      console.error('Failed to update scene:', error);
    } finally {
      setIsSaving(false);
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
      if (selectedSceneId === deleteConfirm) {
        setSelectedSceneId(newScenes[0]?.id || null);
      }
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete scene:', error);
    }
  };

  const handleBackgroundUpload = async (file: File) => {
    if (!selectedScene) return;

    try {
      const previewUrl = await fileToDataUrl(file);
      const storagePath = `stories/${storyId}/scenes/${selectedScene.id}/background.png`;

      setBackgroundPreview(previewUrl);

      const downloadUrl = await uploadImage(storagePath, file);

      const updatedScene = { ...selectedScene, backgroundImageUrl: downloadUrl };
      setScenes(
        scenes.map((s) => (s.id === selectedScene.id ? updatedScene : s))
      );
    } catch (error) {
      console.error('Failed to upload background:', error);
    }
  };

  const handleBackgroundDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleBackgroundUpload(file);
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

    const updatedScene = {
      ...selectedScene,
      characterIds: updatedCharacters,
      outfits: updatedOutfits,
    };

    setScenes(
      scenes.map((s) => (s.id === selectedScene.id ? updatedScene : s))
    );
  };

  const addWinCondition = () => {
    if (!selectedScene) return;

    const newCondition: WinCondition = {
      id: generateId(),
      description: '',
      completionCriteria: '',
    };

    const updatedScene = {
      ...selectedScene,
      winConditions: [...selectedScene.winConditions, newCondition],
    };

    setScenes(
      scenes.map((s) => (s.id === selectedScene.id ? updatedScene : s))
    );
  };

  const removeWinCondition = (conditionId: string) => {
    if (!selectedScene) return;

    const updatedScene = {
      ...selectedScene,
      winConditions: selectedScene.winConditions.filter(
        (c) => c.id !== conditionId
      ),
    };

    setScenes(
      scenes.map((s) => (s.id === selectedScene.id ? updatedScene : s))
    );
  };

  const updateWinCondition = (
    conditionId: string,
    field: 'description' | 'completionCriteria',
    value: string
  ) => {
    if (!selectedScene) return;

    const updatedScene = {
      ...selectedScene,
      winConditions: selectedScene.winConditions.map((c) =>
        c.id === conditionId ? { ...c, [field]: value } : c
      ),
    };

    setScenes(
      scenes.map((s) => (s.id === selectedScene.id ? updatedScene : s))
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-violet-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white">Scene Builder</h1>
          <p className="text-gray-400 text-sm">Create and manage story scenes</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Scene List */}
        <div className="w-64 border-r border-gray-800 bg-gray-900 overflow-y-auto flex flex-col">
          <div className="p-4 space-y-2 flex-1">
            {scenes.map((scene, idx) => (
              <button
                key={scene.id}
                onClick={() => setSelectedSceneId(scene.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left ${
                  selectedSceneId === scene.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <span className="text-xs font-bold flex-shrink-0 mt-1">
                  {idx + 1}
                </span>
                <span className="text-sm font-medium truncate">{scene.title}</span>
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-gray-800">
            <Dialog open={showAddSceneDialog} onOpenChange={setShowAddSceneDialog}>
              <Button
                onClick={() => setShowAddSceneDialog(true)}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                Add Scene
              </Button>
              <DialogContent className="bg-gray-900 border-gray-800">
                <DialogHeader>
                  <DialogTitle className="text-white">Add Scene</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Create a new scene for your story.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-3 justify-end pt-4">
                  <Button
                    type="button"
                    onClick={() => setShowAddSceneDialog(false)}
                    variant="outline"
                    className="border-gray-700 text-gray-300 hover:bg-gray-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAddScene}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    Create Scene
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Main Area - Scene Details */}
        <div className="flex-1 overflow-y-auto bg-gray-950">
          {selectedScene ? (
            <div className="max-w-4xl mx-auto p-8 space-y-8">
              {/* Basic Info */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Scene Details</h2>
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">
                    Scene Title
                  </label>
                  <Input
                    value={selectedScene.title}
                    onChange={(e) =>
                      setScenes(
                        scenes.map((s) =>
                          s.id === selectedScene.id
                            ? { ...s, title: e.target.value }
                            : s
                        )
                      )
                    }
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </Card>

              {/* Prompt */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Scene Prompt</h2>
                <Textarea
                  value={selectedScene.prompt}
                  onChange={(e) =>
                    setScenes(
                      scenes.map((s) =>
                        s.id === selectedScene.id
                          ? { ...s, prompt: e.target.value }
                          : s
                      )
                    )
                  }
                  placeholder="Describe the scenario, setting, and mood for this scene..."
                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                  rows={6}
                />
              </Card>

              {/* Background Image */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Background Image</h2>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleBackgroundDrop}
                  className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center hover:border-violet-500 transition-colors"
                >
                  {selectedScene.backgroundImageUrl || backgroundPreview ? (
                    <img
                      src={backgroundPreview || selectedScene.backgroundImageUrl}
                      alt="Background"
                      className="w-full max-h-64 object-contain rounded mb-4"
                    />
                  ) : (
                    <div className="text-gray-400 mb-4">
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
                  <label htmlFor="background-input">
                    <Button
                      type="button"
                      onClick={() =>
                        document.getElementById('background-input')?.click()
                      }
                      variant="outline"
                      className="border-gray-700 text-gray-300 hover:bg-gray-800 cursor-pointer"
                    >
                      Upload Image
                    </Button>
                  </label>
                </div>
              </Card>

              {/* Characters */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Characters</h2>
                <div className="space-y-4">
                  {characters.length === 0 ? (
                    <p className="text-gray-400 text-sm">
                      No characters created yet. Go to the character builder to add characters.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {characters.map((char) => (
                          <div key={char.id} className="space-y-2">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={selectedScene.characterIds.includes(
                                  char.id
                                )}
                                onChange={() => toggleCharacter(char.id)}
                                className="w-5 h-5"
                              />
                              <label className="text-sm text-gray-300 cursor-pointer flex-1">
                                {char.name}
                              </label>
                            </div>
                            {selectedScene.characterIds.includes(char.id) && (
                              <div className="ml-8">
                                <label className="text-xs text-gray-400 block mb-1">
                                  Outfit Description
                                </label>
                                <Input
                                  value={selectedScene.outfits[char.id] || ''}
                                  onChange={(e) =>
                                    setScenes(
                                      scenes.map((s) =>
                                        s.id === selectedScene.id
                                          ? {
                                              ...s,
                                              outfits: {
                                                ...s.outfits,
                                                [char.id]: e.target.value,
                                              },
                                            }
                                          : s
                                      )
                                    )
                                  }
                                  placeholder="e.g., wearing a red dress"
                                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 text-sm"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Card>

              {/* Win Conditions */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Win Conditions</h2>
                  <Button
                    onClick={addWinCondition}
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    Add Condition
                  </Button>
                </div>

                {selectedScene.winConditions.length === 0 ? (
                  <p className="text-gray-400 text-sm">
                    No win conditions yet. Add one to define goals for this scene.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {selectedScene.winConditions.map((condition) => (
                      <div
                        key={condition.id}
                        className="bg-gray-800 p-4 rounded-lg space-y-3 border border-gray-700"
                      >
                        <div>
                          <label className="text-sm font-medium text-gray-300 block mb-2">
                            Player Goal (what the player sees)
                          </label>
                          <Input
                            value={condition.description}
                            onChange={(e) =>
                              updateWinCondition(
                                condition.id,
                                'description',
                                e.target.value
                              )
                            }
                            placeholder="e.g., Find the hidden key"
                            className="bg-gray-700 border-gray-600 text-white placeholder-gray-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-300 block mb-2">
                            Completion Criteria (what the LLM evaluates)
                          </label>
                          <Textarea
                            value={condition.completionCriteria}
                            onChange={(e) =>
                              updateWinCondition(
                                condition.id,
                                'completionCriteria',
                                e.target.value
                              )
                            }
                            placeholder="e.g., Player must find a key hidden in the librarian's desk"
                            className="bg-gray-700 border-gray-600 text-white placeholder-gray-500"
                            rows={3}
                          />
                        </div>
                        <Button
                          onClick={() => removeWinCondition(condition.id)}
                          size="sm"
                          variant="outline"
                          className="border-red-600 text-red-500 hover:bg-red-950 w-full"
                        >
                          Remove Condition
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Actions */}
              <div className="flex gap-3 justify-between pb-8">
                <Button
                  onClick={() => setDeleteConfirm(selectedScene.id)}
                  variant="outline"
                  className="border-red-600 text-red-500 hover:bg-red-950"
                >
                  Delete Scene
                </Button>
                <Button
                  onClick={handleUpdateScene}
                  disabled={isSaving}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {isSaving ? 'Saving...' : 'Save Scene'}
                </Button>
              </div>

              {/* Delete Confirmation Dialog */}
              {deleteConfirm === selectedScene.id && (
                <Dialog
                  open={deleteConfirm === selectedScene.id}
                  onOpenChange={() => setDeleteConfirm(null)}
                >
                  <DialogContent className="bg-gray-900 border-gray-800">
                    <DialogHeader>
                      <DialogTitle className="text-white">Delete Scene?</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        This action cannot be undone. Are you sure you want to delete{' '}
                        <span className="font-semibold">{selectedScene.title}</span>?
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-3 justify-end">
                      <Button
                        onClick={() => setDeleteConfirm(null)}
                        variant="outline"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleDeleteScene}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
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
                <Dialog open={showAddSceneDialog} onOpenChange={setShowAddSceneDialog}>
                  <Button
                    onClick={() => setShowAddSceneDialog(true)}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    Create First Scene
                  </Button>
                </Dialog>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
