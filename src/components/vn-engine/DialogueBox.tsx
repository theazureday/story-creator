'use client';

import { useState, useEffect, useRef } from 'react';
import type { Character, DialogueMessage } from '@/lib/types';

interface Props {
  messages: DialogueMessage[];
  characters: Record<string, Character>;
  onSendMessage: (text: string) => void;
  isSending: boolean;
  isSceneComplete: boolean;
  onNextScene: () => void;
}

export default function DialogueBox({
  messages,
  characters,
  onSendMessage,
  isSending,
  isSceneComplete,
  onNextScene,
}: Props) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent">
      {/* Message history - scrollable */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-3 max-h-[30vh]"
      >
        {messages.map((msg, i) => {
          const char = msg.characterId ? characters[msg.characterId] : null;

          if (msg.role === 'player') {
            return (
              <div key={i} className="flex justify-end animate-slide-up">
                <div className="bg-violet-600/80 rounded-2xl rounded-br-md px-4 py-2 max-w-[80%]">
                  <p className="text-sm text-white">{msg.text}</p>
                </div>
              </div>
            );
          }

          if (msg.role === 'narrator' || msg.role === 'system') {
            return (
              <div key={i} className="text-center animate-slide-up">
                <p className="text-xs text-gray-400 italic px-4">{msg.text}</p>
              </div>
            );
          }

          // Character message
          return (
            <div key={i} className="flex justify-start animate-slide-up">
              <div className="max-w-[85%]">
                {char && (
                  <span
                    className="text-xs font-semibold mb-1 block"
                    style={{ color: char.color || '#a78bfa' }}
                  >
                    {char.displayName}
                  </span>
                )}
                <div className="bg-gray-800/80 rounded-2xl rounded-bl-md px-4 py-2">
                  <p className="text-sm text-gray-100 whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isSending && (
          <div className="flex justify-start animate-slide-up">
            <div className="bg-gray-800/80 rounded-2xl px-4 py-3">
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-2">
        {isSceneComplete ? (
          <button
            onClick={onNextScene}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Continue to Next Scene →
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isSending ? 'Waiting for response...' : 'Type your response...'}
              disabled={isSending}
              className="flex-1 bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="p-3 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:opacity-50 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
