"use client";

import type { ReactNode, RefObject } from "react";
import Icon from "./Icon";
import { EMAIL_RE, splitAddresses } from "@/lib/client";

type Props = {
  label: string;
  values: string[];
  onValues: (v: string[]) => void;
  text: string;
  onText: (t: string) => void;
  listId: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  children?: ReactNode;
};

/** Gmail-style address input: typed addresses turn into removable chips. */
export default function RecipientField({ label, values, onValues, text, onText, listId, inputRef, children }: Props) {
  const commit = (raw = text) => {
    const parts = splitAddresses(raw);
    if (parts.length) onValues([...values, ...parts]);
    onText("");
  };

  return (
    <div className="field" onClick={(e) => e.currentTarget.querySelector("input")?.focus()}>
      <label>{label}</label>
      {values.map((addr, i) => (
        <span key={`${addr}-${i}`} className={EMAIL_RE.test(addr) ? "chip" : "chip bad"} title={EMAIL_RE.test(addr) ? addr : "Invalid address"}>
          {addr}
          <button type="button" title="Remove" onClick={() => onValues(values.filter((_, j) => j !== i))}>
            <Icon name="x" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        list={listId}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          // pasting "a@x.com, b@y.com" or picking from autocomplete ends in a separator → chip it
          if (/[,;]\s*$|\s$/.test(v) && v.trim()) commit(v);
          else onText(v);
        }}
        onKeyDown={(e) => {
          if (["Enter", "Tab", ",", ";"].includes(e.key) && text.trim()) {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !text && values.length) {
            onValues(values.slice(0, -1));
          }
        }}
        onBlur={() => commit()}
      />
      {children}
    </div>
  );
}
