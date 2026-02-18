'use client';

import { useState } from 'react';
import type { WinCondition } from '@/lib/types';

interface Props {
  conditions: WinCondition[];
  completedIds: string[];
}

export default function WinConditionTracker({ conditions, completedIds }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const total = conditions.length;
  const completed = completedIds.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  if (total === 0) return null;

  return (
    <div className="absolute top-4 right-4 z-20">
      {/* Collapsed: just show progress circle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 bg-gray-900/80 backdrop-blur-sm rounded-full px-3 py-1.5 border border-gray-700/50 hover:border-violet-500/50 transition-colors"
      >
        {/* Mini progress ring */}
        <svg width="20" height="20" className="-rotate-90">
          <circle cx="10" cy="10" r="8" fill="none" stroke="#374151" strokeWidth="2" />
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke={completed === total ? '#22c55e' : '#8b5cf6'}
            strokeWidth="2"
            strokeDasharray={`${2 * Math.PI * 8}`}
            strokeDashoffset={`${2 * Math.PI * 8 * (1 - progress / 100)}`}
            className="transition-all duration-500"
          />
        </svg>
        <span className="text-xs font-medium text-gray-300">
          {completed}/{total}
        </span>
      </button>

      {/* Expanded: show all conditions */}
      {isExpanded && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700/50 p-3 animate-slide-up">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Objectives
          </h4>
          <div className="space-y-2">
            {conditions.map((condition) => {
              const isDone = completedIds.includes(condition.id);
              return (
                <div
                  key={condition.id}
                  className={`flex items-start gap-2 text-xs ${
                    isDone ? 'text-green-400' : 'text-gray-400'
                  }`}
                >
                  <span className="mt-0.5">
                    {isDone ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                        <circle cx="10" cy="10" r="7" strokeWidth="1.5" />
                      </svg>
                    )}
                  </span>
                  <span className={isDone ? 'line-through' : ''}>{condition.description}</span>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: completed === total ? '#22c55e' : '#8b5cf6',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
