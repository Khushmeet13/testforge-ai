// components/FileSelector.tsx
import { useState, useMemo } from "react";
import { ExtractedFile } from "../types";
import { FiFile, FiFolder, FiChevronRight, FiChevronDown, FiSearch, FiCheck, FiArrowLeft } from "react-icons/fi";

interface FileSelectorProps {
  files: ExtractedFile[];
  projectName: string;
  onFilesSelected: (selectedPaths: string[]) => void;
  onBack: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
  language?: string;
  size?: number;
}

export function FileSelector({ files, projectName, onFilesSelected, onBack }: FileSelectorProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["root"]));

  // Build tree structure from flat file list
  const fileTree = useMemo(() => {
    const root: TreeNode = { name: projectName || "project", path: "root", type: "folder", children: [] };
    
    files.forEach(file => {
      const parts = file.path.split("/");
      let current = root;
      
      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        const path = parts.slice(0, index + 1).join("/");
        
        let child = current.children?.find(c => c.name === part);
        if (!child) {
          child = {
            name: part,
            path,
            type: isFile ? "file" : "folder",
            children: isFile ? undefined : [],
            language: isFile ? file.language : undefined,
            size: isFile ? file.size : undefined,
          };
          current.children?.push(child);
        }
        current = child;
      });
    });
    
    return root;
  }, [files, projectName]);

  // Filter files based on search
  const filteredTree = useMemo(() => {
    if (!searchQuery) return fileTree;
    
    const filterNode = (node: TreeNode): TreeNode | null => {
      if (node.type === "file") {
        return node.name.toLowerCase().includes(searchQuery.toLowerCase()) ? node : null;
      }
      
      const filteredChildren = node.children
        ?.map(filterNode)
        .filter((n): n is TreeNode => n !== null);
      
      if (filteredChildren && filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      return null;
    };
    
    return filterNode(fileTree) || fileTree;
  }, [fileTree, searchQuery]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleFile = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleAllFiles = (node: TreeNode) => {
    const getAllFiles = (n: TreeNode): string[] => {
      if (n.type === "file") return [n.path];
      return n.children?.flatMap(getAllFiles) || [];
    };

    const allFiles = getAllFiles(node);
    const allSelected = allFiles.every(f => selectedPaths.has(f));

    setSelectedPaths(prev => {
      const next = new Set(prev);
      allFiles.forEach(f => {
        if (allSelected) {
          next.delete(f);
        } else {
          next.add(f);
        }
      });
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    if (node.type === "file") {
      const isSelected = selectedPaths.has(node.path);
      const langColor = getLanguageColor(node.language || "unknown");
      
      return (
        <div
          key={node.path}
          className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-all hover:bg-white/5 ${
            isSelected ? "bg-[#00ff9d]/10" : ""
          }`}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
          onClick={() => toggleFile(node.path)}
        >
          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
            isSelected ? "bg-[#00ff9d] border-[#00ff9d]" : "border-white/20"
          }`}>
            {isSelected && <FiCheck className="text-black text-xs" />}
          </div>
          <FiFile className="text-white/40 flex-shrink-0" />
          <span className="text-white/80 text-sm truncate">{node.name}</span>
          <span 
            className="text-[10px] px-1.5 py-0.5 rounded ml-auto flex-shrink-0"
            style={{ backgroundColor: `${langColor}20`, color: langColor }}
          >
            {node.language}
          </span>
          <span className="text-white/20 text-xs flex-shrink-0 ml-2">
            {formatSize(node.size || 0)}
          </span>
        </div>
      );
    }

    const isExpanded = expandedFolders.has(node.path);
    const allChildrenSelected = node.children?.every(c => 
      c.type === "file" ? selectedPaths.has(c.path) : false
    );

    return (
      <div key={node.path}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-white/5 transition-all"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => toggleFolder(node.path)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFolder(node.path);
            }}
            className="p-0.5 hover:bg-white/10 rounded"
          >
            {isExpanded ? <FiChevronDown className="text-white/60" /> : <FiChevronRight className="text-white/60" />}
          </button>
          <FiFolder className="text-[#7b2fff]/60 flex-shrink-0" />
          <span className="text-white/70 text-sm">{node.name}</span>
          <span className="text-white/20 text-xs ml-auto">
            {node.children?.length || 0} items
          </span>
          {node.children && node.children.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleAllFiles(node);
              }}
              className="text-[10px] text-[#00ff9d]/60 hover:text-[#00ff9d] px-2 py-0.5 border border-[#00ff9d]/20 rounded hover:border-[#00ff9d]/40 transition-all"
            >
              {allChildrenSelected ? "Deselect All" : "Select All"}
            </button>
          )}
        </div>
        {isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Select Files for Testing</h2>
          <p className="text-white/40 text-sm mt-1">
            {files.length} files extracted from {projectName}
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-all flex items-center gap-2"
        >
          <FiArrowLeft />
          Back
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#00ff9d]/30 transition-all"
        />
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 p-3 bg-white/[0.03] border border-white/10 rounded-lg">
        <div className="flex items-center gap-2 text-white/60 text-sm">
          <FiFile className="text-[#00ff9d]" />
          <span>{selectedPaths.size} of {files.length} files selected</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setSelectedPaths(new Set(files.map(f => f.path)))}
          className="text-xs text-[#00ff9d]/60 hover:text-[#00ff9d] transition-all"
        >
          Select All
        </button>
        <button
          onClick={() => setSelectedPaths(new Set())}
          className="text-xs text-white/40 hover:text-white/60 transition-all"
        >
          Clear All
        </button>
      </div>

      {/* File Tree */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filteredTree.children && filteredTree.children.length > 0 ? (
            filteredTree.children.map(child => renderNode(child))
          ) : (
            <div className="text-center py-12 text-white/30">
              No files found matching "{searchQuery}"
            </div>
          )}
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex justify-end">
        <button
          onClick={() => onFilesSelected(Array.from(selectedPaths))}
          disabled={selectedPaths.size === 0}
          className="px-8 py-3 bg-gradient-to-r from-[#00ff9d] to-[#00cc7a] text-black font-bold rounded-xl hover:shadow-[0_0_30px_rgba(0,255,157,0.3)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          Generate Tests for {selectedPaths.size} File(s) ⚡
        </button>
      </div>
    </div>
  );
}

function getLanguageColor(language: string): string {
  const colors: Record<string, string> = {
    JavaScript: "#f7df1e",
    TypeScript: "#3178c6",
    Python: "#3776ab",
    Java: "#f89820",
    JSON: "#6b7280",
    YAML: "#6b7280",
    HTML: "#e34f26",
    CSS: "#1572b6",
    Markdown: "#083fa1",
    unknown: "#6b7280",
  };
  return colors[language] || colors.unknown;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}