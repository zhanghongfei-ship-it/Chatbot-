import React from 'react';
import { Message, Sender, MessageStatus } from '../types';

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
}

// Reusable Thought Bubble Component with Tooltip
const ThoughtTooltip: React.FC<{ thoughts: string, align: 'left' | 'right' }> = ({ thoughts, align }) => {
  return (
    <div className="group relative flex items-center mx-2 z-20">
      <div className="w-5 h-5 rounded-full bg-gray-800/50 border border-gray-600/50 flex items-center justify-center cursor-help hover:bg-gray-700 transition-colors">
        <span className="text-[10px] grayscale opacity-60 group-hover:opacity-100 group-hover:grayscale-0 transition-all">💭</span>
      </div>
      
      {/* Tooltip Content */}
      <div className={`absolute ${align === 'left' ? 'right-full mr-2' : 'left-full ml-2'} top-0 w-64 p-3 bg-black/90 backdrop-blur border border-gray-700 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30`}>
        <div className="text-[10px] text-gray-400 font-mono mb-1 uppercase tracking-wider">Internal Monologue</div>
        <div className="text-xs text-gray-200 leading-relaxed font-sans italic">
          "{thoughts}"
        </div>
      </div>
    </div>
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isLast }) => {
  // Handle System/Debug Messages separately
  if (message.sender === Sender.System) {
    return (
      <div className="flex w-full justify-center my-3 px-2 group">
        <div className="flex items-center gap-1 max-w-[95%]">
          <span className="text-[10px] md:text-xs font-mono text-gray-400 bg-gray-800/50 border border-gray-700/50 px-3 py-2 rounded text-center whitespace-pre-wrap break-words leading-relaxed">
            {message.text}
          </span>
          {/* Show thoughts tooltip for system messages if available */}
          {message.thoughts && <ThoughtTooltip thoughts={message.thoughts} align="right" />}
        </div>
      </div>
    );
  }

  const isUser = message.sender === Sender.User;
  const isRead = message.status === MessageStatus.Read;

  // Format time
  const timeString = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Determine styles based on sender and status
  const bubbleColorClass = isUser
    ? (isRead ? 'bg-purple-600 text-white' : 'bg-gray-600 text-gray-200')
    : 'bg-gray-800 text-gray-200 border border-gray-700';

  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Bot: Message Container + Potential Thought Bubble */}
      <div className={`flex max-w-[85%] ${isUser ? 'items-end flex-col' : 'items-start flex-row'}`}>
        
        {/* Actual Message Bubble Container */}
        <div className={`flex flex-col max-w-full ${isUser ? 'items-end' : 'items-start'}`}>
          <div
            className={`px-4 py-2 rounded-2xl text-sm md:text-base shadow-md relative break-words transition-colors duration-700 ease-in-out ${bubbleColorClass} ${
              isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
            }`}
          >
            {/* Image rendering */}
            {message.imageUrl && (
              <div className="mb-2 -mx-2 -mt-2">
                <img 
                  src={message.imageUrl} 
                  alt="User upload" 
                  className={`max-w-full h-auto rounded-xl object-cover max-h-64 ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`} 
                />
              </div>
            )}
            
            {message.text}
          </div>

          <div className="flex items-center gap-2 mt-1 px-1">
            <span className="text-[10px] text-gray-500">{timeString}</span>
            
            {/* QA Debug Score - Displayed on User Message */}
            {isUser && message.interestLevel !== undefined && (
              <span className="text-[9px] font-mono text-emerald-500/80 border border-emerald-500/20 px-1 rounded">
                Score: {message.interestLevel}
              </span>
            )}

            {/* User Status */}
            {isUser && (
              <span className={`text-[10px] font-medium transition-colors duration-500 ${
                isRead ? 'text-purple-400' : 'text-gray-500'
              }`}>
                {isRead ? '已读' : message.status === MessageStatus.Delivered ? '已送达' : '发送中'}
              </span>
            )}
          </div>
        </div>

        {/* Bot Thoughts: Displayed to the RIGHT of the bot bubble */}
        {!isUser && message.thoughts && (
          <div className="mt-2">
            <ThoughtTooltip thoughts={message.thoughts} align="right" />
          </div>
        )}

      </div>
    </div>
  );
};