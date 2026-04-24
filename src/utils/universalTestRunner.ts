// utils/universalTestRunner.ts
// Runs JS/TS tests via WebContainers, Python/Java/Ruby via Judge0 API

import { WebContainer } from '@webcontainer/api';

// ─────────────────────────────────────────────────────────────
// CONFIG — paste your free RapidAPI key from rapidapi.com/judge0
// ─────────────────────────────────────────────────────────────
const JUDGE0_URL = 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_KEY = 'YOUR_RAPIDAPI_KEY'; // <-- replace this

const JUDGE0_LANG_IDS: Record<string, number> = {
    pytest: 71,  // Python 3.8.1
    junit: 62,  // Java (OpenJDK 13.0.1)
    rspec: 72,  // Ruby (2.7.0)
};

// JUnit needs a small harness since Judge0 runs a single file
const JUNIT_HARNESS = (testCode: string) => `
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

${testCode}
`;

const PYTEST_HARNESS = (testCode: string) => `
import pytest
${testCode}

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
`;

const RSPEC_HARNESS = (testCode: string) => `
require 'rspec'
${testCode}

RSpec::Core::Runner.run([__FILE__])
`;

const HARNESSES: Record<string, (code: string) => string> = {
    junit: JUNIT_HARNESS,
    pytest: PYTEST_HARNESS,
    rspec: RSPEC_HARNESS,
};

