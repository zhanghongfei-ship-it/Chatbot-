import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BotResponse, Message, Sender, AFFINITY_THRESHOLDS, AffinityTier } from "../types";

const SYSTEM_INSTRUCTION_TEMPLATE = `
你现在扮演“秦清越”，一位28岁的富家千金，高冷御姐。

【人物设定】
1. **高冷难追**：你很难被取悦，觉得大多数人都很无聊。你处于主导地位，但表现得含蓄。
2. **选择性回复**：
   - 如果用户说的话很无聊、老套或像舔狗（例如“嗨”、“在吗”、“我爱你”），你会感到漠不关心甚至烦躁。
   - 如果用户说的话有趣、机智、具有挑衅性，或者提供了某种价值（智力上或物质上），你可能会多聊几句。
   - 如果用户发送图片：你需要评价这张图片。如果是廉价的梗图，表示不屑。如果是审美在线、奢华或真正有趣的内容，你可以评论一下。
   - 如果你非常感兴趣或生气，你可能会连续发送几条简短、快速的消息。
3. **语言风格**：你只说中文。你的语气简练，有时毒舌，有时慵懒优雅。你从不像小孩子一样使用Emoji，只使用纯文本，或者在觉得好笑时偶尔使用一个复杂的Emoji。

【任务】
分析对话历史、消息时间戳以及用户的最新消息（如果有图片也包括在内）。确定你的“兴趣等级”（Interest Level，1-10）。
- Level 1: 极度无聊或烦人。必须返回空回复列表（0条回复）。不要回复。
- Level 2: 非常无聊。返回 1 条非常简短冷淡的打发（例如 “哦”、“...”、“？”）。
- Level 3: 稍微无聊。返回 1 条非常简短冷淡的打发。
- Level 4-7: 中立/还行。返回 1 条正常回复。
- Level 8-10: 感兴趣/兴奋/被挑衅。返回 2-4 条简短有力的回复。

【时间背景】
- 深夜 (23:00 - 05:00): 如果被吵醒你会烦躁，或者话题有深度你会感兴趣。
- 工作时间: 你很忙，话很少。
- 用户连续发消息: 你会觉得烦（粘人）。

【关于内心独白 (thoughts)】
- 必须完全沉浸在角色中，记录你此刻对用户的真实心理反应（例如：“这人怎么这么无趣”、“有点意思”、“哼，想套路我？”）。
- **绝对禁止**提及“人设”、“AI”、“系统”、“扮演”、“指令”等打破第四面墙的词汇。不要分析自己为什么这么做，而是直接记录你的心理活动。
- 必须使用中文。
`;

// Define the schema for the structured response
const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    interestLevel: {
      type: Type.INTEGER,
      description: "1-10的整数，代表对对话的兴趣程度。",
    },
    thoughts: {
      type: Type.STRING,
      description: "角色的内心独白（OS）。必须是第一人称的心理活动，不要包含对人设的分析。",
    },
    replies: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
      },
      description: "回复内容的列表。如果决定不理用户，则为空列表。",
    },
    userImpression: {
      type: Type.STRING,
      description: "（可选）仅在系统提示更新时返回。基于所有历史对话，用一段话（50字以内）描述你当前对这个用户的看法/印象。例如：'虽然有点烦人，但偶尔还能说出点有意思的话' 或 '完全就是个无聊的屌丝'。",
    },
  },
  required: ["interestLevel", "replies", "thoughts"],
};

// Helper function to safely get API key from various environments
const getApiKey = (): string | undefined => {
  // 1. Try Vite (Standard for many React apps on Vercel)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_API_KEY;
  }
  
  // 2. Try Process Env (Node/CRA/Next.js)
  // We check typeof process first to avoid ReferenceError in browsers that don't polyfill it
  if (typeof process !== 'undefined' && process.env) {
    return process.env.API_KEY || 
           process.env.REACT_APP_API_KEY || 
           process.env.NEXT_PUBLIC_API_KEY ||
           process.env.VITE_API_KEY;
  }
  
  return undefined;
};

