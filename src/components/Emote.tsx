import React, { useState } from "react";
import { usePopper } from "react-popper";

import { Client } from "lib/client";
import { Protocol as P } from "lib/protocol";

export namespace Emote {
  export type Props = {
    client: Client;
  };
}

export const Emote = (props: Emote.Props) => {
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
      <button ref={setOutRef} onClick={() => setOpen(!open)}>
        emote
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
