/**
 * Animated worker avatar component
 */

import React from 'react';

interface WorkerAvatarProps {
  agentType: string;
  status: 'idle' | 'working' | 'completed' | 'failed';
  size?: 'sm' | 'md' | 'lg';
}

const agentEmojis: Record<string, string> = {
  writer: '✍️',
  editor: '📝',
  planner: '📋',
  research: '🔍',
  swe: '👷',
  tester: '🧪',
  verifier: '✅',
  default: '🤖',
};

const sizeClasses = {
  sm: 'w-10 h-10 text-xl',
  md: 'w-16 h-16 text-3xl',
  lg: 'w-24 h-24 text-5xl',
};

const statusClasses = {
  idle: 'bg-gray-100 border-gray-300',
  working: 'bg-blue-100 border-blue-400 animate-pulse-slow',
  completed: 'bg-green-100 border-green-400',
  failed: 'bg-red-100 border-red-400',
};

export function WorkerAvatar({ agentType, status, size = 'md' }: WorkerAvatarProps) {
  const emoji = agentEmojis[agentType.toLowerCase()] || agentEmojis.default;

  return (
    <div className="relative inline-block">
      <div
        className={`
          ${sizeClasses[size]} 
          ${statusClasses[status]}
          rounded-full border-2 flex items-center justify-center
          transition-all duration-300
        `}
      >
        {emoji}
      </div>
      
      {status === 'working' && (
        <div className="absolute inset-0 rounded-full border-2 border-blue-400 pulse-ring" />
      )}
      
      {status === 'completed' && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
          ✓
        </div>
      )}
      
      {status === 'failed' && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
          ✕
        </div>
      )}
    </div>
  );
}
