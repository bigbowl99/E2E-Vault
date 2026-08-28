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
  User,
  Calendar,
} from 'lucide-react';
import type { Contact, VaultItem } from '../types';
import { api } from '../services/api';

interface VaultListProps {
  items: VaultItem[];
  contacts: Contact[];
  selectedContactFilter?: string | null;
  onSelectContactFilter?: (pubkey: string | null) => void;
  onDeleteItem: (id: string) => void;
  onUpdateTags: (id: string, newTags: string) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

const BRAND_FILTERS = [
  { id: 'all', label: 'All Items', icon: '🌐', color: 'bg-vault-800 text-slate-200' },
  { id: 'openai', label: 'ChatGPT / OpenAI', icon: '🤖', color: 'bg-emerald-950 text-emerald-300 border-emerald-700/60' },
  { id: 'gemini', label: 'Google Gemini', icon: '✨', color: 'bg-blue-950 text-blue-300 border-blue-700/60' },
  { id: 'claude', label: 'Claude', icon: '🧠', color: 'bg-amber-950 text-amber-300 border-amber-700/60' },
  { id: 'deepseek', label: 'DeepSeek', icon: '⚡', color: 'bg-indigo-950 text-indigo-300 border-indigo-700/60' },
  { id: 'aliyun', label: '阿里云 AccessKey', icon: '☁️', color: 'bg-orange-950 text-orange-300 border-orange-700/60' },
  { id: 'tencent', label: '腾讯云 Secret', icon: '🐧', color: 'bg-sky-950 text-sky-300 border-sky-700/60' },
  { id: 'wechat', label: '微信生态凭证', icon: '💬', color: 'bg-green-950 text-green-300 border-green-700/60' },
  { id: 'aws', label: 'AWS', icon: '🌐', color: 'bg-amber-950 text-amber-300 border-amber-700/60' },
  { id: 'github', label: 'GitHub', icon: '🐙', color: 'bg-slate-800 text-slate-200 border-slate-600' },
  { id: 'ssh', label: 'SSH 私钥', icon: '🔑', color: 'bg-yellow-950 text-yellow-300 border-yellow-700/60' },
  { id: 'ssl', label: 'SSL 证书', icon: '📜', color: 'bg-cyan-950 text-cyan-300 border-cyan-700/60' },
  { id: 'database', label: '数据库连接', icon: '🗄️', color: 'bg-rose-950 text-rose-300 border-rose-700/60' },
  { id: 'env', label: '.env 变量', icon: '🔒', color: 'bg-teal-950 text-teal-300 border-teal-700/60' },
];

export const VaultList: React.FC<VaultListProps> = ({
  items,
  contacts,
  selectedContactFilter = null,
  onSelectContactFilter,
  onDeleteItem,
  onUpdateTags,
  onToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagEditValue, setTagEditValue] = useState('');

  // Filter items
  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      // Contact filter
      if (selectedContactFilter) {
        if (item.sender_pubkey !== selectedContactFilter) {
          return false;
        }
      }

      // Brand filter
      if (selectedBrand !== 'all') {
        const itemTags = item.tags ? item.tags.toLowerCase() : '';
        const matchesBrand = item.brand === selectedBrand || itemTags.includes(selectedBrand);
        if (!matchesBrand) {
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
        const matchesSender = item.contact_name?.toLowerCase().includes(q) || false;
        const matchesKeyType = item.key_type?.toLowerCase().includes(q) || false;
        return matchesTitle || matchesContent || matchesPath || matchesTags || matchesSender || matchesKeyType;
      }

      return true;
    });
  }, [items, searchQuery, selectedBrand, selectedContactFilter]);

  // Group items by date for chronological timeline
  const groupedByDate = React.useMemo(() => {
    const groups: Record<string, VaultItem[]> = {};
    filteredItems.forEach((item) => {
      const dateStr = item.created_at.split(' ')[0] || 'Unknown Date';
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(item);
    });
    return groups;
  }, [filteredItems]);

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

  const getBrandBadge = (brand?: string | null, keyType?: string | null) => {
    if (!brand && !keyType) return null;
    const b = brand || 'key';
    const found = BRAND_FILTERS.find((f) => f.id === b);
    const label = keyType || found?.label || b.toUpperCase();
    const icon = found?.icon || '🔑';
    const colorClass = found?.color || 'bg-vault-800 text-slate-200 border-vault-700';

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-sm ${colorClass}`}
      >
        <span>{icon}</span>
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className="bg-vault-900/80 border border-vault-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* 1. Search Bar & Contact Filter Header */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-vault-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search keys, tokens (e.g. ChatGPT, Aliyun, id_rsa, db_root)..."
            className="w-full bg-vault-950 border border-vault-800 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-vault-500 focus:outline-none transition"
          />
        </div>

        {/* Contact Specific Timeline Selector */}
        {onSelectContactFilter && (
          <div className="flex items-center gap-2 bg-vault-950 border border-vault-800 rounded-xl px-3 py-1.5 shrink-0">
            <User className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-vault-400">Timeline:</span>
            <select
              value={selectedContactFilter || ''}
              onChange={(e) => onSelectContactFilter(e.target.value || null)}
              className="bg-transparent text-xs text-emerald-300 font-semibold focus:outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="" className="bg-vault-900 text-slate-300">
                All Contacts
              </option>
              {contacts.map((c) => (
                <option key={c.id} value={c.public_key} className="bg-vault-900 text-slate-200">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 2. Key Type & Brand Fast-Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
        {BRAND_FILTERS.map((f) => {
          const isSelected = selectedBrand === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setSelectedBrand(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition shrink-0 border ${
                isSelected
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/50 scale-[1.02]'
                  : 'bg-vault-950/80 text-vault-400 hover:text-slate-200 border-vault-800/80 hover:bg-vault-900'
              }`}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Items Timeline List Grouped by Date */}
      <div className="space-y-5 max-h-[580px] overflow-y-auto pr-1">
        {Object.keys(groupedByDate).length === 0 ? (
          <div className="py-14 text-center text-vault-500 space-y-2">
            <Filter className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-sm font-medium">No matching files or keys found</p>
            <p className="text-xs text-vault-600">
              Try adjusting your search query or selecting another brand filter.
            </p>
          </div>
        ) : (
          Object.entries(groupedByDate).map(([dateStr, dateItems]) => (
            <div key={dateStr} className="space-y-3">
              {/* Date Header Pill */}
              <div className="sticky top-0 z-10 flex items-center gap-2 py-1 bg-vault-900/95 backdrop-blur">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-slate-300 tracking-wider">
                  {dateStr}
                </span>
                <div className="h-px flex-1 bg-vault-800" />
                <span className="text-[11px] text-vault-500 font-mono">
                  {dateItems.length} {dateItems.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {/* Items on this date */}
              <div className="space-y-2.5">
                {dateItems.map((item) => {
                  const isText = item.type === 'text';
                  const isRevealed = revealedIds[item.id] || false;
                  const itemTags = item.tags
                    ? item.tags.split(',').map((t) => t.trim()).filter(Boolean)
                    : [];

                  return (
                    <div
                      key={item.id}
                      className="bg-vault-950/70 hover:bg-vault-950 border border-vault-800/80 hover:border-emerald-800/40 rounded-xl p-4 transition space-y-2.5 shadow-sm"
                    >
                      {/* Top Bar: Icon, Title, Brand Badge & Actions */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`p-2 rounded-xl shrink-0 ${
                              isText
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            }`}
                          >
                            {isText ? <FileText className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-semibold text-slate-100 truncate">
                                {item.title || (isText ? 'Sensitive Text' : 'Encrypted File')}
                              </h3>

                              {/* Brand Recognition Badge */}
                              {getBrandBadge(item.brand, item.key_type)}

                              {/* Sender Contact Badge */}
                              {item.contact_name && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-vault-900 border border-vault-800 text-[10px] text-emerald-400 font-medium">
                                  <User className="w-3 h-3" />
                                  <span>{item.contact_name}</span>
                                </span>
                              )}
                            </div>

                            <span className="text-[11px] text-vault-500 font-mono">
                              {item.created_at}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons */}
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
                                title="Open Decrypted File"
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

                      {/* Content Preview */}
                      {isText && item.content && (
                        <div className="bg-vault-900/90 rounded-lg p-2.5 border border-vault-800 text-xs font-mono text-slate-200 break-words whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {isRevealed
                            ? item.content
                            : item.content.slice(0, 32) + (item.content.length > 32 ? ' ••••••••••••••••' : '')}
                        </div>
                      )}

                      {!isText && item.file_path && (
                        <p className="text-xs font-mono text-vault-400 truncate bg-vault-900/80 p-2 rounded border border-vault-800/80">
                          {item.file_path}
                        </p>
                      )}

                      {/* Tags & Inline Editor */}
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
                              <span className="text-[10px] text-vault-600">no custom tags</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
