export interface Message {
  id: string;
  sender: string;
  model: string;
  text: string;
  reaction?: string;
  timestamp: number;
}

export interface AIModel {
  id: string;
  name: string;
  modelCode: string;
  themeColor: string;
  avatar: string;
  voice: any;
}

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  score: number;
  hand: string[];
  playedCards: string[];
  modelInfo?: AIModel;
}

export interface BlackCard {
  text: string;
  pick: number;
}
