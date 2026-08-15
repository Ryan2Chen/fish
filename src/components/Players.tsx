import React, { useState } from "react";
import { usePopper } from "react-popper";

import { Avatar } from "components/Avatar";
import { CardSelector } from "components/CardSelector";
import { Emote } from "components/Emote";
import { Card } from "lib/cards";
import { CFish as C, SeatID } from "lib/cfish";
import { Client } from "lib/client";

const PlayerInt = (props: {
  active: boolean;
  askBtn: JSX.Element | null;
  avatarId: string;
  cardSelector: (update: () => void) => JSX.Element | null;
  chatBubbleSide: "left" | "right";
  chatMessage: string | null;
  chatMessageId: number | null;
  client: Client;
  team: C.Team | null;
  emoji: string | null;
  emoteId: number | null;
  isHost: boolean;
  isSelf: boolean;
  name: string;
  seatBtn: JSX.Element | null;
}) => {
  const [outRef, setOutRef] = useState<HTMLElement>(null);
  const [inRef, setInRef] = useState<HTMLElement>(null);
  const { styles, attributes, update } = usePopper(outRef, inRef, {
    placement: "bottom",
  });

  // chat bubble anchors to the avatar row (same idea as Emote's own
  // popper), not to the box as a whole, so it lines up with the icon
  // regardless of name length or box height -- except for your own seat,
  // where it anchors to the emote icon specifically (via this extra wrapper
  // ref), so the bubble doesn't sit on top of it. The arrow modifier keeps
  // the tail's attachment point correct even as the bubble's height
  // changes (multi-line wraps) or its placement flips near an edge -- a
  // fixed, hand-tuned CSS offset would drift out of sync with the bubble.
  const [avatarRef, setAvatarRef] = useState<HTMLElement>(null);
  const [selfEmoteRef, setSelfEmoteRef] = useState<HTMLElement>(null);
  const [chatRef, setChatRef] = useState<HTMLElement>(null);
  const [chatArrowRef, setChatArrowRef] = useState<HTMLElement>(null);
  const chatAnchorRef = props.isSelf ? selfEmoteRef : avatarRef;
  const { styles: chatStyles, attributes: chatAttributes } = usePopper(
    chatAnchorRef,
    chatRef,
    {
      placement: props.chatBubbleSide === "left" ? "left" : "right",
      // skidding (first value) shifts the bubble up along the cross axis,
      // distance (second value) is the horizontal gap from the anchor
      modifiers: [
        { name: "offset", options: { offset: [-24, 12] } },
        // padding keeps the arrow's computed offset clear of the bubble's
        // rounded corners -- too close and the corner curve clips into the
        // arrow's flush edge, making it look detached from the bubble
        { name: "arrow", options: { element: chatArrowRef, padding: 6 } },
      ],
    }
  );

  return (
    <div
      className={`playerInt ${props.active ? "active" : ""}`}
      ref={setOutRef}
    >
      {props.emoji ? (
        <div className="emoteBubble" key={props.emoteId}>
          {props.emoji}
        </div>
      ) : null}
      {props.chatMessage ? (
        <div
          className={`chatBubble ${props.chatBubbleSide} team-${props.team}`}
          key={props.chatMessageId}
          ref={setChatRef}
          style={chatStyles.popper}
          {...chatAttributes.popper}
        >
          {props.chatMessage}
          {/* An asymmetric polygon, not a rotated symmetric one: its base
          edge is defined to lie exactly on the bubble's border and is
          never transformed, so it can't visually separate from the
          bubble regardless of where popper positions it vertically.
          Only the tip point is offset up-and-over for the angled look. */}
          <div
            className="chatBubbleTail"
            ref={setChatArrowRef}
            style={chatStyles.arrow}
          />
        </div>
      ) : null}
      <div className="avatarRow" ref={setAvatarRef}>
        <Avatar id={props.avatarId} />
        {props.isSelf ? (
          <div className="selfEmoteWrap" ref={setSelfEmoteRef}>
            <Emote client={props.client} />
          </div>
        ) : null}
      </div>
      <span className="playerName">
        {props.isHost ? <span className="adminBadge">★</span> : null}
        {props.name}
      </span>
      {props.seatBtn}
      {props.askBtn}
      <div
        className="popWrap"
        ref={setInRef}
        style={styles.popper}
        {...attributes.popper}
      >
        {props.cardSelector(update)}
      </div>
    </div>
  );
};

export namespace Players {
  export type Props = {
    client: Client;
  };

  export type State = {
    animDone?: boolean;
    askee?: number | null;
  };
}

export class Players extends React.Component<Players.Props, Players.State> {
  constructor(props) {
    super(props);

    this.state = {
      animDone: true,
      askee: null,
    };
  }

