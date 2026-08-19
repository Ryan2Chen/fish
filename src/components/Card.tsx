import React from "react";
import { Draggable } from "react-beautiful-dnd";

import { Card as CardT, cardSuitToSymbol, rankToSymbol } from "lib/cards";
import { Client } from "lib/client";

export namespace CardSpan {
  export type Props = {
    break?: boolean;
    card: CardT;
  };
}

export class CardSpan extends React.Component<CardSpan.Props> {
  render() {
    const { card } = this.props;
    const color = card.color();
    const suit = cardSuitToSymbol(card.cardSuit);
    const rank =
      this.props.break && suit === "★" ? "" : rankToSymbol(card.rank);

    return (
      <span className="cardSpan" style={{ color }}>
        {rank !== "" ? (
          <>
            <span className="rank">{rank}</span>
            {this.props.break ? <br /> : null}
          </>
        ) : null}
        <span className="suit">{suit}</span>
      </span>
    );
  }
}

// a lo-fi illustrated card face: corner indices + a big center suit glyph
export class CardFace extends React.Component<CardSpan.Props> {
  render() {
    const { card } = this.props;
    const color = card.color();
    const suit = cardSuitToSymbol(card.cardSuit);
    const rank = rankToSymbol(card.rank);

    return (
      <svg className="cardFace" viewBox="0 0 80 120" style={{ fill: color }}>
        <text className="corner rank" x="8" y="20">
          {rank}
        </text>
        <text className="corner suit" x="8" y="36">
          {suit}
        </text>
        <text
          className="corner rank"
          x="72"
          y="100"
          transform="rotate(180 72 100)"
        >
          {rank}
        </text>
        <text
          className="corner suit"
          x="72"
          y="116"
          transform="rotate(180 72 116)"
        >
          {suit}
        </text>
        <text className="center suit" x="40" y="70">
          {suit}
        </text>
      </svg>
    );
  }
}

export namespace Card {
  export type Props = {
    card: CardT;
    disabled?: boolean;
    // true when this card starts a new fish-suit run (relative to
    // whatever's immediately to its left) -- purely a visual gap so a
    // sorted (or manually grouped) hand actually reads as grouped, not a
    // gameplay concern
    groupStart?: boolean;
    index: number;
  };
}

export class Card extends React.Component<Card.Props> {
  render() {
    const { card, index } = this.props;

    return (
      <Draggable
        draggableId={card.toString()}
        index={index}
        isDragDisabled={this.props.disabled ?? false}
        key={card.toString()}
      >
        {(provided, snapshot) => (
          <div
            className={`cardFrame ${this.props.groupStart ? "groupStart" : ""}`}
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            {...provided.draggableProps.style}
          >
            <div className="card">
              <CardFace card={card} />
            </div>
          </div>
        )}
      </Draggable>
    );
  }
}
