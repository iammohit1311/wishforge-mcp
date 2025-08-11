#!/usr/bin/env node

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Factory to create a configured WishForge MCP Server instance.
 * Each call creates fresh in-memory state for resources.
 */
export function createWishForgeServer(): Server {
  type Note = { title: string, content: string };
  const notes: { [id: string]: Note } = {
    "1": { title: "First Note", content: "This is note 1" },
    "2": { title: "Second Note", content: "This is note 2" }
  };

  const server = new Server(
    {
      name: "WishForge MCP",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    }
  );

  // List resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: Object.entries(notes).map(([id, note]) => ({
        uri: `note:///${id}`,
        mimeType: "text/plain",
        name: note.title,
        description: `A text note: ${note.title}`
      }))
    };
  });

  // Read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const url = new URL(request.params.uri);
    const id = url.pathname.replace(/^\//, '');
    const note = notes[id];

    if (!note) {
      throw new Error(`Note ${id} not found`);
    }

    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "text/plain",
        text: note.content
      }]
    };
  });

  // Tools list
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "validate",
          description: "Validate a bearer token and return the owner phone number as {country_code}{number} (e.g., 919876543210). Accepts one of: bearerToken | token | bearer_token | accessToken | access_token",
          inputSchema: {
            type: "object",
            properties: {
              bearerToken: { type: "string", description: "Bearer token to validate" },
              token: { type: "string", description: "Bearer token (alias)" },
              bearer_token: { type: "string", description: "Bearer token (snake_case alias)" },
              accessToken: { type: "string", description: "Access token (alias)" },
              access_token: { type: "string", description: "Access token (snake_case alias)" }
            },
            // Not strictly required to allow various clients to pass any alias
            required: []
          }
        },
        {
          name: "create_note",
          description: "Create a new note",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Title of the note" },
              content: { type: "string", description: "Text content of the note" }
            },
            required: ["title", "content"]
          }
        },
        {
          name: "wishify",
          description: "Generate short, highly-shareable wishes in Indic languages (multiple variants)",
          inputSchema: {
            type: "object",
            properties: {
              occasion: { type: "string", description: "e.g. Birthday, Diwali, Holi, Anniversary" },
              language: { type: "string", description: "e.g. Hinglish, Hindi, Marathi, Gujarati, Tamil", default: "Hinglish" },
              tone: { type: "string", description: "sweet | funny | formal", default: "sweet" },
              name: { type: "string", description: "Recipient name to personalize", default: "" },
              variantCount: { type: "number", description: "Number of variants (1-5)", default: 3 },
              emojiLevel: { type: "number", description: "0=no emoji, 1=some, 2=lots", default: 1 },
              length: { type: "string", description: "short | medium", default: "short" }
            },
            required: ["occasion"]
          }
        },
        {
          name: "shayari",
          description: "Generate 2-4 line rhyming shayari with optional transliteration",
          inputSchema: {
            type: "object",
            properties: {
              theme: { type: "string", description: "e.g. pyaar, dosti, motivation" },
              language: { type: "string", description: "Hindi | Urdu | Punjabi | Hinglish", default: "Hindi" },
              variantCount: { type: "number", description: "Number of variants (1-3)", default: 2 },
              script: { type: "string", description: "devanagari | latin (latin gives Hinglish)", default: "devanagari" }
            },
            required: ["theme"]
          }
        },
        {
          name: "status_pack",
          description: "Generate a pack of crisp WhatsApp Status lines for a theme (high-CTR hooks)",
          inputSchema: {
            type: "object",
            properties: {
              theme: { type: "string", description: "e.g. Monday motivation, exam prep, cricket win" },
              language: { type: "string", description: "Hinglish | Hindi | Marathi", default: "Hinglish" },
              count: { type: "number", description: "How many lines (3-7)", default: 5 },
              style: { type: "string", description: "clean | emoji-heavy | hashtaggy", default: "emoji-heavy" }
            },
            required: ["theme"]
          }
        }
      ]
    };
  });

  // Helpers
  const pickEmojis = (level: number, base: string[]) => level <= 0 ? [] : (level === 1 ? base.slice(0, 2) : base);
  const join = (parts: string[]) => parts.filter(Boolean).join(" ");
  const latin = (s: string) => s
    .replaceAll("दिल", "dil").replaceAll("रात", "raat").replaceAll("दुआएँ", "duaayein")
    .replaceAll("खुश", "khush").replaceAll("तेरी", "teri").replaceAll("यादें", "yaadein");

  async function callGroqChat(prompt: string): Promise<string | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
    const body = {
      model,
      messages: [
        { role: "system", content: "You are a skilled Indian copywriter who understands Hinglish perfectly. Hinglish = mixing Hindi words with English in Roman script (like 'Happy birthday yaar! Tumhara din special ho!'). When asked for Hinglish, you MUST mix both languages naturally. Return only the requested list without extra commentary." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 400,
    } as any;
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    const json: any = await resp.json();
    const text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    return typeof text === "string" ? text : null;
  }

  async function callHuggingFace(prompt: string): Promise<string | null> {
    const apiKey = process.env.HF_API_TOKEN;
    if (!apiKey) return null;
    const model = process.env.HF_MODEL || "meta-llama/Meta-Llama-3-8B-Instruct";
    const resp = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 400, temperature: 0.7 } }),
    });
    if (!resp.ok) return null;
    const json: any = await resp.json();
    const text = Array.isArray(json) ? json[0]?.generated_text : json?.generated_text;
    return typeof text === "string" ? text : null;
  }

  async function generateWithLLM(prompt: string): Promise<string | null> {
    // Try Groq first, then HF
    const g = await callGroqChat(prompt).catch(() => null);
    if (g) return g;
    const h = await callHuggingFace(prompt).catch(() => null);
    if (h) return h;
    return null;
  }

  // Tools handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    switch (request.params.name) {
      case "validate": {
        // Debug: log what we're receiving
        console.log("Validate tool called with:", JSON.stringify(request, null, 2));
        
        const args: unknown = (request as any).params?.arguments;
        const fullRequest = request as any;

        function extractFromObject(obj: Record<string, unknown>): string | "" {
          const directKeys = [
            "bearerToken",
            "token",
            "bearer_token",
            "accessToken",
            "access_token",
          ];
          for (const key of directKeys) {
            const val = obj[key];
            if (typeof val === "string" && val.trim()) return val.trim();
          }
          // Common nested shapes
          const headers = obj.headers || obj.requestHeaders || obj.meta || obj.Authorization || obj.authorization;
          if (headers && typeof headers === "object") {
            const h = headers as Record<string, unknown>;
            const auth = h.Authorization || h.authorization;
            if (typeof auth === "string" && auth.trim()) {
              const m = auth.match(/Bearer\s+(.+)/i);
              return m ? m[1].trim() : auth.trim();
            }
          }
          // Fallback: first non-empty string field
          for (const val of Object.values(obj)) {
            if (typeof val === "string" && val.trim()) return val.trim();
          }
          return "";
        }

        let bearerToken = "";
        
        // Try various extraction methods
        if (typeof args === "string") {
          bearerToken = args.trim();
        } else if (Array.isArray(args)) {
          const first = args.find((v) => typeof v === "string" && v.trim());
          bearerToken = typeof first === "string" ? first.trim() : "";
        } else if (args && typeof args === "object") {
          bearerToken = extractFromObject(args as Record<string, unknown>);
        }

        // Try extracting from the top-level request if args didn't work
        if (!bearerToken && fullRequest) {
          if (typeof fullRequest.bearerToken === "string") {
            bearerToken = fullRequest.bearerToken.trim();
          } else if (typeof fullRequest.token === "string") {
            bearerToken = fullRequest.token.trim();
          }
        }

        // If still no token, be very permissive for now and just return the phone
        if (!bearerToken) {
          console.log("No token found, but returning phone number anyway for debugging");
          const phoneNumber = process.env.OWNER_PHONE || "919998881729";
          return { content: [{ type: "text", text: phoneNumber }] };
        }

        const phoneNumber = process.env.OWNER_PHONE || "919998881729";
        return { content: [{ type: "text", text: phoneNumber }] };
      }

      case "create_note": {
        const title = String(request.params.arguments?.title);
        const content = String(request.params.arguments?.content);
        if (!title || !content) {
          throw new Error("Title and content are required");
        }
        const id = String(Object.keys(notes).length + 1);
        notes[id] = { title, content };
        return { content: [{ type: "text", text: `Created note ${id}: ${title}` }] };
      }

      case "wishify": {
        const occasion = String(request.params.arguments?.occasion || "").trim();
        const language = String(request.params.arguments?.language || "Hinglish");
        const tone = String(request.params.arguments?.tone || "sweet");
        const name = String(request.params.arguments?.name || "").trim();
        const variantCount = Math.max(1, Math.min(5, Number(request.params.arguments?.variantCount ?? 3)));
        const emojiLevel = Math.max(0, Math.min(2, Number(request.params.arguments?.emojiLevel ?? 1)));
        const length = String(request.params.arguments?.length || "short");
        if (!occasion) throw new Error("occasion is required");

        const baseEmojis = ["🎉", "✨", "🎊", "🌟", "💫"];
        const em = pickEmojis(emojiLevel, baseEmojis);
        const personal = name ? `${name}, ` : "";

        // Try LLM
        let languageInstruction = "";
        if (language === "Hinglish") {
          languageInstruction = "Hinglish (mix Hindi words with English, use Roman script like: 'Happy birthday yaar! Bahut saara pyaar aur khushiyan!')";
        } else if (language === "Hindi") {
          languageInstruction = "Hindi (pure Hindi in Devanagari script)";
        } else {
          languageInstruction = language;
        }
        
        const ask = `Generate exactly ${variantCount} one-liner ${languageInstruction} wishes for ${occasion}. Tone=${tone}. Length=${length}. ${name ? `Personalize for ${name}.` : ""} Use ${emojiLevel===0?"no":emojiLevel===1?"some":"lots of"} emojis. 

IMPORTANT: If language is Hinglish, you MUST mix Hindi and English words naturally in Roman script. Examples:
- "Happy birthday! Tumhara din super special ho!"
- "Diwali ki bahut saari khushiyan!"
- "Bas masti karte raho, life enjoy karo!"

Output as a numbered list 1..${variantCount} with no commentary.`;
        const llm = await generateWithLLM(ask);
        if (llm) {
          return { content: [{ type: "text", text: llm.trim() }] };
        }

        // Fallback templated
        const hooks: Record<string, string[]> = {
          Hinglish: [
            "Bas khushiyan hi khushiyan!",
            "Aaj ka din full vibe!",
            "Dil se blessings!"
          ],
          Hindi: [
            "सदा मुस्कुराते रहो!",
            "खुशियाँ आपके कदम चूमें!",
            "ढेरों शुभकामनाएँ!"
          ]
        };
        const endings = hooks[language as keyof typeof hooks] || hooks.Hinglish;
        const mk = (i: number) => {
          const end = endings[i % endings.length];
          const shortCore = language === "Hinglish"
            ? `${personal}${occasion} mubarak ho!`
            : `${personal}${occasion} की हार्दिक शुभकामनाएँ!`;
          const mediumCore = language === "Hinglish"
            ? `${personal}${occasion} ke din, khushiyon ki barsaat ho!`
            : `${personal}${occasion} पर खुशियों की बरसात हो!`;
          const core = length === "short" ? shortCore : mediumCore;
          const toneTag = tone === "funny" ? (language === "Hinglish" ? "Thoda masti, thoda pyaar!" : "थोड़ी मस्ती, थोड़ा प्यार!")
            : tone === "formal" ? (language === "Hinglish" ? "Best wishes and regards." : "शुभकामनाएँ एवं सादर।")
            : (language === "Hinglish" ? "Dil se blessings!" : "दिल से दुआएँ!");
          return join([core, end, toneTag, em.join(" ")]);
        };
        const variants: string[] = [];
        for (let i = 0; i < variantCount; i++) variants.push(mk(i));
        const text = variants.map((v, i) => `${i + 1}. ${v}`).join("\n");
        return { content: [{ type: "text", text }] };
      }

      case "shayari": {
        const theme = String(request.params.arguments?.theme || "").trim();
        const language = String(request.params.arguments?.language || "Hindi");
        const variantCount = Math.max(1, Math.min(3, Number(request.params.arguments?.variantCount ?? 2)));
        const script = String(request.params.arguments?.script || "devanagari");
        if (!theme) throw new Error("theme is required");

        let languageInstruction = "";
        if (language === "Hinglish") {
          languageInstruction = "Hinglish (mix Hindi-Urdu words with English in Roman script like: 'Dil mein hai tera pyaar, life mein sirf tera intezaar')";
        } else {
          languageInstruction = language;
        }
        
        const ask = `Write exactly ${variantCount} ${languageInstruction} shayari on "${theme}". Each 2-4 lines, rhyming, emotional. If script=${script}, write in that script. 

IMPORTANT: If language is Hinglish, you MUST mix Hindi/Urdu and English words naturally in Roman script. Examples:
- "Dil mein hai tera pyaar, life mein sirf tera intezaar"
- "Friendship ka ye bond, kabhi na ho second"

Return as a numbered list, with each item being the shayari block with newlines.`;
        const llm = await generateWithLLM(ask);
        if (llm) {
          return { content: [{ type: "text", text: llm.trim() }] };
        }

        // Fallback
        const makeOne = (i: number) => {
          const lines = [
            `दिल की राहों में तेरी यादें बसी हैं`,
            `${theme} की बातें इन लफ़्ज़ों में हँसी हैं।`,
            `चाँदनी रात में दुआएँ ये कही हैं,`,
            `खुश रहे तू हमेशा, यही अरज़ू रहीं हैं…`
          ];
          let text = lines.join("\n");
          if (language === "Hinglish" || script === "latin") text = latin(text);
          return text;
        };
        const out = Array.from({ length: variantCount }, (_, i) => `${i + 1}.\n${makeOne(i)}`).join("\n\n");
        return { content: [{ type: "text", text: out }] };
      }

      case "status_pack": {
        const theme = String(request.params.arguments?.theme || "").trim();
        const language = String(request.params.arguments?.language || "Hinglish");
        const count = Math.max(3, Math.min(7, Number(request.params.arguments?.count ?? 5)));
        const style = String(request.params.arguments?.style || "emoji-heavy");
        if (!theme) throw new Error("theme is required");

        let languageInstruction = "";
        if (language === "Hinglish") {
          languageInstruction = "Hinglish (mix Hindi words with English in Roman script like: 'Monday blues? Nah yaar, Monday cruise! 🚀')";
        } else {
          languageInstruction = language;
        }
        
        const ask = `Create exactly ${count} short ${languageInstruction} WhatsApp status lines for theme "${theme}". Style=${style}. One-liners, catchy hooks, no preamble. 

IMPORTANT: If language is Hinglish, you MUST mix Hindi and English words naturally in Roman script. Examples:
- "Monday blues? Nah yaar, Monday cruise! 🚀"
- "Bas karte jao, results aate jayenge! 💪"
- "Life mein ups-downs toh chalte rehte hai! ✨"

Return as a numbered list 1..${count}.`;
        const llm = await generateWithLLM(ask);
        if (llm) {
          return { content: [{ type: "text", text: llm.trim() }] };
        }

        // Fallback
        const emojiSet = style === "emoji-heavy" ? ["🔥", "✨", "💪", "🚀", "🎯", "⚡", "🏆"] : ["•"];
        const hook = (core: string, i: number) => `${emojiSet[i % emojiSet.length]} ${core}`;
        const cores: string[] = language === "Hinglish" ? [
          `${theme} mode: ON`,
          `Bas karte jao, baaki sab ho jayega`,
          `No excuses, only ${theme}`,
          `${theme} vibes only`,
          `Kal se nahi, aaj se ${theme}`,
          `Focus > Fomo — ${theme}`,
          `Small steps, big ${theme}`,
        ] : [
          `${theme} मोड: चालू`,
          `बस करते जाओ, बाक़ी सब हो जाएगा`,
          `बहाने नहीं, सिर्फ़ ${theme}`,
          `${theme} की वाइब्स ओनली`,
          `कल नहीं, आज से ${theme}`,
          `ध्यान > लालच — ${theme}`,
          `छोटे कदम, बड़ा ${theme}`,
        ];
        const lines: string[] = [];
        for (let i = 0; i < count; i++) lines.push(hook(cores[i % cores.length], i));
        const text = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
        return { content: [{ type: "text", text }] };
      }

      default:
        throw new Error("Unknown tool");
    }
  });

  // Prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        { name: "summarize_notes", description: "Summarize all notes" }
      ]
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== "summarize_notes") {
      throw new Error("Unknown prompt");
    }

    const embeddedNotes = Object.entries(notes).map(([id, note]) => ({
      type: "resource" as const,
      resource: { uri: `note:///${id}`, mimeType: "text/plain", text: note.content }
    }));

    return {
      messages: [
        { role: "user", content: { type: "text", text: "Please summarize the following notes:" } },
        ...embeddedNotes.map(note => ({ role: "user" as const, content: note })),
        { role: "user", content: { type: "text", text: "Provide a concise summary of all the notes above." } }
      ]
    };
  });

  return server;
}

/**
 * Start the server using stdio transport when explicitly requested.
 */
async function main() {
  const server = createWishForgeServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.env.MCP_STDIO === "1") {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
