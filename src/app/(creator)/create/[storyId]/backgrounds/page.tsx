'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  getBackgrounds,
  createBackground,
  updateBackground,
  deleteBackground,
  uploadImage,
} from '@/lib/firestore-utils';
import { generateId, fileToDataUrl } from '@/lib/utils';
import { Background } from '@/lib/types';
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

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] || 'image/png';
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function BackgroundsEditor() {
  const params = useParams();
  const { user } = useAuth();
  const storyId = params.storyId as string;

  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const selected = backgrounds.find((b) => b.id === selectedId);

  const saveCurrentBackground = useCallback(async () => {
    if (!selected) return;
    // Upload data URL images to storage first
    let imageUrl = selected.imageUrl;
    if (imageUrl && imageUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(imageUrl);
      imageUrl = await uploadImage(`stories/${storyId}/backgrounds/${selected.id}/image.png`, blob);
    }
    await updateBackground(storyId, selected.id, { ...selected, imageUrl });
    setBackgrounds((prev) =>
      prev.map((b) => (b.id === selected.id ? { ...b, imageUrl } : b))
    );
  }, [selected, storyId]);

  const { status: saveStatus, triggerSave } = useAutoSave({ onSave: saveCurrentBackground });

  useEffect(() => {
    if (!user || !storyId) return;
    const fetchData = async () => {
      try {
        const data = await getBackgrounds(storyId);
        setBackgrounds(data);
        if (data.length > 0) setSelectedId(data[0].id);
      } catch (err) {
        console.error('Failed to fetch backgrounds:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, storyId]);

  const handleAdd = async () => {
    if (!user) return;
    const newBg: Background = {
      id: generateId(),
      storyId,
      name: 'New Background',
      description: '',
      imageUrl: '',
      prompt: '',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await createBackground(storyId, newBg);
    setBackgrounds([...backgrounds, newBg]);
    setSelectedId(newBg.id);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteBackground(storyId, deleteConfirm);
    const newList = backgrounds.filter((b) => b.id !== deleteConfirm);
    setBackgrounds(newList);
    if (selectedId === deleteConfirm) setSelectedId(newList[0]?.id || null);
    setDeleteConfirm(null);
  };

  const updateField = (field: keyof Background, value: string | string[]) => {
    if (!selected) return;
    const updated = { ...selected, [field]: value };
    setBackgrounds(backgrounds.map((b) => (b.id === selected.id ? updated : b)));
    triggerSave();
  };

  const handleImageUpload = async (file: File) => {
    if (!selected) return;
    const dataUrl = await fileToDataUrl(file);
    updateField('imageUrl', dataUrl);
  };

  const handleGenerate = async () => {
    if (!genPrompt.trim() || !selected) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_background',
          prompt: genPrompt,
        }),
      });
      const data = await res.json();
      if (data.imageUrl) {
        updateField('imageUrl', data.imageUrl);
        updateField('prompt', genPrompt);
        setShowGenDialog(false);
        setGenPrompt('');
      } else {
        alert(data.error || 'Generation failed');
      }
    } catch (err) {
      console.error('Generation failed:', err);
      alert('Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="text-purple-400">Loading backgrounds...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r overflow-y-auto flex flex-col" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="p-4 space-y-2 flex-1">
          {backgrounds.map((bg) => (
            <button
              key={bg.id}
              onClick={() => setSelectedId(bg.id)}
              className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                selectedId === bg.id
                  ? 'text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              style={{
                background: selectedId === bg.id ? 'var(--accent)' : 'var(--surface-light)',
              }}
            >
              <div className="text-sm font-medium truncate">{bg.name}</div>
              {bg.imageUrl && (
                <div className="mt-2 h-16 rounded overflow-hidden">
                  <img src={bg.imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={handleAdd} className="btn-accent w-full text-center text-sm">
            Add Background
          </button>
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex-1 overflow-y-auto p-8">
        {selected ? (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Save status */}
            {saveStatus !== 'idle' && (
              <div className={`autosave-indicator ${saveStatus} inline-block`}>
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Error saving'}
              </div>
            )}

            {/* Name */}
            <div className="card-jai p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Background Details</h2>
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-2">Name</label>
                <Input
                  value={selected.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="input-jai text-white"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-2">Description</label>
                <Textarea
                  value={selected.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  className="input-jai text-white"
                  rows={3}
                  placeholder="Describe this background..."
                />
              </div>
            </div>

            {/* Image */}
            <div className="card-jai p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Image</h2>
                <button
                  onClick={() => setShowGenDialog(true)}
                  className="btn-accent text-sm"
                >
                  Generate with AI
                </button>
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file?.type.startsWith('image/')) handleImageUpload(file);
                }}
                className="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
                style={{ borderColor: 'var(--border)' }}
              >
                {selected.imageUrl ? (
                  <img
                    src={selected.imageUrl}
                    alt={selected.name}
                    className="w-full max-h-80 object-contain rounded mb-4"
                  />
                ) : (
                  <div className="py-12 text-gray-500">
                    <p>Drag & drop an image or click Upload</p>
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
                  id="bg-upload"
                />
                <div className="flex gap-2 justify-center">
                  <Button
                    type="button"
                    onClick={() => document.getElementById('bg-upload')?.click()}
                    variant="outline"
                    className="border-gray-600 text-gray-300 hover:text-white"
                  >
                    Upload Image
                  </Button>
                  {selected.imageUrl && (
                    <Button
                      type="button"
                      onClick={() => updateField('imageUrl', '')}
                      variant="outline"
                      className="border-red-700 text-red-400 hover:bg-red-950"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Delete */}
            <div className="flex justify-start">
              <Button
                onClick={() => setDeleteConfirm(selected.id)}
                variant="outline"
                className="border-red-700 text-red-400 hover:bg-red-950"
              >
                Delete Background
              </Button>
            </div>

            {/* Delete Confirmation */}
            {deleteConfirm && (
              <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
                <DialogContent style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <DialogHeader>
                    <DialogTitle className="text-white">Delete Background?</DialogTitle>
                    <DialogDescription className="text-gray-400">
                      This cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex gap-3 justify-end">
                    <Button onClick={() => setDeleteConfirm(null)} variant="outline" className="border-gray-600 text-gray-300">
                      Cancel
                    </Button>
                    <Button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
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
              <p className="text-gray-400 mb-4">No backgrounds yet</p>
              <button onClick={handleAdd} className="btn-accent">
                Add First Background
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Generation Dialog */}
      <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
        <DialogContent style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="text-white">Generate Background with AI</DialogTitle>
            <DialogDescription className="text-gray-400">
              Describe the background scene you want to create.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              placeholder="e.g., A moonlit Japanese garden with cherry blossoms and a stone path..."
              className="input-jai text-white"
              rows={4}
            />
            <div className="flex gap-3 justify-end">
              <Button onClick={() => setShowGenDialog(false)} variant="outline" className="border-gray-600 text-gray-300">
                Cancel
              </Button>
              <button
                onClick={handleGenerate}
                disabled={generating || !genPrompt.trim()}
                className="btn-accent disabled:opacity-50"
              >
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
