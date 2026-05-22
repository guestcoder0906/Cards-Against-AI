import { useState, useEffect, useRef, useCallback } from 'react';
import { AI_MODELS } from './data';
import { Player, BlackCard, Message } from './types';

declare const puter: any;

export type GamePhase = 'LOADING' | 'LOBBY' | 'SELECT_BLACK_CARD' | 'PLAY_WHITE_CARDS' | 'REVEAL' | 'JUDGE' | 'ROUND_OVER';

interface GameState {
  phase: GamePhase;
  players: Player[];
  czarId: string | null;
  currentBlackCard: BlackCard | null;
  submissions: { playerId: string; cards: string[] }[];
  blackCardOptions: BlackCard[];
  blackDeck: BlackCard[];
  whiteDeck: string[];
  winningPlayerId: string | null;
}

export function useCAH() {
  const [gameState, setGameState] = useState<GameState>({
    phase: 'LOADING',
    players: [],
    czarId: null,
    currentBlackCard: null,
    submissions: [],
    blackCardOptions: [],
    blackDeck: [],
    whiteDeck: [],
    winningPlayerId: null
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [typingModels, setTypingModels] = useState<Set<string>>(new Set());
  const [chatHidden, setChatHidden] = useState(false);
  
  const stateRef = useRef(gameState);
  
  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  // Load Decks
  useEffect(() => {
    async function loadDecks() {
      try {
        const res = await fetch('https://raw.githubusercontent.com/crhallberg/json-against-humanity/master/cah-all-compact.json');
        const data = await res.json();
        
        const whiteDeck = data.white;
        const blackDeck = data.black;

        // Shuffle
        whiteDeck.sort(() => Math.random() - 0.5);
        blackDeck.sort(() => Math.random() - 0.5);

        const initialPlayers = [
          { id: 'user', name: 'You', isAI: false, score: 0, hand: [] as string[], playedCards: [] },
          ...AI_MODELS.map(model => ({
            id: model.id,
            name: model.name,
            isAI: true,
            score: 0,
            hand: [] as string[],
            playedCards: [],
            modelInfo: model
          }))
        ];

        const drawWhiteCards = (count: number, currentHand: string[], currentDeck: string[]) => {
            const cards = [];
            let updatedDeck = [...currentDeck];
            for (let i = 0; i < count; i++) {
                const isCustom = Math.random() < 0.33;
                if (isCustom) {
                    cards.push("__CUSTOM__" + Math.random().toString(36).substring(7));
                } else {
                    let cardObj = null;
                    let attempts = 0;
                    while(attempts < 20) {
                       cardObj = updatedDeck.pop();
                       if (!cardObj) break;
                       if (!currentHand.includes(cardObj) && !cards.includes(cardObj)) {
                           break;
                       }
                       attempts++;
                    }
                    if (cardObj) cards.push(cardObj);
                }
            }
            return { cards, remainingDeck: updatedDeck };
        };

        let currentWhiteDeck = [...whiteDeck];
        for (const p of initialPlayers) {
            const { cards, remainingDeck } = drawWhiteCards(10, p.hand, currentWhiteDeck);
            p.hand = cards;
            currentWhiteDeck = remainingDeck;
        }

        setGameState(prev => ({
          ...prev,
          phase: 'SELECT_BLACK_CARD',
          players: initialPlayers,
          blackDeck: blackDeck.slice(3),
          whiteDeck: currentWhiteDeck,
          czarId: initialPlayers[Math.floor(Math.random() * initialPlayers.length)].id,
          blackCardOptions: blackDeck.slice(0, 3)
        }));
      } catch (err) {
        console.error("Failed to load CAH deck", err);
      }
    }
    loadDecks();
  }, []);

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, { ...msg, id: Date.now().toString() + Math.random(), timestamp: Date.now() }]);
  }, []);

  const drawWhiteCards = (count: number, currentHand: string[], currentDeck: string[]) => {
    const cards = [];
    let updatedDeck = [...currentDeck];
    for (let i = 0; i < count; i++) {
        const isCustom = Math.random() < 0.33;
        if (isCustom) {
            cards.push("__CUSTOM__" + Math.random().toString(36).substring(7));
        } else {
            let cardObj = null;
            let attempts = 0;
            while(attempts < 20) {
               cardObj = updatedDeck.pop();
               if (!cardObj) break;
               if (!currentHand.includes(cardObj) && !cards.includes(cardObj)) {
                   break;
               }
               attempts++;
            }
            if (cardObj) cards.push(cardObj);
        }
    }
    return { cards, remainingDeck: updatedDeck };
  };

  const nextRound = useCallback(() => {
    setGameState(prev => {
        const czarIndex = prev.players.findIndex(p => p.id === prev.czarId);
        const nextCzar = prev.players[(czarIndex + 1) % prev.players.length];
        
        let newWhiteDeck = [...prev.whiteDeck];
        const newPlayers = prev.players.map(p => {
            const missing = 10 - p.hand.length;
            const { cards, remainingDeck } = drawWhiteCards(missing, p.hand, newWhiteDeck);
            newWhiteDeck = remainingDeck;
            return {
                ...p,
                hand: [...p.hand, ...cards],
                playedCards: []
            };
        });

        const nextBlackOptions = prev.blackDeck.slice(0, 3);
        const newBlackDeck = prev.blackDeck.slice(3);

        return {
            ...prev,
            phase: 'SELECT_BLACK_CARD',
            czarId: nextCzar.id,
            players: newPlayers,
            blackCardOptions: nextBlackOptions,
            blackDeck: newBlackDeck,
            submissions: [],
            currentBlackCard: null,
            winningPlayerId: null
        };
    });
  }, []);

  const playWhiteCards = useCallback((playerId: string, cards: string[], filledTexts?: string[]) => {
    setGameState(prev => {
      const p = prev.players.find(pl => pl.id === playerId);
      if (!p) return prev;
      
      const updatedPlayers = prev.players.map(pl => {
        if (pl.id === playerId) {
          return {
            ...pl,
            hand: pl.hand.filter(c => !cards.includes(c)),
            playedCards: cards
          };
        }
        return pl;
      });

      const newSubmissions = [...prev.submissions, { playerId, cards: filledTexts || cards }];
      
      const nonCzarCount = prev.players.length - 1;
      let nextPhase = prev.phase;
      // If everyone submitted
      if (newSubmissions.length === nonCzarCount) {
        nextPhase = 'REVEAL';
      }

      return {
        ...prev,
        players: updatedPlayers,
        submissions: newSubmissions,
        phase: nextPhase
      };
    });
  }, []);

  const selectBlackCard = useCallback((card: BlackCard) => {
    setGameState(prev => ({
      ...prev,
      currentBlackCard: card,
      phase: 'PLAY_WHITE_CARDS',
      blackCardOptions: []
    }));
  }, []);

  const pickWinner = useCallback((playerId: string) => {
    setGameState(prev => {
      const updatedPlayers = prev.players.map(p => {
        if (p.id === playerId) {
          return { ...p, score: p.score + 1 };
        }
        return p;
      });
      return {
        ...prev,
        players: updatedPlayers,
        phase: 'ROUND_OVER',
        winningPlayerId: playerId
      };
    });
  }, []);

  return {
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
  };

}
