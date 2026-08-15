import React from "react";

import { Client } from "lib/client";

export namespace Chat {
  export type Props = {
    active: boolean;
    client: Client;
  };

  export type State = {
    input: string;
  };
}

export class Chat extends React.Component<Chat.Props, Chat.State> {
  constructor(props) {
    super(props);
    this.state = { input: "" };
  }

  submit(e): void {
    e.preventDefault();
    e.stopPropagation();

    const { client } = this.props;
    if (!this.state.input.trim()) return;

    client.sendChat(this.state.input);
    this.setState({ input: "" });
  }

  render() {
    const { active, client } = this.props;
    const { chatLog } = client;

    return (
      <div className={`chat ${active ? "active" : ""}`}>
        <ul>
          {chatLog.map((item, i) => (
            <li key={i}>
              <span className="playerName">{item.user.name}:</span>{" "}
              {item.message}
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => this.submit(e)}>
          <input
            maxLength={280}
            onChange={(e) => this.setState({ input: e.target.value })}
            type="text"
            value={this.state.input}
          />
          <button type="submit">send</button>
        </form>
      </div>
    );
  }
}
