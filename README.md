# TestForge AI ⚡

AI-powered test suite generator. Upload a project ZIP → AI analyzes the code → Generates complete test files.

## Features
- **Multi-language**: Node.js, TypeScript, Python, Java
- **Auto-detection**: Detects project type and suggests the right framework
- **AI generation**: Claude Sonnet generates unit tests, integration tests, and edge cases
- **Live streaming**: Watch tests generate in real-time
- **Frameworks**: Jest, Vitest, Mocha, Pytest, JUnit 5, RSpec
- **Download**: One-click download of generated test file

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Usage

1. Zip your project folder (Node.js, Python, Java, etc.)
2. Upload the ZIP file
3. Review the analysis (functions, endpoints, business logic)
4. Select a test framework
5. Click "Generate Test Suite"
6. Download the generated test file

## Project Structure

```
src/
  App.tsx                  # Root app + state machine
  types.ts                 # TypeScript types
  components/
    Header.tsx             # Top nav
    UploadZone.tsx         # Drag & drop uploader
    AnalysisPanel.tsx      # Code analysis results + framework picker
    TestOutputPanel.tsx    # Generated test viewer + download
  utils/
    analyzer.ts            # ZIP extraction + code analysis
    testGenerator.ts       # Claude API integration
```

## How It Works

1. **ZIP Extraction** (`analyzer.ts`): Uses JSZip to extract code files, filtering out node_modules, binaries, etc.
2. **Code Analysis**: Regex-based AST-lite parsing to find functions, API routes, business logic patterns
3. **Project Detection**: Identifies language/framework from config files and file extensions
4. **Test Generation** (`testGenerator.ts`): Sends analysis + code snippets to Claude API with a structured prompt
5. **Streaming Output**: SSE streaming for real-time test preview

## Tech Stack

- React 18 + TypeScript
- Tailwind CSS
- Vite
- JSZip (ZIP parsing)
- Anthropic Claude API (claude-sonnet-4-20250514)
