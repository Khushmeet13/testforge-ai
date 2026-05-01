import { AnalysisResult, TestFramework } from "../types";

// Framework-specific syntax configurations
function getFrameworkSyntax(framework: TestFramework) {
  const configs = {
    jest: {
      name: "Jest",
      testFunc: "describe() / it()",
      assertion: "expect(value).toBe(expected)",
      mockFunc: "jest.fn()",
      asyncPattern: "async/await",
      importLine: "",
      example: `describe('Pure Functions', () => {
  // DEFINE functions first
  function validateEmail(email) {
    if (!email) return false;
    return email.includes('@');
  }
  
  function formatCard(num) {
    if (!num) return '';
    const d = num.replace(/\D/g, '');
    return d.match(/.{1,4}/g)?.join(' ') || d;
  }
  
  // THEN write tests
  describe('validateEmail', () => {
    it('valid email', () => {
      expect(validateEmail('test@test.com')).toBe(true);
    });
    it('empty email', () => {
      expect(validateEmail('')).toBe(false);
    });
    it('null email', () => {
      expect(validateEmail(null)).toBe(false);
    });
  });
  
  describe('formatCard', () => {
    it('formats 16 digits', () => {
      expect(formatCard('1234567890123456')).toBe('1234 5678 9012 3456');
    });
    it('empty input', () => {
      expect(formatCard('')).toBe('');
    });
  });
});`
    },
    vitest: {
      name: "Vitest",
      testFunc: "describe() / it()",
      assertion: "expect(value).toBe(expected)",
      mockFunc: "vi.fn()",
      asyncPattern: "async/await",
      importLine: "import { describe, it, expect, vi } from 'vitest';",
      example: `import { describe, it, expect, vi } from 'vitest';

describe('Pure Functions', () => {
  function validateEmail(email) {
    if (!email) return false;
    return email.includes('@');
  }
  
  describe('validateEmail', () => {
    it('valid email', () => {
      expect(validateEmail('test@test.com')).toBe(true);
    });
    it('empty email', () => {
      expect(validateEmail('')).toBe(false);
    });
  });
});`
    },
    mocha: {
      name: "Mocha",
      testFunc: "describe() / it()",
      assertion: "expect(value).to.equal(expected)",
      mockFunc: "sinon.stub()",
      asyncPattern: "async/await or done()",
      importLine: "const { expect } = require('chai');",
      example: `const { expect } = require('chai');

describe('Pure Functions', () => {
  function validateEmail(email) {
    if (!email) return false;
    return email.includes('@');
  }
  
  describe('validateEmail', () => {
    it('valid email', () => {
      expect(validateEmail('test@test.com')).to.equal(true);
    });
    it('empty email', () => {
      expect(validateEmail('')).to.equal(false);
    });
  });
});`
    },
    pytest: {
      name: "Pytest",
      testFunc: "def test_function_name():",
      assertion: "assert value == expected",
      mockFunc: "unittest.mock.Mock()",
      asyncPattern: "pytest.mark.asyncio",
      importLine: "import pytest",
      example: `import pytest

def validate_email(email):
    if not email:
        return False
    return '@' in email

def test_valid_email():
    assert validate_email('test@test.com') == True

def test_empty_email():
    assert validate_email('') == False

def test_none_email():
    assert validate_email(None) == False`
    },
    junit: {
      name: "JUnit 5",
      testFunc: "@Test void methodName()",
      assertion: "assertEquals(expected, actual)",
      mockFunc: "Mockito.mock()",
      asyncPattern: "CompletableFuture",
      importLine: "import org.junit.jupiter.api.*;\nimport static org.junit.jupiter.api.Assertions.*;",
      example: `import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

class ValidationTest {
    
    static boolean validateEmail(String email) {
        if (email == null || email.isEmpty()) return false;
        return email.contains("@");
    }
    
    @Test
    void validEmailReturnsTrue() {
        assertTrue(validateEmail("test@test.com"));
    }
    
    @Test
    void emptyEmailReturnsFalse() {
        assertFalse(validateEmail(""));
    }
    
    @Test
    void nullEmailReturnsFalse() {
        assertFalse(validateEmail(null));
    }
}`
    },
    rspec: {
      name: "RSpec",
      testFunc: "describe / context / it",
      assertion: "expect(value).to eq(expected)",
      mockFunc: "double() or allow().to receive()",
      asyncPattern: "expect async",
      importLine: "require 'spec_helper'",
      example: `require 'spec_helper'

def validate_email(email)
  return false if email.nil? || email.empty?
  email.include?('@')
end

describe '#validate_email' do
  it 'returns true for valid email' do
    expect(validate_email('test@test.com')).to eq(true)
  end
  
  it 'returns false for empty' do
    expect(validate_email('')).to eq(false)
  end
  
  it 'returns false for nil' do
    expect(validate_email(nil)).to eq(false)
  end
end`
    },
    "react-testing-library": {
      name: "React Testing Library",
      testFunc: "describe() / it()",
      assertion: "expect(value).toBe(expected)",
      mockFunc: "jest.fn()",
      asyncPattern: "async/await",
      importLine: "",
      example: `describe('Pure Functions', () => {
  function validateForm(data) {
    if (!data.name) return { valid: false, error: 'Name required' };
    if (!data.email) return { valid: false, error: 'Email required' };
    return { valid: true };
  }
  
  describe('validateForm', () => {
    it('validates complete data', () => {
      expect(validateForm({ name: 'John', email: 'john@test.com' }))
        .toEqual({ valid: true });
    });
    
    it('rejects missing name', () => {
      expect(validateForm({ email: 'john@test.com' }))
        .toEqual({ valid: false, error: 'Name required' });
    });
  });
});`
    },
    supertest: {
      name: "Supertest",
      testFunc: "describe() / it()",
      assertion: "expect(value).toBe(expected)",
      mockFunc: "jest.fn()",
      asyncPattern: "async/await",
      importLine: "",
      example: `describe('API Logic', () => {
  function validateBody(data) {
    if (!data.email) return { error: 'Email required' };
    return { valid: true };
  }
  
  describe('validateBody', () => {
    it('accepts valid data', () => {
      expect(validateBody({ email: 'a@b.c' })).toEqual({ valid: true });
    });
    it('rejects missing email', () => {
      expect(validateBody({})).toEqual({ error: 'Email required' });
    });
  });
});`
    },
    cypress: {
      name: "Cypress",
      testFunc: "describe() / it()",
      assertion: "expect(value).to.equal(expected)",
      mockFunc: "cy.stub()",
      asyncPattern: "cy.wrap()",
      importLine: "",
      example: `describe('Pure Functions', () => {
  function calculateTotal(items, discount = 0) {
    if (!items?.length) return 0;
    const sum = items.reduce((s, i) => s + i.price, 0);
    return sum * (1 - discount / 100);
  }
  
  describe('calculateTotal', () => {
    it('calculates without discount', () => {
      expect(calculateTotal([{ price: 100 }])).to.equal(100);
    });
    it('applies discount', () => {
      expect(calculateTotal([{ price: 100 }], 20)).to.equal(80);
    });
    it('handles empty', () => {
      expect(calculateTotal([])).to.equal(0);
    });
  });
});`
    }
  };
  return configs[framework];
}

