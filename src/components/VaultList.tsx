import React, { useState } from 'react';
import {
  Search,
  FileText,
  FileCode,
  Copy,
  Check,
  FolderOpen,
  ExternalLink,
  Trash2,
  Tag as TagIcon,
  Eye,
  EyeOff,
  Filter,
} from 'lucide-react';
import type { VaultItem } from '../types';
import { api } from '../services/api';

interface VaultListProps {
  items: VaultItem[];
  onDeleteItem: (id: string) => void;
  onUpdateTags: (id: string, newTags: string) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const VaultList: React.FC<VaultListProps> = ({
  items,
  onDeleteItem,
  onUpdateTags,
  onToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagEditValue, setTagEditValue] = useState('');

  // Extract unique tags
  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.tags) {
        item.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .forEach((t) => set.add(t));
      }
    });
    return Array.from(set);
  }, [items]);

  // Filter items
  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      // Tag filter
      if (selectedTag !== 'all') {
        const itemTags = item.tags ? item.tags.split(',').map((t) => t.trim()) : [];
        if (!itemTags.includes(selectedTag)) {
          return false;
        }
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q) || false;
        const matchesContent = item.content?.toLowerCase().includes(q) || false;
        const matchesPath = item.file_path?.toLowerCase().includes(q) || false;
        const matchesTags = item.tags?.toLowerCase().includes(q) || false;
        return matchesTitle || matchesContent || matchesPath || matchesTags;
      }

      return true;
    });
  }, [items, searchQuery, selectedTag]);

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopy = async (id: string, text: string) => {
    await api.copyToClipboard(text);
    setCopiedId(id);
    onToast('Copied to clipboard!', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveTags = (id: string) => {
    onUpdateTags(id, tagEditValue);
    setEditingTagId(null);
  };

  return (
    <div className="bg-vault-900/80 border border-vault-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Search & Tag Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-vault-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vault (content, filename, tags)..."
            className="w-full bg-vault-950 border border-vault-800 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-vault-500 focus:outline-none transition"
          />
        </div>

        {/* Tag Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setSelectedTag('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
              selectedTag === 'all'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-vault-950 text-vault-400 hover:text-slate-200 border border-vault-800'
            }`}
          >
            All ({items.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
                selectedTag === tag
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-vault-950 text-vault-400 hover:text-slate-200 border border-vault-800'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center text-vault-500 space-y-2">
            <Filter className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-sm font-medium">No encrypted or decrypted items found</p>
            <p className="text-xs text-vault-600">
              Encrypt new secrets above or copy [SECURE]:: / .e2e files to populate your vault.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isText = item.type === 'text';
            const isRevealed = revealedIds[item.id] || false;
            const itemTags = item.tags
              ? item.tags.split(',').map((t) => t.trim()).filter(Boolean)
              : [];

            return (
              <div
                key={item.id}
                className="bg-vault-950/70 hover:bg-vault-950 border border-vault-800/80 hover:border-vault-700/80 rounded-xl p-4 transition space-y-2.5"
              >
                {/* Header info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isText
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      }`}
                    >
                      {isText ? <FileText className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-100 truncate">
                        {item.title || (isText ? 'Text Snippet' : 'Encrypted File')}
                      </h3>
                      <span className="text-[11px] text-vault-500 font-mono">
                        {item.created_at}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isText && item.content && (
                      <>
                        <button
                          onClick={() => toggleReveal(item.id)}
                          className="p-1.5 rounded-lg bg-vault-850 hover:bg-vault-800 text-vault-400 hover:text-slate-200 transition"
                          title={isRevealed ? 'Hide Secret' : 'Reveal Secret'}
                        >
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleCopy(item.id, item.content!)}
                          className="p-1.5 rounded-lg bg-vault-850 hover:bg-vault-800 text-vault-400 hover:text-slate-200 transition"
                          title="Copy Plaintext"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    )}

                    {!isText && item.file_path && (
                      <>
                        <button
                          onClick={() => api.openFile(item.file_path!)}
                          className="p-1.5 rounded-lg bg-teal-950/70 hover:bg-teal-900 text-teal-300 border border-teal-800/60 transition text-xs flex items-center gap-1"
                          title="Open File"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => api.showInFolder(item.file_path!)}
                          className="p-1.5 rounded-lg bg-vault-850 hover:bg-vault-800 text-vault-400 hover:text-slate-200 transition"
                          title="Show in Folder"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => onDeleteItem(item.id)}
                      className="p-1.5 rounded-lg bg-vault-850 hover:bg-rose-950/60 text-vault-400 hover:text-rose-400 transition"
                      title="Delete from Vault"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Content body */}
                {isText && item.content && (
                  <div className="bg-vault-900/90 rounded-lg p-2.5 border border-vault-800 text-xs font-mono text-slate-200 break-words whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {isRevealed
                      ? item.content
                      : item.content.slice(0, 30) + (item.content.length > 30 ? ' ••••••••••' : '')}
                  </div>
                )}

                {!isText && item.file_path && (
                  <p className="text-xs font-mono text-vault-400 truncate bg-vault-900/80 p-2 rounded border border-vault-800/80">
                    {item.file_path}
                  </p>
                )}

                {/* Tags section */}
                <div className="flex items-center justify-between text-xs pt-1">
                  {editingTagId === item.id ? (
                    <div className="flex items-center gap-2 w-full">
                      <input
                        type="text"
                        value={tagEditValue}
                        onChange={(e) => setTagEditValue(e.target.value)}
                        placeholder="e.g. prod, database"
                        className="bg-vault-900 border border-emerald-600 rounded px-2 py-0.5 text-xs text-slate-100 focus:outline-none w-full max-w-xs"
                      />
                      <button
                        onClick={() => handleSaveTags(item.id)}
                        className="px-2 py-0.5 rounded bg-emerald-600 text-white text-xs"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingTagId(null)}
                        className="text-vault-400 hover:text-slate-200 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => {
                          setEditingTagId(item.id);
                          setTagEditValue(item.tags || '');
                        }}
                        className="text-vault-500 hover:text-vault-300 transition"
                        title="Edit Tags"
                      >
                        <TagIcon className="w-3 h-3" />
                      </button>
                      {itemTags.length > 0 ? (
                        itemTags.map((t, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-full bg-vault-900 text-vault-300 border border-vault-800 text-[10px] font-medium"
                          >
                            #{t}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-vault-600">no tags</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
