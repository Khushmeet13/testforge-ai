import { useState } from "react";
import { AnalysisResult, ExternalDependency, ExternalDepType, MockFile, TestFramework } from "../types";

interface MockGenerationPanelProps {
  analysis: AnalysisResult;
  framework: TestFramework;
}

const TYPE_META: Record<ExternalDepType, { icon: string; label: string; color: string; accentColor: string }> = {
  database: { icon: "🗄️",  label: "Database",   color: "bg-[#3b82f6]/5 border-[#3b82f6]/20", accentColor: "#3b82f6" },
  http:     { icon: "🌐",  label: "HTTP Client", color: "bg-[#8b5cf6]/5 border-[#8b5cf6]/20", accentColor: "#8b5cf6" },
  fileio:   { icon: "📁",  label: "File I/O",    color: "bg-[#f59e0b]/5 border-[#f59e0b]/20", accentColor: "#f59e0b" },
  queue:    { icon: "📨",  label: "Message Queue", color: "bg-[#ec4899]/5 border-[#ec4899]/20", accentColor: "#ec4899" },
  cache:    { icon: "⚡",  label: "Cache",       color: "bg-[#06b6d4]/5 border-[#06b6d4]/20", accentColor: "#06b6d4" },
  email:    { icon: "✉️",  label: "Email",       color: "bg-[#10b981]/5 border-[#10b981]/20", accentColor: "#10b981" },
  auth:     { icon: "🔐",  label: "Auth/JWT",    color: "bg-[#f97316]/5 border-[#f97316]/20", accentColor: "#f97316" },
};

function generateMockContent(dep: ExternalDependency, framework: TestFramework, projectType: string): MockFile {
  const isJest = framework === "jest" || framework === "vitest";
  const isPy = projectType === "python";
  const isJava = projectType === "java";
  const mockFn = framework === "vitest" ? "vi.fn()" : "jest.fn()";

  if (isPy) {
    return generatePythonMock(dep);
  }
  if (isJava) {
    return generateJavaMock(dep);
  }
  return generateJSMock(dep, mockFn, framework);
}

