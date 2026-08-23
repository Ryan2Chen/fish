import React from "react";
import {
  DragDropContext,
  Droppable,
  DroppableProvided,
  DroppableStateSnapshot,
  DropResult,
} from "react-beautiful-dnd";

import { Card, CardFace } from "components/Card";
import {
  Card as CardT,
  FishSuit,
  fishSuitToGroupColor,
  fishSuitToString,
  genFishSuit,
} from "lib/cards";
import { CFish as C, SeatID } from "lib/cfish";
import { Client } from "lib/client";
import { MOBILE_QUERY } from "lib/responsive";

namespace DeclareArea {
  export type Props = {
    cards: CardT[];
    disabled: boolean;
    name: string;
    provided: DroppableProvided;
    seat: SeatID | "unset";
    snapshot: DroppableStateSnapshot;
  };
}

class DeclareArea extends React.Component<DeclareArea.Props> {
  render() {
    const { cards, disabled, name, provided, seat, snapshot } = this.props;

    return (
      <div className={`declareArea rot-${seat}`}>
        {/* the drop zone sits right on top of that seat's own name box in
        the player circle underneath, hiding it -- label the drop zone
        itself so whose pile this is stays obvious regardless */}
        <div className="declareAreaLabel">{name}</div>
        <div
          className="declareInner"
          ref={provided.innerRef}
          {...provided.droppableProps}
        >
          {cards.map((card, i) => (
            <Card
              card={card}
              disabled={disabled}
              key={card.toString()}
              index={i}
            />
          ))}
          {provided.placeholder}
        </div>
      </div>
    );
  }
}

export namespace Declare {
  export type Props = {
    client: Client;
    seats: SeatID[];
    suit: FishSuit;
  };

  export type State = {
    cards: Record<SeatID | "unset", CardT[]>;
    isMobile: boolean;
    // the card currently "picked up" via tap, mobile only -- null means
    // nothing selected. Tapping a destination area moves it there;
    // tapping it again (or its own pile) deselects instead of moving.
    selected: { id: SeatID | "unset"; index: number } | null;
  };
}

export class Declare extends React.Component<Declare.Props, Declare.State> {
  mql = typeof window !== "undefined" ? window.matchMedia(MOBILE_QUERY) : null;

  constructor(props) {
    super(props);

    const { seats, suit } = this.props;

    let cards = { unset: [...genFishSuit(suit)] };
    for (const seat of seats) {
      cards[seat] = [];
    }

    this.state = { cards, isMobile: this.mql?.matches ?? false, selected: null };
  }

  componentDidMount() {
    this.props.client.declareMoveHook = (
      srcId: string,
      srcIdx: number,
      destId: string,
      destIdx: number
    ) => this.move(srcId, srcIdx, destId, destIdx);
    this.mql?.addEventListener("change", this.onMqlChange);
  }

  componentWillUnmount() {
    this.mql?.removeEventListener("change", this.onMqlChange);
  }

  onMqlChange = (e: MediaQueryListEvent) => {
    this.setState({ isMobile: e.matches });
  };

  move(srcId: string, srcIdx: number, destId: string, destIdx: number) {
    const { cards: oldCards } = this.state;
    const [card] = oldCards[srcId].splice(srcIdx, 1);
    const newCards = [...oldCards[destId]];
    newCards.splice(destIdx, 0, card);
    const cards = { ...oldCards, [destId]: newCards };
    this.setState({ cards });
  }

  onDragEnd(result: DropResult) {
    const { source, destination } = result;
    if (!destination) return;

    const srcId = source.droppableId;
    const destId = destination.droppableId;
    const srcIdx = source.index;
    const destIdx = destination.index;

    this.props.client.declareMove(srcId, srcIdx, destId, destIdx);
    this.move(srcId, srcIdx, destId, destIdx);
  }

  submit() {
    let owners = {};
    for (const seat of this.props.seats) {
      for (const card of this.state.cards[seat]) {
        owners[card.toString()] = seat;
      }
    }
    this.props.client.declare(owners);
  }

