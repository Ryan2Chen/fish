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
  listRef = React.createRef<HTMLUListElement>();
  // true until the user scrolls away from the bottom on purpose
  stickToBottom = true;
  // client.chatLog is mutated in place, so props identity can't tell us
  // when a message was added -- track the length we last saw ourselves
  lastChatLength = 0;

  constructor(props) {
    super(props);
    this.state = { input: "" };
    this.lastSeenLength = props.client.chatLog.length;
  }

  componentDidMount() {
    this.scrollToBottom();
  }

  componentDidUpdate() {
    // Chat re-renders on every game event, not just new chat messages --
    // only autoscroll when a message actually arrived, so it doesn't yank
    // someone back to the bottom while they're scrolled up reading history
    const length = this.props.client.chatLog.length;
    if (length !== this.lastSeenLength) {
      this.lastSeenLength = length;
      this.scrollToBottom();
    }
  }

  scrollToBottom(): void {
    const el = this.listRef.current;
    if (el === null) return;
    el.scrollTop = el.scrollHeight;
  }

  componentDidMount() {
    this.lastChatLength = this.props.client.chatLog.length;
    this.scrollToBottom();
  }

  componentDidUpdate() {
    const { length } = this.props.client.chatLog;
    if (length !== this.lastChatLength) {
      this.lastChatLength = length;
      this.scrollToBottom();
    }
  }

  scrollToBottom(): void {
    const list = this.listRef.current;
    if (!list || !this.stickToBottom) return;
    list.scrollTop = list.scrollHeight;
  }

  onScroll(): void {
    const list = this.listRef.current;
    if (!list) return;
    const distanceFromBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight;
    this.stickToBottom = distanceFromBottom < 20;
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
        <ul onScroll={() => this.onScroll()} ref={this.listRef}>
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
