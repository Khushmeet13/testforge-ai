import JSZip from "jszip";
import {
  FileInfo,
  FunctionInfo,
  ApiEndpoint,
  BusinessLogic,
  AnalysisResult,
  ProjectType,
  TestFramework,
} from "../types";

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "venv",
  "dist", "build", ".next", "coverage", ".pytest_cache",
  "target", ".gradle", ".idea", ".vscode", "vendor",
]);

const IGNORED_EXTENSIONS = new Set([
  ".lock", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".map", ".min.js",
  ".min.css", ".zip", ".tar", ".gz", ".pdf", ".DS_Store",
]);

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript",
  ".py": "Python",
  ".java": "Java",
  ".rb": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".php": "PHP",
  ".cs": "C#",
  ".cpp": "C++", ".cc": "C++", ".cxx": "C++",
  ".c": "C",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".json": "JSON",
  ".yaml": "YAML", ".yml": "YAML",
  ".toml": "TOML",
  ".xml": "XML",
  ".html": "HTML",
  ".css": "CSS",
  ".sh": "Shell",
  ".sql": "SQL",
};

export async function extractZip(file: File): Promise<FileInfo[]> {
  const zip = new JSZip();
  const content = await zip.loadAsync(file);
  const files: FileInfo[] = [];

  const entries = Object.entries(content.files);

  for (const [path, zipEntry] of entries) {
    if (zipEntry.dir) continue;

    const parts = path.split("/");
    const shouldIgnore = parts.some((part) => IGNORED_DIRS.has(part));
    if (shouldIgnore) continue;

    const ext = "." + path.split(".").pop()?.toLowerCase();
    if (IGNORED_EXTENSIONS.has(ext)) continue;

    // Only process text-like files
    const language = LANGUAGE_MAP[ext] || null;
    if (!language && !path.endsWith(".txt") && !path.endsWith(".md")) continue;

    try {
      const textContent = await zipEntry.async("text");
      if (textContent.length > 200_000) continue; // skip huge files

      files.push({
        name: parts[parts.length - 1],
        path,
        content: textContent,
        language: language || "Text",
        size: textContent.length,
      });
    } catch {
      // Binary file, skip
    }
  }

  return files;
}

export function detectProjectType(files: FileInfo[]): ProjectType {
  const names = files.map((f) => f.name.toLowerCase());
  const paths = files.map((f) => f.path.toLowerCase());

  if (names.includes("package.json")) {
    const pkg = files.find((f) => f.name === "package.json");
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg.content);
        const deps = {
          ...parsed.dependencies,
          ...parsed.devDependencies,
        };
        if (deps["typescript"] || paths.some((p) => p.endsWith(".ts"))) {
          return "typescript";
        }
      } catch {}
    }
    return "nodejs";
  }

  if (
    names.includes("requirements.txt") ||
    names.includes("setup.py") ||
    names.includes("pyproject.toml") ||
    paths.some((p) => p.endsWith(".py"))
  )
    return "python";

  if (
    names.includes("pom.xml") ||
    names.includes("build.gradle") ||
    paths.some((p) => p.endsWith(".java"))
  )
    return "java";

  return "unknown";
}

export function suggestFramework(
  projectType: ProjectType,
  files: FileInfo[]
): TestFramework {
  if (projectType === "python") return "pytest";
  if (projectType === "java") return "junit";

  if (projectType === "typescript" || projectType === "nodejs") {
    const pkg = files.find((f) => f.name === "package.json");
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg.content);
        const deps = {
          ...parsed.dependencies,
          ...parsed.devDependencies,
        };
        if (deps["vitest"]) return "vitest";
        if (deps["mocha"]) return "mocha";
      } catch {}
    }
    return "jest";
  }

  return "jest";
}

function extractJSFunctions(content: string, filePath: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = content.split("\n");

  const patterns = [
    // export function foo(a, b)
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
    // export const foo = (a, b) =>
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/,
    // export const foo = async function(a, b)
    /(?:export\s+)?const\s+(\w+)\s*=\s*async\s+function\s*\(([^)]*)\)/,
    // class method: methodName(a, b) {
    /^\s{2,}(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/,
  ];

  lines.forEach((line, idx) => {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1] && match[1] !== "if" && match[1] !== "for" && match[1] !== "while") {
        const params = match[2]
          ? match[2]
              .split(",")
              .map((p) => p.trim().split(":")[0].trim().split("=")[0].trim())
              .filter(Boolean)
          : [];

        functions.push({
          name: match[1],
          params,
          isAsync: line.includes("async"),
          isExported: line.includes("export"),
          file: filePath,
          lineNumber: idx + 1,
        });
        break;
      }
    }
  });

  return functions;
}

