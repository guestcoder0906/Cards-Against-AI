import { AIModel } from './types';

export const AI_MODELS: AIModel[] = [
  {
    id: 'gpt',
    name: 'gpt-5.5',
    modelCode: 'openai/gpt-5.5',
    themeColor: 'bg-emerald-600',
    avatar: 'G5',
    voice: { voice: 'Matthew', engine: 'generative', language: 'en-US' }
  },
  {
    id: 'claude',
    name: 'claude-opus-4.6',
    modelCode: 'anthropic/claude-opus-4-6',
    themeColor: 'bg-amber-600',
    avatar: 'C4',
    voice: { voice: 'Ruth', engine: 'generative', language: 'en-US' }
  },
  {
    id: 'gemini',
    name: 'gemini-3.5-flash',
    modelCode: 'google/gemini-3.5-flash',
    themeColor: 'bg-indigo-600',
    avatar: 'G3',
    voice: { provider: 'gemini', model: 'gemini-3.1-flash-tts-preview', voice: 'Puck' }
  },
  {
    id: 'grok',
    name: 'grok-4.1',
    modelCode: 'x/grok-4-1',
    themeColor: 'bg-slate-700',
    avatar: 'X4',
    voice: { provider: 'xai', voice: 'rex' }
  }
];