function buildSmartPrompt(analysis: AnalysisResult, framework: TestFramework, selectedFiles: string[]): string {
  
  const syntax = getFrameworkSyntax(framework);
  
  const sourceCode = analysis.files
    .filter(f => selectedFiles.some(sf => f.path.includes(sf)))
    .map(f => `
${'─'.repeat(50)}
📄 ${f.path} (${f.language})
${'─'.repeat(50)}
${f.content.slice(0, 2500)}
${'─'.repeat(50)}
`).join("\n");

  const functionDetails = analysis.functions
    .filter(f => selectedFiles.some(sf => f.file.includes(sf)))
    .map(f => `• ${f.name}(${f.params.join(", ")})${f.isAsync ? " [async]" : ""}`)
    .join("\n");

  return `Generate ${syntax.name} test. PURE FUNCTIONS ONLY.

═══════════════════════════════════════════
${syntax.name.toUpperCase()} | ${analysis.projectName} | ${analysis.languages.join(", ")}
═══════════════════════════════════════════
Functions: ${functionDetails || "None"}

═══════════════════════════════════════════
📝 SOURCE
═══════════════════════════════════════════
${sourceCode}

═══════════════════════════════════════════
🔴 RULE #1: DEFINE FUNCTIONS BEFORE TESTS
═══════════════════════════════════════════

You MUST define every function BEFORE calling it in tests.

✅ CORRECT:
describe('Tests', () => {
  // 1. DEFINE
  function formatCard(num) {
    if (!num) return '';
    return num.replace(/\D/g, '').match(/.{1,4}/g)?.join(' ') || '';
  }
  
  // 2. THEN TEST
  it('formats card', () => {
    expect(formatCard('12345678')).toBe('1234 5678');
  });
});

❌ WRONG (function not defined):
describe('Tests', () => {
  it('formats card', () => {
    expect(formatCard('12345678')).toBe('1234 5678'); // ERROR: formatCard not defined!
  });
});

═══════════════════════════════════════════
🚫 FORBIDDEN
═══════════════════════════════════════════
require()  import from './'  process.env  global.window
global.import  jest.mock()  jest.spyOn()  React.useState
render()  screen.  beforeAll()  afterAll()
axios  fetch  emailjs  new Razorpay  setTimeout

═══════════════════════════════════════════
✅ RULES
═══════════════════════════════════════════
1. DEFINE functions at top of describe block
2. Only test: input → output functions
3. 2-3 tests per function
4. Test: valid, null, empty, edge case

${syntax.example}

OUTPUT ONLY CODE. Start: ${syntax.importLine || 'describe('}`;
}