function generateJSMock(dep: ExternalDependency, mockFn: string, framework: TestFramework): MockFile {
  const vitest = framework === "vitest";
  const importLine = vitest ? `import { vi } from 'vitest';` : `// jest auto-mock`;

  const mocks: Record<ExternalDepType, { filename: string; content: string }> = {
    database: {
      filename: `__mocks__/${dep.name}.js`,
      content: `${importLine}

// Mock for: ${dep.name}
// Used in: ${dep.files.map(f => f.split("/").pop()).join(", ")}

const mockQuery = ${mockFn};
const mockFind = ${mockFn};
const mockFindOne = ${mockFn};
const mockSave = ${mockFn};
const mockDelete = ${mockFn};
const mockCreate = ${mockFn};
const mockUpdate = ${mockFn};

// Fixture data
export const fixtures = {
  user: { id: "user-1", name: "Test User", email: "test@example.com", createdAt: new Date() },
  users: [
    { id: "user-1", name: "Test User", email: "test@example.com" },
    { id: "user-2", name: "Another User", email: "other@example.com" },
  ],
};

// Mock model/connection
const mockDb = {
  query: mockQuery,
  find: mockFind.mockResolvedValue([fixtures.user]),
  findOne: mockFindOne.mockResolvedValue(fixtures.user),
  findById: mockFindOne.mockResolvedValue(fixtures.user),
  save: mockSave.mockResolvedValue(fixtures.user),
  create: mockCreate.mockResolvedValue(fixtures.user),
  update: mockUpdate.mockResolvedValue({ affected: 1 }),
  delete: mockDelete.mockResolvedValue({ affected: 1 }),
  // Chain helpers
  where: ${mockFn}.mockReturnThis(),
  select: ${mockFn}.mockReturnThis(),
  limit: ${mockFn}.mockReturnThis(),
  skip: ${mockFn}.mockReturnThis(),
  exec: ${mockFn}.mockResolvedValue([fixtures.user]),
};

module.exports = mockDb;
module.exports.default = mockDb;
`,
    },
    http: {
      filename: `__mocks__/${dep.name}.js`,
      content: `${importLine}

// Mock for: ${dep.name} (HTTP Client)
// Used in: ${dep.files.map(f => f.split("/").pop()).join(", ")}

const createMockResponse = (data, status = 200) => ({
  data,
  status,
  statusText: status === 200 ? "OK" : "Error",
  headers: { "content-type": "application/json" },
  ok: status >= 200 && status < 300,
});

// Default mock responses per method
const mockGet = ${mockFn}.mockResolvedValue(createMockResponse({ success: true, data: {} }));
const mockPost = ${mockFn}.mockResolvedValue(createMockResponse({ success: true, id: "new-id" }, 201));
const mockPut = ${mockFn}.mockResolvedValue(createMockResponse({ success: true }));
const mockPatch = ${mockFn}.mockResolvedValue(createMockResponse({ success: true }));
const mockDelete = ${mockFn}.mockResolvedValue(createMockResponse(null, 204));

const mockAxios = {
  get: mockGet,
  post: mockPost,
  put: mockPut,
  patch: mockPatch,
  delete: mockDelete,
  request: ${mockFn}.mockResolvedValue(createMockResponse({})),
  create: jest.fn().mockReturnThis(),
  defaults: { headers: {} },
  interceptors: {
    request: { use: ${mockFn}, eject: ${mockFn} },
    response: { use: ${mockFn}, eject: ${mockFn} },
  },
};

// Helper: simulate network error
mockAxios.simulateError = (method, error) => {
  mockAxios[method].mockRejectedValueOnce(error || new Error("Network Error"));
};

// Helper: override next response
mockAxios.mockNextResponse = (method, data, status = 200) => {
  mockAxios[method].mockResolvedValueOnce(createMockResponse(data, status));
};

module.exports = mockAxios;
module.exports.default = mockAxios;
`,
    },
    fileio: {
      filename: `__mocks__/fs.js`,
      content: `${importLine}

// Mock for Node.js 'fs' module
// Used in: ${dep.files.map(f => f.split("/").pop()).join(", ")}

const path = require("path");

// In-memory virtual filesystem
const _files = new Map();
const _dirs = new Set(["/"]);

const mockFs = {
  // Sync methods
  readFileSync: ${mockFn}.mockImplementation((filePath, encoding) => {
    const content = _files.get(path.normalize(filePath));
    if (!content) throw Object.assign(new Error(\`ENOENT: no such file: \${filePath}\`), { code: "ENOENT" });
    return encoding ? content.toString() : Buffer.from(content);
  }),
  writeFileSync: ${mockFn}.mockImplementation((filePath, data) => {
    _files.set(path.normalize(filePath), Buffer.from(data));
  }),
  existsSync: ${mockFn}.mockImplementation((filePath) => _files.has(path.normalize(filePath))),
  mkdirSync: ${mockFn}.mockImplementation((dir) => { _dirs.add(path.normalize(dir)); }),
  unlinkSync: ${mockFn}.mockImplementation((filePath) => { _files.delete(path.normalize(filePath)); }),
  readdirSync: ${mockFn}.mockReturnValue([]),
  statSync: ${mockFn}.mockReturnValue({ isFile: () => true, isDirectory: () => false, size: 100 }),

  // Async promise methods
  promises: {
    readFile: ${mockFn}.mockResolvedValue(Buffer.from("")),
    writeFile: ${mockFn}.mockResolvedValue(undefined),
    unlink: ${mockFn}.mockResolvedValue(undefined),
    mkdir: ${mockFn}.mockResolvedValue(undefined),
    readdir: ${mockFn}.mockResolvedValue([]),
    stat: ${mockFn}.mockResolvedValue({ isFile: () => true, size: 100 }),
  },

  // Test helpers
  _reset: () => { _files.clear(); _dirs.clear(); _dirs.add("/"); },
  _setFile: (filePath, content) => { _files.set(path.normalize(filePath), Buffer.from(content)); },
  _getFile: (filePath) => _files.get(path.normalize(filePath))?.toString(),
};

module.exports = mockFs;
`,
    },
    queue: {
      filename: `__mocks__/${dep.name}.js`,
      content: `${importLine}

// Mock for: ${dep.name} (Message Queue)
// Used in: ${dep.files.map(f => f.split("/").pop()).join(", ")}

const _sentMessages = [];
const _handlers = new Map();

const mockQueue = {
  add: ${mockFn}.mockImplementation((jobName, data) => {
    _sentMessages.push({ jobName, data, timestamp: Date.now() });
    return Promise.resolve({ id: \`job-\${Date.now()}\`, data });
  }),
  process: ${mockFn}.mockImplementation((jobName, handler) => { _handlers.set(jobName, handler); }),
  publish: ${mockFn}.mockImplementation((topic, message) => {
    _sentMessages.push({ topic, message, timestamp: Date.now() });
    return Promise.resolve();
  }),
  subscribe: ${mockFn},
  close: ${mockFn}.mockResolvedValue(undefined),
  on: ${mockFn}.mockReturnThis(),

  // Test helpers
  _getSentMessages: () => [..._sentMessages],
  _clearMessages: () => { _sentMessages.length = 0; },
  _triggerJob: async (jobName, data) => {
    const handler = _handlers.get(jobName);
    if (handler) await handler({ data, id: "test-job" });
  },
};

module.exports = mockQueue;
module.exports.default = mockQueue;
`,
    },
    cache: {
      filename: `__mocks__/${dep.name}.js`,
      content: `${importLine}

// Mock for: ${dep.name} (Cache)
// Used in: ${dep.files.map(f => f.split("/").pop()).join(", ")}

const _store = new Map();

const mockCache = {
  get: ${mockFn}.mockImplementation((key) => Promise.resolve(_store.get(key) ?? null)),
  set: ${mockFn}.mockImplementation((key, value) => { _store.set(key, value); return Promise.resolve("OK"); }),
  del: ${mockFn}.mockImplementation((key) => { _store.delete(key); return Promise.resolve(1); }),
  exists: ${mockFn}.mockImplementation((key) => Promise.resolve(_store.has(key) ? 1 : 0)),
  expire: ${mockFn}.mockResolvedValue(1),
  ttl: ${mockFn}.mockResolvedValue(3600),
  flushall: ${mockFn}.mockImplementation(() => { _store.clear(); return Promise.resolve("OK"); }),
  quit: ${mockFn}.mockResolvedValue(undefined),
  on: ${mockFn}.mockReturnThis(),
  pipeline: ${mockFn}.mockReturnValue({ exec: ${mockFn}.mockResolvedValue([]) }),

  // Test helpers
  _store,
  _reset: () => _store.clear(),
  _seed: (key, value) => _store.set(key, value),
};

module.exports = mockCache;
module.exports.default = mockCache;
`,
    },
    email: {
      filename: `__mocks__/${dep.name}.js`,
      content: `${importLine}

// Mock for: ${dep.name} (Email)
// Used in: ${dep.files.map(f => f.split("/").pop()).join(", ")}

const _sentEmails = [];

const mockTransporter = {
  sendMail: ${mockFn}.mockImplementation((options) => {
    _sentEmails.push({ ...options, sentAt: new Date().toISOString(), messageId: \`<mock-\${Date.now()}@test>\` });
    return Promise.resolve({ messageId: \`<mock-\${Date.now()}@test>\`, accepted: [options.to], rejected: [] });
  }),
  verify: ${mockFn}.mockResolvedValue(true),
  close: ${mockFn},
};

const mockMailer = {
  send: ${mockFn}.mockImplementation((msg) => {
    _sentEmails.push(msg);
    return Promise.resolve({ statusCode: 202, headers: {} });
  }),
  createTransport: ${mockFn}.mockReturnValue(mockTransporter),

  // Test helpers
  _getSentEmails: () => [..._sentEmails],
  _clearEmails: () => { _sentEmails.length = 0; },
  _getLastEmail: () => _sentEmails[_sentEmails.length - 1],
  _findEmailTo: (address) => _sentEmails.filter(e => e.to === address || e.to?.includes?.(address)),
};

module.exports = mockMailer;
module.exports.default = mockMailer;
`,
    },
    auth: {
      filename: `__mocks__/${dep.name}.js`,
      content: `${importLine}

// Mock for: ${dep.name} (Auth / JWT)
// Used in: ${dep.files.map(f => f.split("/").pop()).join(", ")}

// Fixture tokens and users
export const fixtures = {
  validToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock.signature",
  expiredToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.signature",
  user: { id: "user-123", email: "test@example.com", role: "user", iat: 1700000000, exp: 9999999999 },
  adminUser: { id: "admin-1", email: "admin@example.com", role: "admin", iat: 1700000000, exp: 9999999999 },
};

const mockAuth = {
  // JWT
  sign: ${mockFn}.mockReturnValue(fixtures.validToken),
  verify: ${mockFn}.mockImplementation((token) => {
    if (token === fixtures.expiredToken) throw Object.assign(new Error("jwt expired"), { name: "TokenExpiredError" });
    if (!token || token === "invalid") throw Object.assign(new Error("invalid token"), { name: "JsonWebTokenError" });
    return fixtures.user;
  }),
  decode: ${mockFn}.mockReturnValue(fixtures.user),

  // bcrypt
  hash: ${mockFn}.mockResolvedValue("$2b$10$mockhash"),
  compare: ${mockFn}.mockImplementation((plain, hash) =>
    Promise.resolve(plain === "correct-password" || hash === "$2b$10$mockhash")
  ),
  hashSync: ${mockFn}.mockReturnValue("$2b$10$mockhash"),
  compareSync: ${mockFn}.mockReturnValue(true),

  // Test helpers
  mockValidUser: () => mockAuth.verify.mockReturnValueOnce(fixtures.user),
  mockAdminUser: () => mockAuth.verify.mockReturnValueOnce(fixtures.adminUser),
  mockExpiredToken: () => mockAuth.verify.mockImplementationOnce(() => {
    throw Object.assign(new Error("jwt expired"), { name: "TokenExpiredError" });
  }),
};

module.exports = mockAuth;
module.exports.default = mockAuth;
`,
    },
  };

  const m = mocks[dep.type];
  return { filename: m.filename, content: m.content, type: dep.type };
}

