import React from "react";

import { AVATARS, Avatar } from "components/Avatar";
import { SuitSpan } from "components/SuitSelector";
import { Card, fishSuitToString } from "lib/cards";
import { CFish as C } from "lib/cfish";
import { Client } from "lib/client";
import { Protocol as P } from "lib/protocol";

export namespace Info {
  export type Props = {
    active: boolean;
    client: Client;
    lone: boolean;
  };

  export type State = {
    nameInput: string;
    renaming: boolean;
  };
}

export class Info extends React.Component<Info.Props, Info.State> {
  constructor(props) {
    super(props);

    this.state = {
      nameInput: "",
      renaming: false,
    };
  }

  submitRename(e): void {
    e.preventDefault();
    e.stopPropagation();

    const { client } = this.props;
    const name = (this.state.nameInput || "no name").slice(0, 16);
    window.localStorage.setItem("name", name);
    client.attemptRename(name);
    this.setState({ renaming: false });
  }

  startRename(currentName: string): void {
    this.setState({ renaming: true, nameInput: currentName });
  }

  renderRenameForm() {
    return (
      <form className="renameForm" onSubmit={(e) => this.submitRename(e)}>
        <input
          autoFocus
          maxLength={16}
          onChange={(e) => this.setState({ nameInput: e.target.value })}
          type="text"
          value={this.state.nameInput}
        />
        <button type="submit">save</button>
      </form>
    );
  }

  renderAvatarPicker() {
    const { client } = this.props;

    return (
      <div className="avatarPicker">
        {AVATARS.map((id) => (
          <button
            className="avatarOption"
            key={id}
            onClick={(e) => client.attemptSetAvatar(id)}
          >
            <Avatar id={id} size={22} />
          </button>
        ))}
      </div>
    );
  }

  renderTeam(team: C.Team) {
    const { client } = this.props;
    const { engine, users } = client;

    return (
      <div className={`team team-${team}`}>
        <div className="score">{engine.scoreOf(team)}</div>
        <p>suits:</p>
        <ul>
          {Card.FISH_SUITS.filter(
            (suit) => engine.declarerOf[suit] === team
          ).map((suit, i) => (
            <li key={i}>
              <SuitSpan suit={suit} />
            </li>
          ))}
        </ul>
        <p>members:</p>
        <ul>
          {engine.seats
            .filter((seat) => engine.teamOf(seat) === team)
            .map((seat) => (
              <li key={seat}>
                <Avatar id={client.findUser(seat)?.avatar} size={20} />
                <span className="playerName">
                  {seat === engine.ownSeat ? (
                    <b>{client.nameOf(seat)}</b>
                  ) : (
                    client.nameOf(seat)
                  )}
                </span>
                {engine.userOf[seat] !== null ? (
                  <span className="chips">
                    {engine.chips[engine.userOf[seat]] ?? engine.rules.startingChips}{" "}
                    chips
                  </span>
                ) : null}
              </li>
            ))}
        </ul>
      </div>
    );
  }

  renderUser(user: P.User) {
    const { client } = this.props;
    const host = client.engine.host === user.id;
    const isSelf = client.identity.id === user.id;

    return (
      <li key={user.id}>
        <Avatar id={user.avatar} size={20} />
        <span className="playerName">
          {host ? <span className="adminBadge">★</span> : null}
          {user.name}
        </span>
        {isSelf && !this.state.renaming ? (
          <button onClick={(e) => this.startRename(user.name)}>rename</button>
        ) : null}
        {isSelf && this.state.renaming ? this.renderRenameForm() : null}
        {isSelf ? this.renderAvatarPicker() : null}
      </li>
    );
  }

  render() {
    const { active, client, lone } = this.props;
    const { engine, users } = client;
    const isHost = engine.identity === engine.host;

    return (
      <div className={`info ${active ? "active" : ""} ${lone ? "lone" : ""}`}>
        <div className="users">
          <p>users:</p>
          <ul>{users.map((user) => this.renderUser(user))}</ul>
        </div>
        <div className="teams">
          {this.renderTeam(C.Team.FIRST)}
          {this.renderTeam(C.Team.SECOND)}
        </div>
        {isHost && engine.phase !== C.Phase.WAIT ? (
          <button
            className="adminReset"
            onClick={(e) => {
              if (window.confirm("reset the game back to the lobby?")) {
                client.adminReset();
              }
            }}
          >
            admin: reset game
          </button>
        ) : null}
      </div>
    );
  }
}
