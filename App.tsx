import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, Sender, MessageStatus, AffinityTier, AFFINITY_THRESHOLDS } from './types';
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

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

// Helper for delays
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to get a fresh initial message with current timestamp
const getInitialMessage = (): Message => ({
  id: generateId(), // Always unique ID
  text: "有事？",
  sender: Sender.Bot,
  timestamp: Date.now(), // Always current time
});

const App: React.FC = () => {
  // Initialize with a function to ensure fresh timestamp on first load
  const [messages, setMessages] = useState<Message[]>(() => [getInitialMessage()]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Affinity System State
  const [affinity, setAffinity] = useState(10); // Start at 10
  const [impression, setImpression] = useState("（她看了你一眼，似乎没什么特别的想法）");
  const [showLevelUp, setShowLevelUp] = useState<{tier: AffinityTier, show: boolean}>({ tier: AffinityTier.Stranger, show: false });

  // UI States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showPersonaInfo, setShowPersonaInfo] = useState(false); // Restored Persona Bubble State
  const [activeModal, setActiveModal] = useState<'none' | 'affinity' | 'impression' | 'reset'>('none');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const personaRef = useRef<HTMLDivElement>(null); // Restored ref for persona bubble
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
      // Logic for Menu
      if (isMenuOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      // Logic for Persona Bubble
      if (showPersonaInfo && personaRef.current && !personaRef.current.contains(event.target as Node)) {
        setShowPersonaInfo(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen, showPersonaInfo]);

  // Calculate current Tier
  const currentTier = affinity >= AFFINITY_THRESHOLDS.Favored 
    ? AffinityTier.Favored 
    : affinity >= AFFINITY_THRESHOLDS.Acquaintance 
      ? AffinityTier.Acquaintance 
      : AffinityTier.Stranger;

  // Visual Properties based on Tier
  const getAffinityColor = () => {
    switch (currentTier) {
      case AffinityTier.Favored: return 'text-red-500';
      case AffinityTier.Acquaintance: return 'text-purple-400';
      default: return 'text-blue-300';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
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
    
    // 1. Add User Message
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

    // 2. Logic: Should we update impression? Every 10 messages (including this one)
    const totalMessages = messages.length + 1;
    const shouldUpdateImpression = totalMessages % 10 === 0;

    // 3. Determine Random "Read" Delay (1.5s to 6s)
    const readDelay = Math.random() * 4500 + 1500;

    // 4. API Call with CURRENT affinity and Impression Trigger
    const apiPromise = generateBotResponse(messages, userText, affinity, shouldUpdateImpression, userImage);

    // 5. Wait
    await wait(readDelay);

    // 6. Mark Read
    setMessages(prev => 
      prev.map(msg => 
        (msg.sender === Sender.User && msg.status !== MessageStatus.Read)
          ? { ...msg, status: MessageStatus.Read } 
          : msg
      )
    );

    // 7. Process Response
    try {
      const response = await apiPromise;
      
      console.log("Bot Thoughts:", response.thoughts);

      // Update Impression if provided
      if (response.userImpression) {
        setImpression(response.userImpression);
      }

      // --- AFFINITY CALCULATION ---
      let affinityDelta = 0;
      if (response.interestLevel <= 2) affinityDelta = -2;
      else if (response.interestLevel === 3) affinityDelta = -1;
      else if (response.interestLevel >= 4 && response.interestLevel <= 6) affinityDelta = 1;
      else if (response.interestLevel >= 7 && response.interestLevel <= 8) affinityDelta = 3;
      else if (response.interestLevel >= 9) affinityDelta = 5;

      const oldTier = currentTier;
      
      // Update Affinity (Clamped 0-100)
      setAffinity(prev => {
        const newVal = Math.min(Math.max(prev + affinityDelta, 0), 100);
        
        // Check for Level Up
        let newCalculatedTier = AffinityTier.Stranger;
        if (newVal >= AFFINITY_THRESHOLDS.Favored) newCalculatedTier = AffinityTier.Favored;
        else if (newVal >= AFFINITY_THRESHOLDS.Acquaintance) newCalculatedTier = AffinityTier.Acquaintance;

        // If tier improved, trigger notification
        if (newCalculatedTier !== oldTier && newVal > prev) {
             setShowLevelUp({ tier: newCalculatedTier, show: true });
             setTimeout(() => setShowLevelUp(prev => ({ ...prev, show: false })), 4000);
        }

        return newVal;
      });

      // Update User Message with score
      setMessages(prev => prev.map(msg => 
        msg.id === userMsgId 
          ? { ...msg, interestLevel: response.interestLevel }
          : msg
      ));

      const replies = response.replies || [];

      // No Reply Logic
      if (replies.length === 0) {
        setMessages(prev => [
          ...prev,
          {
            id: generateId(),
            text: "对方已读但是决定不答复了。",
            sender: Sender.System,
            timestamp: Date.now(),
            thoughts: response.thoughts 
          }
        ]);
        return;
      }

      // Sending Replies
      for (let i = 0; i < replies.length; i++) {
        const replyText = replies[i];
        const typingDuration = Math.min(Math.max(replyText.length * 60, 800), 3000);
        
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
            thoughts: i === 0 ? response.thoughts : undefined
          }
        ]);
      }

    } catch (error) {
      console.error("Failed to process chat flow", error);
    }
  }, [inputText, messages, previewImage, affinity, currentTier]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Triggered by Menu Item
  const onResetRequest = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    setActiveModal('reset');
  };

  // Triggered by Modal Confirm
  const performReset = () => {
    setMessages([getInitialMessage()]);
    setAffinity(10);
    setImpression("（她看了你一眼，似乎没什么特别的想法）");
    setPreviewImage(null);
    setInputText('');
    setActiveModal('none');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 font-sans overflow-hidden">
      
      {/* LEVEL UP OVERLAY */}
      {showLevelUp.show && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none">
          <div className="bg-gray-900/90 backdrop-blur-md border border-purple-500/50 p-8 rounded-2xl shadow-2xl animate-in zoom-in duration-500 flex flex-col items-center">
            <div className="text-4xl mb-2">✨ 关系突破 ✨</div>
            <div className={`text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent ${getAffinityColor() === 'text-red-500' ? 'from-red-500 to-pink-600' : getAffinityColor() === 'text-purple-400' ? 'from-purple-400 to-indigo-500' : 'from-gray-500 to-blue-400'}`}>
              {showLevelUp.tier}
            </div>
            <div className="text-gray-400 text-sm mt-2">
              {showLevelUp.tier === AffinityTier.Acquaintance ? "她开始愿意听你多说几句了。" : "你对她而言，与众不同。"}
            </div>
          </div>
        </div>
      )}

      {/* GENERIC MODAL WRAPPER */}
      {activeModal !== 'none' && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={() => setActiveModal('none')}
        >
          <div 
            className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden relative"
            onClick={e => e.stopPropagation()} // Prevent close when clicking inside
          >
            {/* Modal Content Switch */}
            {activeModal === 'reset' && (
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-100 mb-2">重置对话</h3>
                <p className="text-gray-400 text-sm mb-6">确定要清空所有聊天记录、重置好感度以及她对你的印象吗？</p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setActiveModal('none')} className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors text-sm">取消</button>
                  <button onClick={performReset} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors text-sm font-medium">确定重置</button>
                </div>
              </div>
            )}

            {/* SIMPLIFIED AFFINITY MODAL (No Persona Text) */}
            {activeModal === 'affinity' && (
              <div className="flex flex-col">
                 <div className="relative h-32 bg-gradient-to-br from-gray-800 to-gray-900 flex flex-col items-center justify-center border-b border-gray-700 rounded-t-2xl">
                    <img src={BOT_AVATAR} className="w-16 h-16 rounded-full border-4 border-gray-800 shadow-2xl z-10" alt="avatar" />
                    <div className="mt-2 text-center">
                      <span className={`text-3xl font-bold ${getAffinityColor()}`}>{affinity}</span>
                      <span className="text-xs text-gray-500 uppercase tracking-wider ml-1">/ 100</span>
                    </div>
                 </div>
                 <div className="p-6 text-center">
                    <h3 className="text-lg font-bold text-white mb-2">当前关系</h3>
                    <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold border ${
                       currentTier === AffinityTier.Favored ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                       currentTier === AffinityTier.Acquaintance ? 'border-purple-500/30 text-purple-400 bg-purple-500/10' :
                       'border-blue-500/30 text-blue-400 bg-blue-500/10'
                    }`}>
                      {currentTier}
                    </div>
                    <p className="text-gray-400 text-xs mt-5 leading-relaxed">
                      {currentTier === AffinityTier.Stranger && "她对你还很陌生，回复往往简短冷漠。试着找点有趣的话题吧。"}
                      {currentTier === AffinityTier.Acquaintance && "由于你们已经熟识，她愿意花更多时间回复你，偶尔还会开开玩笑。"}
                      {currentTier === AffinityTier.Favored && "你是她特别在意的人。她会展现出不为人知的温柔（或者更猛烈的毒舌）。"}
                    </p>
                 </div>
              </div>
            )}

            {activeModal === 'impression' && (
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4 text-amber-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM6.97 15.03a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zm9.75 0a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zm-9.75 5.25a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zm9.75 0a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
                  </svg>
                  <h3 className="text-lg font-bold text-white">她对你的印象</h3>
                </div>
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                   <p className="text-gray-300 italic text-sm leading-relaxed">
                     "{impression}"
                   </p>
                </div>
                <p className="text-xs text-gray-500 mt-4 text-center">系统每隔10条对话会自动更新此评价</p>
              </div>
            )}
            
            {/* Close Button Generic */}
            <button 
              onClick={() => setActiveModal('none')}
              className="absolute top-3 right-3 text-gray-500 hover:text-white bg-gray-900/50 rounded-full p-1 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none h-16 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 flex items-center px-4 md:px-6 sticky top-0 z-40 select-none justify-between">
        
        {/* Left: Avatar + Name + Online Status + Persona Bubble */}
        <div className="flex items-center relative" ref={personaRef}>
          <div 
            className="relative cursor-pointer transition-transform hover:scale-105"
            onClick={() => setShowPersonaInfo(!showPersonaInfo)}
          >
            <img 
              src={BOT_AVATAR} 
              alt="秦清越" 
              className="w-10 h-10 rounded-full object-cover border border-gray-600 shadow-lg"
            />
            {/* Online Dot */}
            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-900 transition-colors duration-300 ${isTyping ? 'bg-purple-500 animate-pulse' : 'bg-green-500'}`}></div>
          </div>
          
          <div className="ml-3 flex flex-col justify-center">
             <div 
               className="flex items-center gap-1.5 cursor-pointer group" 
               onClick={() => setShowPersonaInfo(!showPersonaInfo)}
             >
                <h1 className="text-gray-100 font-semibold text-sm md:text-base tracking-wide group-hover:text-white transition-colors">秦清越</h1>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-500 group-hover:text-purple-400 transition-colors">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
             </div>
             <span className={`text-[10px] md:text-xs font-medium transition-colors duration-300 ${isTyping ? 'text-purple-400' : 'text-green-500'}`}>
                {isTyping ? '对方正在输入...' : '在线'}
             </span>
          </div>

          {/* Persona Info Bubble (Absolute Positioned) */}
          {showPersonaInfo && (
              <div className="absolute top-14 left-0 md:left-2 w-80 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl p-5 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-left">
                 <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">Character Profile</h3>
                 <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-sans custom-scrollbar max-h-[60vh] overflow-y-auto pr-1">
                    {PERSONA_DESCRIPTION}
                 </div>
                 {/* Close Hint for Mobile */}
                 <div className="md:hidden mt-3 pt-2 border-t border-gray-800 text-center">
                   <span className="text-[10px] text-gray-600">点击其他区域关闭</span>
                 </div>
              </div>
          )}
        </div>

        {/* Right: Actions (Heart, Star, Menu) */}
        <div className="flex items-center gap-1 md:gap-3">
          
          {/* Heart Icon (Affinity & Persona) */}
          <button 
             onClick={() => setActiveModal('affinity')}
             className={`p-2 hover:bg-white/5 rounded-full transition-all relative group ${getAffinityColor()}`}
             title="好感度 & 人设"
          >
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
             </svg>
             <span className="absolute -top-0.5 -right-0.5 bg-gray-900 text-[9px] font-bold px-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full border border-gray-700 shadow-sm leading-none">
               {affinity}
             </span>
          </button>
          
          {/* Impression Icon */}
          <button 
             onClick={() => setActiveModal('impression')}
             className="p-2 text-amber-500/80 hover:text-amber-400 hover:bg-amber-900/20 rounded-full transition-all relative group"
             title="用户印象"
          >
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM6.97 15.03a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zm9.75 0a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zm-9.75 5.25a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zm9.75 0a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
             </svg>
          </button>

          {/* Settings Menu */}
          <div className="relative" ref={menuRef}>
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
                  onClick={onResetRequest}
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