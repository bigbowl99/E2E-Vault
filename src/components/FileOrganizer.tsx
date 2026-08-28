import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  User,
  Users,
  Search,
  ExternalLink,
  Trash2,
  Calendar,
  Layers,
  LayoutGrid,
  List,
  Sparkles,
  FileCode,
  FileText,
  Key,
  Shield,
  Copy,
  Check,
  Filter,
} from 'lucide-react';
import type { Contact, VaultItem } from '../types';
import { api } from '../services/api';

interface FileOrganizerProps {
  items: VaultItem[];
  contacts: Contact[];
  onDeleteItem: (id: string) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

const CATEGORY_ITEMS = [
  { id: 'all', label: 'All Files', icon: Layers, countMatcher: () => true },
  { id: 'ai', label: 'AI Keys & Models', icon: Sparkles, countMatcher: (i: VaultItem) => ['openai', 'gemini', 'claude', 'deepseek', 'huggingface'].includes(i.brand || '') },
  { id: 'cloud', label: 'Cloud & Ecosystem', icon: Shield, countMatcher: (i: VaultItem) => ['aliyun', 'tencent', 'wechat', 'baidu', 'aws', 'gcp', 'collab'].includes(i.brand || '') },
  { id: 'ssh', label: 'SSH & Private Keys', icon: Key, countMatcher: (i: VaultItem) => i.brand === 'ssh' || (i.tags || '').includes('ssh') },
  { id: 'ssl', label: 'SSL Certificates', icon: FileText, countMatcher: (i: VaultItem) => i.brand === 'ssl' || (i.tags || '').includes('ssl') || (i.title || '').endsWith('.crt') || (i.title || '').endsWith('.cer') },
  { id: 'config', label: 'Configs & .env', icon: FileCode, countMatcher: (i: VaultItem) => i.brand === 'env' || i.brand === 'k8s' || (i.title || '').endsWith('.yaml') || (i.title || '').endsWith('.json') || (i.title || '').endsWith('.env') },
];

export const FileOrganizer: React.FC<FileOrganizerProps> = ({
  items,
  contacts,
  onDeleteItem,
  onToast,
}) => {
  // Navigation filter state
  const [selectedNav, setSelectedNav] = useState<'contact' | 'category'>('contact');
  const [selectedContactKey, setSelectedContactKey] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Search & view mode
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'timeline' | 'grid'>('timeline');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter only file items
  const fileItems = useMemo(() => items.filter((i) => i.type === 'file'), [items]);

  // Count files per contact
  const contactFileCounts = useMemo(() => {
    const map: Record<string, number> = {};
    fileItems.forEach((item) => {
      if (item.sender_pubkey) {
        map[item.sender_pubkey] = (map[item.sender_pubkey] || 0) + 1;
      }
    });
    return map;
  }, [fileItems]);

  // Filtered files according to active sidebar selection + search
  const filteredFiles = useMemo(() => {
    return fileItems.filter((item) => {
      // 1. Sidebar Nav Filter
      if (selectedNav === 'contact' && selectedContactKey) {
        if (item.sender_pubkey !== selectedContactKey) {
          return false;
        }
      } else if (selectedNav === 'category' && selectedCategory !== 'all') {
        const catObj = CATEGORY_ITEMS.find((c) => c.id === selectedCategory);
        if (catObj && !catObj.countMatcher(item)) {
          return false;
        }
      }

      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q) || false;
        const matchesPath = item.file_path?.toLowerCase().includes(q) || false;
        const matchesTags = item.tags?.toLowerCase().includes(q) || false;
        const matchesSender = item.contact_name?.toLowerCase().includes(q) || false;
        const matchesKeyType = item.key_type?.toLowerCase().includes(q) || false;
        const matchesBrand = item.brand?.toLowerCase().includes(q) || false;
        return matchesTitle || matchesPath || matchesTags || matchesSender || matchesKeyType || matchesBrand;
      }

      return true;
    });
  }, [fileItems, selectedNav, selectedContactKey, selectedCategory, searchQuery]);

  // Group files by date for chronological timeline
  const groupedFilesByDate = useMemo(() => {
    const groups: Record<string, VaultItem[]> = {};
    filteredFiles.forEach((item) => {
      const dateStr = item.created_at.split(' ')[0] || 'Unknown Date';
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(item);
    });
    return groups;
  }, [filteredFiles]);

  const handleCopyPath = async (id: string, path: string) => {
    await api.copyToClipboard(path);
    setCopiedId(id);
    onToast('File path copied!', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenVaultFolder = async () => {
    try {
      await api.openVaultFolder();
      onToast('Opened vault folder in Explorer', 'success');
    } catch (err: any) {
      onToast(typeof err === 'string' ? err : 'Failed to open folder', 'error');
    }
  };

  const activeContactObj = contacts.find((c) => c.public_key === selectedContactKey);

  return (
    <div className="bg-vault-900/90 border border-vault-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[620px]">
      {/* LEFT SIDEBAR: Organization Hub */}
      <aside className="w-full md:w-64 bg-vault-950/90 border-b md:border-b-0 md:border-r border-vault-800 p-4 flex flex-col justify-between shrink-0 space-y-6">
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                File Organizer
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-[10px] text-emerald-300 font-mono border border-emerald-800/60">
              {fileItems.length} files
            </span>
          </div>

          {/* Section 1: By Contact */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-vault-400 px-2 py-1">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span>By Partner Contacts</span>
              </span>
            </div>

            {/* All Contacts Option */}
            <button
              onClick={() => {
                setSelectedNav('contact');
                setSelectedContactKey(null);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                selectedNav === 'contact' && selectedContactKey === null
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-vault-900'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Layers className="w-3.5 h-3.5" />
                <span>All Contacts</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-vault-900 text-vault-300 font-mono">
                {fileItems.length}
              </span>
            </button>

            {/* Individual Contacts */}
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {contacts.map((c) => {
                const count = contactFileCounts[c.public_key] || 0;
                const isSelected = selectedNav === 'contact' && selectedContactKey === c.public_key;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedNav('contact');
                      setSelectedContactKey(c.public_key);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                        : 'text-slate-300 hover:bg-vault-900'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <User className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-vault-900 text-vault-300 font-mono">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: By Key & Credential Category */}
          <div className="space-y-1.5 pt-2 border-t border-vault-800/80">
            <div className="text-[11px] font-semibold text-vault-400 px-2 py-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              <span>By Key & Category</span>
            </div>

            <div className="space-y-1">
              {CATEGORY_ITEMS.map((cat) => {
                const count = fileItems.filter((i) => cat.countMatcher(i)).length;
                const isSelected = selectedNav === 'category' && selectedCategory === cat.id;
                const IconComp = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedNav('category');
                      setSelectedCategory(cat.id);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                        : 'text-slate-300 hover:bg-vault-900'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <IconComp className="w-3.5 h-3.5 text-purple-400" />
                      <span className="truncate">{cat.label}</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-vault-900 text-vault-300 font-mono">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Explorer Launcher */}
        <div className="pt-3 border-t border-vault-800/80">
          <button
            onClick={handleOpenVaultFolder}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-vault-900 hover:bg-vault-850 text-slate-200 text-xs font-medium border border-vault-750 transition shadow-sm active:scale-95"
            title="Open local folder ~/.e2e_vault/files in Explorer"
          >
            <FolderOpen className="w-4 h-4 text-emerald-400" />
            <span>Open Vault Folder</span>
          </button>
        </div>
      </aside>

      {/* RIGHT WORKSPACE: File Management & Timeline Area */}
      <section className="flex-1 p-5 space-y-4 flex flex-col justify-between overflow-hidden">
        <div>
          {/* Top Control Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-vault-800">
            {/* Breadcrumbs */}
            <div>
              <div className="flex items-center gap-2 text-xs text-vault-400">
                <span>Vault Files</span>
                <span>/</span>
                <span className="text-emerald-400 font-semibold">
                  {selectedNav === 'contact'
                    ? activeContactObj
                      ? `👤 ${activeContactObj.name}'s Timeline`
                      : 'All Contacts'
                    : `🗂️ ${CATEGORY_ITEMS.find((c) => c.id === selectedCategory)?.label}`}
                </span>
              </div>
              <p className="text-xs text-vault-500 mt-0.5 font-mono">
                {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'} found
              </p>
            </div>

            {/* Search & View Switcher */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-vault-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search keys, certs, names..."
                  className="bg-vault-950 border border-vault-800 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-vault-500 focus:outline-none w-48 transition"
                />
              </div>

              {/* View Toggle */}
              <div className="flex items-center bg-vault-950 border border-vault-800 rounded-xl p-0.5">
                <button
                  onClick={() => setViewMode('timeline')}
                  className={`p-1.5 rounded-lg text-xs transition ${
                    viewMode === 'timeline'
                      ? 'bg-vault-800 text-emerald-400'
                      : 'text-vault-400 hover:text-slate-200'
                  }`}
                  title="Timeline View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs transition ${
                    viewMode === 'grid'
                      ? 'bg-vault-800 text-emerald-400'
                      : 'text-vault-400 hover:text-slate-200'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Files Display Container */}
          <div className="mt-4 max-h-[520px] overflow-y-auto pr-1 space-y-6">
            {filteredFiles.length === 0 ? (
              <div className="py-16 text-center text-vault-500 space-y-2">
                <Filter className="w-8 h-8 mx-auto opacity-40" />
                <p className="text-sm font-medium">No files matching this filter</p>
                <p className="text-xs text-vault-600">
                  Drag and drop sensitive keys or receive .e2e files to populate this folder.
                </p>
              </div>
            ) : viewMode === 'timeline' ? (
              // TIMELINE VIEW
              Object.entries(groupedFilesByDate).map(([dateStr, dateItems]) => (
                <div key={dateStr} className="space-y-3">
                  {/* Date Marker */}
                  <div className="sticky top-0 z-10 flex items-center gap-2 py-1 bg-vault-900/95 backdrop-blur">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-300 tracking-wider">
                      {dateStr}
                    </span>
                    <div className="h-px flex-1 bg-vault-800" />
                    <span className="text-[11px] text-vault-500 font-mono">
                      {dateItems.length} files
                    </span>
                  </div>

                  {/* Date Items Cards */}
                  <div className="space-y-2.5">
                    {dateItems.map((file) => {
                      return (
                        <div
                          key={file.id}
                          className="bg-vault-950/80 hover:bg-vault-950 border border-vault-800/80 hover:border-emerald-800/50 rounded-xl p-3.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                        >
                          {/* File info */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                              <FileCode className="w-5 h-5" />
                            </div>

                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-semibold text-slate-100 truncate">
                                  {file.title || 'Encrypted File'}
                                </h3>

                                {/* Key Sniffer Badge */}
                                {file.key_type && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 text-[10px] font-semibold">
                                    {file.key_type}
                                  </span>
                                )}

                                {/* Sender Badge */}
                                {file.contact_name && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-vault-900 text-blue-300 border border-vault-800 text-[10px] font-medium">
                                    <User className="w-3 h-3" />
                                    <span>{file.contact_name}</span>
                                  </span>
                                )}
                              </div>

                              <p className="text-xs font-mono text-vault-400 truncate max-w-lg">
                                {file.file_path}
                              </p>
                            </div>
                          </div>

                          {/* Action Toolbar */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            {file.file_path && (
                              <>
                                <button
                                  onClick={() => api.openFile(file.file_path!)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-950 hover:bg-teal-900 text-teal-300 border border-teal-800/60 text-xs font-medium transition"
                                  title="Open Decrypted File"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Open</span>
                                </button>

                                <button
                                  onClick={() => api.showInFolder(file.file_path!)}
                                  className="p-1.5 rounded-lg bg-vault-850 hover:bg-vault-800 text-vault-400 hover:text-slate-200 transition"
                                  title="Show in Explorer"
                                >
                                  <FolderOpen className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => handleCopyPath(file.id, file.file_path!)}
                                  className="p-1.5 rounded-lg bg-vault-850 hover:bg-vault-800 text-vault-400 hover:text-slate-200 transition"
                                  title="Copy Path"
                                >
                                  {copiedId === file.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </>
                            )}

                            <button
                              onClick={() => onDeleteItem(file.id)}
                              className="p-1.5 rounded-lg bg-vault-850 hover:bg-rose-950/60 text-vault-400 hover:text-rose-400 transition"
                              title="Delete File"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              // GRID VIEW
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className="bg-vault-950/80 hover:bg-vault-950 border border-vault-800/80 hover:border-emerald-800/50 rounded-xl p-4 transition space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                          <FileCode className="w-5 h-5" />
                        </div>

                        {file.key_type && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 text-[10px] font-semibold truncate max-w-[120px]">
                            {file.key_type}
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-slate-100 truncate" title={file.title || ''}>
                          {file.title || 'Encrypted File'}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[11px] text-vault-500 mt-0.5">
                          <span>{file.created_at.split(' ')[0]}</span>
                          {file.contact_name && (
                            <>
                              <span>•</span>
                              <span className="text-blue-400 font-medium">{file.contact_name}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] font-mono text-vault-400 truncate bg-vault-900/90 p-1.5 rounded border border-vault-800">
                        {file.file_path}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-vault-800/80">
                      {file.file_path ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => api.openFile(file.file_path!)}
                            className="px-2.5 py-1 rounded bg-teal-950 hover:bg-teal-900 text-teal-300 border border-teal-800/60 text-xs font-medium transition"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => api.showInFolder(file.file_path!)}
                            className="p-1 rounded bg-vault-900 text-vault-400 hover:text-slate-200 transition"
                            title="Show in Explorer"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : <div />}

                      <button
                        onClick={() => onDeleteItem(file.id)}
                        className="p-1 rounded bg-vault-900 text-vault-400 hover:text-rose-400 transition"
                        title="Delete File"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