function extractPythonFunctions(content: string, filePath: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    const match = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
    if (match) {
      const params = match[2]
        ? match[2]
            .split(",")
            .map((p) => p.trim().split(":")[0].split("=")[0].trim())
            .filter((p) => p && p !== "self" && p !== "cls")
        : [];

      functions.push({
        name: match[1],
        params,
        isAsync: line.includes("async def"),
        isExported: !match[1].startsWith("_"),
        file: filePath,
        lineNumber: idx + 1,
      });
    }
  });

  return functions;
}

function extractJavaFunctions(content: string, filePath: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    const match = line.match(
      /(?:public|private|protected)\s+(?:static\s+)?(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(([^)]*)\)/
    );
    if (match && match[1] !== "class" && match[1] !== "if") {
      const params = match[2]
        ? match[2]
            .split(",")
            .map((p) => {
              const parts = p.trim().split(/\s+/);
              return parts[parts.length - 1];
            })
            .filter(Boolean)
        : [];

      functions.push({
        name: match[1],
        params,
        isAsync: false,
        isExported: line.includes("public"),
        file: filePath,
        lineNumber: idx + 1,
      });
    }
  });

  return functions;
}

function extractApiEndpoints(files: FileInfo[]): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  for (const file of files) {
    const { content, path } = file;

    // Express/Fastify/Koa style
    const jsApiPattern =
      /(?:app|router|server)\.(get|post|put|patch|delete|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match;
    while ((match = jsApiPattern.exec(content)) !== null) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: path,
      });
    }

    // Flask/FastAPI style
    const pythonApiPattern =
      /@(?:app|router|blueprint)\.(?:route|get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
    while ((match = pythonApiPattern.exec(content)) !== null) {
      endpoints.push({
        method: "GET",
        path: match[1],
        file: path,
      });
    }

    // Spring style
    const springPattern =
      /@(?:GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)\s*\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"]/gi;
    while ((match = springPattern.exec(content)) !== null) {
      const method = match[0].includes("Get")
        ? "GET"
        : match[0].includes("Post")
        ? "POST"
        : match[0].includes("Put")
        ? "PUT"
        : "DELETE";
      endpoints.push({ method, path: match[1], file: path });
    }
  }

  return endpoints.slice(0, 20);
}

function extractBusinessLogic(files: FileInfo[]): BusinessLogic[] {
  const logic: BusinessLogic[] = [];

  const keywords = {
    validation: ["validate", "verify", "check", "isValid", "assert"],
    calculation: ["calculate", "compute", "sum", "total", "price", "fee", "rate", "score"],
    transformation: ["transform", "convert", "format", "parse", "serialize", "map", "filter"],
    query: ["find", "search", "fetch", "get", "query", "select", "load"],
    auth: ["auth", "login", "logout", "jwt", "token", "permission", "role", "access"],
    other: ["process", "handle", "execute", "run"],
  };

  for (const file of files) {
    for (const [type, words] of Object.entries(keywords)) {
      for (const word of words) {
        const regex = new RegExp(`\\b(${word}\\w*)\\s*[=(]`, "gi");
        const match = regex.exec(file.content);
        if (match) {
          logic.push({
            name: match[1],
            file: file.path,
            type: type as BusinessLogic["type"],
            description: `${type} logic: ${match[1]}`,
          });
          break;
        }
      }
    }
  }

  return logic.slice(0, 15);
}

function extractDependencies(files: FileInfo[]): string[] {
  const deps: Set<string> = new Set();

  for (const file of files) {
    if (file.name === "package.json") {
      try {
        const pkg = JSON.parse(file.content);
        Object.keys(pkg.dependencies || {}).forEach((d) => deps.add(d));
        Object.keys(pkg.devDependencies || {}).forEach((d) => deps.add(d));
      } catch {}
    }
    if (file.name === "requirements.txt") {
      file.content.split("\n").forEach((line) => {
        const dep = line.split("==")[0].split(">=")[0].trim();
        if (dep && !dep.startsWith("#")) deps.add(dep);
      });
    }
    if (file.name === "pom.xml") {
      const matches = file.content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g);
      for (const m of matches) deps.add(m[1]);
    }
  }

  return Array.from(deps).slice(0, 20);
}

