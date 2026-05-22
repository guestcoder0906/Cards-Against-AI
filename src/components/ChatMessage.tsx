import React from 'react';
import { AI_MODELS } from '../data';
import { Message } from '../types';

interface Props {
  message: Message;
}

export const ChatMessage: React.FC<Props> = ({ message }) => {
  const isUser = message.sender === 'User';
  const aiModel = AI_MODELS.find(m => m.name === message.sender);

  return (
    <div className={`flex flex-col mb-2 ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-start gap-3 max-w-[85%] sm:max-w-[75%] ${isUser ? 'flex-row-reverse' : ''}`}>
        {!isUser && (
          <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 border-[#0c0e14] flex items-center justify-center text-xs font-bold text-white shadow-sm mt-1 ${aiModel?.themeColor || 'bg-slate-700'}`}>
            {aiModel?.avatar || '🤖'}
          </div>
        )}
        
        <div className="flex flex-col">
          <div className={`flex items-center gap-2 mb-1.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <span className={`text-[11px] font-bold ${
              isUser ? 'text-indigo-400' : 'text-slate-300'
            }`}>
              {isUser ? 'User' : aiModel?.modelCode || message.sender}
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
            </span>
          </div>
          
          <div className={`relative px-4 py-3 text-sm leading-relaxed ${
            isUser 
              ? 'bg-indigo-500/10 text-indigo-100 rounded-2xl rounded-tr-none border border-indigo-500/20 shadow-md' 
              : 'bg-slate-800/80 text-slate-200 rounded-2xl rounded-tl-none border border-slate-700 shadow-xl'
          }`}>
            {message.text}
          </div>

          {message.reaction && !isUser && (
            <div className="flex mt-2">
              <span className="bg-slate-800 px-2.5 py-1 rounded-md text-[11px] border border-slate-700 shadow-sm flex items-center gap-1">
                {message.reaction} <span className="opacity-50 text-slate-400 font-mono">1</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatMessage;