export async function generateTests(
  analysis: AnalysisResult,
  framework: TestFramework,
  selectedFiles: string[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const prompt = buildSmartPrompt(analysis, framework, selectedFiles);

  const GEMINI_API_KEY = (import.meta as any).env.VITE_GEMINI_KEY;
  if (!GEMINI_API_KEY) throw new Error("VITE_GEMINI_API_KEY not set");

  const GEMINI_API_URL = (import.meta as any).env.VITE_GEMINI_API_URL;

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topP: 0.95,
        topK: 40,
        stopSequences: [],
      },
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const data = await response.json();
  let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generatedText) throw new Error("No code generated");

  generatedText = cleanGeneratedCode(generatedText);
  generatedText = removeForbiddenPatterns(generatedText);
  generatedText = validateAndFixFunctions(generatedText);

  return generatedText;
}

function cleanGeneratedCode(code: string): string {
  code = code.replace(/^```[\w]*\s*\n/, "").replace(/\n\s*```\s*$/, "");
  code = code.replace(/#[a-f0-9]+">/gi, "");
  code = code.replace(/<span[^>]*>/g, "").replace(/<\/span>/g, "");
  code = code.replace(/^.*?(?=describe\(|import |def |class |@Test|require )/s, "");
  code = code.replace(/\n\n.*(?:hope|remember|note|good luck).*$/is, "");
  return code.trim();
}

function removeForbiddenPatterns(code: string): string {
  // Remove require() calls (but NOT function definitions)
  code = code.replace(/^(const|let|var)\s+\w+\s*=\s*require\s*\([^)]*\);?\s*$/gm, "");
  
  // Remove import from project files
  code = code.replace(/^import\s+.*from\s+['"][.\/][^'"]*['"];?\s*$/gm, "");
  
  // Remove jest.mock with file paths
  code = code.replace(/^jest\.mock\(['"][.\/][^'"]*['"].*;?\s*$/gm, "");
  code = code.replace(/^vi\.mock\(['"][.\/][^'"]*['"].*;?\s*$/gm, "");
  
  // Remove process.env assignments
  code = code.replace(/^.*process\.env\s*=.*;?\s*$/gm, "");
  code = code.replace(/^delete process\.env.*;?\s*$/gm, "");
  
  // Remove global assignments
  code = code.replace(/^global\.\w+\s*=.*;?\s*$/gm, "");
  code = code.replace(/^globalThis\.\w+\s*=.*;?\s*$/gm, "");
  
  // Remove React spyOn
  code = code.replace(/^jest\.spyOn\(React.*;?\s*$/gm, "");
  
  // Remove import React
  code = code.replace(/^import React.*;?\s*$/gm, "");
  
  // Remove render/screen lines
  code = code.replace(/^.*render\(<.*;?\s*$/gm, "");
  code = code.replace(/^.*screen\.\w+.*;?\s*$/gm, "");
  
  // Remove beforeAll/afterAll blocks
  code = code.replace(/^(beforeAll|afterAll)\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\);?/gm, "");
  
  // Remove jest.isolateModules blocks
  code = code.replace(/jest\.isolateModules\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\);?/g, "");
  
  // Clean blank lines
  code = code.replace(/\n{3,}/g, "\n\n");
  
  return code.trim();
}

// NEW: Validate functions exist and add stubs if missing
function validateAndFixFunctions(code: string): string {
  // Find all function calls in expect statements
  const calledFunctions = new Set<string>();
  const callRegex = /expect\s*\(\s*(\w+)\s*\(/g;
  let match;
  while ((match = callRegex.exec(code)) !== null) {
    if (!['expect', 'describe', 'it', 'test', 'beforeEach', 'afterEach'].includes(match[1])) {
      calledFunctions.add(match[1]);
    }
  }
  
  // Find all defined functions
  const definedFunctions = new Set<string>();
  const defRegex = /function\s+(\w+)\s*\(/g;
  while ((match = defRegex.exec(code)) !== null) {
    definedFunctions.add(match[1]);
  }
  
  // Find missing functions
  const missing: string[] = [];
  calledFunctions.forEach(fn => {
    if (!definedFunctions.has(fn)) {
      missing.push(fn);
    }
  });
  
  if (missing.length > 0) {
    console.warn("Missing function definitions:", missing);
    
    // Add placeholder warning at top of file
    const warning = `\n// ⚠️ WARNING: These functions are called but not defined: ${missing.join(', ')}
// The tests will fail. Please add function definitions.\n`;
    
    code = warning + code;
  }
  
  return code;
}

export { buildSmartPrompt, cleanGeneratedCode, removeForbiddenPatterns, validateAndFixFunctions };