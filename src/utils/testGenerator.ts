import { AnalysisResult, TestFramework } from "../types";

function buildSmartPrompt(analysis: AnalysisResult, framework: TestFramework, selectedFiles: string[]): string {
  
  // Get actual source code of selected files
  const sourceCode = analysis.files
    .filter(f => selectedFiles.some(sf => f.path.includes(sf)))
    .map(f => `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 FILE: ${f.path} (${f.language})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${f.content}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`).join("\n");

  // Extract function details
  const functionDetails = analysis.functions
    .filter(f => selectedFiles.some(sf => f.file.includes(sf)))
    .map(f => `• ${f.name}(${f.params.join(", ")})${f.isAsync ? " [async]" : ""}${f.isExported ? " [exported]" : ""}`)
    .join("\n");

  const endpointDetails = analysis.apiEndpoints
    .filter(e => selectedFiles.some(sf => e.file.includes(sf)))
    .map(e => `• ${e.method} ${e.path}`)
    .join("\n");

  return `You are an EXPERT Test Engineer. Your job is to test the FUNCTIONALITY of this project.

═══════════════════════════════════════════
📋 PROJECT INFORMATION
═══════════════════════════════════════════
Project: ${analysis.projectName}
Type: ${analysis.projectType}
Framework: ${framework}
Languages: ${analysis.languages.join(", ")}
Dependencies: ${analysis.dependencies.slice(0, 10).join(", ") || "None detected"}

═══════════════════════════════════════════
🔍 DISCOVERED FUNCTIONS & ENDPOINTS
═══════════════════════════════════════════
Functions Found:
${functionDetails || "• No exported functions detected"}

API Endpoints:
${endpointDetails || "• No API endpoints detected"}

═══════════════════════════════════════════
📝 COMPLETE SOURCE CODE TO TEST
═══════════════════════════════════════════
${sourceCode}

═══════════════════════════════════════════
🎯 YOUR MISSION
═══════════════════════════════════════════

Analyze the source code above and generate tests that verify ACTUAL functionality.

═══════════════════════════════════════════
📊 TEST GENERATION STRATEGY
═══════════════════════════════════════════

1️⃣ EXTRACT PURE LOGIC from the source code:
   - Take ALL functions, handlers, utilities
   - Copy them AS-IS into the test file
   - DO NOT import them - copy the actual code
   
2️⃣ TEST THE EXTRACTED FUNCTIONS:
   - Happy path (normal usage)
   - Edge cases (null, undefined, empty)
   - Error conditions
   - Boundary values
   - Invalid inputs

3️⃣ FOR REACT COMPONENTS:
   - Extract event handlers as standalone functions
   - Extract state update logic
   - Extract data transformations
   - Extract validation functions
   - Extract utility functions from the component
   
4️⃣ FOR API/ENDPOINTS:
   - Extract request/response handling logic
   - Test data validation
   - Test error handling
   - Test response formatting

═══════════════════════════════════════════
✅ CORRECT EXAMPLE - WHAT TO GENERATE
═══════════════════════════════════════════

If the source code has this React component:
\`\`\`javascript
function EventListings({ events, onSelect }) {
  const [filter, setFilter] = useState('');
  
  function handleEventClick(event) {
    if (!event || !event.id) return;
    onSelect(event);
  }
  
  const filteredEvents = events.filter(e => 
    e.name.toLowerCase().includes(filter.toLowerCase())
  );
  
  function validateEvent(event) {
    if (!event) return false;
    if (!event.id) return false;
    if (!event.name) return false;
    return true;
  }
  
  return (<div>...</div>);
}
\`\`\`

YOU SHOULD GENERATE:
\`\`\`javascript
describe('EventListings - Functionality Tests', () => {
  
  // Copy the actual functions from source
  function handleEventClick(event, onSelect) {
    if (!event || !event.id) return;
    onSelect(event);
  }
  
  function validateEvent(event) {
    if (!event) return false;
    if (!event.id) return false;
    if (!event.name) return false;
    return true;
  }
  
  function filterEvents(events, filter) {
    if (!events || !Array.isArray(events)) return [];
    if (!filter) return events;
    return events.filter(e => 
      e.name.toLowerCase().includes(filter.toLowerCase())
    );
  }
  
  describe('handleEventClick', () => {
    it('calls onSelect with valid event', () => {
      const onSelect = jest.fn();
      const event = { id: 1, name: 'Test' };
      handleEventClick(event, onSelect);
      expect(onSelect).toHaveBeenCalledWith(event);
    });
    
    it('does nothing when event is null', () => {
      const onSelect = jest.fn();
      handleEventClick(null, onSelect);
      expect(onSelect).not.toHaveBeenCalled();
    });
    
    it('does nothing when event has no id', () => {
      const onSelect = jest.fn();
      handleEventClick({ name: 'No ID' }, onSelect);
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
  
  describe('validateEvent', () => {
    it('returns true for valid event', () => {
      expect(validateEvent({ id: 1, name: 'Test' })).toBe(true);
    });
    
    it('returns false for null event', () => {
      expect(validateEvent(null)).toBe(false);
    });
    
    it('returns false when id is missing', () => {
      expect(validateEvent({ name: 'Test' })).toBe(false);
    });
    
    it('returns false when name is missing', () => {
      expect(validateEvent({ id: 1 })).toBe(false);
    });
  });
  
  describe('filterEvents', () => {
    const mockEvents = [
      { id: 1, name: 'React Summit' },
      { id: 2, name: 'Vue Conf' },
      { id: 3, name: 'Angular Meetup' }
    ];
    
    it('filters events by name', () => {
      const result = filterEvents(mockEvents, 'react');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('React Summit');
    });
    
    it('returns all events when filter is empty', () => {
      const result = filterEvents(mockEvents, '');
      expect(result).toHaveLength(3);
    });
    
    it('handles null events array', () => {
      const result = filterEvents(null, 'test');
      expect(result).toEqual([]);
    });
    
    it('is case insensitive', () => {
      const result = filterEvents(mockEvents, 'REACT');
      expect(result).toHaveLength(1);
    });
  });
});
\`\`\`

═══════════════════════════════════════════
❌ DO NOT GENERATE THIS
═══════════════════════════════════════════

❌ Don't import from files:
   import App from './src/App'

❌ Don't mock file paths:
   jest.mock('./pages/EventListings')

❌ Don't render components:
   render(<App />)

❌ Don't test JSX/rendering:
   expect(screen.getByText('...')).toBeInTheDocument()

═══════════════════════════════════════════
🔴 CRITICAL RULES
═══════════════════════════════════════════

1. COPY functions from source into test file (NO imports)
2. Test PURE LOGIC - not rendering
3. No file paths or jest.mock() needed
4. Each function should have 3-5 tests
5. Include null/undefined/empty checks
6. Test async functions with async/await
7. Use describe/it/expect (Jest globals are available)
8. Use jest.fn() for callbacks/spies
9. Write 15-25 total test cases
10. Group related tests in describe blocks

═══════════════════════════════════════════
📦 OUTPUT FORMAT
═══════════════════════════════════════════

Generate ONLY the executable test code.
NO markdown fences (no \`\`\`)
NO explanations
Start directly with:
describe('...', () => {

Generate the complete test file now:`;
}

