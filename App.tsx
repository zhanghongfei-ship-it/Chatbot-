import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, Sender, MessageStatus } from './types';
import { generateBotResponse } from './services/geminiService';
import { MessageBubble } from './components/MessageBubble';
import { TypingIndicator } from './components/TypingIndicator';

// ----------------------------------------------------------------------
// Avatar Configuration
// REPLACE the URL below with your specific image URL or Base64 string
// ----------------------------------------------------------------------
const BOT_AVATAR = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRQ9MZkPHO6VlAXkae4Fpfg4iDkUtnYpxQ5vw&s";

// ----------------------------------------------------------------------
// Persona Info for UI Display
// ----------------------------------------------------------------------
const PERSONA_DESCRIPTION = `姓名：秦清越
年龄：28岁
身份：富家千金，高冷御姐

【性格特征】
❄️ 高冷难追：难以取悦，觉得大多数人都很无聊。
💬 选择性回复：
   • 面对无聊、老套或舔狗式的发言，她会冷淡敷衍甚至无视。
   • 面对有趣、聪明或有价值的发言，她才会多看你一眼。
   • 极度感兴趣或生气时，可能会连续发消息轰炸。
🚫 语言风格：简练，偶尔毒舌，慵懒优雅，从不使用幼稚的Emoji。`;

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'init-1',
    text: "有事？",
    sender: Sender.Bot,
    timestamp: Date.now(),
    // interestLevel removed to keep initial UI clean
  }
];

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