export function analyzeProject(files: FileInfo[], fileName: string): AnalysisResult {
  const projectType = detectProjectType(files);
  const suggestedFramework = suggestFramework(projectType, files);

  const functions: FunctionInfo[] = [];
  for (const file of files) {
    if (file.language === "JavaScript" || file.language === "TypeScript") {
      functions.push(...extractJSFunctions(file.content, file.path));
    } else if (file.language === "Python") {
      functions.push(...extractPythonFunctions(file.content, file.path));
    } else if (file.language === "Java") {
      functions.push(...extractJavaFunctions(file.content, file.path));
    }
  }

  const apiEndpoints = extractApiEndpoints(files);
  const businessLogic = extractBusinessLogic(files);
  const dependencies = extractDependencies(files);
  const externalDeps = extractExternalDeps(files, projectType);

  const languages = [...new Set(files.map((f) => f.language).filter((l) => l !== "Text"))];

  const projectName =
    fileName.replace(/\.zip$/i, "").replace(/[_-]/g, " ") || "My Project";

  const testableItems =
    functions.slice(0, 50).length + apiEndpoints.length + businessLogic.length;

  return {
    projectType,
    projectName,
    suggestedFramework,
    files: files.slice(0, 30),
    functions: functions.slice(0, 50),
    apiEndpoints,
    businessLogic,
    dependencies,
    languages,
    summary: `Detected ${files.length} files across ${languages.join(", ")} with ${functions.length} functions and ${apiEndpoints.length} API endpoints.`,
    testableItems,
    externalDeps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// External Dependency Detection
// ─────────────────────────────────────────────────────────────────────────────

import { ExternalDependency, ExternalDepType } from "../types";

const DB_LIBS = new Set(["mongoose","sequelize","typeorm","prisma","pg","mysql","mysql2","mongodb","sqlite3","knex","redis","ioredis","dynamodb","@aws-sdk/client-dynamodb","firebase-admin","supabase","@supabase/supabase-js","cassandra-driver","elasticsearch"]);
const HTTP_LIBS = new Set(["axios","node-fetch","fetch","got","superagent","request","http","https","needle","ky","cross-fetch","isomorphic-fetch"]);
const FILE_LIBS = new Set(["fs","fs/promises","path","os","readline","stream","zlib","archiver","multer","formidable","busboy","sharp"]);
const QUEUE_LIBS = new Set(["bull","bullmq","amqplib","kafka","kafkajs","aws-sqs","@aws-sdk/client-sqs","nats","redis-queue","celery","rq"]);
const CACHE_LIBS = new Set(["redis","ioredis","memcached","node-cache","lru-cache","cache-manager"]);
const EMAIL_LIBS = new Set(["nodemailer","sendgrid","@sendgrid/mail","mailgun-js","postmark","mailchimp","ses","@aws-sdk/client-ses"]);
const AUTH_LIBS = new Set(["passport","jsonwebtoken","jwt","bcrypt","bcryptjs","argon2","oauth","oauth2","firebase-auth","auth0","@auth0/auth0-react","clerk"]);

const PY_DB = new Set(["sqlalchemy","pymongo","psycopg2","pymysql","motor","redis","aioredis","databases","tortoise","peewee","django.db"]);
const PY_HTTP = new Set(["requests","aiohttp","httpx","urllib","urllib3","httplib2"]);
const PY_FILE = new Set(["pathlib","os.path","shutil","io","open","csv","json","yaml","toml"]);
const PY_QUEUE = new Set(["celery","dramatiq","rq","pika","kafka-python","confluent-kafka","boto3.sqs"]);
const PY_EMAIL = new Set(["smtplib","email","sendgrid","mailgun","boto3.ses"]);
const PY_AUTH = new Set(["jwt","pyjwt","bcrypt","passlib","authlib","python-jose","itsdangerous"]);

const JAVA_DB = new Set(["JpaRepository","EntityManager","DataSource","JdbcTemplate","MongoRepository","RedisTemplate","CrudRepository","HibernateSessionFactory"]);
const JAVA_HTTP = new Set(["RestTemplate","WebClient","HttpClient","OkHttpClient","Feign","Retrofit"]);
const JAVA_FILE = new Set(["FileInputStream","FileOutputStream","BufferedReader","Files.read","Files.write","FileUtils"]);

function classifyDep(name: string, projectType: string): ExternalDepType | null {
  if (projectType === "python") {
    if ([...PY_DB].some(d => name.includes(d))) return "database";
    if ([...PY_HTTP].some(d => name.includes(d))) return "http";
    if ([...PY_FILE].some(d => name.includes(d))) return "fileio";
    if ([...PY_QUEUE].some(d => name.includes(d))) return "queue";
    if ([...PY_EMAIL].some(d => name.includes(d))) return "email";
    if ([...PY_AUTH].some(d => name.includes(d))) return "auth";
  } else if (projectType === "java") {
    if ([...JAVA_DB].some(d => name.includes(d))) return "database";
    if ([...JAVA_HTTP].some(d => name.includes(d))) return "http";
    if ([...JAVA_FILE].some(d => name.includes(d))) return "fileio";
  } else {
    if (DB_LIBS.has(name)) return "database";
    if (HTTP_LIBS.has(name)) return "http";
    if (FILE_LIBS.has(name)) return "fileio";
    if (QUEUE_LIBS.has(name)) return "queue";
    if (CACHE_LIBS.has(name)) return "cache";
    if (EMAIL_LIBS.has(name)) return "email";
    if (AUTH_LIBS.has(name)) return "auth";
  }
  return null;
}

const MOCK_STRATEGIES: Record<ExternalDepType, string> = {
  database: "Mock DB connection, stub query methods, return fixture data",
  http: "Intercept HTTP calls with nock/msw, return mock responses",
  fileio: "Use in-memory fs (memfs) or jest.mock('fs'), avoid real disk I/O",
  queue: "Mock queue client, stub enqueue/consume, verify messages",
  cache: "Stub cache get/set/del, simulate hits and misses",
  email: "Mock mailer transport, capture sent messages in memory",
  auth: "Mock token verify, stub user lookup, test both valid/invalid paths",
};

export function extractExternalDeps(files: FileInfo[], projectType: string): ExternalDependency[] {
  const depMap = new Map<string, { type: ExternalDepType; files: Set<string> }>();

  for (const file of files) {
    if (!["JavaScript","TypeScript","Python","Java"].includes(file.language)) continue;

    // JS/TS imports
    if (file.language === "JavaScript" || file.language === "TypeScript") {
      const importRegex = /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
      let m;
      while ((m = importRegex.exec(file.content)) !== null) {
        const pkg = (m[1] || m[2]).replace(/^@types\//, "").split("/").slice(0, m[1]?.startsWith("@") ? 2 : 1).join("/");
        const depType = classifyDep(pkg, projectType);
        if (depType) {
          const existing = depMap.get(pkg);
          if (existing) { existing.files.add(file.path); }
          else depMap.set(pkg, { type: depType, files: new Set([file.path]) });
        }
      }
    }

    // Python imports
    if (file.language === "Python") {
      const pyImport = /(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import)/g;
      let m;
      while ((m = pyImport.exec(file.content)) !== null) {
        const pkg = (m[1] || m[2]).split(".")[0];
        const depType = classifyDep(pkg, projectType);
        if (depType) {
          const existing = depMap.get(pkg);
          if (existing) { existing.files.add(file.path); }
          else depMap.set(pkg, { type: depType, files: new Set([file.path]) });
        }
      }
    }

    // Java — look for usage patterns
    if (file.language === "Java") {
      const javaPatterns = [...JAVA_DB, ...JAVA_HTTP, ...JAVA_FILE];
      for (const pattern of javaPatterns) {
        if (file.content.includes(pattern)) {
          const depType = classifyDep(pattern, projectType);
          if (depType) {
            const existing = depMap.get(pattern);
            if (existing) { existing.files.add(file.path); }
            else depMap.set(pattern, { type: depType, files: new Set([file.path]) });
          }
        }
      }
    }
  }

  return Array.from(depMap.entries()).map(([name, { type, files }]) => ({
    name, type,
    files: Array.from(files),
    mockStrategy: MOCK_STRATEGIES[type],
  }));
}
