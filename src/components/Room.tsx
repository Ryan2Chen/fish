import React from "react";
import { withRouter } from "react-router-dom";
import { RouteComponentProps } from "react-router";

import { Action } from "components/Action";
import { CardAnim } from "components/CardAnim";
import { CardArea } from "components/CardArea";
import { Config } from "components/Config";
import { Declare } from "components/Declare";
import { Info } from "components/Info";
import { Log } from "components/Log";
import { Players } from "components/Players";
import { Question } from "components/Question";
import { SpinWheel } from "components/SpinWheel";
import andoverSeal from "assets/andover-seal.svg";
import { CFish as C } from "lib/cfish";
import { Client } from "lib/client";
import { RoomID, UserID } from "lib/server";

export namespace Room {
  export type Match = {
    room: string;
  };

  export type Props = RouteComponentProps<Match> & {
    url: string;
  };

  export type State = {
    client?: Client | null;
    name?: string | null;
    nameInput?: string;
    room?: string;
    sidebar?: "closed" | "info" | "log";
  };
}

class Room extends React.Component<Room.Props, Room.State> {
  constructor(props) {
    super(props);

    this.state = {
      client: null,
      name: window.localStorage.getItem(this.storageKey("name")),
      nameInput: "",
      room: this.props.match.params.room,
      sidebar: "closed",
    };
  }

  // "?as=2" namespaces localStorage so a handful of ordinary tabs in the
  // same browser can each be a distinct test player -- real links (no "as"
  // param) are untouched and keep the normal persistent identity
  storageKey(key: "name" | "token"): string {
    const as = new URLSearchParams(this.props.location.search).get("as");
    return as ? `${key}:${as}` : key;
  }

  componentDidMount() {
    if (this.state.name !== null) this.startClient(this.state.name);
  }

  startClient(name: string) {
    const { client: client_, room } = this.state;
    if (client_ !== null) return;

    const token = this.getToken();
    const client = new Client(this.props.url, room as RoomID, name, token);
    client.onUpdate = (client: Client) => this.setState({ client });
    client.connect();
    this.setState({ client, name });
  }

  submitName(e) {
    e.preventDefault();
    e.stopPropagation();
    const name = (this.state.nameInput || "no name").slice(0, 16);
    window.localStorage.setItem(this.storageKey("name"), name);
    this.startClient(name);
  }

  // persistent per-browser identity, so a reload/reconnect can reclaim
  // the same seat instead of looking like a brand new player
  getToken(): UserID {
    const key = this.storageKey("token");
    let token = window.localStorage.getItem(key);
    if (!token) {
      token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(key, token);
    }
    return token as UserID;
  }

  renderNameEntry() {
    return (
      <div className="nameEntry">
        <p>enter your name</p>
        <form onSubmit={(e) => this.submitName(e)}>
          <input
            autoFocus
            maxLength={16}
            onChange={(e) => this.setState({ nameInput: e.target.value })}
            type="text"
            value={this.state.nameInput}
          />
          <button type="submit">go!</button>
        </form>
      </div>
    );
  }

  renderDeclare() {
    const { client } = this.state;
    const { engine } = client;

    if (engine.phase !== C.Phase.DECLARE) return null;

    const seats = engine.seats.filter(
      (seat) => engine.teamOf(seat) === engine.teamOf(engine.declarer)
    );

    return <Declare client={client} suit={engine.declaredSuit} seats={seats} />;
  }

  renderSubaction() {
    const { client, sidebar } = this.state;
    const { engine } = client;

    if (engine.phase === C.Phase.WAIT) return <Config client={client} />;
    if (engine.ownHand !== null) return <CardArea client={client} />;
    return null;
  }

  renderToggle(pane: "info" | "log") {
    const { client, sidebar } = this.state;
    const { engine } = client;
    const label = sidebar !== pane ? `show ${pane}` : `hide ${pane}`;

    const onClick = (e) =>
      this.setState({ sidebar: sidebar === pane ? "closed" : pane });

    return <button onClick={onClick}>{label}</button>;
  }

  renderSidebar() {
    const { client, sidebar } = this.state;
    const { engine } = client;
    const logvis = engine.rules.log !== C.LogRule.LAST_ACTION;

    return (
      <>
        <Info active={sidebar === "info"} client={client} lone={!logvis} />
        {logvis ? <Log active={sidebar === "log"} client={client} /> : null}
        <div
          className={`toggles ${
            this.state.sidebar === "closed" ? "" : "active"
          }`}
        >
          {this.renderToggle("info")}
          {logvis ? this.renderToggle("log") : null}
        </div>
      </>
    );
  }

  render() {
    const { client, name } = this.state;

    if (name === null) {
      return <div className="game">{this.renderNameEntry()}</div>;
    }

    if (!client) {
      return <div className="game">loading...</div>;
    }

    const { engine } = client;

    if (client?.status === "disconnected") {
      return (
        <div className="game">
          you've been disconnected! reload the page to rejoin the game
        </div>
      );
    }
    if (!client?.engine) {
      return <div className="game">loading...</div>;
    }

    if (engine.paused) {
      return (
        <div className="game">
          game paused &mdash; waiting for {client.nameOf(engine.pausedUser)}{" "}
          to reconnect (up to a minute)
        </div>
      );
    }

    return (
      <div className="room">
        <img className="andoverBadge" src={andoverSeal} alt="Phillips Academy Andover seal" />
        <div className="game">
          <div className="table">
            <Players client={client} />
            <Question client={client} />
            {this.renderDeclare()}
            <CardAnim client={client} />
            <SpinWheel client={client} />
          </div>
          <Action client={client} />
          {this.renderSubaction()}
        </div>
        {this.renderSidebar()}
      </div>
    );
  }
}

export default withRouter(Room);
