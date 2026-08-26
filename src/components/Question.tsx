import React from "react";
import { createPortal } from "react-dom";
import {
  ArcherContainer,
  ArcherElement,
  AnchorPosition,
  Relation,
  ValidLineStyles,
} from "react-archer";

import { CardSpan } from "components/Card";
import { SeatID } from "lib/cfish";
import { Client } from "lib/client";

namespace PlayerTarget {
  export type Props = {
    id: string;
    relations: Relation[];
    seat: SeatID;
  };
}

class PlayerTarget extends React.Component<PlayerTarget.Props> {
  render() {
    const { id, relations, seat } = this.props;

    return (
      <div className={`playerTarget rot-${seat}`}>
        <ArcherElement id={id} relations={relations}>
          <div className="playerTargetInt"></div>
        </ArcherElement>
      </div>
    );
  }
}

export namespace Question {
  export type Props = {
    client: Client;
  };

  export type State = {
    // real on-screen rect of the (invisible) anchor below, i.e. where
    // .question would sit if it weren't portaled -- null until measured
    rect: { height: number; left: number; top: number; width: number } | null;
  };
}

export class Question extends React.Component<Question.Props, Question.State> {
  anchorRef = React.createRef<HTMLDivElement>();
  observer: ResizeObserver;

  constructor(props) {
    super(props);
    this.state = { rect: null };
  }

  componentDidMount() {
    this.measure();
    // .table's mobile layout applies `transform: scale(0.62)` to fit the
    // desktop-sized rem layout on a phone. react-archer positions its SVG
    // arrow and label by measuring getBoundingClientRect (post-transform,
    // real screen pixels) but draws into an SVG whose own coordinate space
    // is its untransformed layout size -- under any ancestor CSS transform
    // those two spaces diverge, so the arrow/label land short of the real
    // target. Portaling the whole overlay to document.body at this anchor's
    // real screen rect (below) sidesteps the mismatch entirely: nothing in
    // the portaled subtree is inside a transformed ancestor anymore, so
    // getBoundingClientRect and layout pixels agree again. Window resize
    // and .table's own size changes (e.g. rotating a phone) both need a
    // re-measure, hence the ResizeObserver plus a resize listener.
    this.observer = new ResizeObserver(() => this.measure());
    if (this.anchorRef.current) this.observer.observe(this.anchorRef.current);
    window.addEventListener("resize", this.measure);
  }

  componentWillUnmount() {
    this.observer?.disconnect();
    window.removeEventListener("resize", this.measure);
  }

  measure = () => {
    const el = this.anchorRef.current;
    if (!el) return;
    const { height, left, top, width } = el.getBoundingClientRect();
    this.setState({ rect: { height, left, top, width } });
  };

  render() {
    const { client } = this.props;
    const { engine, lastAsk } = client;
    const { rect } = this.state;

    const label = lastAsk && (
      <div className="label">
        <CardSpan card={lastAsk.card} />
      </div>
    );

    // keeps pointing at the asker/askee of the most recent ask -- lastAsk is
    // a frozen snapshot, so this stays correct even after engine.asker gets
    // reassigned by a bad ask transferring the turn
    const relations = (id: SeatID) => {
      if (lastAsk === null || id !== lastAsk.asker) return [];
      const obj = {
        targetId: lastAsk.askee.toString(),
        targetAnchor: "top" as AnchorPosition,
        sourceAnchor: "top" as AnchorPosition,
        label: label,
        style: {
          lineStyle: "straight" as ValidLineStyles,
        },
      };
      return [obj];
    };

    const overlay = rect && (
      <div
        className="questionOverlay"
        style={{
          height: rect.height,
          left: rect.left,
          position: "fixed",
          top: rect.top,
          width: rect.width,
        }}
      >
        <ArcherContainer strokeColor="black">
          {engine.seats.map((seat) => (
            <PlayerTarget
              key={seat}
              id={seat.toString()}
              seat={seat}
              relations={relations(seat)}
            />
          ))}
        </ArcherContainer>
      </div>
    );

    return (
      <>
        <div className="question" ref={this.anchorRef} />
        {createPortal(overlay, document.body)}
      </>
    );
  }
}