function generatePythonMock(dep: ExternalDependency): MockFile {
  const mocks: Partial<Record<ExternalDepType, MockFile>> = {
    database: {
      filename: `fixtures/${dep.name}_mock.py`,
      type: "database",
      content: `"""Mock for ${dep.name} — used in: ${dep.files.map(f => f.split("/").pop()).join(", ")}"""
from unittest.mock import MagicMock, AsyncMock, patch
import pytest

# Fixture data
MOCK_USER = {"id": "user-1", "name": "Test User", "email": "test@example.com"}
MOCK_USERS = [MOCK_USER, {"id": "user-2", "name": "Other", "email": "other@example.com"}]

@pytest.fixture
def mock_db(mocker):
    """Fixture: mock database session/connection."""
    mock = MagicMock()
    mock.query.return_value.all.return_value = MOCK_USERS
    mock.query.return_value.first.return_value = MOCK_USER
    mock.query.return_value.filter.return_value = mock.query.return_value
    mock.query.return_value.filter_by.return_value = mock.query.return_value
    mock.add = MagicMock()
    mock.commit = MagicMock()
    mock.delete = MagicMock()
    mock.rollback = MagicMock()
    mock.close = MagicMock()
    return mock

@pytest.fixture
def mock_db_async(mocker):
    """Fixture: async database session mock."""
    mock = AsyncMock()
    mock.execute.return_value.fetchall.return_value = MOCK_USERS
    mock.execute.return_value.fetchone.return_value = MOCK_USER
    mock.commit = AsyncMock()
    mock.rollback = AsyncMock()
    return mock
`,
    },
    http: {
      filename: `fixtures/${dep.name}_mock.py`,
      type: "http",
      content: `"""Mock for ${dep.name} (HTTP) — used in: ${dep.files.map(f => f.split("/").pop()).join(", ")}"""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

def make_response(data=None, status=200):
    mock = MagicMock()
    mock.status_code = status
    mock.ok = 200 <= status < 300
    mock.json.return_value = data or {"success": True}
    mock.text = str(data)
    mock.raise_for_status = MagicMock(
        side_effect=None if mock.ok else Exception(f"HTTP {status}")
    )
    return mock

@pytest.fixture
def mock_requests(mocker):
    mock = MagicMock()
    mock.get.return_value = make_response({"data": []})
    mock.post.return_value = make_response({"id": "new-id"}, 201)
    mock.put.return_value = make_response({"updated": True})
    mock.patch.return_value = make_response({"patched": True})
    mock.delete.return_value = make_response(None, 204)
    return mocker.patch("${dep.name}", mock)

@pytest.fixture
def mock_httpx_async(mocker):
    async def mock_get(*a, **kw): return make_response({"data": []})
    async def mock_post(*a, **kw): return make_response({"id": "new"}, 201)
    mock = AsyncMock()
    mock.get = mock_get
    mock.post = mock_post
    return mock
`,
    },
  };

  return mocks[dep.type] ?? {
    filename: `fixtures/${dep.name}_mock.py`,
    type: dep.type,
    content: `"""Mock for ${dep.name} (${dep.type})"""\nfrom unittest.mock import MagicMock, patch\nimport pytest\n\n@pytest.fixture\ndef mock_${dep.name.replace(/[-./]/g, "_")}():\n    return MagicMock()\n`,
  };
}

