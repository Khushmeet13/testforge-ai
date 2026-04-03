import { useState, useMemo } from "react";
import { AnalysisResult, FileInfo } from "../types";

interface FileTreeExplorerProps {
  analysis: AnalysisResult;
  testOutput: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children: TreeNode[];
  file?: FileInfo;
  isExpanded?: boolean;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f7df1e", Python: "#3776ab",
  Java: "#f89820", Ruby: "#cc0000", Go: "#00add8", JSON: "#6b7280",
  YAML: "#6b7280", HTML: "#e34f26", CSS: "#1572b6", Shell: "#89e051",
};

const LANG_ICONS: Record<string, string> = {
  TypeScript: "🔷", JavaScript: "🟨", Python: "🐍", Java: "☕",
  Ruby: "💎", Go: "🐹", JSON: "⚙️", YAML: "⚙️", HTML: "🌐",
  CSS: "🎨", Shell: "💲", Text: "📄", SQL: "🗄️",
};

function buildTree(files: FileInfo[]): TreeNode {
  const root: TreeNode = { name: "root", path: "", type: "dir", children: [], isExpanded: true };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current.children.push({ name: part, path: file.path, type: "file", children: [], file, isExpanded: false });
      } else {
        let dir = current.children.find(c => c.name === part && c.type === "dir");
        if (!dir) {
          dir = { name: part, path: parts.slice(0, i + 1).join("/"), type: "dir", children: [], isExpanded: i === 0 };
          current.children.push(dir);
        }
        current = dir;
      }
    }
  }

  // Sort: dirs first, then files, alphabetically
  const sortNode = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