// ─────────────────────────────────────────────────────────────
// JUDGE0 RUNNER  (Python · Java · Ruby)
// ─────────────────────────────────────────────────────────────
async function runViaJudge0(
    code: string,
    framework: string,
    onOutput: (s: string) => void
): Promise<'pass' | 'fail'> {
    onOutput(`⏳ Submitting ${framework} tests to Judge0...\n`);

    const harness = HARNESSES[framework];
    const finalCode = harness ? harness(code) : code;

    let token: string;
    try {
        const submit = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=true&wait=false`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': JUDGE0_KEY,
                'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
            },
            body: JSON.stringify({
                language_id: JUDGE0_LANG_IDS[framework],
                source_code: btoa(unescape(encodeURIComponent(finalCode))),
                stdin: '',
                cpu_time_limit: 10,
                memory_limit: 256000,
            }),
        });

        if (!submit.ok) {
            const err = await submit.text();
            onOutput(`❌ Judge0 submission failed: ${err}\n`);
            return 'fail';
        }

        const data = await submit.json();
        token = data.token;
    } catch (e: any) {
        onOutput(`❌ Network error: ${e.message}\nMake sure your Judge0 API key is set in universalTestRunner.ts\n`);
        return 'fail';
    }

    onOutput(`📡 Waiting for results`);

    // Poll with exponential backoff
    let result: any = null;
    const delays = [1000, 1500, 2000, 2000, 2000, 3000, 3000, 3000, 3000, 3000];
    for (const delay of delays) {
        await new Promise(r => setTimeout(r, delay));
        onOutput('.');

        try {
            const poll = await fetch(
                `${JUDGE0_URL}/submissions/${token}?base64_encoded=true&fields=status,stdout,stderr,compile_output`,
                {
                    headers: {
                        'X-RapidAPI-Key': JUDGE0_KEY,
                        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
                    },
                }
            );
            result = await poll.json();
            // status id > 2 means done (3=AC, 4=WA, 5=TLE, 6=CE, etc.)
            if (result.status?.id > 2) break;
        } catch {
            // retry silently
        }
    }

    onOutput('\n\n');

    if (!result) {
        onOutput('❌ Timed out waiting for Judge0 response.\n');
        return 'fail';
    }

    // Decode outputs
    const decode = (b64: string | null) =>
        b64 ? decodeURIComponent(escape(atob(b64))) : '';

    const stdout = decode(result.stdout);
    const stderr = decode(result.stderr);
    const compileOutput = decode(result.compile_output);
    const statusId = result.status?.id ?? 0;

    if (compileOutput) {
        onOutput(`🔨 Compile output:\n${compileOutput}\n\n`);
    }
    if (stdout) onOutput(stdout + '\n');
    if (stderr) onOutput(stderr + '\n');

    if (!stdout && !stderr && !compileOutput) {
        onOutput(`Status: ${result.status?.description ?? 'Unknown'}\n`);
    }

    // status 3 = Accepted
    return statusId === 3 ? 'pass' : 'fail';
}

// ─────────────────────────────────────────────────────────────
// WEBCONTAINERS RUNNER  (Jest · Vitest · Mocha · RTL · Supertest)
// ─────────────────────────────────────────────────────────────
// let wcInstance: WebContainer | null = null;
declare global {
    interface Window {
        __WEB_CONTAINER_INSTANCE__?: WebContainer;
    }
}

async function getWebContainer(
    onOutput: (s: string) => void
): Promise<WebContainer> {
    if (window.__WEB_CONTAINER_INSTANCE__) {
        return window.__WEB_CONTAINER_INSTANCE__;
    }

    onOutput('🚀 Booting WebContainer (first run takes ~5s)...\n');

    const instance = await WebContainer.boot();

    window.__WEB_CONTAINER_INSTANCE__ = instance;

    onOutput('✅ WebContainer ready\n\n');

    return instance;
}

function normalizeImports(testCode: string): string {
    return testCode
        .replace(/from\s+['"](\.\/)?([A-Z][^'"]*)['"]/g, "from './src/$2'")  // ./App → ./src/App
        .replace(/from\s+['"]\.\.\/src\//g, "from './src/")
        .replace(/from\s+['"]src\//g, "from './src/");
}

function deduplicateImports(code: string): string {
    const lines = code.split('\n');
    const seenImports = new Set<string>();
    const result: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        // Check if it's an import statement
        if (trimmed.startsWith('import ')) {
            if (seenImports.has(trimmed)) {
                // Skip duplicate import
                continue;
            }
            seenImports.add(trimmed);
        }
        result.push(line);
    }

    return result.join('\n');
}

const JS_TEST_COMMANDS: Record<string, string[]> = {
    jest: ['npx', 'jest', '--config=jest.config.cjs', '--colors', '--no-coverage', '--forceExit'],
    vitest: ['npx', 'vitest', 'run', '--reporter=verbose'],
    mocha: ['npx', 'mocha', '**/*.test.{js,mjs}', '--timeout', '10000'],
    'react-testing-library': ['npx', 'jest', '--colors', '--no-coverage', '--forceExit', '--env=jsdom'],
    supertest: ['npx', 'jest', '--colors', '--no-coverage', '--forceExit'],
};

const DEFAULT_PACKAGE_JSON = (
    framework: string,
    sourceFiles: Record<string, string>
) => {
    let detectedDeps: Record<string, string> = {};

    if (sourceFiles["package.json"]) {
        try {
            const pkg = JSON.parse(sourceFiles["package.json"]);
            detectedDeps = {
                ...(pkg.dependencies || {}),
                ...(pkg.devDependencies || {}),
            };
        } catch { }
    }

    return JSON.stringify(
        {
            name: "test-project",
            version: "1.0.0",
            scripts: {
                test: JS_TEST_COMMANDS[framework]?.slice(1).join(" ") ?? "jest",
            },
            dependencies: detectedDeps,
            devDependencies: {
                jest: "^29.0.0",
                vitest: "^1.6.0",
                mocha: "^10.4.0",
                axios: '^1.6.0',
                clsx: '^2.1.1',
                'framer-motion': '^11.0.0',
                'lucide-react': '^0.446.0',
                'react-router-dom': '^6.26.0',
                '@tabler/icons-react': '^3.17.0',

                "@testing-library/react": "^16.0.0",
                "@testing-library/jest-dom": "^6.0.0",
                "@testing-library/user-event": "^14.0.0",
                "jest-environment-jsdom": "^29.0.0",
                "@babel/core": "^7.0.0",
                "@babel/preset-env": "^7.0.0",
                "@babel/preset-react": "^7.0.0",
                "@babel/preset-typescript": "^7.0.0",
                "babel-jest": "^29.0.0",
                "@heroicons/react": "^2.2.0",
            },
        },
        null,
        2
    );
};

function extractImportsFromCode(code: string): string[] {
    const deps: string[] = [];
    const importRegex = /(?:import|require)\s*(?:.*?\s+from\s+)?['"]([^.'"@][^'"]*)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
        const pkg = match[1].split('/')[0]; // handle scoped: @testing-library/react → @testing-library
        const fullPkg = match[1].startsWith('@')
            ? match[1].split('/').slice(0, 2).join('/')
            : match[1].split('/')[0];
        if (!deps.includes(fullPkg)) deps.push(fullPkg);
    }
    return deps;
}

// Flatten nested path strings into WebContainer mount structure
// function buildMountStructure(files: Record<string, string>): any {
//     const mount: any = {};

//     for (const [filePath, content] of Object.entries(files)) {
//         const parts = filePath.replace(/^\//, '').split('/');
//         let cursor = mount;

//         for (let i = 0; i < parts.length - 1; i++) {
//             const part = parts[i];
//             if (!cursor[part]) cursor[part] = { directory: {} };
//             cursor = cursor[part].directory;
//         }

//         cursor[parts[parts.length - 1]] = {
//             file: { contents: content },
//         };
//     }

//     return mount;
// }

function buildMountStructure(files: Record<string, string>): any {
    const mount: any = {};

    // Detect common root folder (e.g. "launchxy/")
    const allPaths = Object.keys(files);
    const rootFolders = new Set(
        allPaths.map(path => path.split('/')[0]).filter(Boolean)
    );

    const shouldStripRoot = rootFolders.size === 1;

    for (const [originalPath, content] of Object.entries(files)) {
        const normalizedPath = shouldStripRoot
            ? originalPath.split('/').slice(1).join('/')
            : originalPath;

        const parts = normalizedPath.replace(/^\//, '').split('/');
        let cursor = mount;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!cursor[part]) {
                cursor[part] = { directory: {} };
            }
            cursor = cursor[part].directory;
        }

        cursor[parts[parts.length - 1]] = {
            file: { contents: content },
        };
    }

    return mount;
}

async function runViaWebContainers(
    files: Record<string, string>,
    framework: string,
    onOutput: (s: string) => void
): Promise<'pass' | 'fail'> {
    try {
        // if (!wcInstance) {
        //     onOutput('🚀 Booting WebContainer (first run takes ~5s)...\n');
        //     wcInstance = await WebContainer.boot();
        //     onOutput('✅ WebContainer ready\n\n');
        // }

        const wcInstance = await getWebContainer(onOutput);
        // Inject defaults if not present
        const allFiles = { ...files };
        if (!allFiles['package.json']) {
            allFiles['package.json'] = DEFAULT_PACKAGE_JSON(framework, files);
        }
        //         if (!allFiles['babel.config.cjs'] && !allFiles['babel.config.js']) {
        //             allFiles['jest.config.cjs'] = `
        // module.exports = {
        //   testEnvironment: 'jsdom',
        //   setupFilesAfterEnv: ['./jest.setup.js'],
        //   transform: {
        //     '^.+\\\\.[jt]sx?$': ['babel-jest', {
        //       presets: [
        //         ['@babel/preset-env', { targets: { node: 'current' } }],
        //         ['@babel/preset-react', { runtime: 'automatic' }],
        //         '@babel/preset-typescript',
        //       ],
        //     }],
        //   },
        // };
        // `;

        //             allFiles['jest.setup.js'] = `
        // import '@testing-library/jest-dom';
        // `;

        //         }
        if (!allFiles['babel.config.cjs'] && !allFiles['babel.config.js']) {
            allFiles['jest.config.cjs'] = `
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['./jest.setup.js'],
  transform: {
    '^.+\\\\.[jt]sx?$': 'babel-jest',
  },
};
`;

            allFiles['babel.config.cjs'] = `
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
};
`;

            allFiles['jest.setup.js'] = `
require('@testing-library/jest-dom');
`;
        }

        await wcInstance.fs.rm('/src', { recursive: true, force: true }).catch(() => { });
        await wcInstance.fs.rm('/package.json', { force: true }).catch(() => { });
        await wcInstance.fs.rm('/jest.config.js', { force: true }).catch(() => { });
        await wcInstance.fs.rm('/jest.config.cjs', { force: true }).catch(() => { }); // add this
        await wcInstance.fs.rm('/babel.config.cjs', { force: true }).catch(() => { });

        const mount = buildMountStructure(allFiles);
        // onOutput('\n📂 Mounted files:\n');
        // for (const key of Object.keys(allFiles)) {
        //     onOutput(` - ${key}\n`);
        // }
        await wcInstance.mount(mount);
        await wcInstance.fs.writeFile('/babel.config.cjs', `
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
};
`);

        await wcInstance.fs.writeFile('/jest.config.cjs', `
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['./jest.setup.js'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
};
`);

        await wcInstance.fs.writeFile('/jest.setup.js', `
require('@testing-library/jest-dom');
`);

const debugProc = await wcInstance.spawn('cat', ['/babel.config.cjs']);
//debugProc.output.pipeTo(new WritableStream({ write: (chunk) => onOutput(chunk) }));
await debugProc.exit;

        // const mount = buildMountStructure(allFiles);
        // //await wcInstance.fs.rm('/', { recursive: true, force: true }).catch(() => {});
        // await wcInstance.mount(mount);

        const testFileContent = Object.entries(files).find(([k]) => k.includes('test'))?.[1] ?? '';
        const detectedDeps = extractImportsFromCode(testFileContent);

        if (detectedDeps.length > 0) {
            onOutput(`📦 Installing test dependencies: ${detectedDeps.join(', ')}\n`);
            const depInstall = await wcInstance.spawn('npm', [
                'install', '--prefer-offline', '--silent', ...detectedDeps
            ]);
            depInstall.output.pipeTo(
                new WritableStream({ write: (chunk) => onOutput(chunk) })
            );
            await depInstall.exit;
        }
        // Install
        onOutput('📦 Installing dependencies (cached after first run)...\n');
        const install = await wcInstance.spawn('npm', ['install', '--prefer-offline', '--silent']);
        install.output.pipeTo(
            new WritableStream({ write: (chunk) => onOutput(chunk) })
        );
        const installCode = await install.exit;
        if (installCode !== 0) {
            onOutput('\n❌ npm install failed\n');
            return 'fail';
        }

        onOutput(`\n🧪 Running ${framework} tests...\n${'─'.repeat(50)}\n`);

        const [cmd, ...args] = JS_TEST_COMMANDS[framework] ?? ['npx', 'jest'];
        const proc = await wcInstance.spawn(cmd, args);

        let output = '';
        proc.output.pipeTo(
            new WritableStream({
                write: (chunk) => {
                    output += chunk;
                    onOutput(chunk);
                },
            })
        );

        const exitCode = await proc.exit;
        onOutput(`\n${'─'.repeat(50)}\n`);
        onOutput(exitCode === 0 ? '✅ All tests passed\n' : '❌ Some tests failed\n');

        return exitCode === 0 ? 'pass' : 'fail';
    } catch (e: any) {
        onOutput(`\n❌ WebContainer error: ${e.message}\n`);
        onOutput('Make sure your Vite config has the required COOP/COEP headers.\n');
        return 'fail';
    }
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────
const JS_FRAMEWORKS = new Set([
    'jest',
    'vitest',
    'mocha',
    'react-testing-library',
    'supertest',
]);

function stripBuildToolMocks(code: string): string {
    const buildTools = [
        '@tailwindcss/vite', 'vite', '@vitejs', 'webpack',
        'rollup', 'esbuild', 'postcss', 'autoprefixer',
    ];

    let result = code;

    for (const tool of buildTools) {
        const escaped = tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Remove jest.mock('tool') or jest.mock('tool', ...) — handles multiline via[\s\S]
        // Matches: jest.mock('tool') or jest.mock('tool', () => ({ ... }))
        result = result.replace(
            new RegExp(
                `jest\\.mock\\(\\s*['"\`]${escaped}['"\`]\\s*(?:,\\s*(?:\\(\\)\\s*=>\\s*(?:\\{[\\s\\S]*?\\}|\\([\\s\\S]*?\\))|\\{[\\s\\S]*?\\}))?\\s*\\)\\s*;?\\n?`,
                'g'
            ),
            ''
        );
    }

    // Also remove any leftover orphaned arrow functions from partial removals
    // e.g. lines that are just: " => ({" or "}));"
    result = result.replace(/^\s*=>\s*\(\{[\s\S]*?\}\)\);\s*\n?/gm, '');
    result = result.replace(/^\s*\}\)\);\s*$/gm, ''); // orphaned closing }));

    return result;
}