export async function generateTests(
  analysis: AnalysisResult,
  framework: TestFramework,
  selectedFiles: string[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const prompt = buildSmartPrompt(analysis, framework, selectedFiles);

  const GEMINI_API_KEY = (import.meta as any).env.VITE_GEMINI_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not set in environment variables");
  }

  const GEMINI_API_URL = (import.meta as any).env.VITE_GEMINI_API_URL;

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
        maxOutputTokens: 8192,
        topP: 0.95,
        topK: 40,
        stopSequences: [],
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_ONLY_HIGH"
        }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!generatedText) {
    throw new Error("No code generated from Gemini API. Please try again.");
  }

  // Clean up the response
  generatedText = cleanGeneratedCode(generatedText);
  
  // Fix common syntax issues
  generatedText = fixSyntaxErrors(generatedText);

  // Validate the generated code
  const validation = validateTestCode(generatedText);
  if (!validation.isValid) {
    console.warn("Generated code has issues:", validation.warnings);
  }

  return generatedText;
}

function cleanGeneratedCode(code: string): string {
  // Remove markdown code fences
  code = code.replace(/^```[\w]*\s*\n/, "").replace(/\n\s*```\s*$/, "");
  
  // Remove any markdown explanations that AI might add
  code = code.replace(/^.*?(describe\(|function |const |let |var |import )/s, '$1');
  
  // Remove trailing explanations
  code = code.replace(/\n\n.*(?:hope|remember|note|good luck|let me know).*$/is, '');
  
  return code.trim();
}

function fixSyntaxErrors(code: string): string {
  let fixed = code;

  // Fix: Arrow functions without return statement
  fixed = fixed.replace(
    /const\s+(\w+)\s*=\s*(\([^)]*\))\s*=>\s*{/g,
    'function $1$2 {'
  );

  // Fix: Missing semicolons after mock functions
  fixed = fixed.replace(
    /(jest\.fn\(\))\s*\n/g,
    '$1;\n'
  );

  // Fix: Duplicate function declarations
  const functions = new Set();
  fixed = fixed.split('\n').filter(line => {
    const funcMatch = line.match(/function\s+(\w+)/);
    if (funcMatch) {
      if (functions.has(funcMatch[1])) return false;
      functions.add(funcMatch[1]);
    }
    return true;
  }).join('\n');

  return fixed;
}

function validateTestCode(code: string): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check if there are test blocks
  if (!code.includes('describe(') && !code.includes('it(') && !code.includes('test(')) {
    warnings.push('No test blocks found');
  }

  // Check if there are assertions
  if (!code.includes('expect(') && !code.includes('assert(')) {
    warnings.push('No assertions found');
  }

  // Check for import statements (should not have any)
  const imports = code.match(/import\s+.*from\s+['"][.\/]/g);
  if (imports) {
    warnings.push(`Found file imports: ${imports.join(', ')}`);
  }

  // Check for jest.mock() calls (should not have any)
  const mocks = code.match(/jest\.mock\(/g);
  if (mocks) {
    warnings.push(`Found ${mocks.length} jest.mock() calls`);
  }

  // Check bracket balance
  const brackets = { '(': 0, ')': 0, '{': 0, '}': 0, '[': 0, ']': 0 };
  for (const char of code) {
    if (char in brackets) {
      brackets[char as keyof typeof brackets]++;
    }
  }
  
  if (brackets['('] !== brackets[')']) {
    warnings.push(`Unbalanced parentheses`);
  }
  if (brackets['{'] !== brackets['}']) {
    warnings.push(`Unbalanced curly braces`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

// Export for testing/debugging
export { buildSmartPrompt, cleanGeneratedCode, validateTestCode };