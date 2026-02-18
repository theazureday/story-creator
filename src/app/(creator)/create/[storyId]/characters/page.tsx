'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  getCharacters,
  createCharacter,
  updateCharacter as updateCharacterFB,
  deleteCharacter as deleteCharacterFB,
  uploadImage,
} from '@/lib/firestore-utils';
import { generateId } from '@/lib/utils';
import { Character, ExpressionKey } from '@/lib/types';
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

const EXPRESSIONS: ExpressionKey[] = [
  'default',
  'happy',
  'sad',
  'angry',
  'surprised',
  'thinking',
  'embarrassed',
];

// ============================================================
// Utility Functions (ported from Victoria Academy)
// ============================================================

function handleImagePaste(
  e: React.ClipboardEvent,
  setImage: (dataUrl: string | null) => void
) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
      return;
    }
  }
}

function cropFaceFromPortrait(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const cropHeight = img.height * 0.32;
      const cropWidth = Math.min(img.width, cropHeight * 1.1);
      const sx = Math.max(0, (img.width - cropWidth) / 2);
      const sy = 0;
      const sw = Math.min(cropWidth, img.width);
      const sh = Math.min(cropHeight, img.height);
      const outputSize = 256;
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputSize, outputSize);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = dataUrl;
  });
}

function compressImage(dataUrl: string, maxWidth = 768, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function removeBackground(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;

      const sampleEdge = (positions: number[]) => {
        const rs: number[] = [], gs: number[] = [], bs: number[] = [];
        for (const px of positions) {
          const i = px * 4;
          rs.push(d[i]); gs.push(d[i+1]); bs.push(d[i+2]);
        }
        rs.sort((a,b) => a-b); gs.sort((a,b) => a-b); bs.sort((a,b) => a-b);
        const m = Math.floor(rs.length / 2);
        return { r: rs[m], g: gs[m], b: bs[m] };
      };

      const topPx: number[] = [], botPx: number[] = [], leftPx: number[] = [], rightPx: number[] = [];
      for (let x = 0; x < w; x += 2) { topPx.push(x); botPx.push((h-1)*w + x); }
      for (let y = 0; y < h; y += 2) { leftPx.push(y*w); rightPx.push(y*w + w-1); }
      const edgeSamples = [sampleEdge(topPx), sampleEdge(botPx), sampleEdge(leftPx), sampleEdge(rightPx)];

      const bgIsAchromatic = edgeSamples.every(s => {
        const sat = Math.max(s.r, s.g, s.b) - Math.min(s.r, s.g, s.b);
        return sat < 35;
      });
      const bgIsGreen = edgeSamples.some(s => s.g > 150 && s.r < 120 && s.b < 120);
      const avgBgBrightness = edgeSamples.reduce((sum, s) => sum + (s.r + s.g + s.b) / 3, 0) / edgeSamples.length;
      const threshold = bgIsGreen ? 80 : bgIsAchromatic ? (avgBgBrightness < 50 ? 70 : 110) : 70;
      const feather = 15;

      function minEdgeDist(idx: number): number {
        let minD = Infinity;
        for (const bg of edgeSamples) {
          const dr = d[idx] - bg.r, dg = d[idx+1] - bg.g, db = d[idx+2] - bg.b;
          const dd = Math.sqrt(dr*dr + dg*dg + db*db);
          if (dd < minD) minD = dd;
        }
        return minD;
      }

      function isLowSaturation(idx: number): boolean {
        const maxCh = Math.max(d[idx], d[idx+1], d[idx+2]);
        const minCh = Math.min(d[idx], d[idx+1], d[idx+2]);
        if (maxCh <= 10) return true;
        const absSat = maxCh - minCh;
        const relSat = absSat / maxCh;
        return absSat < 30 && relSat < 0.18;
      }

      const visited = new Uint8Array(w * h);
      const rawBg = new Uint8Array(w * h);
      const queue: number[] = [];
      for (let x = 0; x < w; x++) { queue.push(x); queue.push((h-1)*w + x); }
      for (let y = 1; y < h-1; y++) { queue.push(y*w); queue.push(y*w + w-1); }

      while (queue.length > 0) {
        const px = queue.pop()!;
        if (visited[px]) continue;
        visited[px] = 1;
        const pxIdx = px * 4;
        const dd = minEdgeDist(pxIdx);
        let accept = dd < threshold + feather;
        if (accept && bgIsAchromatic) {
          accept = isLowSaturation(pxIdx);
        }
        if (accept) {
          rawBg[px] = 1;
          const x = px % w, y = Math.floor(px / w);
          if (x > 0 && !visited[px-1]) queue.push(px-1);
          if (x < w-1 && !visited[px+1]) queue.push(px+1);
          if (y > 0 && !visited[px-w]) queue.push(px-w);
          if (y < h-1 && !visited[px+w]) queue.push(px+w);
        }
      }

      const borderConnected = new Uint8Array(w * h);
      const borderQueue: number[] = [];
      for (let x = 0; x < w; x++) {
        if (rawBg[x]) borderQueue.push(x);
        if (rawBg[(h-1)*w + x]) borderQueue.push((h-1)*w + x);
      }
      for (let y = 1; y < h-1; y++) {
        if (rawBg[y*w]) borderQueue.push(y*w);
        if (rawBg[y*w + w-1]) borderQueue.push(y*w + w-1);
      }
      const borderVisited = new Uint8Array(w * h);
      while (borderQueue.length > 0) {
        const px = borderQueue.pop()!;
        if (borderVisited[px]) continue;
        borderVisited[px] = 1;
        if (!rawBg[px]) continue;
        borderConnected[px] = 1;
        const bx = px % w, by = Math.floor(px / w);
        if (bx > 0 && !borderVisited[px-1]) borderQueue.push(px-1);
        if (bx < w-1 && !borderVisited[px+1]) borderQueue.push(px+1);
        if (by > 0 && !borderVisited[px-w]) borderQueue.push(px-w);
        if (by < h-1 && !borderVisited[px+w]) borderQueue.push(px+w);
      }

      const isBackground = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const px = y * w + x;
          if (!borderConnected[px]) continue;
          let bgCount = 0, total = 0;
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const ny = y + dy, nx = x + dx;
              if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                total++;
                if (borderConnected[ny * w + nx]) bgCount++;
              }
            }
          }
          if (bgCount >= total * 0.65) isBackground[px] = 1;
        }
      }

      let removedCount = 0;
      for (let i = 0; i < w * h; i++) {
        if (isBackground[i]) {
          removedCount++;
          const di = i * 4;
          const dd = minEdgeDist(di);
          if (dd < threshold) {
            d[di + 3] = 0;
          } else {
            const alpha = Math.round(((dd - threshold) / feather) * 255);
            d[di + 3] = Math.min(d[di + 3], Math.max(0, Math.min(255, alpha)));
          }
        }
      }

      const pct = removedCount / (w * h);
      if (pct < 0.05 || pct > 0.92) {
        resolve(dataUrl);
        return;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function getExpressivenessLabel(value: number): string {
  if (value <= 15) return 'Very Muted';
  if (value <= 35) return 'Subtle';
  if (value <= 55) return 'Moderate';
  if (value <= 75) return 'Expressive';
  return 'Very Expressive';
}

/** Convert a data URL to a Blob for Firebase Storage upload */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*);/)?.[1] || 'image/png';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ============================================================
// Main Component
// ============================================================

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

  // AI Character Generator modal state
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCharName, setAiCharName] = useState('');
  const [aiRefImage, setAiRefImage] = useState<string | null>(null);
  const [generatingChar, setGeneratingChar] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);

  // In-editor AI generation state
  const [editorAiPrompt, setEditorAiPrompt] = useState('');
  const [generatingBaseImage, setGeneratingBaseImage] = useState(false);
  const [editorRefImage, setEditorRefImage] = useState<string | null>(null);

  // Expression generation state
  const [generatingExpr, setGeneratingExpr] = useState<string | null>(null);
  const [generatingAllExprs, setGeneratingAllExprs] = useState(false);
  const [exprProgress, setExprProgress] = useState('');

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxLabel, setLightboxLabel] = useState('');

  const selectedChar = characters.find((c) => c.id === selectedCharId) || null;

  // Helper: update a character in local state
  const patchChar = useCallback((charId: string, patch: Partial<Character>) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === charId ? { ...c, ...patch } : c))
    );
  }, []);

  // Helper: update the selected character
  const updateSelected = useCallback(
    (patch: Partial<Character>) => {
      if (!selectedCharId) return;
      patchChar(selectedCharId, patch);
    },
    [selectedCharId, patchChar]
  );

  // ============================================================
  // Fetch characters
  // ============================================================
  useEffect(() => {
    if (!user || !storyId) return;
    const fetchCharacters = async () => {
      try {
        const chars = await getCharacters(storyId);
        setCharacters(chars);
        if (chars.length > 0) setSelectedCharId(chars[0].id);
      } catch (error) {
        console.error('Failed to fetch characters:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCharacters();
  }, [user, storyId]);

  // ============================================================
  // CRUD Operations
  // ============================================================

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
      expressions: {},
      profilePicUrl: '',
      voiceEnabled: false,
      expressiveness: 50,
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

  const handleSaveCharacter = async () => {
    if (!selectedChar || !user) return;
    setIsSaving(true);
    try {
      // Upload any data URL images to Firebase Storage before saving
      const charToSave = { ...selectedChar };

      // Upload base image if it's a data URL
      if (charToSave.baseImageUrl?.startsWith('data:')) {
        const path = `stories/${storyId}/characters/${charToSave.id}/base.png`;
        const url = await uploadImage(path, dataUrlToBlob(charToSave.baseImageUrl));
        charToSave.baseImageUrl = url;
      }

      // Upload profile pic if it's a data URL
      if (charToSave.profilePicUrl?.startsWith('data:')) {
        const path = `stories/${storyId}/characters/${charToSave.id}/profile.png`;
        const url = await uploadImage(path, dataUrlToBlob(charToSave.profilePicUrl));
        charToSave.profilePicUrl = url;
      }

      // Upload expression images that are data URLs
      const newExpressions = { ...charToSave.expressions };
      for (const [expr, imgUrl] of Object.entries(newExpressions)) {
        if (imgUrl && imgUrl.startsWith('data:')) {
          const path = `stories/${storyId}/characters/${charToSave.id}/${expr}.png`;
          const url = await uploadImage(path, dataUrlToBlob(imgUrl));
          newExpressions[expr as ExpressionKey] = url;
        }
      }
      charToSave.expressions = newExpressions;

      await updateCharacterFB(storyId, charToSave.id, charToSave);
      setCharacters(
        characters.map((c) => (c.id === charToSave.id ? charToSave : c))
      );
    } catch (error) {
      console.error('Failed to save character:', error);
      alert('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCharacter = async () => {
    if (!deleteConfirm || !user) return;
    try {
      await deleteCharacterFB(storyId, deleteConfirm);
      const remaining = characters.filter((c) => c.id !== deleteConfirm);
      setCharacters(remaining);
      if (selectedCharId === deleteConfirm) {
        setSelectedCharId(remaining[0]?.id || null);
      }
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete character:', error);
    }
  };

  // ============================================================
  // Manual Image Upload
  // ============================================================

  const handleManualImageUpload = async (file: File, target: 'base' | ExpressionKey) => {
    if (!selectedChar) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      if (target === 'base') {
        const faceCrop = await cropFaceFromPortrait(dataUrl).catch(() => dataUrl);
        updateSelected({
          baseImageUrl: dataUrl,
          profilePicUrl: faceCrop,
          expressions: { ...selectedChar.expressions, default: dataUrl },
        });
      } else {
        updateSelected({
          expressions: { ...selectedChar.expressions, [target]: dataUrl },
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // ============================================================
  // AI Character Generator Modal
  // ============================================================

  const generateCharacterImage = async () => {
    if (!aiPrompt.trim()) return;
    setGeneratingChar(true);
    setAiPreview(null);
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_character',
          prompt: aiPrompt,
          characterName: aiCharName || 'Character',
          referenceImageUrl: aiRefImage,
        }),
      });
      if (!res.ok) {
        alert(`Character generation failed (HTTP ${res.status}). Try again.`);
        return;
      }
      let data;
      try { data = await res.json(); } catch {
        alert('Character generation failed — invalid response. Try again.');
        return;
      }
      if (data.imageUrl) {
        const cleanedUrl = await removeBackground(data.imageUrl);
        setAiPreview(cleanedUrl);
      } else {
        alert(data.error || data.message || 'Failed to generate character image.');
      }
    } catch (err) {
      console.error(err);
      alert('Generation failed. Check API key and try again.');
    } finally {
      setGeneratingChar(false);
    }
  };

  const acceptGeneratedCharacter = async () => {
    if (!aiPreview || !user) return;
    const faceCrop = await cropFaceFromPortrait(aiPreview).catch(() => aiPreview);
    const newChar: Character = {
      id: generateId(),
      storyId,
      name: aiCharName.toLowerCase().replace(/\s+/g, '_') || 'character',
      displayName: aiCharName || 'Character',
      description: aiPrompt,
      baseImageUrl: aiPreview,
      expressions: { default: aiPreview },
      profilePicUrl: faceCrop,
      color: '#a855f7',
      voiceEnabled: false,
      expressiveness: 50,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await createCharacter(storyId, newChar);
      setCharacters((prev) => [...prev, newChar]);
      setSelectedCharId(newChar.id);
    } catch (error) {
      console.error('Failed to create AI character:', error);
    }
    setShowAIGenerator(false);
    setAiPreview(null);
    setAiPrompt('');
    setAiCharName('');
    setAiRefImage(null);
  };

  // ============================================================
  // In-Editor AI Base Image Generation
  // ============================================================

  const generateBaseImage = async () => {
    if (!selectedChar || !editorAiPrompt.trim()) return;
    setGeneratingBaseImage(true);
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_character',
          prompt: editorAiPrompt,
          characterName: selectedChar.displayName || selectedChar.name || 'Character',
          referenceImageUrl: editorRefImage,
        }),
      });
      if (!res.ok) {
        alert(`Generation failed (HTTP ${res.status}). Try again.`);
        return;
      }
      let data;
      try { data = await res.json(); } catch {
        alert('Generation failed — invalid response. Try again.');
        return;
      }
      if (data.imageUrl) {
        const cleanedUrl = await removeBackground(data.imageUrl);
        const faceCrop = await cropFaceFromPortrait(cleanedUrl).catch(() => cleanedUrl);
        updateSelected({
          baseImageUrl: cleanedUrl,
          profilePicUrl: faceCrop,
          expressions: { ...selectedChar.expressions, default: cleanedUrl },
        });
        setEditorAiPrompt('');
        setEditorRefImage(null);
      } else {
        alert(data.error || data.message || 'Failed to generate image.');
      }
    } catch (err) {
      console.error(err);
      alert('Generation failed. Check your connection and try again.');
    } finally {
      setGeneratingBaseImage(false);
    }
  };

  // ============================================================
  // Single Expression Generation
  // ============================================================

  const generateExpression = async (expression: ExpressionKey) => {
    if (!selectedChar?.baseImageUrl) { alert('Upload a base image first'); return; }
    setGeneratingExpr(expression);
    try {
      const compressedBase = selectedChar.baseImageUrl.startsWith('data:')
        ? await compressImage(selectedChar.baseImageUrl)
        : selectedChar.baseImageUrl;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_expression',
          baseImageUrl: compressedBase,
          expression,
          characterName: selectedChar.displayName,
          expressiveness: selectedChar.expressiveness ?? 50,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        alert(`Expression generation failed (HTTP ${res.status}). Try again.`);
        return;
      }
      let data;
      try { data = await res.json(); } catch {
        alert('Expression generation failed — invalid response.');
        return;
      }
      if (data.imageUrl) {
        const cleanedUrl = await removeBackground(data.imageUrl);
        updateSelected({
          expressions: { ...selectedChar.expressions, [expression]: cleanedUrl },
        });
      } else {
        alert(data.message || data.error || 'Expression generation returned no image.');
      }
    } catch (err) {
      console.error('Expression generation failed:', err);
      if (err instanceof DOMException && err.name === 'AbortError') {
        alert('Expression generation timed out. Try again in a moment.');
      } else {
        alert('Failed to generate expression. Try again.');
      }
    } finally {
      setGeneratingExpr(null);
    }
  };

  // ============================================================
  // Generate All Expressions (Bulk)
  // ============================================================

  const generateAllExpressions = async () => {
    if (!selectedChar?.baseImageUrl) {
      alert('Need a base image to create expression variants');
      return;
    }
    setGeneratingAllExprs(true);
    setExprProgress('Starting expression generation...');

    const allExprs = EXPRESSIONS.filter((e) => e !== 'default');
    const exprsToGenerate = allExprs.filter((e) => !selectedChar.expressions[e]);
    const alreadyDone = allExprs.length - exprsToGenerate.length;

    if (exprsToGenerate.length === 0) {
      setExprProgress('All expressions already generated! Clear an expression to regenerate it.');
      setGeneratingAllExprs(false);
      return;
    }

    let succeeded = 0;
    let currentExprs = { ...selectedChar.expressions };
    const MAX_RETRIES = 2;

    const compressedBase = selectedChar.baseImageUrl.startsWith('data:')
      ? await compressImage(selectedChar.baseImageUrl)
      : selectedChar.baseImageUrl;

    for (let i = 0; i < exprsToGenerate.length; i++) {
      const expr = exprsToGenerate[i];
      setExprProgress(`Generating "${expr}" (${i + 1}/${exprsToGenerate.length}${alreadyDone > 0 ? `, ${alreadyDone} already existed` : ''})...`);

      let exprSucceeded = false;
      for (let attempt = 0; attempt <= MAX_RETRIES && !exprSucceeded; attempt++) {
        try {
          if (attempt > 0) {
            setExprProgress(`Retrying "${expr}" (attempt ${attempt + 1})...`);
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 55000);

          const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'generate_expression',
              baseImageUrl: compressedBase,
              expression: expr,
              characterName: selectedChar.displayName,
              expressiveness: selectedChar.expressiveness ?? 50,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!res.ok) continue;
          let data;
          try { data = await res.json(); } catch { continue; }
          if (data.imageUrl) {
            const cleanedUrl = await removeBackground(data.imageUrl);
            currentExprs = { ...currentExprs, [expr]: cleanedUrl };
            updateSelected({ expressions: currentExprs });
            succeeded++;
            exprSucceeded = true;
          }
        } catch (err) {
          console.error(`Expression ${expr} attempt ${attempt + 1} failed:`, err);
        }
      }
      if (i < exprsToGenerate.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setExprProgress(`Done! Generated ${succeeded}/${exprsToGenerate.length} new expressions${alreadyDone > 0 ? ` (${alreadyDone} already existed)` : ''}.`);
    setGeneratingAllExprs(false);
  };

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-violet-400 text-sm">Loading characters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Character Builder</h1>
            <p className="text-gray-400 text-sm">Create and manage story characters</p>
          </div>
          <Button
            onClick={() => setShowAIGenerator(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white"
          >
            ✨ AI Generate Character
          </Button>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
          onClick={() => { setLightboxImage(null); setLightboxLabel(''); }}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImage}
              alt={lightboxLabel}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
            {lightboxLabel && (
              <p className="text-white/70 text-sm mt-3 capitalize">{lightboxLabel}</p>
            )}
            <button
              onClick={() => { setLightboxImage(null); setLightboxLabel(''); }}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white/20 hover:bg-white/30 text-white rounded-full text-lg flex items-center justify-center transition backdrop-blur-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* AI Character Generator Modal */}
      {showAIGenerator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setShowAIGenerator(false); setAiPreview(null); }}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-2xl w-[90%] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">✨ AI Character Generator</h3>
              <button onClick={() => { setShowAIGenerator(false); setAiPreview(null); }} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Character Name *</label>
                <Input
                  value={aiCharName}
                  onChange={(e) => setAiCharName(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="e.g. Lucien Ashford"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Character Description *</label>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onPaste={(e) => handleImagePaste(e, setAiRefImage)}
                  rows={4}
                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 resize-none"
                  placeholder={"Describe appearance, personality, clothing...\nPaste an image here (Ctrl+V) to use as reference.\n\ne.g. A mysterious dark-haired young man with sharp violet eyes, wearing a long black coat over a Victorian vest."}
                />
                {aiRefImage && (
                  <div className="relative inline-block mt-2">
                    <img src={aiRefImage} alt="Ref" className="w-20 h-20 object-cover rounded-lg border border-gray-600" />
                    <button onClick={() => setAiRefImage(null)} className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 hover:bg-red-500 text-white rounded-full text-xs flex items-center justify-center shadow-lg transition">✕</button>
                    <p className="text-gray-500 text-[10px] mt-1">Reference image</p>
                  </div>
                )}
              </div>

              <Button
                onClick={generateCharacterImage}
                disabled={generatingChar || !aiPrompt.trim()}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white py-3"
              >
                {generatingChar ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generating with Gemini...
                  </span>
                ) : (
                  '✨ Generate Character Portrait'
                )}
              </Button>

              {aiPreview && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <p className="text-gray-400 text-xs mb-3">Preview — {aiCharName || 'Character'}</p>
                  <div className="flex gap-4 items-start">
                    <div
                      className="w-48 aspect-[3/4] rounded-lg overflow-hidden bg-gray-700 shrink-0 cursor-pointer"
                      onClick={() => { setLightboxImage(aiPreview); setLightboxLabel(aiCharName || 'Generated Character'); }}
                    >
                      <img src={aiPreview} alt="Generated" className="w-full h-full object-cover" />
                    </div>
                    <div className="space-y-2 flex-1">
                      <Button onClick={acceptGeneratedCharacter} className="w-full bg-green-600 hover:bg-green-500 text-white">
                        ✓ Accept & Create Character
                      </Button>
                      <Button onClick={generateCharacterImage} disabled={generatingChar} variant="outline" className="w-full border-gray-700 text-gray-300 hover:bg-gray-800">
                        🔄 Regenerate
                      </Button>
                      <Button onClick={() => setAiPreview(null)} variant="outline" className="w-full border-gray-700 text-gray-500 hover:bg-gray-800">
                        Discard
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Character List */}
        <div className="w-64 border-r border-gray-800 bg-gray-900 overflow-y-auto flex flex-col">
          <div className="p-4 space-y-2 flex-1">
            {characters.map((char) => (
              <button
                key={char.id}
                onClick={() => {
                  setSelectedCharId(char.id);
                  setEditorAiPrompt('');
                  setEditorRefImage(null);
                  setExprProgress('');
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  selectedCharId === char.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {char.profilePicUrl || char.baseImageUrl ? (
                  <img
                    src={char.profilePicUrl || char.baseImageUrl}
                    alt={char.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xs">
                    {char.name.charAt(0)}
                  </div>
                )}
                <div className="text-left min-w-0">
                  <span className="text-sm font-medium truncate block">{char.displayName || char.name}</span>
                  <span className="text-xs opacity-60">{Object.keys(char.expressions || {}).length} expressions</span>
                </div>
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-gray-800">
            <Button
              onClick={() => setShowAddCharDialog(true)}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white"
            >
              + Add Character
            </Button>
          </div>
        </div>

        {/* Main Area */}
        <div className="flex-1 overflow-y-auto bg-gray-950">
          {selectedChar ? (
            <div className="max-w-4xl mx-auto p-8 space-y-6">
              {/* Basic Info */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Basic Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">Internal Name</label>
                    <Input
                      value={selectedChar.name}
                      onChange={(e) => updateSelected({ name: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="e.g. arches"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">Display Name</label>
                    <Input
                      value={selectedChar.displayName}
                      onChange={(e) => updateSelected({ displayName: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="e.g. Arches"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">Dialogue Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={selectedChar.color}
                        onChange={(e) => updateSelected({ color: e.target.value })}
                        className="w-12 h-12 rounded cursor-pointer"
                      />
                      <span className="text-gray-400">{selectedChar.color}</span>
                    </div>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedChar.voiceEnabled ?? false}
                        onChange={(e) => updateSelected({ voiceEnabled: e.target.checked })}
                        className="accent-violet-500 w-4 h-4"
                      />
                      <span className="text-gray-300 text-sm">Voice Enabled</span>
                    </label>
                  </div>
                </div>
              </Card>

              {/* Description */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Description & Personality</h2>
                <Textarea
                  value={selectedChar.description}
                  onChange={(e) => updateSelected({ description: e.target.value })}
                  placeholder="Describe the character's personality, background, and traits. This helps the AI generate appropriate dialogue."
                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                  rows={6}
                />
              </Card>

              {/* Images Section */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Images</h2>
                <p className="text-gray-400 text-xs">Base portrait = full-body sprite used in scenes. Click any image to enlarge.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Base Portrait */}
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">Base Portrait (Full Body)</label>
                    <div
                      className="aspect-[3/4] bg-gray-800 rounded-lg overflow-hidden mb-3 relative cursor-pointer border-2 border-dashed border-gray-700 hover:border-violet-500 transition-colors"
                      onClick={() => { if (selectedChar.baseImageUrl) { setLightboxImage(selectedChar.baseImageUrl); setLightboxLabel('Base Portrait'); } }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file && file.type.startsWith('image/')) handleManualImageUpload(file, 'base');
                      }}
                    >
                      {selectedChar.baseImageUrl ? (
                        <img src={selectedChar.baseImageUrl} alt="Base" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                          Drag & drop or upload
                        </div>
                      )}
                      {generatingBaseImage && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                          <span className="text-purple-300 text-xs">Generating...</span>
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleManualImageUpload(file, 'base');
                      }}
                      className="hidden"
                      id="base-image-input"
                    />
                    <label htmlFor="base-image-input">
                      <Button
                        type="button"
                        onClick={() => document.getElementById('base-image-input')?.click()}
                        variant="outline"
                        size="sm"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800 cursor-pointer w-full mb-3"
                      >
                        Upload Image
                      </Button>
                    </label>

                    {/* AI Generate Base Image */}
                    <div className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-3 space-y-2">
                      <p className="text-purple-300 text-xs font-semibold">✨ AI Generate Portrait</p>
                      <Textarea
                        value={editorAiPrompt}
                        onChange={(e) => setEditorAiPrompt(e.target.value)}
                        onPaste={(e) => handleImagePaste(e, setEditorRefImage)}
                        rows={3}
                        className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 text-xs resize-none"
                        placeholder={"Describe the character's appearance...\nPaste an image (Ctrl+V) as reference"}
                      />
                      {editorRefImage && (
                        <div className="relative inline-block">
                          <img src={editorRefImage} alt="Ref" className="w-12 h-12 object-cover rounded border border-gray-600" />
                          <button onClick={() => setEditorRefImage(null)} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center shadow-lg transition">✕</button>
                        </div>
                      )}
                      <Button
                        onClick={generateBaseImage}
                        disabled={generatingBaseImage || !editorAiPrompt.trim()}
                        size="sm"
                        className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs"
                      >
                        {generatingBaseImage ? 'Generating...' : '✨ Generate'}
                      </Button>
                    </div>
                  </div>

                  {/* Profile Picture */}
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">Profile Picture (auto-set from base)</label>
                    <div
                      className="w-24 h-24 bg-gray-800 rounded-full overflow-hidden mb-3 cursor-pointer"
                      onClick={() => { if (selectedChar.profilePicUrl) { setLightboxImage(selectedChar.profilePicUrl); setLightboxLabel('Profile Picture'); } }}
                    >
                      {selectedChar.profilePicUrl ? (
                        <img src={selectedChar.profilePicUrl} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">👤</div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file || !selectedChar) return;
                        const reader = new FileReader();
                        reader.onload = () => updateSelected({ profilePicUrl: reader.result as string });
                        reader.readAsDataURL(file);
                      }}
                      className="hidden"
                      id="profile-pic-input"
                    />
                    <label htmlFor="profile-pic-input">
                      <Button
                        type="button"
                        onClick={() => document.getElementById('profile-pic-input')?.click()}
                        variant="outline"
                        size="sm"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800 cursor-pointer"
                      >
                        Upload Profile Pic
                      </Button>
                    </label>
                  </div>
                </div>
              </Card>

              {/* Expressiveness Slider */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Expressiveness</h2>
                <p className="text-gray-400 text-xs">Controls how dramatic or muted the generated expressions will be. Low = stoic. High = exaggerated anime reactions.</p>
                <style>{`
                  .expr-slider {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 100%;
                    height: 8px;
                    border-radius: 4px;
                    background: linear-gradient(to right, rgba(139,92,246,0.3) 0%, rgba(139,92,246,0.8) 100%);
                    outline: none;
                    cursor: pointer;
                  }
                  .expr-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #a78bfa;
                    border: 3px solid #fff;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
                    cursor: grab;
                    transition: transform 0.15s, background 0.15s;
                  }
                  .expr-slider::-webkit-slider-thumb:hover {
                    background: #c4b5fd;
                    transform: scale(1.15);
                  }
                  .expr-slider::-moz-range-thumb {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #a78bfa;
                    border: 3px solid #fff;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
                    cursor: grab;
                  }
                  .expr-slider::-moz-range-track {
                    height: 8px;
                    border-radius: 4px;
                    background: linear-gradient(to right, rgba(139,92,246,0.3), rgba(139,92,246,0.8));
                  }
                `}</style>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={selectedChar.expressiveness ?? 50}
                  onChange={(e) => updateSelected({ expressiveness: parseInt(e.target.value) })}
                  className="expr-slider"
                />
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">Muted</span>
                  <span className="text-gray-500 text-xs">Expressive</span>
                </div>
                <div className="text-center">
                  <span className="inline-block bg-purple-600/30 border border-purple-500/30 rounded-full px-4 py-1">
                    <span className="text-purple-300 text-sm font-bold">{selectedChar.expressiveness ?? 50}</span>
                    <span className="text-gray-400 text-xs ml-2">— {getExpressivenessLabel(selectedChar.expressiveness ?? 50)}</span>
                  </span>
                </div>
              </Card>

              {/* Expressions Gallery */}
              <Card className="bg-gray-900 border-gray-800 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Expressions</h2>
                  <Button
                    onClick={generateAllExpressions}
                    disabled={generatingAllExprs || !selectedChar.baseImageUrl}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white text-xs"
                  >
                    {generatingAllExprs ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating...
                      </span>
                    ) : (
                      '✨ Generate All Expressions'
                    )}
                  </Button>
                </div>
                <p className="text-gray-400 text-xs">Full-body variants with different expressions. &quot;Default&quot; is auto-set from base portrait. Click any image to enlarge.</p>
                {exprProgress && (
                  <div className="bg-purple-900/30 border border-purple-500/20 rounded-lg px-3 py-2">
                    <p className="text-purple-300 text-xs">{exprProgress}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {EXPRESSIONS.map((expr) => {
                    const imageUrl = selectedChar.expressions[expr];
                    const isGenerating = generatingExpr === expr;
                    const isDefault = expr === 'default';
                    return (
                      <div key={expr} className="text-center">
                        <div
                          className={`aspect-[3/4] bg-gray-800 rounded-lg overflow-hidden mb-2 relative ${
                            isDefault ? 'ring-2 ring-violet-500/50' : ''
                          } ${imageUrl ? 'cursor-pointer hover:ring-2 hover:ring-white/30' : ''}`}
                          onClick={() => {
                            if (imageUrl) {
                              setLightboxImage(imageUrl);
                              setLightboxLabel(`${selectedChar.displayName} — ${expr}`);
                            }
                          }}
                        >
                          {imageUrl ? (
                            <img src={imageUrl} alt={expr} className="w-full h-full object-contain" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">?</div>
                          )}
                          {isGenerating && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          {/* Clear button on non-default expressions that have images */}
                          {imageUrl && !isDefault && !isGenerating && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const newExprs = { ...selectedChar.expressions };
                                delete newExprs[expr];
                                updateSelected({ expressions: newExprs });
                              }}
                              className="absolute top-1 right-1 w-5 h-5 bg-red-600/80 hover:bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center shadow-lg transition"
                              title="Clear expression"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <p className="text-gray-400 text-xs capitalize mb-1">
                          {expr}{isDefault ? ' (auto)' : ''}
                        </p>
                        {!isDefault && (
                          <div className="flex gap-1">
                            <Button
                              onClick={() => generateExpression(expr)}
                              disabled={isGenerating || !selectedChar.baseImageUrl}
                              size="sm"
                              className="flex-1 bg-violet-600/50 hover:bg-violet-500/50 disabled:opacity-30 text-white text-[10px] h-7"
                            >
                              {isGenerating ? '...' : 'AI Gen'}
                            </Button>
                            <label className="flex-1">
                              <Button
                                type="button"
                                onClick={() => document.getElementById(`expr-upload-${expr}`)?.click()}
                                size="sm"
                                variant="outline"
                                className="w-full border-gray-700 text-gray-400 hover:bg-gray-800 text-[10px] h-7 cursor-pointer"
                              >
                                Upload
                              </Button>
                              <input
                                type="file"
                                accept="image/*"
                                id={`expr-upload-${expr}`}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleManualImageUpload(file, expr);
                                }}
                                className="hidden"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                  onClick={handleSaveCharacter}
                  disabled={isSaving}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {isSaving ? 'Saving & Uploading...' : 'Save Character'}
                </Button>
              </div>

              {/* Delete Confirmation Dialog */}
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
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-gray-400 mb-4">No characters yet</p>
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={() => setShowAIGenerator(true)}
                    className="bg-purple-600 hover:bg-purple-500 text-white"
                  >
                    ✨ AI Generate Character
                  </Button>
                  <Button
                    onClick={() => setShowAddCharDialog(true)}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    Create Manually
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Character Dialog */}
      <Dialog open={showAddCharDialog} onOpenChange={setShowAddCharDialog}>
        <DialogContent className="bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Add Character</DialogTitle>
            <DialogDescription className="text-gray-400">
              Create a new character manually.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-4">
            <Button
              onClick={() => setShowAddCharDialog(false)}
              variant="outline"
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddCharacter}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              Create Character
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