export function FileTreeExplorer({ analysis, testOutput }: FileTreeExplorerProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([""]));
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(analysis.files[0] ?? null);
  const [searchQuery, setSearchQuery] = useState("");

  const tree = useMemo(() => buildTree(analysis.files), [analysis.files]);

  const testLower = testOutput.toLowerCase();
  const coveredFiles = useMemo(() => {
    return new Set(
      analysis.files
        .filter(f => {
          const fns = analysis.functions.filter(fn => fn.file === f.path);
          return fns.some(fn => testLower.includes(fn.name.toLowerCase()));
        })
        .map(f => f.path)
    );
  }, [analysis, testLower]);

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const filteredFiles = searchQuery
    ? analysis.files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.path.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  const functionsForFile = selectedFile
    ? analysis.functions.filter(fn => fn.file === selectedFile.path)
    : [];

  const coveredFns = functionsForFile.filter(fn => testLower.includes(fn.name.toLowerCase()));
  const uncoveredFns = functionsForFile.filter(fn => !testLower.includes(fn.name.toLowerCase()));

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    if (node.type === "dir" && node.name !== "root") {
      const isOpen = expandedDirs.has(node.path);
      const hasMatch = searchQuery
        ? node.children.some(c => c.path.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;
      if (!hasMatch) return null;
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleDir(node.path)}
            className="flex items-center gap-1.5 w-full text-left py-1 px-2 rounded-md hover:bg-white/5 transition-colors group"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <span className="text-white/30 text-xs w-3 flex-shrink-0">{isOpen ? "▾" : "▸"}</span>
            <span className="text-xs">📁</span>
            <span className="text-white/60 text-xs group-hover:text-white/80 transition-colors">{node.name}</span>
            <span className="text-white/20 text-[10px] ml-auto">{node.children.length}</span>
          </button>
          {isOpen && node.children.map(child => renderNode(child, depth + 1))}
        </div>
      );
    }
    if (node.type === "file" && node.file) {
      const file = node.file;
      const isCovered = coveredFiles.has(file.path);
      const isSelected = selectedFile?.path === file.path;
      return (
        <button
          key={node.path}
          onClick={() => setSelectedFile(file)}
          className={`flex items-center gap-1.5 w-full text-left py-1 px-2 rounded-md transition-all ${
            isSelected ? "bg-white/10" : "hover:bg-white/5"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="text-sm flex-shrink-0">{LANG_ICONS[file.language] ?? "📄"}</span>
          <span className={`text-xs truncate flex-1 ${isSelected ? "text-white" : "text-white/60"}`}>{node.name}</span>
          {isCovered && <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] flex-shrink-0" title="Has test coverage" />}
        </button>
      );
    }
    if (node.name === "root") {
      return <div key="root">{node.children.map(c => renderNode(c, 0))}</div>;
    }
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[580px]">
      {/* File tree */}
      <div className="flex flex-col bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-white/8">
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] rounded-lg border border-white/8">
            <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="flex-1 bg-transparent text-xs text-white/70 placeholder-white/20 outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {searchQuery ? (
            filteredFiles!.length === 0 ? (
              <p className="text-white/20 text-xs text-center py-4">No files match</p>
            ) : (
              filteredFiles!.map(f => (
                <button key={f.path} onClick={() => setSelectedFile(f)}
                  className={`flex items-center gap-1.5 w-full text-left py-1.5 px-2 rounded-md transition-all ${selectedFile?.path === f.path ? "bg-white/10" : "hover:bg-white/5"}`}>
                  <span className="text-sm">{LANG_ICONS[f.language] ?? "📄"}</span>
                  <div className="min-w-0">
                    <p className="text-white/70 text-xs truncate">{f.name}</p>
                    <p className="text-white/25 text-[10px] truncate">{f.path.split("/").slice(0, -1).join("/")}</p>
                  </div>
                  {coveredFiles.has(f.path) && <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] flex-shrink-0 ml-auto" />}
                </button>
              ))
            )
          ) : renderNode(tree, 0)}
        </div>
        <div className="p-2 border-t border-white/8 flex items-center gap-3 text-[10px] text-white/25">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d]" /> covered</span>
          <span>{analysis.files.length} files</span>
        </div>
      </div>

      {/* File preview + coverage */}
      <div className="lg:col-span-2 flex flex-col gap-3">
        {selectedFile ? (
          <>
            {/* File header */}
            <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/10 rounded-xl">
              <span className="text-xl">{LANG_ICONS[selectedFile.language] ?? "📄"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-white/30 text-xs truncate">{selectedFile.path}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <span className="text-[10px] px-2 py-1 rounded-full"
                  style={{ backgroundColor: `${LANG_COLORS[selectedFile.language] ?? "#6b7280"}20`, color: LANG_COLORS[selectedFile.language] ?? "#9ca3af" }}>
                  {selectedFile.language}
                </span>
                <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 text-white/40">
                  {(selectedFile.size / 1024).toFixed(1)}kb
                </span>
                {coveredFiles.has(selectedFile.path)
                  ? <span className="text-[10px] px-2 py-1 rounded-full bg-[#00ff9d]/15 text-[#00ff9d]">✓ Covered</span>
                  : <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 text-white/30">Not covered</span>}
              </div>
            </div>

            {/* Function coverage mini-panel */}
            {functionsForFile.length > 0 && (
              <div className="p-3 bg-white/[0.02] border border-white/10 rounded-xl">
                <p className="text-white/30 text-[10px] tracking-widest uppercase mb-2">
                  Functions — {coveredFns.length}/{functionsForFile.length} tested
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {coveredFns.map(fn => (
                    <span key={fn.name} className="text-[10px] px-2 py-0.5 bg-[#00ff9d]/10 text-[#00ff9d]/80 border border-[#00ff9d]/20 rounded font-mono">
                      ✓ {fn.name}
                    </span>
                  ))}
                  {uncoveredFns.map(fn => (
                    <span key={fn.name} className="text-[10px] px-2 py-0.5 bg-[#ef4444]/10 text-[#ef4444]/70 border border-[#ef4444]/20 rounded font-mono">
                      ✗ {fn.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* File content */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center gap-2 px-4 py-2 bg-[#111118] border border-white/8 rounded-t-xl">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                </div>
                <span className="text-white/30 text-[10px] font-mono ml-2">{selectedFile.name}</span>
                <span className="ml-auto text-white/20 text-[10px]">{selectedFile.content.split("\n").length} lines</span>
              </div>
              <div className="flex-1 bg-[#0d0d14] border border-t-0 border-white/8 rounded-b-xl overflow-auto max-h-80">
                <pre className="text-xs leading-relaxed p-4 font-mono text-white/60 whitespace-pre">
                  {selectedFile.content.slice(0, 4000)}{selectedFile.content.length > 4000 ? "\n... (truncated)" : ""}
                </pre>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-white/20 text-sm">
            Select a file to preview
          </div>
        )}
      </div>
    </div>
  );
}
