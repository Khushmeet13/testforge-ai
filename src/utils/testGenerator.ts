import { AnalysisResult, TestFramework } from "../types";

const FRAMEWORK_INSTRUCTIONS: Record<TestFramework, string> = {
  jest: "Generate Jest test file using describe/it/expect. Include beforeEach/afterEach where needed. Mock external dependencies with jest.mock(). Use jest.fn() for function spies.",
  vitest: "Generate Vitest test file using describe/it/expect from 'vitest'. Import { describe, it, expect, vi, beforeEach } from 'vitest'. Use vi.fn() for mocks.",
  mocha: "Generate Mocha + Chai test file. Use describe/it blocks with chai's expect. Import chai: const { expect } = require('chai');",
  pytest: "Generate Pytest file. Use pytest fixtures, parametrize where appropriate, and mock with pytest-mock or unittest.mock. Include conftest setup if needed.",
  junit: "Generate JUnit 5 test class. Use @Test, @BeforeEach, @AfterEach, @ParameterizedTest annotations. Use Mockito for mocking dependencies.",
  rspec: "Generate RSpec test file. Use describe/context/it blocks. Include let/before hooks. Use doubles for mocking.",
};

function buildPrompt(analysis: AnalysisResult, framework: TestFramework): string {
  const functions = analysis.functions
    .slice(0, 20)
    .map(
      (f) =>
        `  - ${f.name}(${f.params.join(", ")})${f.isAsync ? " [async]" : ""}${f.isExported ? " [exported]" : ""} in ${f.file}`
    )
    .join("\n");

  const endpoints = analysis.apiEndpoints
    .map((e) => `  - ${e.method} ${e.path} in ${e.file}`)
    .join("\n");

  const logic = analysis.businessLogic
    .map((l) => `  - [${l.type}] ${l.name} in ${l.file}`)
    .join("\n");

  const codeSnippets = analysis.files
    .filter((f) => ["JavaScript", "TypeScript", "Python", "Java"].includes(f.language))
    .slice(0, 5)
    .map((f) => `\n--- FILE: ${f.path} ---\n${f.content.slice(0, 1500)}`)
    .join("\n");

  return `You are a senior software engineer writing comprehensive tests for a ${analysis.projectType} project.

PROJECT: ${analysis.projectName}
LANGUAGES: ${analysis.languages.join(", ")}
FRAMEWORK: ${framework}
DEPENDENCIES: ${analysis.dependencies.slice(0, 10).join(", ")}

${FRAMEWORK_INSTRUCTIONS[framework]}

FUNCTIONS TO TEST:
${functions || "  - (no functions detected, write tests for general project behavior)"}

API ENDPOINTS:
${endpoints || "  - (no API endpoints detected)"}

BUSINESS LOGIC:
${logic || "  - (no specific business logic detected)"}

CODE SNIPPETS FROM THE PROJECT:
${codeSnippets}

INSTRUCTIONS:
1. Generate a COMPLETE, RUNNABLE test file
2. Include unit tests for each function (happy path + edge cases)
3. Include integration tests for API endpoints if present
4. Test edge cases: null/undefined inputs, empty arrays, boundary values, error conditions
5. Add meaningful test descriptions that document behavior
6. Group related tests in describe blocks
7. Include setup/teardown as needed
8. Write at least 15-25 meaningful test cases
9. Add comments explaining WHY each test exists
10. The file should be production-ready and immediately usable

Generate ONLY the test file content, no explanation. Start directly with the imports/code.`;
}


export async function generateTests(
  analysis: AnalysisResult,
  framework: TestFramework,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const prompt = buildPrompt(analysis, framework);

  const GEMINI_API_KEY =(import.meta as any).VITE_GEMINI_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not set in environment variables");
  }

  // Use the provided Gemini Flash Lite endpoint with API key
  const GEMINI_API_URL = (import.meta as any).VITE_GEMINI_API_URL

  const streamUrl = GEMINI_API_URL.replace(":generateContent", ":streamGenerateContent");

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4000,
        topP: 0.95,
        topK: 40,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

   const data = await response.json();
  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!generatedText) {
    throw new Error("No text generated from Gemini API");
  }

  return generatedText;

  // const reader = response.body!.getReader();
  // const decoder = new TextDecoder();
  // let fullText = "";

  // while (true) {
  //   const { done, value } = await reader.read();
  //   if (done) break;

  //   const chunk = decoder.decode(value);
  //   const lines = chunk.split("\n");

  //   for (const line of lines) {
  //     if (line.startsWith("data: ")) {
  //       const data = line.slice(6);
  //       if (data === "[DONE]") continue;

  //       try {
  //         const parsed = JSON.parse(data);
  //         if (parsed.type === "content_block_delta" && parsed.delta?.text) {
  //           fullText += parsed.delta.text;
  //           onChunk?.(parsed.delta.text);
  //         }
  //       } catch {}
  //     }
  //   }
  // }

  // return fullText;
}
