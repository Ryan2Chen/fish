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
  client: Client;
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
      <div className="avatarRow">
        <Avatar id={props.avatarId} />
        {props.isSelf ? <Emote client={props.client} /> : null}
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
              client={client}
              emoji={client.activeEmotes[seat] ?? null}
              emoteId={client.activeEmoteIds[seat] ?? null}
              isHost={
                engine.userOf[seat] !== null && engine.userOf[seat] === engine.host
              }
              isSelf={seat === engine.ownSeat}
              name={this.renderName(seat)}
              seatBtn={this.renderSeatBtn(seat)}
            />
          </div>
        ))}
      </div>
    );
  }
}
