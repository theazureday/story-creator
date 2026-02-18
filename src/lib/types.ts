// ============================================================
// Story Creator Platform — Core TypeScript Types
// ============================================================

// --- User ---
export interface User {
  uid: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  createdAt: number;
  role: 'creator' | 'player' | 'admin';
}

// --- Story ---
export interface Story {
  id: string;
  creatorUid: string;
  creatorName: string;
  title: string;
  description: string;
  coverImageUrl: string;
  tags: string[];
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
  playCount: number;
  rating: number;
  ratingCount: number;
  sceneCount: number;
  characterCount: number;
}

// --- Character ---
export type ExpressionKey =
  | 'default'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'thinking'
  | 'embarrassed';

export const EXPRESSION_KEYS: ExpressionKey[] = [
  'default',
  'happy',
  'sad',
  'angry',
  'surprised',
  'thinking',
  'embarrassed',
];

export interface Character {
  id: string;
  storyId: string;
  name: string;
  displayName: string;
  description: string; // Personality + backstory, fed to LLM
  baseImageUrl: string; // Firebase Storage URL
  expressions: Partial<Record<ExpressionKey, string>>; // expression -> Storage URL
  profilePicUrl: string;
  color: string; // Hex color for dialogue name
  voiceEnabled: boolean;
  expressiveness: number; // 0-100 slider: 0 = very muted, 100 = very exaggerated
  createdAt: number;
  updatedAt: number;
}

// --- Scene ---
export interface WinCondition {
  id: string;
  description: string; // Shown to player as hint/goal
  completionCriteria: string; // Natural language for LLM evaluation (hidden)
}

export interface Scene {
  id: string;
  storyId: string;
  title: string;
  orderIndex: number;
  prompt: string; // Scene setup prompt for LLM
  backgroundImageUrl: string;
  characterIds: string[]; // Characters in this scene
  outfits: Record<string, string>; // characterId -> outfit description
  winConditions: WinCondition[];
  unlockedBySceneId: string | null;
  createdAt: number;
  updatedAt: number;
}

// --- AI Dialogue ---
export interface DialogueMessage {
  role: 'player' | 'character' | 'narrator' | 'system';
  characterId?: string;
  characterName?: string;
  emotion?: ExpressionKey;
  text: string;
  timestamp: number;
}

export interface AIResponse {
  text: string;
  character: string; // character ID
  emotion: ExpressionKey;
  completedConditions: string[]; // win condition IDs newly completed
}

// --- Player Progress ---
export interface PlayerProgress {
  odcId: string; // odcument ID: odcument made of uid_storyId
  odcUserRef: string;
  storyId: string;
  uid: string;
  currentSceneId: string;
  completedSceneIds: string[];
  currentConversation: DialogueMessage[];
  completedWinConditions: Record<string, string[]>; // sceneId -> conditionIds
  startedAt: number;
  updatedAt: number;
}

// --- NovelAI ---
export interface NovelAIGenerateRequest {
  action: 'generate_character' | 'generate_expression' | 'generate_background';
  prompt: string;
  characterName?: string;
  expression?: ExpressionKey;
  referenceImageUrl?: string;
}

// --- UI State ---
export interface UIState {
  currentCharacterId: string | null;
  currentEmotion: ExpressionKey;
  isTransitioning: boolean;
  isSending: boolean;
  showWinConditions: boolean;
}
