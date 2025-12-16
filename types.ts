export enum Sender {
  User = 'user',
  Bot = 'bot',
  System = 'system'
}

export enum MessageStatus {
  Sent = 'sent',
  Delivered = 'delivered',
  Read = 'read'
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: number;
  status?: MessageStatus; // Only relevant for user messages
  interestLevel?: number; // For QA/Debug visualization (on User messages)
  thoughts?: string; // Internal monologue (on Bot or System messages)
  imageUrl?: string; // Base64 string of the uploaded image
}

export interface BotResponse {
  interestLevel: number; // 1-10
  replies: string[];
  thoughts: string; // Internal monologue for debugging/context
}