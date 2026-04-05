export type AppState = "idle" | "analyzing" | "analyzed" | "generating" | "done";
export type ProjectType = "nodejs" | "python" | "java" | "typescript" | "unknown";
export type TestFramework = "jest" | "pytest" | "junit" | "mocha" | "vitest" | "rspec" | "react-testing-library" | "supertest" | "cypress";
export type CICDPlatform = "github" | "gitlab" | "jenkins";

// ── Core ──────────────────────────────────────────────────────────────────────
export interface FileInfo { name: string; path: string; content: string; language: string; size: number; }
export interface FunctionInfo { name: string; params: string[]; returnType?: string; isAsync?: boolean; isExported?: boolean; file: string; description?: string; lineNumber?: number; }
export interface ApiEndpoint { method: string; path: string; file: string; handler?: string; }
export interface BusinessLogic { name: string; file: string; type: "validation"|"calculation"|"transformation"|"query"|"auth"|"other"; description: string; }

// ── Coverage ──────────────────────────────────────────────────────────────────
export interface FileCoverage { path: string; language: string; totalFunctions: number; coveredFunctions: string[]; uncoveredFunctions: string[]; coveragePercent: number; heatLevel: "hot"|"warm"|"cold"|"none"; }
export interface CoverageMap { files: FileCoverage[]; overallPercent: number; totalFunctions: number; coveredCount: number; }

// ── Mocks ─────────────────────────────────────────────────────────────────────
export type ExternalDepType = "database"|"http"|"fileio"|"queue"|"cache"|"email"|"auth";
export interface ExternalDependency { name: string; type: ExternalDepType; files: string[]; mockStrategy: string; }
export interface MockFile { filename: string; content: string; type: ExternalDepType; }

// ── CI/CD ─────────────────────────────────────────────────────────────────────
export interface CICDConfig { platform: CICDPlatform; filename: string; content: string; description: string; }

// ── Test Quality Scorer ───────────────────────────────────────────────────────
export interface QualityDimension { name: string; score: number; max: number; feedback: string; }
export interface QualityReport { overallScore: number; grade: "A"|"B"|"C"|"D"|"F"; dimensions: QualityDimension[]; suggestions: QualitySuggestion[]; strengths: string[]; }
export interface QualitySuggestion { severity: "error"|"warning"|"info"; message: string; location?: string; fix?: string; }

// ── Iterative Refinement Chat ─────────────────────────────────────────────────
export interface ChatMessage { id: string; role: "user"|"assistant"; content: string; timestamp: number; isStreaming?: boolean; }

// ── Bug Detection ─────────────────────────────────────────────────────────────
export type BugSeverity = "critical"|"warning"|"info";
export interface BugReport { id: string; file: string; line?: number; function?: string; severity: BugSeverity; title: string; description: string; suggestion: string; category: "null-safety"|"error-handling"|"security"|"performance"|"logic"|"type-safety"; }

// ── Documentation ─────────────────────────────────────────────────────────────
export interface DocEntry { functionName: string; file: string; docstring: string; }
export interface Documentation { entries: DocEntry[]; readme: string; }

// ── History / Sessions ────────────────────────────────────────────────────────
export interface SessionRecord { id: string; projectName: string; framework: TestFramework; timestamp: number; testOutput: string; analysis: AnalysisResult; qualityScore?: number; }

// ── Diff ──────────────────────────────────────────────────────────────────────
export type DiffStatus = "added"|"removed"|"modified"|"unchanged";
export interface FileDiff { path: string; status: DiffStatus; linesAdded: number; linesRemoved: number; oldContent?: string; newContent?: string; }
export interface DiffResult { files: FileDiff[]; hasChanges: boolean; addedFiles: number; removedFiles: number; modifiedFiles: number; }

// ── Main Analysis Result ──────────────────────────────────────────────────────
export interface AnalysisResult { projectType: ProjectType; projectName: string; suggestedFramework: TestFramework; files: FileInfo[]; functions: FunctionInfo[]; apiEndpoints: ApiEndpoint[]; businessLogic: BusinessLogic[]; dependencies: string[]; summary: string; testableItems: number; languages: string[]; externalDeps: ExternalDependency[]; }
export interface GeneratedTest { framework: TestFramework; content: string; filename: string; }

// ── GitHub Integration ────────────────────────────────────────────────────────
export interface GitHubRepo { id: number; full_name: string; name: string; default_branch: string; private: boolean; language: string | null; description: string | null; html_url: string; }
export interface GitHubFile { path: string; content: string; sha?: string; }
export interface GitHubBranch { name: string; sha: string; }
export interface GitHubPR { number: number; html_url: string; title: string; state: string; }
export interface GitHubConnection { token: string; user: string; avatar_url: string; }

// ── VSCode Split Pane ─────────────────────────────────────────────────────────
export interface SplitPaneFile { path: string; content: string; language: string; testContent?: string; testPath?: string; }

// ── Export Formats ────────────────────────────────────────────────────────────
export type ExportFormat = "zip" | "pdf" | "gist";
export interface ExportResult { format: ExportFormat; url?: string; filename?: string; }
