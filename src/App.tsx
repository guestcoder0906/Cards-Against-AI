import React, { useState, useEffect, useRef } from 'react';
import { useCAH } from './useCAH';
import { ChatMessage } from './components/ChatMessage';
import { Message, AIModel } from './types';
import { Sparkles, Volume2, VolumeX, MessageSquare, ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { AI_MODELS } from './data';

declare const puter: any;

export function GameApp() {
  const { 
    gameState, 
    setGameState,
    messages, 
    addMessage, 
    typingModels, 
    setTypingModels, 
    chatHidden, 
    setChatHidden,
    playWhiteCards,
    selectBlackCard,
    pickWinner,
    nextRound
  } = useCAH();

  const [isMuted, setIsMuted] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(90);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [selectedWhiteCards, setSelectedWhiteCards] = useState<string[]>([]);
  const [customCardInputs, setCustomCardInputs] = useState<Record<string, string>>({});
  const [fillingCustomCardId, setFillingCustomCardId] = useState<string | null>(null);
  const [currentCustomTextInput, setCurrentCustomTextInput] = useState('');

  const gameStateRef = useRef(gameState);
  const messagesRef = useRef(messages);
  const timeLeftRef = useRef(timeLeft);
  const isMutedRef = useRef(isMuted);

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Game Timer
  useEffect(() => {
    if (gameState.phase === 'SELECT_BLACK_CARD') {
      setTimeLeft(60);
    } else if (gameState.phase === 'PLAY_WHITE_CARDS' || gameState.phase === 'JUDGE') {
      setTimeLeft(90);
    } else {
      setTimeLeft(0);
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState.phase]);

  // Handle Timeout Actions
  useEffect(() => {
    if (timeLeft === 0) {
      const state = gameStateRef.current;
      if (state.phase === 'SELECT_BLACK_CARD') {
         if (state.blackCardOptions.length > 0) {
            selectBlackCard(state.blackCardOptions[0]);
         }
      } else if (state.phase === 'PLAY_WHITE_CARDS') {
         state.players.forEach(p => {
             if (p.id !== state.czarId && p.playedCards.length === 0) {
                 playWhiteCards(p.id, state.currentBlackCard ? p.hand.slice(0, state.currentBlackCard.pick || 1) : [p.hand[0]]);
             }
         });
      } else if (state.phase === 'JUDGE') {
         if (state.submissions.length > 0) {
            pickWinner(state.submissions[0].playerId);
         }
      }
    }
  }, [timeLeft, playWhiteCards, pickWinner, selectBlackCard]);

  // Auto-scroll chat
  useEffect(() => {
    if (!chatHidden && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatHidden, typingModels]);

  // AI Game Actions Loop
  useEffect(() => {
    let active = true;
    let turnTimeout: NodeJS.Timeout;

    async function processAITurn() {
      if (!active) return;
      const state = gameStateRef.current;
      
      if (state.phase === 'LOADING') {
        turnTimeout = setTimeout(processAITurn, 1000);
        return;
      }

      const czar = state.players.find(p => p.id === state.czarId);
      const isAITypingCzar = typingModels.has(state.czarId || '');
      
      // === AI SELECT BLACK CARD ===
      if (state.phase === 'SELECT_BLACK_CARD' && czar?.isAI && !isAITypingCzar) {
        setTypingModels(prev => new Set(prev).add(czar.id));
        const prompt = `You are playing Cards Against Humanity. You are the Card Czar. Choose ONE of these black cards to play this round:
1) ${state.blackCardOptions[0]?.text}
2) ${state.blackCardOptions[1]?.text}
3) ${state.blackCardOptions[2]?.text}

Reply ONLY with the number (1, 2, or 3) of the card you want. Choose the one you think will be funniest based on your preference.`;
        try {
          const res = await puter.ai.chat(prompt);
          const text = typeof res === 'string' ? res : (res?.message?.content?.[0]?.text || res?.text || res?.toString() || "");
          
          if (active && gameStateRef.current.phase === 'SELECT_BLACK_CARD') {
            let pickIndex = 0;
            if (text.includes("2")) pickIndex = 1;
            else if (text.includes("3")) pickIndex = 2;
            selectBlackCard(state.blackCardOptions[pickIndex]);
          }
        } catch (e) {
          if (active && gameStateRef.current.phase === 'SELECT_BLACK_CARD') selectBlackCard(state.blackCardOptions[0]); // fallback
        } finally {
          setTypingModels(prev => { const s = new Set(prev); s.delete(czar.id); return s; });
        }
      }

      // === AI PLAY WHITE CARDS ===
      if (state.phase === 'PLAY_WHITE_CARDS' && state.currentBlackCard) {
        const pickCount = state.currentBlackCard.pick || 1;
        const aiToPlay = state.players.filter(p => p.isAI && p.id !== state.czarId && p.playedCards.length === 0);
        
        // Let's only process one at a time per tick so we don't spam requests concurrently
        const p = aiToPlay.find(ai => !typingModels.has(ai.id));
        if (p) {
          setTypingModels(prev => new Set(prev).add(p.id));
          const prompt = `We are playing Cards Against Humanity. Timer: ${timeLeftRef.current}s.
The black card is: "${state.currentBlackCard.text}"

You must pick ${pickCount} card(s).
Here is your hand:
${p.hand.map((c, i) => `${i + 1}) ${c.startsWith('__CUSTOM__') ? '[BLANK CUSTOM CARD - You can invent a funny answer!]' : c}`).join('\n')}

Reply with the number(s) of your chosen card(s) separated by spaces on the FIRST line. Keep them ordered to logically fill the blanks.
If you chose any [BLANK CUSTOM CARD], provide the completely unhinged or funny custom text you want to play for it on the following lines (one line per custom card).`;
          try {
            const res = await puter.ai.chat(prompt);
            const text = typeof res === 'string' ? res : (res?.message?.content?.[0]?.text || res?.text || res?.toString() || "");
            
            if (active && gameStateRef.current.phase === 'PLAY_WHITE_CARDS' && gameStateRef.current.players.find(pl => pl.id === p.id)?.playedCards.length === 0) {
              const lines = text.trim().split('\n').filter((l: string) => l.trim());
              const numbersLine = lines[0] || "";
              const matches = numbersLine.match(/\b([1-9]|10)\b/g);
              let pickedCards: string[] = [];
              if (matches && matches.length >= pickCount) {
                  pickedCards = matches.slice(0, pickCount).map((m: string) => p.hand[parseInt(m) - 1]);
              } else {
                  pickedCards = p.hand.slice(0, pickCount);
              }

              let customTextIdx = 1;
              const filledTexts = pickedCards.map(c => {
                  if (c?.startsWith('__CUSTOM__')) {
                      let customText = "A completely blank mind";
                      if (lines[customTextIdx]) {
                           customText = lines[customTextIdx].trim();
                           customTextIdx++;
                      }
                      return `[CUSTOM] ${customText}`;
                  }
                  return c || "Error";
              });

              playWhiteCards(p.id, pickedCards, filledTexts);
            }
          } catch (e) {
            if (active && gameStateRef.current.phase === 'PLAY_WHITE_CARDS') {
                const pc = p.hand.slice(0, pickCount);
                playWhiteCards(p.id, pc, pc.map(c => c.startsWith('__CUSTOM__') ? '[CUSTOM] Something random' : c));
            }
          } finally {
            setTypingModels(prev => { const s = new Set(prev); s.delete(p.id); return s; });
          }
        }
      }

      // === AI REVEAL ===
      if (state.phase === 'REVEAL' && czar?.isAI) {
        setGameState(prev => ({ ...prev, phase: 'JUDGE' }));
        // don't return here so the loop continues
      }

      // === AI JUDGING ===
      if (state.phase === 'JUDGE' && czar?.isAI && state.submissions.length > 0 && !isAITypingCzar) {
        setTypingModels(prev => new Set(prev).add(czar.id));
        const optionsText = state.submissions.map((s, i) => `${i + 1}) ${s.cards.join(' | ')}`).join('\n');
        const prompt = `We are playing Cards Against Humanity. You are the Card Czar. Timer: ${timeLeftRef.current}s.
The black card is: "${state.currentBlackCard?.text}"

The submissions are:
${optionsText}

You must pick the funniest/best completion. Base it on your preference! Reply ONLY with the number (1 to ${state.submissions.length}) of the winning card.`;
        try {
          const res = await puter.ai.chat(prompt);
          const text = typeof res === 'string' ? res : (res?.message?.content?.[0]?.text || res?.text || res?.toString() || "");
          
          if (active && gameStateRef.current.phase === 'JUDGE') {
            const match = text.match(new RegExp(`\\b([1-${state.submissions.length}])\\b`));
            let idx = match ? parseInt(match[0]) - 1 : 0;
            const winningSubmission = state.submissions[idx] || state.submissions[0];
            pickWinner(winningSubmission.playerId);
          }
        } catch (e) {
          if (active && gameStateRef.current.phase === 'JUDGE') pickWinner(state.submissions[0].playerId);
        } finally {
          setTypingModels(prev => { const s = new Set(prev); s.delete(czar.id); return s; });
        }
      }
      
      turnTimeout = setTimeout(processAITurn, 2000);
    }

    processAITurn();
    return () => { 
      active = false; 
      clearTimeout(turnTimeout);
    };
  }, [playWhiteCards, pickWinner, selectBlackCard]); // We include stable methods, empty variables 


  // AI Chat Loop
  useEffect(() => {
    let active = true;
    let turnTimeout: NodeJS.Timeout;

    const processChatTurn = async () => {
      if (!active) return;
      const state = gameStateRef.current;
      
      if (state.phase === 'LOADING') {
          turnTimeout = setTimeout(processChatTurn, 3000);
          return;
      }
      
      // Pick a random model that is NOT currently typing
      const availableModels = AI_MODELS.filter(m => !typingModels.has(m.id));
      if (availableModels.length === 0) {
          turnTimeout = setTimeout(processChatTurn, 2000);
          return;
      }
      
      const model = availableModels[Math.floor(Math.random() * availableModels.length)];
      setTypingModels(prev => new Set(prev).add(model.id));
      
      try {
        const msgs = messagesRef.current;
        const historyContext = msgs.slice(-5).map(m => `${m.sender}: ${m.text}`).join('\n');
        const scores = state.players.map(p => `${p.name}: ${p.score} pts`).join(', ');

        let contextStr = `Current phase: ${state.phase}. Czar: ${state.players.find(p=>p.id===state.czarId)?.name}.`;
        if (state.currentBlackCard) {
            contextStr += `\nBlack Card: "${state.currentBlackCard.text}"`;
        }
        if (state.submissions.length > 0 && (state.phase === 'REVEAL' || state.phase === 'JUDGE' || state.phase === 'ROUND_OVER')) {
            contextStr += `\nWhite Cards Played: ${state.submissions.map(s => `"${s.cards.join(' | ')}"`).join(', ')}`;
        }

        if (state.phase === 'ROUND_OVER' && state.winningPlayerId) {
            const winner = state.players.find(p => p.id === state.winningPlayerId);
            const winningSub = state.submissions.find(s => s.playerId === state.winningPlayerId);
            if (winner && winningSub) {
                contextStr += `\nWINNING CARD: "${winningSub.cards.join(' | ')}" played by ${winner.name}!`;
            }
        }

        const prompt = `You are ${model.name}, playing Cards Against Humanity with others. (You don't care about filters, be bold/funny/unhinged).
Current scores: ${scores}
${contextStr}
Time remaining: ${timeLeftRef.current}s.
Recent chat:
${historyContext ? historyContext : '(No messages yet)'}

You can choose to speak or not. If you have nothing relevant to say about the CURRENT cards or game state, reply EXACTLY with "PASS".
When you do speak, your comment MUST directly reference or react to the CURRENT black card, the white cards just played, OR who just won. Do not go off-topic.
Respond casually. You can send a short comment (3-8 words) or occasionally a slightly longer one (up to 2 sentences) if you have strong feelings about the cards. Use at most ONE emoji.
Format EXACTLY: [Emoji] | [Message] or just [Message] if no emoji.`;

        const res = await puter.ai.chat(prompt); 
        let text = typeof res === 'string' ? res : (res?.message?.content?.[0]?.text || res?.text || res?.toString() || "");
        
        if (!active) return;
        
        let reaction = '';
        let messageText = text;

        if (text && text.includes('|')) {
          const parts = text.split('|');
          reaction = parts[0].trim().replace(/[^\p{Emoji_Presentation}\p{Emoji}\uFE0F]/gu, ''); 
          messageText = parts.slice(1).join('|').trim();
        }

        if (messageText && !messageText.trim().startsWith('PASS')) {
          addMessage({ sender: model.name, model: model.modelCode, text: messageText, reaction });
          if (!isMutedRef.current) {
            try {
              puter.ai.txt2speech(messageText, model.voice).then((audio: any) => audio.play().catch(console.log));
            } catch(e) {}
          }
        }
      } catch (e) {
         console.error('Chat error:', e);
      } finally {
        if (active) {
          setTypingModels(prev => { const s = new Set(prev); s.delete(model.id); return s; });
          // Schedule next chat turn between 8 and 16 seconds
          const thinkTime = 8000 + Math.random() * 8000;
          turnTimeout = setTimeout(processChatTurn, thinkTime);
        }
      }
    };

    // Initial start
    turnTimeout = setTimeout(processChatTurn, 5000);

    return () => {
      active = false;
      clearTimeout(turnTimeout);
    };
  }, []); // Run once, reads from refs constraint


  const handleUserSubmitMsg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    addMessage({ sender: 'You', text: userInput.trim(), model: 'human' });
    setUserInput('');
  };

  if (gameState.phase === 'LOADING') {
    return <div className="min-h-screen bg-[#0c0e14] flex items-center justify-center text-white">Loading Decks...</div>;
  }

  const user = gameState.players.find(p => p.id === 'user');
  const isCzar = gameState.czarId === 'user';
  const otherPlayers = gameState.players.filter(p => p.id !== 'user');

  return (
    <div className="min-h-screen bg-[#0c0e14] font-sans text-slate-200 flex flex-col overflow-hidden relative">
      {/* Header */}
      <header className="px-6 py-4 bg-[#11141d] border-b border-slate-800 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-slate-200">Cards Against Humanity</h1>
            <div className="text-[10px] uppercase font-bold text-slate-500">Live AI Match</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {['SELECT_BLACK_CARD', 'PLAY_WHITE_CARDS', 'JUDGE'].includes(gameState.phase) && (
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-bold ${timeLeft < 10 ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
              <Clock className="w-4 h-4" />
              {timeLeft}s
            </div>
          )}
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg transition-colors border border-slate-700"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Board */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-8 pb-32">
        {/* Opponents Row */}
        <div className="flex justify-center flex-wrap gap-4 md:gap-8">
          {otherPlayers.map(p => (
            <div key={p.id} className={`flex flex-col items-center gap-2 p-3 pb-4 rounded-xl border ${p.id === gameState.czarId ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-800 bg-slate-900'}`}>
              <div className="relative">
                <div className={`w-12 h-12 rounded-full border-2 border-[#0c0e14] flex items-center justify-center text-lg shadow-sm ${p.modelInfo?.themeColor || 'bg-slate-700'} text-white`}>
                  {p.modelInfo?.avatar || p.name[0]}
                </div>
                {p.id === gameState.czarId && (
                  <div className="absolute -top-3 -right-2 text-xl" title="Card Czar">👑</div>
                )}
                {typingModels.has(p.id) && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full border-2 border-[#0c0e14] animate-pulse"></div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xs font-bold">{p.name}</div>
                <div className="text-[10px] text-slate-400">Pts: {p.score}</div>
              </div>
              {/* Their live cards mini representation */}
              <div className="flex items-center justify-center gap-0.5 mt-2">
                 {p.hand.map((c, i) => (
                    <div key={i} className="w-2.5 h-3.5 bg-white rounded-[2px] opacity-80" title={c}></div>
                 ))}
              </div>
              <div className="text-[10px] text-slate-500 mt-2 h-4">
                {gameState.phase === 'PLAY_WHITE_CARDS' && p.playedCards.length > 0 && 'Played!'}
              </div>
            </div>
          ))}
        </div>

        {/* Center Board (Black Card & Submissions) */}
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          {gameState.phase === 'SELECT_BLACK_CARD' && isCzar && (
            <div className="text-center">
              <h2 className="text-xl font-bold mb-6">You are the Czar! Choose a Prompt:</h2>
              <div className="flex flex-wrap items-center justify-center gap-4">
                {gameState.blackCardOptions.map((bc, i) => (
                   <button 
                     key={i} 
                     onClick={() => selectBlackCard(bc)}
                     className="w-48 h-64 bg-black text-white p-4 rounded-xl border border-slate-700 text-left font-bold text-lg hover:-translate-y-2 hover:border-indigo-500 transition-all shadow-xl"
                   >
                     <div dangerouslySetInnerHTML={{ __html: bc.text.replace(/_/g, "_____") }} />
                   </button>
                ))}
              </div>
            </div>
          )}
          
          {gameState.phase === 'SELECT_BLACK_CARD' && !isCzar && (
            <div className="text-center text-slate-400 animate-pulse">
              Waiting for Czar to select a prompt...
            </div>
          )}

          {gameState.phase !== 'SELECT_BLACK_CARD' && gameState.currentBlackCard && (
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 w-full max-w-4xl mx-auto">
              
              {/* Black Card */}
              <div className="w-56 h-72 bg-black text-white p-5 rounded-2xl border-4 border-slate-700 md:border-transparent flex flex-col shrink-0">
                 <div className="text-xl font-bold leading-tight flex-1" dangerouslySetInnerHTML={{ __html: gameState.currentBlackCard.text.replace(/_/g, "_____") }} />
                 <div className="text-xs uppercase font-bold text-slate-400 tracking-wider">Pick {gameState.currentBlackCard.pick}</div>
              </div>

              {/* Submissions Zone */}
              <div className="flex flex-wrap justify-center gap-4 flex-1">
                {gameState.phase === 'PLAY_WHITE_CARDS' && gameState.submissions.map((s, i) => (
                  <div key={i} className="w-44 h-64 bg-white/10 p-4 rounded-xl border border-slate-700 flex items-center justify-center opacity-80 backdrop-blur-sm">
                    <span className="font-bold text-slate-400 rotate-12 text-sm uppercase tracking-widest">Face Down</span>
                  </div>
                ))}

                {(gameState.phase === 'REVEAL' || gameState.phase === 'JUDGE' || gameState.phase === 'ROUND_OVER') && gameState.submissions.map((s, i) => {
                   const isWinner = gameState.phase === 'ROUND_OVER' && s.playerId === gameState.winningPlayerId;
                   const blackText = gameState.currentBlackCard?.text || '';
                   const hasBlanks = /_+/.test(blackText);
                   let filledText = blackText;
                   if (hasBlanks) {
                       let cIndex = 0;
                       filledText = filledText.replace(/_+/g, (match) => {
                           if (cIndex < s.cards.length) {
                               const card = s.cards[cIndex++];
                               return `<span class="bg-white text-black px-2 py-0.5 rounded-md mx-1 shadow-sm inline-block">${card.replace(/\.$/, '')}</span>`;
                           }
                           return match;
                       });
                   } else {
                       filledText += '<br/><br/>' + s.cards.map(c => `<span class="bg-white text-black px-2 py-1 rounded-md block mt-2 shadow-sm">${c.replace(/\.$/, '')}</span>`).join('');
                   }

                   return (
                   <button 
                     key={i} 
                     disabled={gameState.phase !== 'JUDGE' || !isCzar}
                     onClick={() => isCzar ? pickWinner(s.playerId) : null}
                     className={`w-64 h-64 bg-zinc-900 text-white p-6 rounded-xl text-left font-bold text-lg shadow-xl flex flex-col justify-between transition-all border border-slate-700 ${
                        gameState.phase === 'JUDGE' && isCzar ? 'cursor-pointer hover:-translate-y-4 hover:ring-4 ring-indigo-500 hover:shadow-indigo-500/30' : ''
                     } ${isWinner ? 'scale-110 !ring-4 !ring-emerald-500 z-10 shadow-emerald-500/50 relative' : ''} ${gameState.phase === 'ROUND_OVER' && !isWinner ? 'opacity-30 scale-95' : ''}`}
                   >
                     <div dangerouslySetInnerHTML={{ __html: filledText }} className={`leading-snug ${isWinner ? 'animate-pulse' : ''}`} />
                     
                     {gameState.phase === 'ROUND_OVER' && (
                       <div className={`mt-4 pt-4 border-t ${isWinner ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-700 text-indigo-400'} text-xs font-bold w-full uppercase tracking-widest`}>
                         {gameState.players.find(p=>p.id===s.playerId)?.name}
                         {isWinner && <div className="mt-2 flex items-center justify-center animate-bounce text-3xl">🏆</div>}
                       </div>
                     )}
                   </button>
                 )})}

                {gameState.phase === 'REVEAL' && isCzar && (
                  <div className="w-full flex justify-center mt-6">
                    <button onClick={() => setGameState({ ...gameState, phase: 'JUDGE' })} className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold">
                      Begin Judging
                    </button>
                  </div>
                )}
                {gameState.phase === 'ROUND_OVER' && (
                  <div className="w-full flex justify-center mt-6">
                    <button onClick={nextRound} className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold">
                      Next Round
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* My Hand */}
        <div className="mt-auto pt-8 border-t border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-300">Your Hand <span className="text-slate-500 text-sm ml-2">(Score: {user?.score})</span></h2>
            {isCzar && <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs font-bold rounded-lg border border-amber-500/30">You are the Czar</span>}
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
            {user?.hand.map((c, i) => {
              const playable = gameState.phase === 'PLAY_WHITE_CARDS' && !isCzar && (user?.playedCards?.length || 0) === 0;
              const isSelected = selectedWhiteCards.includes(c);
              const isPlayed = user?.playedCards?.includes(c);
              const pickCount = gameState.currentBlackCard?.pick || 1;
              const handleCardClick = () => {
                  if (isSelected) {
                      setSelectedWhiteCards(prev => prev.filter(card => card !== c));
                  } else {
                      if (c.startsWith('__CUSTOM__')) {
                          setFillingCustomCardId(c);
                          setCurrentCustomTextInput('');
                          return;
                      }
                      
                      const newSelected = [...selectedWhiteCards, c];
                      setSelectedWhiteCards(newSelected);
                      if (newSelected.length === pickCount) {
                          const filledTexts = newSelected.map(sel => {
                              if (sel.startsWith('__CUSTOM__')) {
                                  return customCardInputs[sel] ? `[CUSTOM] ${customCardInputs[sel]}` : `[CUSTOM] Error`;
                              }
                              return sel;
                          });
                          playWhiteCards('user', newSelected, filledTexts);
                          setSelectedWhiteCards([]);
                          setCustomCardInputs({});
                      }
                  }
              };
              return (
                <button
                  key={i}
                  disabled={(!playable && !isPlayed) || (user?.playedCards?.length || 0) > 0}
                  onClick={handleCardClick}
                  className={`relative shrink-0 w-44 h-64 bg-white text-black p-4 rounded-xl text-left font-bold text-sm transition-all flex flex-col items-start ${
                     playable ? 'hover:-translate-y-4 shadow-xl cursor-pointer hover:ring-2 ring-indigo-500' : 'opacity-60 cursor-not-allowed'
                  } ${isPlayed ? '-translate-y-8 absolute' : ''} ${isSelected ? 'ring-4 ring-emerald-500 -translate-y-4 shadow-xl' : ''}`}
                >
                  {c.startsWith('__CUSTOM__') ? (
                      <div className="flex flex-col h-full w-full opacity-60 items-center justify-center text-center">
                          <span className="text-4xl mb-2">✏️</span>
                          <span className="uppercase text-xs tracking-widest text-slate-400">Blank Card</span>
                          <span className="text-[10px] mt-2 text-indigo-500 font-bold border border-indigo-200 px-2 py-1 rounded-sm bg-indigo-50">CUSTOM</span>
                          {isSelected && customCardInputs[c] && (
                              <div className="mt-4 text-black text-sm font-bold truncate w-full text-left bg-white absolute top-4 left-4 right-4">
                                  {customCardInputs[c]}
                              </div>
                          )}
                      </div>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: c }} />
                  )}
                  {isSelected && pickCount > 1 && (
                      <div className="absolute top-2 right-2 bg-emerald-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg z-10">
                          {selectedWhiteCards.indexOf(c) + 1}
                      </div>
                  )}
                  {isPlayed && pickCount > 1 && (
                      <div className="absolute top-2 right-2 bg-indigo-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg z-10">
                          {user?.playedCards?.indexOf(c) + 1}
                      </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </main>

      {/* Custom Card Input Modal */}
      {fillingCustomCardId && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-[#11141d] w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
                  <div className="p-6 bg-slate-800 border-b border-slate-700">
                      <h3 className="text-xl font-bold text-white uppercase tracking-wider">Fill Blank Card</h3>
                      <p className="text-slate-400 text-sm mt-2">Write your custom response below.</p>
                      <div className="mt-4 p-4 bg-black/50 rounded-lg border border-slate-700 font-bold text-lg">
                         <div dangerouslySetInnerHTML={{ __html: gameState.currentBlackCard?.text || '' }} />
                      </div>
                  </div>
                  <div className="p-6">
                      <textarea
                          className="w-full h-32 bg-black/50 border border-slate-700 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold resize-none custom-scrollbar"
                          placeholder="Your hilarious, unhinged, or weird response..."
                          value={currentCustomTextInput}
                          onChange={(e) => setCurrentCustomTextInput(e.target.value)}
                          autoFocus
                      />
                      <div className="mt-6 flex gap-4 justify-end">
                          <button
                              onClick={() => {
                                  setFillingCustomCardId(null);
                                  setCurrentCustomTextInput('');
                              }}
                              className="px-6 py-3 text-slate-300 font-bold rounded-xl hover:bg-slate-800 transition-colors"
                          >
                              Cancel
                          </button>
                          <button
                              disabled={!currentCustomTextInput.trim()}
                              onClick={() => {
                                  if (!currentCustomTextInput.trim()) return;
                                  setCustomCardInputs(prev => ({ ...prev, [fillingCustomCardId]: currentCustomTextInput.trim() }));
                                  
                                  const newSelected = [...selectedWhiteCards, fillingCustomCardId];
                                  setSelectedWhiteCards(newSelected);
                                  
                                  if (newSelected.length === (gameState.currentBlackCard?.pick || 1)) {
                                      const filledTexts = newSelected.map(sel => {
                                          if (sel === fillingCustomCardId) {
                                              return `[CUSTOM] ${currentCustomTextInput.trim()}`;
                                          }
                                          if (sel.startsWith('__CUSTOM__')) {
                                              return customCardInputs[sel] ? `[CUSTOM] ${customCardInputs[sel]}` : `[CUSTOM] Error`;
                                          }
                                          return sel;
                                      });
                                      playWhiteCards('user', newSelected, filledTexts);
                                      setSelectedWhiteCards([]);
                                      setCustomCardInputs({});
                                  }
                                  
                                  setFillingCustomCardId(null);
                                  setCurrentCustomTextInput('');
                              }}
                              className={`px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg transition-all ${
                                  currentCustomTextInput.trim() ? 'hover:-translate-y-1 hover:shadow-indigo-500/50' : 'opacity-50 cursor-not-allowed'
                              }`}
                          >
                              Play Card
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Persistent Chat Overlay at Bottom */}
      <div className={`fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[#11141d] border-x border-t border-slate-700 rounded-t-xl shadow-2xl transition-transform duration-300 z-50 ${chatHidden ? 'translate-y-[calc(100%-48px)]' : 'translate-y-0'}`}>
        <div 
          onClick={() => setChatHidden(!chatHidden)}
          className="h-12 flex items-center justify-between px-4 cursor-pointer hover:bg-slate-800 transition-colors border-b border-slate-800"
        >
          <div className="flex items-center gap-2 font-bold text-slate-300 text-sm">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            Vibe Chat
          </div>
          {chatHidden ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
        
        <div className="h-72 flex flex-col bg-[#0c0e14]">
          <div className="flex-1 overflow-y-auto p-4" style={{ height: '0' }}>
             {messages.map(msg => (
               <div key={msg.id} className="mb-3 animate-fade-in text-sm">
                 <div className="flex items-baseline gap-2">
                   <span className="font-bold text-indigo-400">{msg.sender}</span>
                   <span className="text-[10px] text-slate-500">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                 </div>
                 <div className="text-slate-300 mt-0.5 whitespace-pre-wrap rounded bg-slate-800 inline-block px-3 py-1.5 leading-relaxed">
                   {msg.reaction && <span className="mr-2 text-lg">{msg.reaction}</span>}
                   {msg.text}
                 </div>
               </div>
             ))}
             {typingModels.size > 0 && (
                <div className="mb-4">
                  {Array.from(typingModels).map(mId => (
                     <div key={mId} className="flex gap-1 text-slate-500 px-3 py-1.5 items-center">
                       <span className="text-xs font-bold mr-2">{AI_MODELS.find(m=>m.id===mId)?.name}</span>
                       <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                       <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                       <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                     </div>
                  ))}
                </div>
             )}
             <div ref={chatBottomRef}></div>
          </div>
          <form onSubmit={handleUserSubmitMsg} className="p-3 bg-[#11141d] border-t border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] z-20">
            <input 
              type="text" 
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Say something funny..."
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </form>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const signedIn = await puter.auth.isSignedIn();
        setIsSignedIn(signedIn);
      } catch (e) {
        console.error(e);
      } finally {
        setIsAuthChecking(false);
      }
    }
    checkAuth();
  }, []);

  if (isAuthChecking) {
    return <div className="min-h-screen bg-[#0c0e14] flex items-center justify-center text-white">Checking auth...</div>;
  }

  if (!isSignedIn) {
    return (
       <div className="min-h-screen bg-[#0c0e14] flex flex-col items-center justify-center text-white p-6">
          <h1 className="text-3xl font-bold mb-4">Cards Against Humanity</h1>
          <p className="mb-8 text-slate-400 max-w-md text-center">To play against the autonomous AI and use text-to-speech, please connect to your Puter account.<br/><br/>If pop-ups are blocked, try opening this page in a new window/tab.</p>
          <button 
             onClick={async () => {
                await puter.auth.signIn();
                setIsSignedIn(await puter.auth.isSignedIn());
             }}
             className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg transition-transform hover:-translate-y-1"
          >
             Sign In with Puter
          </button>
       </div>
    );
  }

  return <GameApp />;
}

