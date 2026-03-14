'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { UserPicker } from './UserPicker';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

interface UserMentionInputProps {
  value: string;
  onChange: (text: string, mentionedUserIds: string[]) => void;
  onSubmit?: () => void;
  users: User[];
  placeholder?: string;
  className?: string;
}

export function UserMentionInput({ value, onChange, onSubmit, users, placeholder, className }: UserMentionInputProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset mentionedIds when value is cleared externally (e.g., after submit)
  useEffect(() => {
    if (!value) setMentionedIds([]);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Check if we're in a mention context
    const textBeforeCursor = text.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? text[atIndex - 1] : ' ';
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      if ((charBefore === ' ' || charBefore === '\n' || atIndex === 0) && !/\s/.test(textAfterAt)) {
        setShowPicker(true);
        setMentionStart(atIndex);
      } else {
        setShowPicker(false);
      }
    } else {
      setShowPicker(false);
    }

    onChange(text, mentionedIds);
  }, [onChange, mentionedIds]);

  const handleSelect = useCallback((user: User) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const before = value.slice(0, mentionStart);
    const after = value.slice(textarea.selectionStart);
    const newText = `${before}@${user.name} ${after}`;
    const newIds = [...mentionedIds, user.id];

    setMentionedIds(newIds);
    onChange(newText, newIds);
    setShowPicker(false);

    // Refocus textarea
    setTimeout(() => {
      textarea.focus();
      const pos = mentionStart + user.name.length + 2; // @Name + space
      textarea.setSelectionRange(pos, pos);
    }, 0);
  }, [value, mentionStart, mentionedIds, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={2}
        placeholder={placeholder || 'Add a comment... Use @ to mention'}
        className={cn(
          'w-full px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none',
          className
        )}
      />
      {showPicker && (
        <UserPicker
          users={users}
          selectedIds={mentionedIds}
          onSelect={handleSelect}
          onClose={() => setShowPicker(false)}
          className="bottom-full mb-1 left-0"
        />
      )}
    </div>
  );
}
