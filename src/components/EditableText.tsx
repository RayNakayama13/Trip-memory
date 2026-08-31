import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  /** 未入力のときに薄く表示する文言 */
  placeholder: string;
  multiline?: boolean;
  className?: string;
  ariaLabel: string;
  onSave: (value: string) => void;
}

/** クリックでその場編集できるテキスト。旅やスポットのタイトル・メモに使う。 */
export function EditableText({
  value,
  placeholder,
  multiline = false,
  className,
  ariaLabel,
  onSave,
}: Props): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = (): void => {
    setEditing(false);
    if (draft !== value) onSave(draft.trim());
  };

  const cancel = (): void => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    const shared = {
      ref: inputRef as never,
      value: draft,
      onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
      onBlur: commit,
      'aria-label': ariaLabel,
      placeholder,
    };
    return multiline ? (
      <textarea
        {...shared}
        className="textarea"
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
        }}
      />
    ) : (
      <input
        {...shared}
        className="input"
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter') commit();
        }}
      />
    );
  }

  return (
    <span className="editable">
      <button
        type="button"
        className={`editable__button ${className ?? ''}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="クリックして編集"
      >
        {value || <span className="muted">{placeholder}</span>}
      </button>
      <span className="editable__pencil" aria-hidden="true">
        ✎
      </span>
    </span>
  );
}
