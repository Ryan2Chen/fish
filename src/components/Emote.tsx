import React, { useState } from "react";
import { usePopper } from "react-popper";

import { Client } from "lib/client";
import { Protocol as P } from "lib/protocol";

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
    placement: "top",
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
      {open ? (
        <div
          className="emoteOptions"
          ref={setInRef}
          style={styles.popper}
          {...attributes.popper}
        >
          {P.EMOJIS.map((emoji) => (
            <button key={emoji} onClick={() => send(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const Emote = EmoteComponent;
