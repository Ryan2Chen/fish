import React from "react";

import { CardSpan } from "components/Card";
import { SuitSelector } from "components/SuitSelector";
import { Card, FishSuit, fishSuitToString, genFishSuit } from "lib/cards";

// same breakpoint the stylesheet's mobile layout switches at
const MOBILE_QUERY = "(max-width: 750px)";

namespace CardSelectorRow {
  export type Props = {
    callback: (card: Card) => void;
    disabled: Card[];
    suit: FishSuit;
  };
}

class CardSelectorRow extends React.Component<CardSelectorRow.Props> {
  render() {
    const { callback, disabled, suit } = this.props;

    return (
      <div className="row" key={fishSuitToString(suit)}>
        {[...genFishSuit(suit)].map((card) => (
          <button
            disabled={disabled.some((card_) => card_.equals(card))}
            key={card.toString()}
            onClick={(e) => callback(card)}
            title={card.toString()}
          >
            <CardSpan card={card} />
          </button>
        ))}
      </div>
    );
  }
}

export namespace CardSelector {
  export type Props = {
    callback: (card: Card) => void;
    close: () => void;
    disabled: Card[];
    suits: FishSuit[];
    update: () => void;
    // the "ask"/"cancel" toggle button that opened this popup, if any --
    // clicks on it must NOT count as "outside" (see handleOutsideClick)
    triggerRef?: HTMLElement | null;
  };

  export type State = {
    isMobile: boolean;
    // which set's specific cards are showing, mobile only -- null means
    // "showing the what-set grid" (see render())
    selectedSuit: FishSuit | null;
  };
}

export class CardSelector extends React.Component<CardSelector.Props, CardSelector.State> {
  mql = typeof window !== "undefined" ? window.matchMedia(MOBILE_QUERY) : null;
  wrapperRef = React.createRef<HTMLDivElement>();

  constructor(props) {
    super(props);
    this.state = { isMobile: this.mql?.matches ?? false, selectedSuit: null };
  }

  componentDidMount() {
    this.props.update();
    this.mql?.addEventListener("change", this.onMqlChange);
    document.addEventListener("mousedown", this.handleOutsideClick);
  }

  componentWillUnmount() {
    this.mql?.removeEventListener("change", this.onMqlChange);
    document.removeEventListener("mousedown", this.handleOutsideClick);
  }

  onMqlChange = (e: MediaQueryListEvent) => {
    this.setState({ isMobile: e.matches });
  };

  // dismisses the whole popup (both the what-set and specific-card steps)
  // and lets the user ask someone else instead. Uses mousedown (fires
  // before the ask/cancel button's own click handler) so a re-click on
  // that same button still correctly toggles closed via its own logic --
  // it's excluded here via triggerRef, not just left to fire twice.
  handleOutsideClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (this.wrapperRef.current?.contains(target)) return;
    if (this.props.triggerRef?.contains(target)) return;
    this.props.close();
  };

  selectSuit(suit: FishSuit | null) {
    this.setState({ selectedSuit: suit });
    // grid <-> single-row content sizes differ, so the popup needs to
    // recompute its position after the switch
    this.props.update();
  }

  render() {
    const { callback, disabled, suits, update } = this.props;
    const { isMobile, selectedSuit } = this.state;

    // mobile step 1: pick a set first, reusing the exact same 3x3 grid as
    // the declare flow's what-set picker -- sets not in hand are disabled
    // rather than hidden, same as declare disables already-declared sets
    if (isMobile && selectedSuit === null) {
      return (
        <div ref={this.wrapperRef}>
          <SuitSelector
            callback={(suit) => this.selectSuit(suit)}
            close={() => {}}
            disabled={Card.FISH_SUITS.filter((suit) => !suits.includes(suit))}
            update={update}
          />
        </div>
      );
    }

    // mobile step 2: just the 6 cards in the chosen set, plus a way back
    // to the what-set grid
    if (isMobile && selectedSuit !== null) {
      return (
        <div className="cardSelector mobileCardStep" ref={this.wrapperRef}>
          <button className="backToSets" onClick={() => this.selectSuit(null)}>
            ← back
          </button>
          <CardSelectorRow callback={callback} disabled={disabled} suit={selectedSuit} />
        </div>
      );
    }

    return (
      <div className="cardSelector" ref={this.wrapperRef}>
        {suits.map((suit) => (
          <CardSelectorRow
            callback={callback}
            disabled={disabled}
            key={fishSuitToString(suit)}
            suit={suit}
          />
        ))}
        {/*<button onClick={(e) => this.props.close()}>cancel</button>*/}
      </div>
    );
  }
}