export async function runTests(
    framework: string,
    testCode: string,
    /** All source files: { 'src/index.js': '...', 'src/utils.js': '...' } */
    sourceFiles: Record<string, string>,
    onOutput: (s: string) => void
): Promise<'pass' | 'fail'> {

    const cleanCode = stripBuildToolMocks(
        deduplicateImports(
            normalizeImports(
                testCode
                    .replace(/^```[\w]*\n?/m, '')
                    .replace(/```\s*$/m, '')
                    .trim()
            )
        )
    );
    console.log("SOURCE FILES RECEIVED:", Object.keys(sourceFiles));
    // onOutput(`Generated Test File:\n${cleanCode}\n\n`);

    onOutput(`\n${'═'.repeat(50)}\n🔬 Test Runner: ${framework.toUpperCase()}\n${'═'.repeat(50)}\n\n`);

    if (framework === 'cypress') {
        onOutput(
            '⚠️  Cypress requires a real browser environment + running server.\n' +
            'It cannot run without a backend.\n\n' +
            '💡 Alternatives that work in-browser:\n' +
            '   • React Testing Library (component tests)\n' +
            '   • Playwright via WebContainers (limited)\n'
        );
        return 'fail';
    }

    // Determine test file extension
    const testFileNames: Record<string, string> = {
        jest: 'index.test.js',
        //jest: 'src/index.test.js',
        vitest: 'index.test.ts',
        mocha: 'index.test.mjs',
        'react-testing-library': 'component.test.jsx',
        supertest: 'api.test.js',
        pytest: 'test_main.py',
        junit: 'MainTest.java',
        rspec: 'main_spec.rb',
    };

    const testFileName = testFileNames[framework] ?? 'index.test.js';

    if (JS_FRAMEWORKS.has(framework)) {
        return runViaWebContainers(
            { ...sourceFiles, [testFileName]: cleanCode },
            framework,
            onOutput
        );
    } else {
        return runViaJudge0(testCode, framework, onOutput);
    }
}

// Expose for cleanup if needed
// export function teardownWebContainer() {
//     wcInstance = null;
// }
export async function teardownWebContainer() {
    if (window.__WEB_CONTAINER_INSTANCE__) {
        await window.__WEB_CONTAINER_INSTANCE__.teardown();
        window.__WEB_CONTAINER_INSTANCE__ = undefined;
    }
}