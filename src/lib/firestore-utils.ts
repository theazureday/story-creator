import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase';
import type { Story, Character, Scene, PlayerProgress } from './types';

// ============================================================
// Stories
// ============================================================

export async function createStory(story: Story): Promise<void> {
  await setDoc(doc(db, 'stories', story.id), story);
}

export async function getStory(storyId: string): Promise<Story | null> {
  const snap = await getDoc(doc(db, 'stories', storyId));
  return snap.exists() ? (snap.data() as Story) : null;
}

export async function getUserStories(uid: string): Promise<Story[]> {
  const q = query(
    collection(db, 'stories'),
    where('creatorUid', '==', uid),
    orderBy('updatedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Story);
}

export async function getPublishedStories(limitCount = 50): Promise<Story[]> {
  const q = query(
    collection(db, 'stories'),
    where('isPublished', '==', true),
    orderBy('playCount', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Story);
}

export async function updateStory(storyId: string, data: Partial<Story>): Promise<void> {
  await updateDoc(doc(db, 'stories', storyId), { ...data, updatedAt: Date.now() });
}

export async function deleteStory(storyId: string): Promise<void> {
  await deleteDoc(doc(db, 'stories', storyId));
}

// ============================================================
// Characters
// ============================================================

export async function createCharacter(storyId: string, char: Character): Promise<void> {
  await setDoc(doc(db, 'stories', storyId, 'characters', char.id), char);
}

export async function getCharacters(storyId: string): Promise<Character[]> {
  const snap = await getDocs(collection(db, 'stories', storyId, 'characters'));
  return snap.docs.map((d) => d.data() as Character);
}

export async function getCharacter(storyId: string, charId: string): Promise<Character | null> {
  const snap = await getDoc(doc(db, 'stories', storyId, 'characters', charId));
  return snap.exists() ? (snap.data() as Character) : null;
}

export async function updateCharacter(
  storyId: string,
  charId: string,
  data: Partial<Character>
): Promise<void> {
  await updateDoc(doc(db, 'stories', storyId, 'characters', charId), {
    ...data,
    updatedAt: Date.now(),
  });
}

export async function deleteCharacter(storyId: string, charId: string): Promise<void> {
  await deleteDoc(doc(db, 'stories', storyId, 'characters', charId));
}

// ============================================================
// Scenes
// ============================================================

export async function createScene(storyId: string, scene: Scene): Promise<void> {
  await setDoc(doc(db, 'stories', storyId, 'scenes', scene.id), scene);
}

export async function getScenes(storyId: string): Promise<Scene[]> {
  const q = query(
    collection(db, 'stories', storyId, 'scenes'),
    orderBy('orderIndex', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Scene);
}

export async function getScene(storyId: string, sceneId: string): Promise<Scene | null> {
  const snap = await getDoc(doc(db, 'stories', storyId, 'scenes', sceneId));
  return snap.exists() ? (snap.data() as Scene) : null;
}

export async function updateScene(
  storyId: string,
  sceneId: string,
  data: Partial<Scene>
): Promise<void> {
  await updateDoc(doc(db, 'stories', storyId, 'scenes', sceneId), {
    ...data,
    updatedAt: Date.now(),
  });
}

export async function deleteScene(storyId: string, sceneId: string): Promise<void> {
  await deleteDoc(doc(db, 'stories', storyId, 'scenes', sceneId));
}

// ============================================================
// Player Progress
// ============================================================

function progressDocId(uid: string, storyId: string) {
  return `${uid}_${storyId}`;
}

export async function getPlayerProgress(
  uid: string,
  storyId: string
): Promise<PlayerProgress | null> {
  const snap = await getDoc(doc(db, 'playerProgress', progressDocId(uid, storyId)));
  return snap.exists() ? (snap.data() as PlayerProgress) : null;
}

export async function savePlayerProgress(progress: PlayerProgress): Promise<void> {
  await setDoc(doc(db, 'playerProgress', progress.odcId), {
    ...progress,
    updatedAt: Date.now(),
  });
}

// ============================================================
// Image Upload
// ============================================================

export async function uploadImage(
  path: string,
  file: Blob | File
): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function deleteImage(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Ignore if file doesn't exist
  }
}
