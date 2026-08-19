import React from "react";
import { DragDropContext, Droppable, DropResult } from "react-beautiful-dnd";

import { Card } from "components/Card";
import { Card as CardT, FishSuit, fishSuitToString } from "lib/cards";
import { Client } from "lib/client";

export namespace CardArea {
  export type Props = {
    client: Client;
  };

  export type State = {
    // purely a personal view preference (which fish-suit groups are tucked
    // away in the shelf) -- never touches engine.ownHand, so it's fine for
    // this to reset on reload
    bankedSuits: Set<FishSuit>;
  };
}

export class CardArea extends React.Component<CardArea.Props, CardArea.State> {
  state: CardArea.State = {
    bankedSuits: new Set(),
  };

  isBanked = (card: CardT): boolean =>
    this.state.bankedSuits.has(card.fishSuit);

  onDragEnd(result: DropResult) {
    const { source, destination } = result;
    if (!destination) return;

    const { engine } = this.props.client;
    const cards = engine.ownHand.cards;

    // the row only renders cards that aren't banked, so rbd's indices are
    // relative to that subset -- map them back onto real positions in the
    // full hand array before splicing it, leaving banked cards' slots alone
    const positions: number[] = [];
    cards.forEach((card, i) => {
      if (!this.isBanked(card)) positions.push(i);
    });
    const subset = positions.map((i) => cards[i]);
    const [moved] = subset.splice(source.index, 1);
    subset.splice(destination.index, 0, moved);
    positions.forEach((fullIndex, k) => {
      cards[fullIndex] = subset[k];
    });

    this.props.client.onUpdate(this.props.client);
  }

  bank(fishSuit: FishSuit) {
    this.setState(({ bankedSuits }) => ({
      bankedSuits: new Set(bankedSuits).add(fishSuit),
    }));
  }

  unbank(fishSuit: FishSuit) {
    this.setState(({ bankedSuits }) => {
      const next = new Set(bankedSuits);
      next.delete(fishSuit);
      return { bankedSuits: next };
    });
  }

  render() {
    const { client } = this.props;
    const { engine } = client;
    if (!engine.ownHand) return null;

    const allCards = engine.ownHand.cards;
    const activeCards = allCards.filter((card) => !this.isBanked(card));

    const bankedGroups: { fishSuit: FishSuit; count: number }[] = [];
    for (const card of allCards) {
      if (!this.isBanked(card)) continue;
      const group = bankedGroups.find((g) => g.fishSuit === card.fishSuit);
      if (group) group.count++;
      else bankedGroups.push({ fishSuit: card.fishSuit, count: 1 });
    }

    return (
      <div className="handArea">
        <DragDropContext onDragEnd={(result) => this.onDragEnd(result)}>
          <Droppable direction="horizontal" droppableId="cardArea">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="cardArea"
              >
                {activeCards.map((card, i) => {
                  const groupStart =
                    i > 0 && card.fishSuit !== activeCards[i - 1].fishSuit;

                  return (
                    <div className="cardWrap" key={card.toString()}>
                      {(i === 0 || groupStart) && (
                        <button
                          className="bankGroupBtn"
                          onClick={() => this.bank(card.fishSuit)}
                          title={`bank ${fishSuitToString(card.fishSuit)}`}
                          type="button"
                        >
                          bank
                        </button>
                      )}
                      <Card card={card} groupStart={groupStart} index={i} />
                    </div>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        {bankedGroups.length > 0 && (
          <div className="bankedShelf">
            {bankedGroups.map((group) => (
              <button
                className="bankedChip"
                key={group.fishSuit}
                onClick={() => this.unbank(group.fishSuit)}
                title="tap to bring back"
                type="button"
              >
                {fishSuitToString(group.fishSuit)} · {group.count}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
}