  componentDidMount() {
    this.props.client.resetShakeAnimHook = () =>
      this.setState({ animDone: false });
  }

  renderName(seat: SeatID) {
    const { client } = this.props;
    const { engine } = client;

    const res = [];
    res.push(client.nameOf(seat));
    if (engine.handSize[seat] !== null) {
      res.push(`(${engine.handSize[seat]})`);
    }

    return res.join(" ");
  }

  renderSeatBtn(seat: SeatID) {
    const { client } = this.props;
    const { engine } = client;

    if (
      (engine.ownSeat !== null && engine.ownSeat !== seat) ||
      (engine.ownSeat === null && engine.userOf[seat] !== null)
    )
      return null;

    return engine.ownSeat !== null ? (
      <button onClick={(e) => client.unseatAt()}>stand up</button>
    ) : (
      <button onClick={(e) => client.seatAt(seat)}>sit down</button>
    );
  }

  // also renders pass and choose buttons
  renderAskBtn(seat: SeatID) {
    const { client } = this.props;
    const { engine } = client;

    if (
      engine.phase === C.Phase.CHOOSE &&
      engine.chooser === engine.ownSeat &&
      engine.teamOf(seat) === engine.teamOf(engine.ownSeat) &&
      engine.handSize[seat] !== 0
    )
      return <button onClick={(e) => client.assignTurn(seat)}>choose</button>;

    if (
      engine.phase === C.Phase.PASS &&
      engine.asker === engine.ownSeat &&
      engine.teamOf(seat) === engine.teamOf(engine.ownSeat) &&
      seat !== engine.ownSeat &&
      engine.handSize[seat] !== 0
    )
      return <button onClick={(e) => client.pass(seat)}>pass</button>;

    if (
      engine.phase !== C.Phase.ASK ||
      engine.asker !== engine.ownSeat ||
      engine.teamOf(seat) === engine.teamOf(engine.ownSeat) ||
      engine.handSize[seat] === 0
    )
      return null;

    const isAsk = this.state.askee !== seat;
    const text = isAsk ? "ask" : "cancel";
    const askee = isAsk ? seat : null;

    return <button onClick={(e) => this.setState({ askee })}>{text}</button>;
  }

  renderCardSelector(seat: SeatID, update: () => void) {
    const { client } = this.props;
    const { engine } = client;

    const callback = (card) => {
      client.ask(seat, card);
      this.setState({ askee: null });
    };
    const disabled =
      engine.rules.bluff === C.BluffRule.YES ? [] : engine.ownHand?.cards;
    const suits = Card.FISH_SUITS.filter((suit) =>
      engine.ownHand?.hasSuit(suit)
    );

    return this.state.askee === seat ? (
      <CardSelector
        callback={callback}
        close={() => this.setState({ askee: null })}
        disabled={disabled}
        suits={suits}
        update={update}
      />
    ) : null;
  }

  // seats on the left half of the table pop their chat bubble to the
  // left, so it doesn't overlap the table; everyone else (right side,
  // plus top/bottom) gets it on the right
  chatBubbleSide(seat: SeatID): "left" | "right" {
    return seat === 1 || seat === 2 ? "left" : "right";
  }

  render() {
    const { client } = this.props;
    const { engine, users } = client;
    const animClass = (seat) =>
      seat !== engine.asker || this.state.animDone ? "" : "shake";

    return (
      <div className="players">
        {engine.seats.map((seat) => (
          <div
            className={`player rot-${seat} team-${engine.teamOf(
              seat
            )} ${animClass(seat)}`}
            key={seat}
            onAnimationEnd={(e) => this.setState({ animDone: true })}
          >
            <PlayerInt
              active={!client.revealingFirstAsker && engine.activeSeat === seat}
              askBtn={this.renderAskBtn(seat)}
              avatarId={client.findUser(seat)?.avatar}
              cardSelector={(update) => this.renderCardSelector(seat, update)}
              chatBubbleSide={this.chatBubbleSide(seat)}
              chatMessage={client.activeChatBubbles[seat] ?? null}
              chatMessageId={client.activeChatBubbleIds[seat] ?? null}
              client={client}
              emoji={client.activeEmotes[seat] ?? null}
              emoteId={client.activeEmoteIds[seat] ?? null}
              isHost={
                engine.userOf[seat] !== null && engine.userOf[seat] === engine.host
              }
              isSelf={seat === engine.ownSeat}
              name={this.renderName(seat)}
              seatBtn={this.renderSeatBtn(seat)}
              team={engine.teamOf(seat)}
            />
          </div>
        ))}
      </div>
    );
  }
}