// Helper for delays
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // UI States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showPersonaInfo, setShowPersonaInfo] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const personaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, previewImage]);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (personaRef.current && !personaRef.current.contains(event.target as Node)) {
        setShowPersonaInfo(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const removePreview = () => {
    setPreviewImage(null);
  };

  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim() && !previewImage) return;

    const userText = inputText.trim();
    const userImage = previewImage || undefined;

    setInputText('');
    setPreviewImage(null);
    
    // 1. Add User Message (Status: Sent -> Delivered immediately)
    const userMsgId = generateId();
    const newUserMsg: Message = {
      id: userMsgId,
      text: userText,
      imageUrl: userImage,
      sender: Sender.User,
      timestamp: Date.now(),
      status: MessageStatus.Delivered,
    };

    setMessages(prev => [...prev, newUserMsg]);

    // 2. Determine Random "Read" Delay (1.5s to 6s) - unpredictable
    // High-cold persona doesn't check phone immediately
    const readDelay = Math.random() * 4500 + 1500;

    // 3. Initiate API call immediately in background to save time, 
    // but don't show result until after "read" logic
    // Pass userImage (base64) to the service
    const apiPromise = generateBotResponse(messages, userText, userImage);

    // 4. Wait for the "Read" delay
    await wait(readDelay);

    // 5. Mark user message as "Read"
    setMessages(prev => 
      prev.map(msg => 
        (msg.sender === Sender.User && msg.status !== MessageStatus.Read)
          ? { ...msg, status: MessageStatus.Read } 
          : msg
      )
    );

    // 6. Process API Response
    try {
      const response = await apiPromise;
      
      console.log("Bot Thoughts:", response.thoughts);

      // UPDATE USER MESSAGE WITH SCORE
      setMessages(prev => prev.map(msg => 
        msg.id === userMsgId 
          ? { ...msg, interestLevel: response.interestLevel }
          : msg
      ));

      const replies = response.replies || [];

      // CASE: NO REPLY (Level 1, or Level 2/3 probability check failed)
      if (replies.length === 0) {
        setMessages(prev => [
          ...prev,
          {
            id: generateId(),
            text: "对方已读但是决定不答复了。",
            sender: Sender.System,
            timestamp: Date.now(),
            thoughts: response.thoughts // Attach thoughts to the system message
          }
        ]);
        return;
      }

      // CASE: SENDING REPLIES
      for (let i = 0; i < replies.length; i++) {
        const replyText = replies[i];
        
        // Calculate typing speed based on length
        const typingDuration = Math.min(Math.max(replyText.length * 60, 800), 3000);
        
        // Human pause
        await wait(Math.random() * 500 + 200);

        setIsTyping(true);
        await wait(typingDuration);
        setIsTyping(false);

        setMessages(prev => [
          ...prev,
          {
            id: generateId(),
            text: replyText,
            sender: Sender.Bot,
            timestamp: Date.now(),
            // Attach thoughts ONLY to the very first message of the batch response
            thoughts: i === 0 ? response.thoughts : undefined
          }
        ]);
      }

    } catch (error) {
      console.error("Failed to process chat flow", error);
    }
  }, [inputText, messages, previewImage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleResetChat = () => {
    if (window.confirm("确定要清空所有聊天记录重置对话吗？")) {
      setMessages(INITIAL_MESSAGES);
      setIsMenuOpen(false);
      setPreviewImage(null);
      setInputText('');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 font-sans">
      {/* Header */}
      <header className="flex-none h-16 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 flex items-center px-4 md:px-6 sticky top-0 z-10 select-none">
        <div className="relative group cursor-pointer transition-transform hover:scale-105">
          <img 
            src={BOT_AVATAR} 
            alt="秦清越" 
            className="w-10 h-10 rounded-full object-cover border border-gray-600 shadow-lg"
          />
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900"></div>
        </div>
        
        {/* Name and Persona Info */}
        <div className="ml-3 relative" ref={personaRef}>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowPersonaInfo(!showPersonaInfo)}>
            <h1 className="text-gray-100 font-semibold text-base">秦清越</h1>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-500 hover:text-purple-400 transition-colors">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-xs text-gray-400">在线</p>

          {/* Persona Bubble Popover */}
          {showPersonaInfo && (
            <div className="absolute top-full left-0 mt-3 w-72 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-left">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wide">人物设定</h3>
                <button onClick={() => setShowPersonaInfo(false)} className="text-gray-500 hover:text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-sans">
                {PERSONA_DESCRIPTION}
              </div>
            </div>
          )}
        </div>

        {/* Right Actions Menu */}
        <div className="ml-auto relative" ref={menuRef}>
          <button 
            className="p-2 text-gray-400 hover:text-white transition rounded-full hover:bg-gray-800"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <button 
                onClick={handleResetChat}
                className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
                重置对话
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Chat Area */}
      <main 
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 relative" 
        ref={chatContainerRef}
      >
        <div className="text-center text-xs text-gray-600 my-4">
          Today
        </div>
        
        {messages.map((msg, index) => (
          <MessageBubble 
            key={msg.id} 
            message={msg} 
            isLast={index === messages.length - 1} 
          />
        ))}
        
        {isTyping && <TypingIndicator />}
        
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="flex-none p-4 bg-gray-900 border-t border-gray-800 sticky bottom-0">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          
          {/* Image Preview */}
          {previewImage && (
            <div className="relative w-fit animate-in slide-in-from-bottom-2 fade-in duration-200">
              <img src={previewImage} alt="Preview" className="h-20 w-auto rounded-lg border border-gray-700 shadow-lg" />
              <button 
                onClick={removePreview}
                className="absolute -top-2 -right-2 bg-gray-800 rounded-full p-1 border border-gray-600 text-gray-400 hover:text-white shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Image Upload Button */}
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className={`p-2 transition-colors rounded-full ${previewImage ? 'text-purple-400 bg-purple-900/20' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
              title="Upload Image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </button>

            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={previewImage ? "Add a caption..." : "Message..."}
                className="w-full bg-gray-800 text-gray-100 placeholder-gray-500 rounded-full py-3 px-5 focus:outline-none focus:ring-2 focus:ring-purple-600/50 border border-gray-700 transition-all"
              />
            </div>

            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() && !previewImage}
              className={`p-3 rounded-full transition-all duration-300 flex items-center justify-center ${
                (inputText.trim() || previewImage)
                  ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-900/20' 
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;