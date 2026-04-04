import { useState, useRef, useEffect } from "react";
import { ChatMessage, AnalysisResult, TestFramework } from "../types";

interface IterativeRefinementProps {
  testOutput: string;
  analysis: AnalysisResult;
  framework: TestFramework;
  onTestsUpdated: (newTests: string) => void;
}

const QUICK_PROMPTS = [
  "Add more edge cases for null/undefined inputs",
  "Add error handling tests for all async functions",
  "Add boundary value tests for number inputs",
  "Make test descriptions more descriptive",
  "Add integration tests for the API endpoints",
  "Add tests for authentication edge cases",
];

export function IterativeRefinement({ testOutput, analysis, framework, onTestsUpdated }: IterativeRefinementProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hi! I've reviewed your test suite for **${analysis.projectName}**. I can help you refine and improve these tests. Try asking me to:\n\n• Add edge cases for specific functions\n• Improve assertion coverage\n• Add integration tests\n• Fix any specific test patterns\n\nWhat would you like to improve?`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [currentTests, setCurrentTests] = useState(testOutput);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || streaming) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content, timestamp: Date.now() };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), isStreaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    // Build conversation history for Gemini with CORRECT role names (MODEL/USER)
    const conversationHistory = messages
      .filter(m => m.role !== "assistant" || m.id !== "welcome")
      .map(m => ({ 
        role: m.role === "assistant" ? "MODEL" : "USER", 
        parts: [{ text: m.content }] 
      }));

    const systemPrompt = `You are a test code refinement assistant. The user has a ${analysis.projectType} project and these are the current tests written in ${framework}.

Current test file:
${currentTests.slice(0, 4000)}

Key functions: ${analysis.functions.slice(0, 10).map(f => f.name).join(", ")}
API endpoints: ${analysis.apiEndpoints.map(e => `${e.method} ${e.path}`).join(", ")}

When the user asks for changes:
1. Return the COMPLETE updated test file (not just the changed parts)
2. After the code block, briefly explain what you changed
3. Format: wrap the full code in triple backticks with the language
4. Be concise in explanation - the code is what matters`;

    try {
      // Get API key from environment
      const GEMINI_API_KEY = (import.meta as any).VITE_GEMINI_KEY ;
      if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not found in environment variables");
      }

      // Use non-streaming endpoint for better reliability
      const GEMINI_API_URL = (import.meta as any).VITE_GEMINI_API_URL;

      // Prepare contents array for Gemini
      const contents = [
        {
          role: "USER",
          parts: [{ text: systemPrompt }],
        },
        ...conversationHistory,
        {
          role: "USER",
          parts: [{ text: content }],
        },
      ];

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8000, // Increased to get complete responses
            topP: 0.95,
            topK: 40,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_NONE",
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Extract text from non-streaming response
      let fullText = "";
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        fullText = data.candidates[0].content.parts[0].text || "";
      }

      // Update the message with the full response
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, content: fullText, isStreaming: false } : m));

      // Extract updated test code from response
      const codeMatch = fullText.match(/```(?:\w+)?\n([\s\S]+?)```/);
      if (codeMatch) {
        const newTests = codeMatch[1];
        setCurrentTests(newTests);
        onTestsUpdated(newTests);
      } else {
        console.warn("No code block found in response");
      }

    } catch (err) {
      console.error("Iterative refinement error:", err);
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, content: "Sorry, I encountered an error. Please try again.", isStreaming: false } : m));
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="flex flex-col h-[600px]">
      {/* Chat history */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
              msg.role === "user" ? "bg-[#7b2fff]/30 text-[#7b2fff]" : "bg-[#00ff9d]/20 text-[#00ff9d]"
            }`}>
              {msg.role === "user" ? "U" : "AI"}
            </div>
            <div className={`max-w-[80%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
              msg.role === "user"
                ? "bg-[#7b2fff]/15 border border-[#7b2fff]/25 text-white/80"
                : "bg-white/[0.04] border border-white/10 text-white/70"
            }`}>
              <MessageContent content={msg.content} />
              {msg.isStreaming && (
                <span className="inline-block w-2 h-3 bg-[#00ff9d]/60 animate-pulse ml-1 rounded-sm" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {!streaming && (
        <div className="flex flex-wrap gap-1.5 py-3 border-t border-white/8">
          {QUICK_PROMPTS.map(p => (
            <button key={p} onClick={() => sendMessage(p)}
              className="px-2.5 py-1 text-[10px] text-white/40 hover:text-white/70 bg-white/[0.03] hover:bg-white/[0.07] border border-white/8 hover:border-white/20 rounded-lg transition-all">
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 items-end pt-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          placeholder="Ask AI to refine your tests… (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="flex-1 bg-white/[0.04] border border-white/10 hover:border-white/20 focus:border-[#7b2fff]/50 rounded-xl px-4 py-3 text-xs text-white/80 placeholder-white/20 resize-none outline-none transition-all font-mono disabled:opacity-50"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || streaming}
          className="px-4 py-3 bg-[#7b2fff] text-white rounded-xl hover:bg-[#6b1fef] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {streaming
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          }
        </button>
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  // Simple renderer: code blocks, bold
  const parts = content.split(/(```[\s\S]*?```|\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const code = part.slice(3, -3).replace(/^\w+\n/, "");
          return (
            <span key={i} className="block mt-2 mb-2">
              <code className="block bg-black/30 rounded-lg p-3 text-[#00ff9d]/80 text-[10px] whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                {code.slice(0, 500)}{code.length > 500 ? "\n... (truncated - full code applied to editor)" : ""}
              </code>
            </span>
          );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-white/90 font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}