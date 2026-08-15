import React from "react";

import { CFish as C, SeatID } from "lib/cfish";
import { Client } from "lib/client";

const CATEGORY_LABEL: Record<C.BetCategory, string> = {
  [C.BetCategory.WINNER]: "winning team",
  [C.BetCategory.MOST_SNIPES]: "most snipes",
  [C.BetCategory.MOST_STOLEN]: "most stolen from",
};

export namespace Bet {
  export type Props = {
    client: Client;
  };

  export type State = {
    category: C.BetCategory;
    pick: number;
    amount: string;
  };
}

export class Bet extends React.Component<Bet.Props, Bet.State> {
  constructor(props) {
    super(props);
    this.state = {
      category: C.BetCategory.WINNER,
      pick: C.Team.FIRST,
      amount: "10",
    };
  }

  submit(e) {
    e.preventDefault();
    const { client } = this.props;
    const amount = Number(this.state.amount);
    if (!amount || amount <= 0) return;
    client.placeBet(this.state.category, this.state.pick, amount);
  }

  renderPickOptions() {
    const { engine } = this.props.client;
    const { category } = this.state;

    if (category === C.BetCategory.WINNER) {
      return (
        <select
          value={this.state.pick}
          onChange={(e) => this.setState({ pick: Number(e.target.value) })}
        >
          <option value={C.Team.FIRST}>team first (blue)</option>
          <option value={C.Team.SECOND}>team second (coral)</option>
        </select>
      );
    }

    return (
      <select
        value={this.state.pick}
        onChange={(e) => this.setState({ pick: Number(e.target.value) })}
      >
        {engine.seats
          .filter((seat) => engine.userOf[seat] !== null)
          .map((seat) => (
            <option key={seat} value={seat}>
              {this.props.client.nameOf(seat)}
            </option>
          ))}
      </select>
    );
  }

  renderPending() {
    const { client } = this.props;
    const { engine } = client;
    if (engine.bets.length === 0) return null;

    return (
      <ul className="pendingBets">
        {engine.bets.map((bet, i) => (
          <li key={i}>
            {client.nameOf(bet.user)} bet {bet.amount} on{" "}
            {CATEGORY_LABEL[bet.category]}
            {bet.category === C.BetCategory.WINNER
              ? ` (${bet.pick === C.Team.FIRST ? "first" : "second"})`
              : ` (${client.nameOf(bet.pick as SeatID)})`}
          </li>
        ))}
      </ul>
    );
  }

  renderResults() {
    const { client } = this.props;
    const { engine } = client;
    if (engine.lastBetResults.length === 0) return null;

    // wrong guesses still get their stake back (payout === amount) when no
    // one in the category guessed right -- distinct from an outright loss
    const outcome = (result: C.BetResult) => {
      if (result.correct) return `won ${result.payout}`;
      if (result.payout > 0) return "refunded, no one guessed right";
      return "lost the bet";
    };

    return (
      <ul className="betResults">
        {engine.lastBetResults.map((result, i) => (
          <li key={i} className={result.correct ? "correct" : result.payout > 0 ? "refund" : "wrong"}>
            {client.nameOf(result.user)}: {CATEGORY_LABEL[result.category]} &mdash;{" "}
            {outcome(result)}
          </li>
        ))}
      </ul>
    );
  }

  render() {
    const { client } = this.props;
    const { engine } = client;
    const balance = engine.chips[engine.identity] ?? engine.rules.startingChips;

    return (
      <div className="bet">
        <div className="title">side bets ({balance} chips)</div>
        {this.renderResults()}
        <form onSubmit={(e) => this.submit(e)}>
          <select
            value={this.state.category}
            onChange={(e) =>
              this.setState({
                category: Number(e.target.value),
                pick: Number(e.target.value) === C.BetCategory.WINNER ? C.Team.FIRST : engine.seats[0],
              })
            }
          >
            <option value={C.BetCategory.WINNER}>winning team</option>
            <option value={C.BetCategory.MOST_SNIPES}>most snipes</option>
            <option value={C.BetCategory.MOST_STOLEN}>most stolen from</option>
          </select>
          {this.renderPickOptions()}
          <input
            type="number"
            min={1}
            value={this.state.amount}
            onChange={(e) => this.setState({ amount: e.target.value })}
          />
          <button type="submit">bet</button>
        </form>
        {this.renderPending()}
      </div>
    );
  }
}
