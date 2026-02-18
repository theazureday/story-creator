'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  getKeyArtItems,
  createKeyArt,
  updateKeyArt,
  deleteKeyArt,
  uploadImage,
} from '@/lib/firestore-utils';
import { generateId, fileToDataUrl } from '@/lib/utils';
import { KeyArt } from '@/lib/types';
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

export default function KeyArtEditor() {
  const params = useParams();
  const { user } = useAuth();
  const storyId = params.storyId as string;

  const [items, setItems] = useState<KeyArt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const selected = items.find((a) => a.id === selectedId);

  const saveCurrentItem = useCallback(async () => {
    if (!selected) return;
    let imageUrl = selected.imageUrl;
    if (imageUrl && imageUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(imageUrl);
      imageUrl = await uploadImage(`stories/${storyId}/keyArt/${selected.id}/image.png`, blob);
    }
    await updateKeyArt(storyId, selected.id, { ...selected, imageUrl });
    setItems((prev) =>
      prev.map((a) => (a.id === selected.id ? { ...a, imageUrl } : a))
    );
  }, [selected, storyId]);

  const { status: saveStatus, triggerSave } = useAutoSave({ onSave: saveCurrentItem });

  useEffect(() => {
    if (!user || !storyId) return;
    const fetchData = async () => {
      try {
        const data = await getKeyArtItems(storyId);
        setItems(data);
        if (data.length > 0) setSelectedId(data[0].id);
      } catch (err) {
        console.error('Failed to fetch key art:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, storyId]);

  const handleAdd = async () => {
    if (!user) return;
    const newItem: KeyArt = {
      id: generateId(),
      storyId,
      name: 'New Key Art',
      description: '',
      imageUrl: '',
      prompt: '',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await createKeyArt(storyId, newItem);
    setItems([...items, newItem]);
    setSelectedId(newItem.id);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteKeyArt(storyId, deleteConfirm);
    const newList = items.filter((a) => a.id !== deleteConfirm);
    setItems(newList);
    if (selectedId === deleteConfirm) setSelectedId(newList[0]?.id || null);
    setDeleteConfirm(null);
  };

  const updateField = (field: keyof KeyArt, value: string | string[]) => {
    if (!selected) return;
    const updated = { ...selected, [field]: value };
    setItems(items.map((a) => (a.id === selected.id ? updated : a)));
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
          action: 'generate_keyart',
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
        <div className="text-purple-400">Loading key art...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r overflow-y-auto flex flex-col" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="p-4 space-y-2 flex-1">
          {items.map((art) => (
            <button
              key={art.id}
              onClick={() => setSelectedId(art.id)}
              className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                selectedId === art.id
                  ? 'text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              style={{
                background: selectedId === art.id ? 'var(--accent)' : 'var(--surface-light)',
              }}
            >
              <div className="text-sm font-medium truncate">{art.name}</div>
              {art.imageUrl && (
                <div className="mt-2 h-20 rounded overflow-hidden">
                  <img src={art.imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={handleAdd} className="btn-accent w-full text-center text-sm">
            Add Key Art
          </button>
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex-1 overflow-y-auto p-8">
        {selected ? (
          <div className="max-w-4xl mx-auto space-y-6">
            {saveStatus !== 'idle' && (
              <div className={`autosave-indicator ${saveStatus} inline-block`}>
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Error saving'}
              </div>
            )}

            <div className="card-jai p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Key Art Details</h2>
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
                  placeholder="Describe this key art piece..."
                />
              </div>
            </div>

            <div className="card-jai p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Image</h2>
                <button onClick={() => setShowGenDialog(true)} className="btn-accent text-sm">
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
                    className="w-full max-h-96 object-contain rounded mb-4"
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
                  id="keyart-upload"
                />
                <div className="flex gap-2 justify-center">
                  <Button
                    type="button"
                    onClick={() => document.getElementById('keyart-upload')?.click()}
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

            <div className="flex justify-start">
              <Button
                onClick={() => setDeleteConfirm(selected.id)}
                variant="outline"
                className="border-red-700 text-red-400 hover:bg-red-950"
              >
                Delete Key Art
              </Button>
            </div>

            {deleteConfirm && (
              <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
                <DialogContent style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <DialogHeader>
                    <DialogTitle className="text-white">Delete Key Art?</DialogTitle>
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
              <p className="text-gray-400 mb-4">No key art yet</p>
              <button onClick={handleAdd} className="btn-accent">
                Add First Key Art
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
        <DialogContent style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="text-white">Generate Key Art with AI</DialogTitle>
            <DialogDescription className="text-gray-400">
              Describe the illustration you want to create.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              placeholder="e.g., An epic battle scene between two rival characters under a stormy sky..."
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
