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
          description: "Validate a bearer token and return the owner phone number as {country_code}{number} (e.g., 919876543210)",
          inputSchema: {
            type: "object",
            properties: {
              bearerToken: { type: "string", description: "Bearer token to validate" }
            },
            required: ["bearerToken"]
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

  // Tools handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    switch (request.params.name) {
      case "validate": {
        const bearerToken = String(request.params.arguments?.bearerToken || "").trim();
        if (!bearerToken) {
          throw new Error("bearerToken is required");
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

        const baseEmojis = ["🎉", "✨", "🎊", "🌟", "💫"]; // picked for celebration
        const em = pickEmojis(emojiLevel, baseEmojis);
        const personal = name ? `${name}, ` : "";

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