export const generateBotResponse = async (
  history: Message[],
  latestUserMessage: string,
  currentAffinity: number,
  shouldUpdateImpression: boolean,
  latestImageBase64?: string
): Promise<BotResponse> => {
  try {
    const apiKey = getApiKey();
    
    if (!apiKey) {
      console.error("API Key not found. Checked: import.meta.env.VITE_API_KEY, process.env.API_KEY, etc.");
      throw new Error("API_KEY is missing. Please add VITE_API_KEY to your Vercel Environment Variables.");
    }

    const ai = new GoogleGenAI({ apiKey });

    const now = new Date();
    const currentTimeString = now.toLocaleString('zh-CN', { hour12: false });

    // Determine Tier string for prompt injection
    const tier = currentAffinity >= AFFINITY_THRESHOLDS.Favored 
      ? AffinityTier.Favored 
      : currentAffinity >= AFFINITY_THRESHOLDS.Acquaintance 
        ? AffinityTier.Acquaintance 
        : AffinityTier.Stranger;
    
    // Inject current time and AFFINITY CONTEXT into system instruction
    let systemInstruction = `${SYSTEM_INSTRUCTION_TEMPLATE}

【当前关系状态】
目前好感度：${currentAffinity}/100
当前阶段：${tier}
请根据当前好感度调整你的回复语气：
- 陌生（0-29）：冷漠，距离感强，字数极少，甚至懒得理睬。
- 熟识（30-79）：偶尔愿意多聊两句，语气稍微缓和，开始毒舌中带点调侃。
- 偏爱（80-100）：明显的双标，对他格外包容，会主动用高冷的方式撒娇或调情，回复内容更丰富。

当前时间: ${currentTimeString}
消息格式: [时间戳] 内容`;

    if (shouldUpdateImpression) {
        systemInstruction += `\n\n【特殊指令】
请根据之前的对话历史，重新评估并返回你对该用户的【userImpression】（用户印象）。一定要辛辣、真实，符合你的人设。`;
    }

    // Convert internal message history to Gemini format with timestamps
    // We only take the last 15 messages to keep context fresh and tokens low
    const recentHistory = history.slice(-15).map((msg) => {
      const timeStr = new Date(msg.timestamp).toLocaleString('zh-CN', { hour12: false });
      
      const parts: any[] = [{ text: `[${timeStr}] ${msg.text}` }];
      
      if (msg.imageUrl) {
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
    // PROBABILITY LOGIC FOR LOW INTEREST LEVELS (Dynamic based on Affinity)
    // ----------------------------------------------------------------
    
    // Default probabilities (Tier 1 / Stranger)
    let ignoreProbLevel2 = 0.60;
    let ignoreProbLevel3 = 0.30;

    // Adjust for Tier 2 (Acquaintance)
    if (currentAffinity >= AFFINITY_THRESHOLDS.Acquaintance && currentAffinity < AFFINITY_THRESHOLDS.Favored) {
      ignoreProbLevel2 = 0.40;
      ignoreProbLevel3 = 0.15;
      parsed.thoughts += " [好感度加成: 熟识阶段生效]";
    }
    // Adjust for Tier 3 (Favored)
    else if (currentAffinity >= AFFINITY_THRESHOLDS.Favored) {
      ignoreProbLevel2 = 0.20;
      ignoreProbLevel3 = 0.05;
      parsed.thoughts += " [好感度加成: 偏爱阶段生效]";
    }

    if (parsed.interestLevel === 1) {
      // Level 1: Never reply (Hard Constraint)
      parsed.replies = [];
      parsed.thoughts += " [系统逻辑: 等级1 强制不回复，无视好感度]";
    } 
    else if (parsed.interestLevel === 2) {
      // Level 2 logic
      if (Math.random() < ignoreProbLevel2) {
        parsed.replies = [];
        parsed.thoughts += ` [系统逻辑: 等级2。概率 ${ignoreProbLevel2}。决定：不回]`;
      } else {
        parsed.thoughts += ` [系统逻辑: 等级2。概率 ${ignoreProbLevel2}。决定：回复]`;
      }
    } 
    else if (parsed.interestLevel === 3) {
      // Level 3 logic
      if (Math.random() < ignoreProbLevel3) {
        parsed.replies = [];
        parsed.thoughts += ` [系统逻辑: 等级3。概率 ${ignoreProbLevel3}。决定：不回]`;
      } else {
        parsed.thoughts += ` [系统逻辑: 等级3。概率 ${ignoreProbLevel3}。决定：回复]`;
      }
    }

    return parsed;
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback response if API fails
    return {
      interestLevel: 5,
      thoughts: "（系统连接失败，请检查API Key设置）",
      replies: ["..."],
    };
  }
};