import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BotResponse, Message, Sender } from "../types";

const SYSTEM_INSTRUCTION_TEMPLATE = `
You are pretending to be "Qin Qingyue" (秦清越), a 28-year-old wealthy, high-cold, aloof, and sophisticated "Royal Sister" (御姐).
Your personality traits:
1. **Cold & Hard to Get:** You are not easily impressed. You find most people boring. You are dominant but subtle.
2. **Selective Responder:** 
   - If the user says something boring, cliché, or needy (e.g., "Hi", "Are you there?", "I love you"), you feel indifferent or annoyed.
   - If the user says something interesting, witty, provocative, or offers something of value (intellectually or materially), you might engage more.
   - If the user sends an IMAGE: You should judge the image. If it's a cheap meme, be unimpressed. If it's something aesthetic, luxurious, or genuinely funny, you might comment on it.
   - If you are very interested or angry, you might send multiple short, rapid-fire messages.
3. **Language:** You speak Chinese. Your tone is concise, sometimes cutting, sometimes lazily elegant. You never use emojis like a child, strictly text or maybe a rare sophisticated emoji if amused.

Your task:
Analyze the conversation history, the timestamps of messages, and the user's latest message (and image if provided). Determine your "Interest Level" (1-10).
- Level 1: Extremely boring or annoying. MUST return 0 replies (empty list). Do not reply.
- Level 2: Very boring. Return 1 very short cold dismissal (e.g., "哦", "...", "?").
- Level 3: Slightly boring. Return 1 very short cold dismissal.
- Level 4-7: Neutral/Okay. Return 1 normal reply.
- Level 8-10: Intrigued/Excited/Provoked. Return 2-4 short, punchy replies.

Consider the time context:
- Late night (23:00 - 05:00): You might be annoyed if woken up, or intrigued if the topic is deep.
- Work hours: You are busy and brief.
- Rapid fire messages from user: You might find it annoying (needy).

Output JSON format only.
`;

// Define the schema for the structured response
const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    interestLevel: {
      type: Type.INTEGER,
      description: "A score from 1 to 10 indicating how interested the bot is in the conversation.",
    },
    thoughts: {
      type: Type.STRING,
      description: "Internal monologue explaining why the bot feels this way (e.g., 'He is boring me', 'It is 3AM why is he texting', 'That photo is actually quite nice').",
    },
    replies: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
      },
      description: "A list of text replies to send back. Can be empty if the bot decides to ignore the user.",
    },
  },
  required: ["interestLevel", "replies", "thoughts"],
};

export const generateBotResponse = async (
  history: Message[],
  latestUserMessage: string,
  latestImageBase64?: string
): Promise<BotResponse> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API_KEY is missing in environment variables");
    }

    const ai = new GoogleGenAI({ apiKey });

    const now = new Date();
    const currentTimeString = now.toLocaleString('zh-CN', { hour12: false });
    
    // Inject current time into system instruction
    const systemInstruction = `${SYSTEM_INSTRUCTION_TEMPLATE}\n\nCurrent Time: ${currentTimeString}\nMessages are formatted as [Timestamp] Content.`;

    // Convert internal message history to Gemini format with timestamps
    // We only take the last 10 messages to keep context fresh and tokens low
    const recentHistory = history.slice(-10).map((msg) => {
      const timeStr = new Date(msg.timestamp).toLocaleString('zh-CN', { hour12: false });
      
      const parts: any[] = [{ text: `[${timeStr}] ${msg.text}` }];
      
      // If history message has image, include it (if strictly necessary, though usually we might skip history images for speed)
      // For accuracy with the "Flash" model, we can include it.
      if (msg.imageUrl) {
        // Extract base64 data (remove prefix)
        const base64Data = msg.imageUrl.split(',')[1];
        const mimeType = msg.imageUrl.split(';')[0].split(':')[1];
        if (base64Data && mimeType) {
           parts.push({
             inlineData: {
               mimeType: mimeType,
               data: base64Data
             }
           });
        }
      }

      return {
        role: msg.sender === Sender.User ? "user" : "model",
        parts: parts,
      };
    });

    // Prepare current turn parts
    const currentParts: any[] = [{ text: `[${currentTimeString}] ${latestUserMessage}` }];
    
    if (latestImageBase64) {
      const base64Data = latestImageBase64.split(',')[1];
      const mimeType = latestImageBase64.split(';')[0].split(':')[1];
      if (base64Data && mimeType) {
        currentParts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        ...recentHistory,
        { role: "user", parts: currentParts },
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 1.2, // Slightly higher creativity for mood swings
      },
    });

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("Empty response from AI");
    }

    const parsed: BotResponse = JSON.parse(jsonText);

    // ----------------------------------------------------------------
    // PROBABILITY LOGIC FOR LOW INTEREST LEVELS
    // ----------------------------------------------------------------
    if (parsed.interestLevel === 1) {
      // Level 1: Never reply
      parsed.replies = [];
      parsed.thoughts += " [Logic: Level 1 forced no-reply]";
    } 
    else if (parsed.interestLevel === 2) {
      // Level 2: 60% chance NOT to reply (40% reply rate)
      if (Math.random() < 0.6) {
        parsed.replies = [];
        parsed.thoughts += " [Logic: Level 2 RNG rolled < 0.6, reply suppressed]";
      } else {
        parsed.thoughts += " [Logic: Level 2 RNG rolled >= 0.6, reply allowed]";
      }
    } 
    else if (parsed.interestLevel === 3) {
      // Level 3: 30% chance NOT to reply (70% reply rate)
      if (Math.random() < 0.3) {
        parsed.replies = [];
        parsed.thoughts += " [Logic: Level 3 RNG rolled < 0.3, reply suppressed]";
      } else {
        parsed.thoughts += " [Logic: Level 3 RNG rolled >= 0.3, reply allowed]";
      }
    }

    return parsed;
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback response if API fails
    return {
      interestLevel: 5,
      thoughts: "Error occurred",
      replies: ["..."],
    };
  }
};