  // mobile tap-to-move flow, replacing drag-and-drop: tap a card to pick
  // it up, then tap a destination pile to move it there -- tapping the
  // same card again (or the pile it's already in) just deselects
  tapCard(declaring: boolean, id: SeatID | "unset", index: number) {
    if (!declaring) return;
    const { selected } = this.state;
    if (selected && selected.id === id && selected.index === index) {
      this.setState({ selected: null });
      return;
    }
    // a pile with any cards in it has no empty background left to tap --
    // its cards fill the whole row -- so once something's picked up,
    // tapping *any* card (not just empty space) counts as choosing that
    // card's pile as the destination, rather than selecting it instead
    if (selected) {
      this.tapDestination(declaring, id);
      return;
    }
    this.setState({ selected: { id, index } });
  }

  tapDestination(declaring: boolean, destId: SeatID | "unset") {
    if (!declaring) return;
    const { selected } = this.state;
    if (!selected) return;
    if (selected.id === destId) {
      this.setState({ selected: null });
      return;
    }

    const destIdx = this.state.cards[destId].length; // append to the end
    this.props.client.declareMove(
      selected.id.toString(),
      selected.index,
      destId.toString(),
      destIdx
    );
    this.move(selected.id.toString(), selected.index, destId.toString(), destIdx);
    this.setState({ selected: null });
  }

  renderMobileArea(id: SeatID | "unset", name: string, declaring: boolean) {
    const cards = this.state.cards[id];
    const { selected } = this.state;

    return (
      <div className={`declareArea rot-${id}`} key={id}>
        <div className="declareAreaLabel">{name}</div>
        <div
          className="declareInner"
          onClick={() => this.tapDestination(declaring, id)}
        >
          {cards.map((card, i) => {
            const isSelected = selected?.id === id && selected?.index === i;
            return (
              <div
                className={`cardFrame ${isSelected ? "selected" : ""}`}
                key={card.toString()}
                onClick={(e) => {
                  // don't also fire the pile's own tapDestination handler
                  e.stopPropagation();
                  this.tapCard(declaring, id, i);
                }}
              >
                <div
                  className="card"
                  style={{ borderColor: fishSuitToGroupColor(card.fishSuit) }}
                >
                  <CardFace card={card} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  render() {
    const { client, seats, suit } = this.props;
    const { engine } = client;

    const ids: (number | "unset")[] = [...seats, "unset"];
    const disabled = this.state.cards["unset"].length > 0;
    const declaring = engine.declarer === engine.ownSeat;

    const declareButtons = declaring ? (
      <div className="declareButtons">
        <button disabled={disabled} onClick={(e) => this.submit()}>
          submit
        </button>
        <button onClick={(e) => client.cancelDeclare()}>cancel</button>
      </div>
    ) : null;

    // mobile: tap-to-move instead of drag-and-drop (touch dragging across
    // react-beautiful-dnd's drop zones is unreliable/awkward on phones)
    if (this.state.isMobile) {
      return (
        <div className="declare">
          {ids.map((id) =>
            this.renderMobileArea(
              id,
              id === "unset" ? "unclaimed" : client.nameOf(id),
              declaring
            )
          )}
          {declareButtons}
        </div>
      );
    }

    return (
      <div className="declare">
        <DragDropContext onDragEnd={(result) => this.onDragEnd(result)}>
          {ids.map((id) => (
            <Droppable
              direction="horizontal"
              droppableId={id.toString()}
              key={id}
            >
              {(provided, snapshot) => (
                <DeclareArea
                  cards={this.state.cards[id]}
                  disabled={!declaring}
                  name={id === "unset" ? "unclaimed" : client.nameOf(id)}
                  provided={provided}
                  seat={id}
                  snapshot={snapshot}
                />
              )}
            </Droppable>
          ))}
        </DragDropContext>
        {declareButtons}
      </div>
    );
  }
}