function generateJavaMock(dep: ExternalDependency): MockFile {
  return {
    filename: `src/test/java/mocks/${dep.name}Mock.java`,
    type: dep.type,
    content: `// Mock for ${dep.name} (${dep.type})
// Add @ExtendWith(MockitoExtension.class) to your test class

import org.mockito.Mock;
import org.mockito.Mockito;
import static org.mockito.Mockito.*;

public class ${dep.name.replace(/[-./]/g, "")}Mock {
    // Usage in test class:
    // @Mock
    // private ${dep.name} mock${dep.name};
    //
    // @BeforeEach void setUp() {
    //     when(mock${dep.name}.findById(anyString())).thenReturn(Optional.of(testEntity));
    //     when(mock${dep.name}.save(any())).thenAnswer(i -> i.getArguments()[0]);
    // }
}
`,
  };
}

export function MockGenerationPanel({ analysis, framework }: MockGenerationPanelProps) {
  const [selectedDep, setSelectedDep] = useState<ExternalDependency | null>(
    analysis.externalDeps[0] ?? null
  );
  const [copied, setCopied] = useState<string | null>(null);

  const mockFile = selectedDep
    ? generateMockContent(selectedDep, framework, analysis.projectType)
    : null;

  const handleCopy = (content: string, key: string) => {
    navigator.clipboard.writeText(content);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownloadAll = () => {
    // Build a simple text bundle of all mocks
    const allContent = analysis.externalDeps
      .map(dep => {
        const mf = generateMockContent(dep, framework, analysis.projectType);
        return `// ===== ${mf.filename} =====\n${mf.content}\n`;
      })
      .join("\n");
    const blob = new Blob([allContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mocks_bundle.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (analysis.externalDeps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-5xl">🎯</div>
        <p className="text-white/40 text-sm">No external dependencies detected</p>
        <p className="text-white/20 text-xs max-w-xs text-center">
          Mock generation kicks in when your project uses databases, HTTP clients, file I/O, queues, etc.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-white font-semibold text-sm tracking-wide">Auto-Generated Mocks</h3>
          <p className="text-white/30 text-xs mt-0.5">
            {analysis.externalDeps.length} external dependencies detected • ready-to-use mock files
          </p>
        </div>
        {analysis.externalDeps.length > 1 && (
          <button
            onClick={handleDownloadAll}
            className="px-3 py-1.5 text-xs bg-[#7b2fff]/20 border border-[#7b2fff]/30 text-[#7b2fff] rounded-lg hover:bg-[#7b2fff]/30 transition-all flex items-center gap-1.5"
          >
            ⬇ Download All Mocks
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dep list */}
        <div className="space-y-2">
          {analysis.externalDeps.map((dep, i) => {
            const meta = TYPE_META[dep.type];
            const isSelected = selectedDep?.name === dep.name;
            return (
              <button
                key={i}
                onClick={() => setSelectedDep(dep)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${meta.color} ${
                  isSelected ? "ring-1 ring-white/20 scale-[1.01]" : "hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-white/80 text-xs font-medium truncate">{dep.name}</p>
                    <p className="text-white/30 text-[10px]">{meta.label}</p>
                  </div>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={{ backgroundColor: `${meta.accentColor}20`, color: meta.accentColor }}
                  >
                    {dep.files.length} file{dep.files.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-white/25 text-[10px] mt-2 line-clamp-2">{dep.mockStrategy}</p>
              </button>
            );
          })}
        </div>

        {/* Mock code view */}
        <div className="lg:col-span-2">
          {mockFile && selectedDep ? (
            <div className="h-full flex flex-col">
              {/* File header */}
              <div className="flex items-center gap-3 px-4 py-2.5 bg-[#111118] border border-white/8 rounded-t-xl">
                <span className="text-lg">{TYPE_META[selectedDep.type].icon}</span>
                <span className="text-white/50 text-xs font-mono flex-1 truncate">{mockFile.filename}</span>
                <button
                  onClick={() => handleCopy(mockFile.content, mockFile.filename)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-white/50 hover:text-white border border-white/10 hover:border-white/25 rounded-md transition-all"
                >
                  {copied === mockFile.filename ? (
                    <><span className="text-[#00ff9d]">✓</span> Copied!</>
                  ) : (
                    <>📋 Copy</>
                  )}
                </button>
              </div>
              <div className="flex-1 bg-[#0d0d14] border border-t-0 border-white/8 rounded-b-xl overflow-auto">
                <pre className="text-xs leading-relaxed p-5 font-mono text-white/70 whitespace-pre-wrap">
                  {mockFile.content}
                </pre>
              </div>

              {/* Used in files */}
              <div className="mt-3 p-3 bg-white/[0.02] border border-white/8 rounded-xl">
                <p className="text-white/30 text-[10px] tracking-widest uppercase mb-2">Used in</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDep.files.map((f, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 bg-white/5 text-white/50 rounded font-mono">
                      {f.split("/").pop()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center py-16 text-white/20 text-sm">
              Select a dependency to view its mock
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
