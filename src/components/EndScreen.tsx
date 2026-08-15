import React from "react";

import { Avatar } from "components/Avatar";
import { CFish as C, SeatID } from "lib/cfish";
import { Client } from "lib/client";

// mm:ss, matches the format used in Info.tsx's team/player clocks
const formatMs = (ms: number): string => {
  const abs = Math.abs(Math.round(ms / 1000));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export namespace EndScreen {
  export type Props = {
    client: Client;
  };
}

export class EndScreen extends React.Component<EndScreen.Props> {
  exportStats() {
    const { client } = this.props;
    const { engine } = client;

    const header = [
      "player",
      "team",
      "cardsWon",
      "cardsLost",
      "declaresCorrect",
      "declaresIncorrect",
      "sets",
      "timeSeconds",
      "mvp",
      "ace",
    ];
    const rows = engine.seats.map((seat) => {
      const stats = engine.stats[seat];
      return [
        client.nameOf(seat),
        engine.teamOf(seat) === C.Team.FIRST ? "first" : "second",
        stats.cardsWon,
        stats.cardsLost,
        stats.declaresCorrect,
        stats.declaresIncorrect,
        engine.setsFor(seat),
        Math.round((engine.usedMs[seat] ?? 0) / 1000),
        seat === engine.mvpSeat ? "yes" : "no",
        seat === engine.aceSeat ? "yes" : "no",
      ];
    });
    const csv = [header, ...rows].map((row) => row.join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cfish-stats-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  renderRow(seat: SeatID) {
    const { client } = this.props;
    const { engine } = client;
    const stats = engine.stats[seat];
    const badges = [];
    if (seat === engine.mvpSeat) badges.push("MVP");
    if (seat === engine.aceSeat && seat !== engine.mvpSeat) badges.push("Ace");

    return (
      <tr key={seat} className={seat === engine.ownSeat ? "self" : ""}>
        <td className="name">
          <Avatar id={client.findUser(seat)?.avatar} size={18} />
          {client.nameOf(seat)}
          {badges.map((b) => (
            <span className={`badge badge-${b.toLowerCase()}`} key={b}>
              {b}
            </span>
          ))}
        </td>
        <td>{stats.cardsWon}</td>
        <td>{stats.cardsLost}</td>
        <td>{stats.declaresCorrect}</td>
        <td>{stats.declaresIncorrect}</td>
        <td>{engine.setsFor(seat)}</td>
        <td>{formatMs(engine.usedMs[seat] ?? 0)}</td>
      </tr>
    );
  }

  render() {
    const { client } = this.props;
    const { engine } = client;

    if (engine.winner === null) return null;

    const ownTeam = engine.ownSeat !== null ? engine.teamOf(engine.ownSeat) : null;
    const headline =
      ownTeam === null
        ? `team ${engine.seats
            .filter((seat) => engine.teamOf(seat) === engine.winner)
            .map((seat) => client.nameOf(seat))
            .join(", ")} won`
        : ownTeam === engine.winner
        ? "you won!"
        : "you lost";

    return (
      <div className="endScreen">
        <div className={`headline ${ownTeam !== null && ownTeam !== engine.winner ? "loss" : ""}`}>
          {headline}
        </div>
        <div className="finalScore">
          {engine.scoreOf(C.Team.FIRST)} &ndash; {engine.scoreOf(C.Team.SECOND)}
        </div>
        <table className="statsTable">
          <thead>
            <tr>
              <th>player</th>
              <th title="cards won by asking">won</th>
              <th title="cards taken from them">lost</th>
              <th title="declares called correctly">✓ decl.</th>
              <th title="declares called wrong">✗ decl.</th>
              <th title="suits their team ended up with">sets</th>
              <th title="time spent as the active decision-maker">time</th>
            </tr>
          </thead>
          <tbody>{engine.seats.map((seat) => this.renderRow(seat))}</tbody>
        </table>
        <button className="exportStats" onClick={() => this.exportStats()}>
          export stats
        </button>
      </div>
    );
  }
}
