'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  getCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  uploadImage,
} from '@/lib/firestore-utils';
import { fileToDataUrl, generateId } from '@/lib/utils';
import { Character } from '@/lib/types';
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
import { Card } from '@/components/ui/card';

const EXPRESSIONS = [
  'default',
  'happy',
  'sad',
  'angry',
  'surprised',
  'thinking',
  'embarrassed',
];

export default function CharacterBuilder() {
  const params = useParams();
  const { user } = useAuth();
  const storyId = params.storyId as string;

  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddCharDialog, setShowAddCharDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});

  const selectedChar = characters.find((c) => c.id === selectedCharId);

  // Fetch characters
  useEffect(() => {
    if (!user || !storyId) return;

    const fetchCharacters = async () => {
      try {
        const chars = await getCharacters(storyId);
        setCharacters(chars);
        if (chars.length > 0) {
          setSelectedCharId(chars[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch characters:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCharacters();
  }, [user, storyId]);

  const handleAddCharacter = async () => {
    if (!user) return;

    const newChar: Character = {
      id: generateId(),
      storyId,
      name: 'New Character',
      displayName: 'New Character',
      description: '',
      color: '#a855f7',
      baseImageUrl: '',
      expressions: {
        default: '',
        happy: '',
        sad: '',
        angry: '',
        surprised: '',
        thinking: '',
        embarrassed: '',
      },
      profilePicUrl: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await createCharacter(storyId, newChar);
      setCharacters([...characters, newChar]);
      setSelectedCharId(newChar.id);
      setShowAddCharDialog(false);
    } catch (error) {
      console.error('Failed to add character:', error);
    }
  };

  const handleUpdateCharacter = async () => {
    if (!selectedChar || !user) return;

    setIsSaving(true);
    try {
      await updateCharacter(storyId, selectedChar.id, selectedChar);
      setCharacters(
        characters.map((c) => (c.id === selectedChar.id ? selectedChar : c))
      );
    } catch (error) {
      console.error('Failed to update character:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCharacter = async () => {
    if (!deleteConfirm || !user) return;

    try {
      await deleteCharacter(storyId, deleteConfirm);
      setCharacters(characters.filter((c) => c.id !== deleteConfirm));
      if (selectedCharId === deleteConfirm) {
        setSelectedCharId(characters[0]?.id || null);
      }
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete character:', error);
    }
  };

  const handleImageUpload = async (
    file: File,
    expression: string | null = null
  ) => {
    if (!selectedChar) return;

    try {
      const previewUrl = await fileToDataUrl(file);
      const filename =
        expression === null ? 'base.png' : `${expression}.png`;
      const storagePath = `stories/${storyId}/characters/${selectedChar.id}/${filename}`;

      // Show preview immediately
      if (expression === null) {
        setImagePreviews({
          ...imagePreviews,
          base: previewUrl,
        });
      } else {
        setImagePreviews({
          ...imagePreviews,
          [expression]: previewUrl,
        });
      }

      // Upload and get URL
      const downloadUrl = await uploadImage(storagePath, file);

      // Update character
      const updatedChar = { ...selectedChar };
      if (expression === null) {
        updatedChar.baseImageUrl = downloadUrl;
      } else {
        updatedChar.expressions[expression as keyof typeof updatedChar.expressions] = downloadUrl;
      }

      setCharacters(
        characters.map((c) => (c.id === selectedChar.id ? updatedChar : c))
      );
    } catch (error) {
      console.error('Failed to upload image:', error);
    }
  };

  const handleBaseImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file);
    }
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
          <h1 className="text-2xl font-bold text-white">Character Builder</h1>
          <p className="text-gray-400 text-sm">Create and manage story characters</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Character List */}
        <div className="w-64 border-r border-gray-800 bg-gray-900 overflow-y-auto flex flex-col">
          <div className="p-4 space-y-2 flex-1">
            {characters.map((char) => (
              <button
                key={char.id}
                onClick={() => setSelectedCharId(char.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  selectedCharId === char.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {char.baseImageUrl ? (
                  <img
                    src={char.baseImageUrl}
                    alt={char.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xs">
                    {char.name.charAt(0)}
                  </div>
                )}
                <span className="text-sm font-medium truncate">{char.name}</span>
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-gray-800">
            <Dialog open={showAddCharDialog} onOpenChange={setShowAddCharDialog}>
              <Button
                onClick={() => setShowAddCharDialog(true)}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                Add Character
              </Button>
              <DialogContent className="bg-gray-900 border-gray-800">
                <DialogHeader>
                  <DialogTitle className="text-white">Add Character</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Create a new character for your story.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-3 justify-end pt-4">
                  <Button
                    type="button"
                    onClick={() => setShowAddCharDialog(false)}
                    variant="outline"
                    className="border-gray-700 text-gray-300 hover:bg-gray-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAddCharacter}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    Create Character
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Main Area - Character Details */}
        <div className="flex-1 overflow-y-auto bg-gray-950">
          {selectedChar ? (
            <div className="max-w-4xl mx-auto p-8 space-y-8">
              {/* Basic Info */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Basic Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">
                      Character Name
                    </label>
                    <Input
                      value={selectedChar.name}
                      onChange={(e) =>
                        setCharacters(
                          characters.map((c) =>
                            c.id === selectedChar.id
                              ? { ...c, name: e.target.value }
                              : c
                          )
                        )
                      }
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">
                      Display Name
                    </label>
                    <Input
                      value={selectedChar.displayName}
                      onChange={(e) =>
                        setCharacters(
                          characters.map((c) =>
                            c.id === selectedChar.id
                              ? { ...c, displayName: e.target.value }
                              : c
                          )
                        )
                      }
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">
                    Dialogue Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={selectedChar.color}
                      onChange={(e) =>
                        setCharacters(
                          characters.map((c) =>
                            c.id === selectedChar.id
                              ? { ...c, color: e.target.value }
                              : c
                          )
                        )
                      }
                      className="w-12 h-12 rounded cursor-pointer"
                    />
                    <span className="text-gray-400">{selectedChar.color}</span>
                  </div>
                </div>
              </Card>

              {/* Description */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">
                  Description & Personality
                </h2>
                <Textarea
                  value={selectedChar.description}
                  onChange={(e) =>
                    setCharacters(
                      characters.map((c) =>
                        c.id === selectedChar.id
                          ? { ...c, description: e.target.value }
                          : c
                      )
                    )
                  }
                  placeholder="Describe the character's personality, background, and traits. This helps the AI generate appropriate dialogue."
                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                  rows={6}
                />
              </Card>

              {/* Base Image */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Base Image</h2>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleBaseImageDrop}
                  className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center hover:border-violet-500 transition-colors"
                >
                  {selectedChar.baseImageUrl || imagePreviews.base ? (
                    <img
                      src={imagePreviews.base || selectedChar.baseImageUrl}
                      alt="Base"
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
                      if (file) handleImageUpload(file);
                    }}
                    className="hidden"
                    id="base-image-input"
                  />
                  <label htmlFor="base-image-input">
                    <Button
                      type="button"
                      onClick={() =>
                        document.getElementById('base-image-input')?.click()
                      }
                      variant="outline"
                      className="border-gray-700 text-gray-300 hover:bg-gray-800 cursor-pointer"
                    >
                      Upload Image
                    </Button>
                  </label>
                </div>
              </Card>

              {/* Expressions */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Expressions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {EXPRESSIONS.map((expression) => (
                    <div
                      key={expression}
                      className="space-y-2"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file && file.type.startsWith('image/')) {
                          handleImageUpload(file, expression);
                        }
                      }}
                    >
                      <label className="text-sm font-medium text-gray-300 capitalize block">
                        {expression}
                      </label>
                      <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center hover:border-violet-500 transition-colors aspect-square flex items-center justify-center">
                        {selectedChar.expressions[
                          expression as keyof typeof selectedChar.expressions
                        ] || imagePreviews[expression] ? (
                          <img
                            src={
                              imagePreviews[expression] ||
                              selectedChar.expressions[
                                expression as keyof typeof selectedChar.expressions
                              ]
                            }
                            alt={expression}
                            className="w-full h-full object-cover rounded"
                          />
                        ) : (
                          <span className="text-xs text-gray-500">{expression}</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, expression);
                        }}
                        className="hidden"
                        id={`expression-${expression}`}
                      />
                      <label htmlFor={`expression-${expression}`}>
                        <Button
                          type="button"
                          onClick={() =>
                            document.getElementById(`expression-${expression}`)?.click()
                          }
                          size="sm"
                          variant="outline"
                          className="w-full border-gray-700 text-gray-300 hover:bg-gray-800 cursor-pointer"
                        >
                          Upload
                        </Button>
                      </label>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Actions */}
              <div className="flex gap-3 justify-between">
                <Button
                  onClick={() => setDeleteConfirm(selectedChar.id)}
                  variant="outline"
                  className="border-red-600 text-red-500 hover:bg-red-950"
                >
                  Delete Character
                </Button>
                <Button
                  onClick={handleUpdateCharacter}
                  disabled={isSaving}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {isSaving ? 'Saving...' : 'Save Character'}
                </Button>
              </div>

              {/* Delete Confirmation Dialog */}
              {deleteConfirm === selectedChar.id && (
                <Dialog open={deleteConfirm === selectedChar.id} onOpenChange={() => setDeleteConfirm(null)}>
                  <DialogContent className="bg-gray-900 border-gray-800">
                    <DialogHeader>
                      <DialogTitle className="text-white">Delete Character?</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        This action cannot be undone. Are you sure you want to delete{' '}
                        <span className="font-semibold">{selectedChar.name}</span>?
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
                        onClick={handleDeleteCharacter}
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
                <p className="text-gray-400 mb-4">No characters yet</p>
                <Dialog open={showAddCharDialog} onOpenChange={setShowAddCharDialog}>
                  <Button
                    onClick={() => setShowAddCharDialog(true)}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    Create First Character
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
