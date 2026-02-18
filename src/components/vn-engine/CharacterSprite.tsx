'use client';

import { useState, useEffect } from 'react';
import type { Character, ExpressionKey } from '@/lib/types';

interface Props {
  character: Character | null;
  emotion: ExpressionKey;
  isVisible: boolean;
}

export default function CharacterSprite({ character, emotion, isVisible }: Props) {
  const [currentImage, setCurrentImage] = useState<string>('');
  const [prevImage, setPrevImage] = useState<string>('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (!character) {
      setCurrentImage('');
      return;
    }

    const newImage =
      character.expressions[emotion] ||
      character.expressions.default ||
      character.baseImageUrl ||
      '';

    if (newImage !== currentImage) {
      setPrevImage(currentImage);
      setCurrentImage(newImage);
      setIsTransitioning(true);

      const timer = setTimeout(() => {
        setIsTransitioning(false);
        setPrevImage('');
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [character, emotion, currentImage]);

  if (!character || !isVisible) return null;

  return (
    <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
      {/* Previous expression (fading out) */}
      {isTransitioning && prevImage && (
        <img
          src={prevImage}
          alt=""
          className="absolute bottom-0 max-h-[65vh] w-auto object-contain animate-fade-out"
          style={{ maxWidth: '80%' }}
        />
      )}

      {/* Current expression */}
      <img
        src={currentImage}
        alt={character.displayName}
        className={`absolute bottom-0 max-h-[65vh] w-auto object-contain transition-opacity duration-400 ${
          isTransitioning ? 'animate-fade-in' : ''
        }`}
        style={{ maxWidth: '80%' }}
        onError={(e) => {
          // Fallback to base image if expression fails
          const img = e.target as HTMLImageElement;
          if (img.src !== character.baseImageUrl && character.baseImageUrl) {
            img.src = character.baseImageUrl;
          }
        }}
      />

      {/* Character name label */}
      {!currentImage && (
        <div className="absolute bottom-4 px-4 py-2 bg-gray-900/80 rounded-lg text-sm text-gray-400">
          {character.displayName}
        </div>
      )}
    </div>
  );
}
