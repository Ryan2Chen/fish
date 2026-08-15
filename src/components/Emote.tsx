import React, { useState } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";

import { Client } from "lib/client";
import { Protocol as P } from "lib/protocol";

// largest divisor of n that's <= sqrt(n) -- picks the most "square" grid
// shape available (9 -> 3x3, 8 -> 4x2, 6 -> 3x2, etc.)
const gridRows = (n: number): number => {
  let rows = Math.floor(Math.sqrt(n));
  while (rows > 1 && n % rows !== 0) rows -= 1;
  return rows;
};

export namespace Emote {
  export type Props = {
    client: Client;
  };
}

const EmoteComponent = (props: Emote.Props) => {
  const { client } = props;
  const [open, setOpen] = useState(false);
  const [outRef, setOutRef] = useState<HTMLElement>(null);
  const [inRef, setInRef] = useState<HTMLElement>(null);
  const { styles, attributes } = usePopper(outRef, inRef, {
    placement: "right-start",
    // skidding (first value, negative) shifts the popup up along the
    // right-placement's cross axis, distance (second value) is the
    // horizontal gap -- together they open it diagonally up-and-right
    // into open table space instead of overlapping the player's own box
    modifiers: [{ name: "offset", options: { offset: [-28, 16] } }],
  });

  if (client.engine.ownSeat === null) return null;

  const send = (emoji: string) => {
    client.sendEmote(emoji);
    setOpen(false);
  };

  return (
    <div className="emotePicker">
      <button
        className="emoteTrigger"
        ref={setOutRef}
        onClick={() => setOpen(!open)}
        title="emote"
      >
        <svg viewBox="0 0 40 40" width="16" height="16">
          <circle cx="18" cy="20" r="15" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="13" cy="18" r="1.8" fill="currentColor" />
          <circle cx="23" cy="18" r="1.8" fill="currentColor" />
          <path
            d="M 11 24 Q 18 30 25 24"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M 32 4 L 32 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M 27 9 L 37 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              className="emoteOptions"
              ref={setInRef}
              style={{
                ...styles.popper,
                gridTemplateColumns: `repeat(${P.EMOJIS.length / gridRows(P.EMOJIS.length)}, auto)`,
              }}
              {...attributes.popper}
            >
              {P.EMOJIS.map((emoji) => (
                <button key={emoji} onClick={() => send(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export const Emote = EmoteComponent;
